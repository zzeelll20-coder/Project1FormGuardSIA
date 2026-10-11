const http = require('http');
const path = require('path');
const os = require('os');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const localtunnel = require('localtunnel');

// Helper to get local network IP addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  if (ips.length === 0) ips.push('127.0.0.1');
  return ips;
}

class ProctorServer {
  constructor(port = 3456) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // In-memory exam store
    // examCode -> { code, title, formUrl, strictLockdown, createdAt, active, teacherClients: Set, students: Map }
    this.exams = new Map();

    // Free Tunnel & Domain State
    this.tunnel = null;
    this.tunnelUrl = null;
    this.isStartingTunnel = false;

    this.setupExpress();
    this.setupWebSockets();
    this.startHeartbeatMonitor();
  }

  setupExpress() {
    this.app.use(express.json());

    // Security Hardening & Headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https: http:; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https: http:;"
      );
      res.removeHeader('X-Powered-By');
      next();
    });

    // Serve renderer files so teacher dashboard or web view can also be viewed via browser
    this.app.use(express.static(path.join(__dirname, 'src')));

    // Status endpoint (hides raw IP by default, provides secure domain information)
    this.app.get('/api/status', (req, res) => {
      const hostname = os.hostname().toLowerCase();
      res.json({
        ok: true,
        version: '2.0.0',
        port: this.port,
        localDomain: `${hostname}.local:${this.port}`,
        preferredDomain: this.tunnelUrl || `formguard.local:${this.port}`,
        tunnelUrl: this.tunnelUrl,
        isTunnelActive: !!this.tunnelUrl,
        activeExams: Array.from(this.exams.values()).map(e => ({
          code: e.code,
          title: e.title,
          studentCount: e.students.size
        }))
      });
    });

    // Toggle free HTTPS domain via Localtunnel
    this.app.post('/api/tunnel/toggle', async (req, res) => {
      try {
        if (this.tunnelUrl) {
          await this.stopTunnel();
          res.json({ ok: true, active: false, url: null });
        } else {
          const result = await this.startTunnel();
          res.json({ ok: result.ok, active: !!result.url, url: result.url, error: result.error });
        }
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Get specific exam data
    this.app.get('/api/exam/:code', (req, res) => {
      const code = req.params.code.toUpperCase();
      const exam = this.exams.get(code);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      res.json({
        code: exam.code,
        title: exam.title,
        formUrl: exam.formUrl,
        strictLockdown: exam.strictLockdown,
        students: Array.from(exam.students.values())
      });
    });

    // Export audit report
    this.app.get('/api/export/:code', (req, res) => {
      const code = req.params.code.toUpperCase();
      const exam = this.exams.get(code);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      const report = {
        examCode: exam.code,
        title: exam.title,
        exportedAt: new Date().toISOString(),
        totalStudents: exam.students.size,
        students: Array.from(exam.students.values())
      };
      res.setHeader('Content-disposition', `attachment; filename=formguard-report-${code}.json`);
      res.setHeader('Content-type', 'application/json');
      res.send(JSON.stringify(report, null, 2));
    });
  }

  setupWebSockets() {
    this.wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.clientRole = null; // 'teacher' | 'student'
      ws.examCode = null;
      ws.studentId = null;

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (err) {
          console.error('[WS Error] Failed to parse or handle message:', err);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });
    });
  }

  async handleMessage(ws, msg) {
    const { action } = msg;

    switch (action) {
      // Teacher creates or hosts an exam room
      case 'host-exam': {
        const code = (msg.code || this.generateExamCode()).toUpperCase();
        let exam = this.exams.get(code);
        if (!exam) {
          exam = {
            code,
            title: msg.title || 'Untitled Exam',
            formUrl: msg.formUrl || '',
            strictLockdown: msg.strictLockdown ?? true,
            requireRosterPin: msg.requireRosterPin ?? true,
            roster: new Map(), // studentId -> { studentId, name, pin, boundDeviceId, boundDeviceName, boundAt }
            createdAt: Date.now(),
            active: true,
            teacherClients: new Set(),
            students: new Map()
          };
          this.exams.set(code, exam);
        } else {
          exam.title = msg.title || exam.title;
          exam.formUrl = msg.formUrl || exam.formUrl;
          exam.strictLockdown = msg.strictLockdown ?? exam.strictLockdown;
          if (typeof msg.requireRosterPin === 'boolean') {
            exam.requireRosterPin = msg.requireRosterPin;
          }
        }

        ws.clientRole = 'teacher';
        ws.examCode = code;
        exam.teacherClients.add(ws);

        ws.send(JSON.stringify({
          type: 'exam-hosted',
          code: exam.code,
          title: exam.title,
          formUrl: exam.formUrl,
          strictLockdown: exam.strictLockdown,
          requireRosterPin: exam.requireRosterPin,
          roster: Array.from(exam.roster.values()),
          students: Array.from(exam.students.values()),
          localDomain: `${os.hostname().toLowerCase()}.local:${this.port}`,
          preferredDomain: this.tunnelUrl || `formguard.local:${this.port}`,
          tunnelUrl: this.tunnelUrl,
          isTunnelActive: !!this.tunnelUrl,
          ips: getLocalIpAddresses(),
          port: this.port
        }));
        break;
      }

      // Teacher toggles free secure HTTPS tunnel
      case 'toggle-tunnel': {
        if (this.tunnelUrl) {
          await this.stopTunnel();
        } else {
          await this.startTunnel();
        }
        break;
      }

      // Teacher updates class roster / PINs
      case 'update-roster': {
        const exam = this.exams.get(ws.examCode);
        if (!exam) return;

        if (Array.isArray(msg.roster)) {
          exam.roster.clear();
          for (const s of msg.roster) {
            const sid = String(s.studentId || '').trim().toUpperCase();
            if (sid) {
              exam.roster.set(sid, {
                studentId: sid,
                name: s.name || sid,
                pin: String(s.pin || '').trim(),
                boundDeviceId: s.boundDeviceId || null,
                boundDeviceName: s.boundDeviceName || null,
                boundAt: s.boundAt || null
              });
            }
          }
        }

        if (typeof msg.requireRosterPin === 'boolean') {
          exam.requireRosterPin = msg.requireRosterPin;
        }

        this.broadcastRoster(exam);
        break;
      }

      // Teacher resets device binding for a student
      case 'reset-device-binding': {
        const exam = this.exams.get(ws.examCode);
        if (!exam) return;
        const sid = String(msg.studentId || '').trim().toUpperCase();
        const record = exam.roster.get(sid);
        if (record) {
          record.boundDeviceId = null;
          record.boundDeviceName = null;
          record.boundAt = null;
          this.broadcastRoster(exam);
        }
        break;
      }

      // Student verifies/fetches exam info before joining
      case 'get-exam-info': {
        const code = (msg.code || '').toUpperCase();
        const exam = this.exams.get(code);
        if (!exam || !exam.active) {
          ws.send(JSON.stringify({ type: 'error', message: 'Exam room not found or inactive.' }));
          return;
        }
        ws.send(JSON.stringify({
          type: 'exam-info',
          code: exam.code,
          title: exam.title,
          formUrl: exam.formUrl,
          strictLockdown: exam.strictLockdown,
          requireRosterPin: exam.requireRosterPin
        }));
        break;
      }

      // Student joins the exam session with ID & PIN verification
      case 'student-join': {
        const code = (msg.code || '').toUpperCase();
        const exam = this.exams.get(code);
        if (!exam || !exam.active) {
          ws.send(JSON.stringify({ type: 'error', message: 'Exam room not found or inactive.' }));
          return;
        }

        const studentId = String(msg.studentId || '').trim().toUpperCase();
        const pin = String(msg.pin || '').trim();
        const deviceId = msg.deviceId || `dev_${Math.random().toString(36).substring(2, 10)}`;
        const deviceName = msg.deviceName || os.hostname();

        if (!studentId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Student ID is required.' }));
          return;
        }

        let studentName = msg.name ? msg.name.trim() : studentId;

        // Roster & PIN Security Checks
        if (exam.requireRosterPin && exam.roster.size > 0) {
          const rosterRecord = exam.roster.get(studentId);
          if (!rosterRecord) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Verification Failed: Student ID "${studentId}" is not on the exam roster. Please check with your teacher.`
            }));
            return;
          }

          if (rosterRecord.pin && rosterRecord.pin !== pin) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Verification Failed: Incorrect Access PIN for this Student ID.'
            }));
            return;
          }

          // Hardware Device Binding Check
          if (rosterRecord.boundDeviceId && rosterRecord.boundDeviceId !== deviceId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Security Lock: Student ID "${studentId}" is already bound to another device (${rosterRecord.boundDeviceName}). Impersonation blocked. Ask your teacher to reset your device binding if you changed computers.`
            }));
            return;
          }

          // Lock / bind hardware device
          rosterRecord.boundDeviceId = deviceId;
          rosterRecord.boundDeviceName = deviceName;
          rosterRecord.boundAt = Date.now();
          studentName = rosterRecord.name; // Use verified name
        }

        // Check if session with same ID already active
        for (const existing of exam.students.values()) {
          if (existing.studentId === studentId && existing.status === 'active' && existing.deviceId !== deviceId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Security Lock: An active exam session is already open for Student ID "${studentId}" on another computer.`
            }));
            return;
          }
        }

        ws.clientRole = 'student';
        ws.examCode = code;
        ws.studentId = studentId;

        const studentData = {
          studentId,
          name: studentName,
          email: msg.email || '',
          deviceId,
          deviceName,
          os: msg.os || `${os.type()} ${os.release()}`,
          status: 'active', // active | away | submitted | offline
          joinedAt: Date.now(),
          lastSeen: Date.now(),
          awayCount: 0,
          awayTotalMs: 0,
          currentAwayStart: null,
          events: [
            { type: 'joined', detail: `Identity verified (${studentId}) on device: ${deviceName}`, ts: Date.now() }
          ]
        };

        exam.students.set(studentId, studentData);

        // Acknowledge student
        ws.send(JSON.stringify({
          type: 'joined-success',
          studentId,
          name: studentName,
          code: exam.code,
          title: exam.title,
          formUrl: exam.formUrl,
          strictLockdown: exam.strictLockdown
        }));

        // Broadcast updated state to all teachers
        this.broadcastToTeachers(exam, {
          type: 'student-updated',
          student: studentData,
          totalStudents: exam.students.size
        });
        this.broadcastRoster(exam);
        break;
      }

      // Student heartbeat
      case 'student-heartbeat': {
        const exam = this.exams.get(ws.examCode);
        if (!exam) return;
        const student = exam.students.get(ws.studentId);
        if (!student) return;

        student.lastSeen = Date.now();
        // If student was marked offline, return them to active (or away if currently away)
        if (student.status === 'offline') {
          student.status = student.currentAwayStart ? 'away' : 'active';
          student.events.push({ type: 'reconnected', detail: 'Reconnected to session', ts: Date.now() });
          this.broadcastToTeachers(exam, { type: 'student-updated', student });
        }
        break;
      }

      // Student logs an incident (blur, switch, copy, paste, navigation)
      case 'student-event': {
        const exam = this.exams.get(ws.examCode);
        if (!exam) return;
        const student = exam.students.get(ws.studentId);
        if (!student) return;

        student.lastSeen = Date.now();
        const eventType = msg.eventType; // 'away' | 'return' | 'copy-paste' | 'nav-blocked' | 'submitted'
        const detail = msg.detail || '';
        const now = Date.now();

        if (eventType === 'away') {
          if (!student.currentAwayStart) {
            student.currentAwayStart = now;
            student.awayCount += 1;
            student.status = 'away';
          }
        } else if (eventType === 'return') {
          if (student.currentAwayStart) {
            const awayDuration = now - student.currentAwayStart;
            student.awayTotalMs += awayDuration;
            student.currentAwayStart = null;
          }
          if (student.status !== 'submitted') {
            student.status = 'active';
          }
        } else if (eventType === 'submitted') {
          if (student.currentAwayStart) {
            student.awayTotalMs += (now - student.currentAwayStart);
            student.currentAwayStart = null;
          }
          student.status = 'submitted';
        }

        const eventRecord = {
          type: eventType,
          detail,
          ts: now
        };
        student.events.push(eventRecord);

        // Keep last 100 events per student to avoid unbounded memory
        if (student.events.length > 100) student.events.shift();

        // Broadcast live incident & student update to teachers
        this.broadcastToTeachers(exam, {
          type: 'student-incident',
          studentId: student.studentId,
          studentName: student.name,
          event: eventRecord,
          student
        });
        break;
      }

      // Teacher issues an action to student (warning message or force submit)
      case 'teacher-action': {
        const exam = this.exams.get(ws.examCode);
        if (!exam) return;

        const targetStudentId = msg.targetStudentId;
        const actionType = msg.actionType; // 'warn' | 'force-submit' | 'broadcast-msg'

        // Send to student client
        for (const client of this.wss.clients) {
          if (client.readyState === WebSocket.OPEN && client.examCode === exam.code) {
            if (actionType === 'broadcast-msg' || client.studentId === targetStudentId) {
              client.send(JSON.stringify({
                type: 'teacher-command',
                actionType,
                message: msg.message || ''
              }));
            }
          }
        }
        break;
      }
    }
  }

  handleDisconnect(ws) {
    if (ws.clientRole === 'teacher' && ws.examCode) {
      const exam = this.exams.get(ws.examCode);
      if (exam) exam.teacherClients.delete(ws);
    } else if (ws.clientRole === 'student' && ws.examCode && ws.studentId) {
      const exam = this.exams.get(ws.examCode);
      if (exam) {
        const student = exam.students.get(ws.studentId);
        if (student && student.status !== 'submitted') {
          student.status = 'offline';
          student.events.push({ type: 'disconnected', detail: 'Connection dropped', ts: Date.now() });
          this.broadcastToTeachers(exam, { type: 'student-updated', student });
        }
      }
    }
  }

  broadcastToTeachers(exam, data) {
    const payload = JSON.stringify(data);
    for (const teacherWs of exam.teacherClients) {
      if (teacherWs.readyState === WebSocket.OPEN) {
        teacherWs.send(payload);
      }
    }
  }

  broadcastRoster(exam) {
    this.broadcastToTeachers(exam, {
      type: 'roster-updated',
      roster: Array.from(exam.roster.values()),
      requireRosterPin: exam.requireRosterPin
    });
  }

  startHeartbeatMonitor() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const exam of this.exams.values()) {
        for (const student of exam.students.values()) {
          // If no heartbeat for > 10s and not already submitted/offline
          if (now - student.lastSeen > 10000 && student.status !== 'submitted' && student.status !== 'offline') {
            student.status = 'offline';
            student.events.push({ type: 'offline', detail: 'Heartbeat timeout (offline)', ts: now });
            this.broadcastToTeachers(exam, { type: 'student-updated', student });
          }
        }
      }
    }, 4000);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  generateExamCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'FG-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async startTunnel(subdomain = null) {
    if (this.tunnel) return { ok: true, url: this.tunnelUrl };
    try {
      this.isStartingTunnel = true;
      const sub = subdomain || `formguard-${Math.random().toString(36).substring(2, 7)}`;
      this.tunnel = await localtunnel({ port: this.port, subdomain: sub });
      this.tunnelUrl = this.tunnel.url;
      this.isStartingTunnel = false;

      this.tunnel.on('close', () => {
        this.tunnel = null;
        this.tunnelUrl = null;
        this.broadcastTunnelState();
      });

      this.tunnel.on('error', (err) => {
        console.warn('[Tunnel Error]:', err);
        this.tunnel = null;
        this.tunnelUrl = null;
        this.broadcastTunnelState();
      });

      this.broadcastTunnelState();
      return { ok: true, url: this.tunnelUrl };
    } catch (err) {
      this.isStartingTunnel = false;
      this.tunnel = null;
      this.tunnelUrl = null;
      console.error('[Tunnel Start Failed]:', err);
      return { ok: false, error: err.message };
    }
  }

  async stopTunnel() {
    if (this.tunnel) {
      try {
        await this.tunnel.close();
      } catch (e) {}
      this.tunnel = null;
      this.tunnelUrl = null;
      this.broadcastTunnelState();
    }
    return { ok: true };
  }

  broadcastTunnelState() {
    const payload = JSON.stringify({
      type: 'tunnel-state-changed',
      tunnelUrl: this.tunnelUrl,
      isTunnelActive: !!this.tunnelUrl
    });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN && client.clientRole === 'teacher') {
        client.send(payload);
      }
    }
  }

  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`[FormGuard Server] Running on http://localhost:${this.port}`);
        resolve({
          port: this.port,
          ips: getLocalIpAddresses()
        });
      });
    });
  }

  async close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await this.stopTunnel();
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(resolve);
      });
    });
  }
}

// Standalone execution support
if (require.main === module) {
  const port = process.env.PORT || 3456;
  const server = new ProctorServer(port);
  server.listen().then(({ port, ips }) => {
    console.log(`[FormGuard] Accessible on:`);
    ips.forEach(ip => console.log(`  http://${ip}:${port}`));
  });
}

module.exports = { ProctorServer, getLocalIpAddresses };
