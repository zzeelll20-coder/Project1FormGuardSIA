class TeacherController {
  constructor() {
    this.ws = null;
    this.exam = {
      code: 'FG-READY',
      title: 'General Exam (Proctored)',
      formUrl: '',
      strictLockdown: true
    };
    this.students = new Map();
    this.roster = new Map();
    this.requireRosterPin = true;
    this.currentFilter = 'all';
    this.selectedStudentId = null;
    this.totalViolations = 0;

    this.bindDomElements();
    this.attachEventListeners();
  }

  bindDomElements() {
    this.titleDisplay = document.getElementById('teacherExamTitle');
    this.codeDisplay = document.getElementById('teacherCodeVal');
    this.codeBox = document.getElementById('teacherCodeBox');
    this.webLinkDisplay = document.getElementById('teacherWebLink');
    this.emptyJoinCode = document.getElementById('emptyJoinCode');

    // Stats
    this.statTotal = document.getElementById('statTotalStudents');
    this.statActive = document.getElementById('statActiveStudents');
    this.statAway = document.getElementById('statAwayStudents');
    this.statOffline = document.getElementById('statOfflineStudents');
    this.statViolations = document.getElementById('statTotalViolations');
    this.gridCountLabel = document.getElementById('studentGridCountLabel');

    // Grid & Stream
    this.grid = document.getElementById('studentsGrid');
    this.eventList = document.getElementById('eventList');

    // Modals
    this.configModal = document.getElementById('modalConfigExam');
    this.auditModal = document.getElementById('modalStudentAudit');
    this.rosterModal = document.getElementById('modalRoster');
    
    // Config Inputs
    this.cfgTitle = document.getElementById('cfgExamTitle');
    this.cfgUrl = document.getElementById('cfgFormUrl');
    this.cfgStrict = document.getElementById('cfgStrictLockdown');

    // Roster Inputs
    this.btnManageRoster = document.getElementById('btnManageRoster');
    this.btnCloseRosterModal = document.getElementById('btnCloseRosterModal');
    this.btnSaveRoster = document.getElementById('btnSaveRoster');
    this.cfgRequireRoster = document.getElementById('cfgRequireRoster');
    this.btnCopyRosterPins = document.getElementById('btnCopyRosterPins');
    this.txtBulkRoster = document.getElementById('txtBulkRoster');
    this.btnGenerateBulkRoster = document.getElementById('btnGenerateBulkRoster');
    this.inputRosterName = document.getElementById('inputRosterName');
    this.inputRosterId = document.getElementById('inputRosterId');
    this.inputRosterPin = document.getElementById('inputRosterPin');
    this.btnAddRosterStudent = document.getElementById('btnAddRosterStudent');
    this.rosterTableBody = document.getElementById('rosterTableBody');
  }

  attachEventListeners() {
    // Copy code on click
    this.codeBox.addEventListener('click', async () => {
      await Utils.copyToClipboard(this.exam.code);
      const originalText = this.codeDisplay.innerText;
      this.codeDisplay.innerText = 'COPIED!';
      setTimeout(() => { this.codeDisplay.innerText = originalText; }, 1500);
    });

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderStudents();
      });
    });

    // Open Config Modal
    document.getElementById('btnConfigureExam').addEventListener('click', () => {
      this.cfgTitle.value = this.exam.title;
      this.cfgUrl.value = this.exam.formUrl;
      this.cfgStrict.checked = this.exam.strictLockdown;
      this.configModal.classList.add('active');
    });

    // Save Config
    document.getElementById('btnSaveConfig').addEventListener('click', () => {
      this.exam.title = this.cfgTitle.value.trim() || 'Untitled Exam';
      this.exam.formUrl = this.cfgUrl.value.trim();
      this.exam.strictLockdown = this.cfgStrict.checked;
      this.configModal.classList.remove('active');
      this.titleDisplay.innerText = this.exam.title;
      this.publishExam();
    });

    // Close Config Modal
    document.getElementById('btnCloseConfigModal').addEventListener('click', () => {
      this.configModal.classList.remove('active');
    });
    document.getElementById('btnCancelConfig').addEventListener('click', () => {
      this.configModal.classList.remove('active');
    });

    // Clear Stream
    document.getElementById('btnClearStream').addEventListener('click', () => {
      this.eventList.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 20px; font-size: 0.8rem;">Stream cleared</div>';
    });

    // Open/Close Roster Modal
    if (this.btnManageRoster) {
      this.btnManageRoster.addEventListener('click', () => {
        this.cfgRequireRoster.checked = this.requireRosterPin;
        this.renderRoster();
        this.rosterModal.classList.add('active');
      });
    }

    if (this.btnCloseRosterModal) {
      this.btnCloseRosterModal.addEventListener('click', () => {
        this.rosterModal.classList.remove('active');
      });
    }

    // Save Roster
    if (this.btnSaveRoster) {
      this.btnSaveRoster.addEventListener('click', () => {
        this.requireRosterPin = this.cfgRequireRoster.checked;
        this.sendRosterUpdate();
        this.rosterModal.classList.remove('active');
        alert('Class roster & PINs saved and active.');
      });
    }

    // Add Single Roster Student
    if (this.btnAddRosterStudent) {
      this.btnAddRosterStudent.addEventListener('click', () => {
        const name = this.inputRosterName.value.trim();
        const id = this.inputRosterId.value.trim().toUpperCase();
        let pin = this.inputRosterPin.value.trim();

        if (!id) {
          alert('Student ID is required.');
          return;
        }

        if (!pin) {
          pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit PIN
        }

        this.roster.set(id, {
          studentId: id,
          name: name || id,
          pin,
          boundDeviceId: null,
          boundDeviceName: null,
          boundAt: null
        });

        this.inputRosterName.value = '';
        this.inputRosterId.value = '';
        this.inputRosterPin.value = '';
        this.renderRoster();
        this.sendRosterUpdate();
      });
    }

    // Generate Bulk Roster from pasted text
    if (this.btnGenerateBulkRoster) {
      this.btnGenerateBulkRoster.addEventListener('click', () => {
        const lines = this.txtBulkRoster.value.split('\n');
        let count = 0;

        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const parts = trimmed.split(/,|\t|;/).map(p => p.trim());
          let name = '';
          let id = '';

          if (parts.length >= 2) {
            name = parts[0];
            id = parts[1].toUpperCase();
          } else {
            id = parts[0].toUpperCase();
            name = id;
          }

          if (id) {
            const pin = Math.floor(1000 + Math.random() * 9000).toString();
            this.roster.set(id, {
              studentId: id,
              name: name || id,
              pin,
              boundDeviceId: null,
              boundDeviceName: null,
              boundAt: null
            });
            count++;
          }
        });

        this.txtBulkRoster.value = '';
        this.renderRoster();
        this.sendRosterUpdate();
        alert(`Generated secure PINs for ${count} students.`);
      });
    }

    // Copy Roster PINs Handout List
    if (this.btnCopyRosterPins) {
      this.btnCopyRosterPins.addEventListener('click', async () => {
        if (this.roster.size === 0) {
          alert('Roster is currently empty.');
          return;
        }

        let output = `FORMGUARD CLASS ROSTER - EXAM: ${this.exam.title} (JOIN CODE: ${this.exam.code})\n`;
        output += `------------------------------------------------------------\n`;
        output += `NAME                 | STUDENT ID   | ACCESS PIN\n`;
        output += `------------------------------------------------------------\n`;

        this.roster.forEach(r => {
          const nameCol = r.name.padEnd(20, ' ').slice(0, 20);
          const idCol = r.studentId.padEnd(12, ' ').slice(0, 12);
          output += `${nameCol} | ${idCol} | ${r.pin}\n`;
        });

        await Utils.copyToClipboard(output);
        alert('Copied Roster & PINs handout list to clipboard!');
      });
    }

    // Export Report
    document.getElementById('btnExportReport').addEventListener('click', () => {
      this.exportReport();
    });

    // Close Audit Modal
    document.getElementById('btnCloseAuditModal').addEventListener('click', () => {
      this.auditModal.classList.remove('active');
    });
    document.getElementById('btnCloseAudit').addEventListener('click', () => {
      this.auditModal.classList.remove('active');
    });

    // Audit Modal Actions
    document.getElementById('btnAuditWarnStudent').addEventListener('click', () => {
      if (!this.selectedStudentId) return;
      const msg = prompt('Enter warning message to send to student:', 'Please keep your focus on the exam window.');
      if (msg) {
        this.sendActionToStudent(this.selectedStudentId, 'warn', msg);
        alert('Warning transmitted.');
      }
    });

    document.getElementById('btnAuditForceSubmit').addEventListener('click', () => {
      if (!this.selectedStudentId) return;
      if (confirm('Are you sure you want to force-submit and terminate this student’s exam session?')) {
        this.sendActionToStudent(this.selectedStudentId, 'force-submit', 'Proctor terminated the session.');
        this.auditModal.classList.remove('active');
      }
    });
  }

  sendRosterUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      action: 'update-roster',
      requireRosterPin: this.requireRosterPin,
      roster: Array.from(this.roster.values())
    }));
  }

  renderRoster() {
    if (!this.rosterTableBody) return;
    this.rosterTableBody.innerHTML = '';

    if (this.roster.size === 0) {
      this.rosterTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 24px;">
            No students registered yet. Add students above or bulk-paste names.
          </td>
        </tr>
      `;
      return;
    }

    this.roster.forEach(r => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      const isBound = !!r.boundDeviceId;
      const boundBadge = isBound
        ? `<span style="color: #34d399; font-size: 0.75rem;" title="Locked to ${this.escapeHtml(r.boundDeviceName || '')}">🔒 Bound (${this.escapeHtml((r.boundDeviceName || '').slice(0, 10))})</span>`
        : `<span style="color: var(--text-dim); font-size: 0.75rem;">⚪ Not bound</span>`;

      tr.innerHTML = `
        <td style="padding: 10px; color: #fff; font-weight: 600;">${this.escapeHtml(r.name)}</td>
        <td style="padding: 10px; font-family: var(--font-mono); color: #93c5fd;">${this.escapeHtml(r.studentId)}</td>
        <td style="padding: 10px; font-family: var(--font-mono); font-weight: 700; color: #fbbf24;">${this.escapeHtml(r.pin)}</td>
        <td style="padding: 10px;">${boundBadge}</td>
        <td style="padding: 10px; text-align: right; display: flex; gap: 6px; justify-content: flex-end;">
          ${isBound ? `<button class="btn btn-secondary btn-sm btn-reset-binding" style="font-size: 0.72rem; padding: 2px 8px;" data-id="${r.studentId}">Reset Lock</button>` : ''}
          <button class="btn btn-danger btn-sm btn-del-roster" style="font-size: 0.72rem; padding: 2px 8px;" data-id="${r.studentId}">✕</button>
        </td>
      `;

      const btnReset = tr.querySelector('.btn-reset-binding');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          if (confirm(`Reset hardware lock for ${r.name}? This lets them log in from a new computer.`)) {
            this.resetDeviceBinding(r.studentId);
          }
        });
      }

      const btnDel = tr.querySelector('.btn-del-roster');
      if (btnDel) {
        btnDel.addEventListener('click', () => {
          this.roster.delete(r.studentId);
          this.renderRoster();
          this.sendRosterUpdate();
        });
      }

      this.rosterTableBody.appendChild(tr);
    });
  }

  resetDeviceBinding(studentId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      action: 'reset-device-binding',
      studentId
    }));
  }

  async start(serverPort = 3456, host = 'localhost') {
    this.serverPort = serverPort;
    this.host = host;
    this.connectWebSocket();
  }

  connectWebSocket() {
    const wsUrl = `ws://${this.host}:${this.serverPort}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[Teacher] Connected to proctor server');
      this.publishExam();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (e) {
        console.error('[Teacher] Parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[Teacher] Disconnected. Reconnecting in 3s...');
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  publishExam() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      action: 'host-exam',
      code: this.exam.code,
      title: this.exam.title,
      formUrl: this.exam.formUrl,
      strictLockdown: this.exam.strictLockdown,
      requireRosterPin: this.requireRosterPin,
      roster: Array.from(this.roster.values())
    }));
  }

  handleServerMessage(data) {
    switch (data.type) {
      case 'exam-hosted': {
        this.exam.code = data.code;
        this.exam.title = data.title;
        this.titleDisplay.innerText = data.title;
        this.codeDisplay.innerText = data.code;
        this.emptyJoinCode.innerText = data.code;

        if (data.ips && data.ips.length > 0) {
          const primaryIp = data.ips[0];
          this.webLinkDisplay.innerText = `http://${primaryIp}:${data.port}`;
        }

        if (typeof data.requireRosterPin === 'boolean') {
          this.requireRosterPin = data.requireRosterPin;
          if (this.cfgRequireRoster) this.cfgRequireRoster.checked = this.requireRosterPin;
        }

        if (Array.isArray(data.roster)) {
          this.roster.clear();
          data.roster.forEach(r => this.roster.set(r.studentId, r));
          this.renderRoster();
        }

        // Restore any existing students
        if (data.students) {
          this.students.clear();
          data.students.forEach(s => this.students.set(s.studentId, s));
          this.updateStats();
          this.renderStudents();
        }
        break;
      }

      case 'roster-updated': {
        if (Array.isArray(data.roster)) {
          this.roster.clear();
          data.roster.forEach(r => this.roster.set(r.studentId, r));
          this.renderRoster();
        }
        if (typeof data.requireRosterPin === 'boolean') {
          this.requireRosterPin = data.requireRosterPin;
          if (this.cfgRequireRoster) this.cfgRequireRoster.checked = this.requireRosterPin;
        }
        break;
      }

      case 'student-updated': {
        this.students.set(data.student.studentId, data.student);
        this.updateStats();
        this.renderStudents();
        if (this.selectedStudentId === data.student.studentId && this.auditModal.classList.contains('active')) {
          this.populateAuditModal(data.student);
        }
        break;
      }

      case 'student-incident': {
        this.students.set(data.student.studentId, data.student);
        this.totalViolations += 1;
        this.updateStats();
        this.renderStudents();
        this.appendStreamEvent(data.studentName, data.event);
        if (this.selectedStudentId === data.student.studentId && this.auditModal.classList.contains('active')) {
          this.populateAuditModal(data.student);
        }
        break;
      }
    }
  }

  updateStats() {
    const list = Array.from(this.students.values());
    const total = list.length;
    const active = list.filter(s => s.status === 'active').length;
    const away = list.filter(s => s.status === 'away').length;
    const offline = list.filter(s => s.status === 'offline').length;

    this.statTotal.innerText = total;
    this.statActive.innerText = active;
    this.statAway.innerText = away;
    this.statOffline.innerText = offline;
    this.statViolations.innerText = this.totalViolations;
    this.gridCountLabel.innerText = `(${total})`;
  }

  renderStudents() {
    let list = Array.from(this.students.values());

    if (this.currentFilter !== 'all') {
      list = list.filter(s => s.status === this.currentFilter);
    }

    if (list.length === 0) {
      this.grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div style="font-weight: 600; color: #fff;">No students found in this view</div>
          <div style="font-size: 0.85rem;">Share code <b style="color: #60a5fa;">${this.exam.code}</b> with students.</div>
        </div>
      `;
      return;
    }

    this.grid.innerHTML = '';
    list.forEach(student => {
      const card = document.createElement('div');
      card.className = `student-card status-${student.status}`;
      
      const statusLabel = student.status === 'active' ? '🟢 Active'
        : student.status === 'away' ? '⚠️ Away'
        : student.status === 'submitted' ? '✓ Submitted'
        : '⚪ Offline';

      const awayTimeFormatted = Utils.formatDuration(student.awayTotalMs);

      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="student-name">${this.escapeHtml(student.name)}</div>
            <div class="student-email">${this.escapeHtml(student.email || student.studentId)}</div>
          </div>
          <span class="status-badge ${student.status}">${statusLabel}</span>
        </div>

        <div class="card-metrics">
          <div class="metric-item">
            <span style="color: var(--text-dim); font-size: 0.7rem;">VIOLATIONS</span>
            <span class="metric-val" style="color: ${student.awayCount > 0 ? '#f59e0b' : '#94a3b8'};">${student.awayCount}</span>
          </div>
          <div class="metric-item">
            <span style="color: var(--text-dim); font-size: 0.7rem;">TIME AWAY</span>
            <span class="metric-val">${awayTimeFormatted}</span>
          </div>
          <div class="metric-item">
            <span style="color: var(--text-dim); font-size: 0.7rem;">DEVICE</span>
            <span class="metric-val" style="font-size: 0.75rem;" title="${this.escapeHtml(student.deviceName)}">${this.escapeHtml(student.deviceName.slice(0, 10))}</span>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-secondary btn-sm btn-block btn-audit" data-id="${student.studentId}">
            📋 Audit Timeline
          </button>
          <button class="btn btn-secondary btn-sm btn-warn" data-id="${student.studentId}" title="Warn student">
            ⚠️
          </button>
        </div>
      `;

      card.querySelector('.btn-audit').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAuditModal(student.studentId);
      });

      card.querySelector('.btn-warn').addEventListener('click', (e) => {
        e.stopPropagation();
        const msg = prompt(`Send warning to ${student.name}:`, 'Please keep your focus on the exam window.');
        if (msg) this.sendActionToStudent(student.studentId, 'warn', msg);
      });

      this.grid.appendChild(card);
    });
  }

  appendStreamEvent(studentName, event) {
    const item = document.createElement('div');
    item.className = `event-item ${event.type}`;

    const timeStr = Utils.formatTime(event.ts);
    let titleStr = '';

    if (event.type === 'away') {
      titleStr = `⚠️ ${studentName} left exam window`;
    } else if (event.type === 'return') {
      titleStr = `🟢 ${studentName} returned to exam`;
    } else if (event.type === 'joined') {
      titleStr = `🎓 ${studentName} joined the exam`;
    } else if (event.type === 'submitted') {
      titleStr = `✅ ${studentName} submitted their exam`;
    } else if (event.type === 'offline') {
      titleStr = `🔴 ${studentName} lost connection`;
    } else {
      titleStr = `ℹ️ ${studentName}: ${event.type}`;
    }

    item.innerHTML = `
      <div class="event-header">
        <span>${timeStr}</span>
        <span style="text-transform: uppercase; font-size: 0.65rem;">${event.type}</span>
      </div>
      <div class="event-title">${this.escapeHtml(titleStr)}</div>
      ${event.detail ? `<div style="font-size: 0.72rem; color: var(--text-dim);">${this.escapeHtml(event.detail)}</div>` : ''}
    `;

    // Keep top items fresh
    this.eventList.prepend(item);
    if (this.eventList.children.length > 50) {
      this.eventList.lastElementChild.remove();
    }
  }

  openAuditModal(studentId) {
    this.selectedStudentId = studentId;
    const student = this.students.get(studentId);
    if (!student) return;

    this.populateAuditModal(student);
    this.auditModal.classList.add('active');
  }

  populateAuditModal(student) {
    document.getElementById('auditStudentName').innerText = student.name;
    document.getElementById('auditStudentMeta').innerText = `${student.email || 'No email'} • Device: ${student.deviceName}`;
    document.getElementById('auditStatus').innerText = student.status.toUpperCase();
    document.getElementById('auditAwayCount').innerText = student.awayCount;
    document.getElementById('auditAwayDuration').innerText = Utils.formatDuration(student.awayTotalMs);

    const timeline = document.getElementById('auditTimelineList');
    timeline.innerHTML = '';

    if (!student.events || student.events.length === 0) {
      timeline.innerHTML = '<div style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 20px;">No incidents recorded.</div>';
      return;
    }

    // Render chronological events (reversed for newest first)
    const reversedEvents = [...student.events].reverse();
    reversedEvents.forEach(evt => {
      const item = document.createElement('div');
      item.className = `event-item ${evt.type}`;
      item.innerHTML = `
        <div class="event-header">
          <span>${Utils.formatTime(evt.ts)}</span>
          <span>${evt.type.toUpperCase()}</span>
        </div>
        <div class="event-title">${this.escapeHtml(evt.detail || evt.type)}</div>
      `;
      timeline.appendChild(item);
    });
  }

  sendActionToStudent(targetStudentId, actionType, message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      action: 'teacher-action',
      targetStudentId,
      actionType,
      message
    }));
  }

  exportReport() {
    const reportData = {
      examCode: this.exam.code,
      title: this.exam.title,
      exportedAt: new Date().toISOString(),
      totalStudents: this.students.size,
      students: Array.from(this.students.values())
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formguard-audit-${this.exam.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
}
