// FormGuard Student Exam Controller (Strict Lockdown & Math Assessment Engine)

const MATH_QUESTIONS = [
  {
    id: 1,
    topic: 'Algebra',
    question: 'Solve for x in the linear equation: 3x + 15 = 45',
    options: [
      { key: 'A', text: 'x = 5' },
      { key: 'B', text: 'x = 10' },
      { key: 'C', text: 'x = 15' },
      { key: 'D', text: 'x = 20' }
    ],
    correct: 'B',
    explanation: 'Subtract 15 from both sides: 3x = 30. Divide by 3: x = 10.'
  },
  {
    id: 2,
    topic: 'Geometry',
    question: 'What is the area of a right-angled triangle with a base of 8 cm and a height of 6 cm?',
    options: [
      { key: 'A', text: '24 cm²' },
      { key: 'B', text: '48 cm²' },
      { key: 'C', text: '14 cm²' },
      { key: 'D', text: '28 cm²' }
    ],
    correct: 'A',
    explanation: 'Area = (1/2) × base × height = (1/2) × 8 × 6 = 24 cm².'
  },
  {
    id: 3,
    topic: 'Arithmetic & Exponents',
    question: 'What is the numerical value of: 2⁵ − 3²?',
    options: [
      { key: 'A', text: '25' },
      { key: 'B', text: '23' },
      { key: 'C', text: '19' },
      { key: 'D', text: '7' }
    ],
    correct: 'B',
    explanation: '2⁵ = 32 and 3² = 9. Therefore, 32 − 9 = 23.'
  },
  {
    id: 4,
    topic: 'Geometry & Mensuration',
    question: 'If a circle has a radius of 7 cm, what is its circumference? (Use π = 22/7)',
    options: [
      { key: 'A', text: '22 cm' },
      { key: 'B', text: '44 cm' },
      { key: 'C', text: '154 cm' },
      { key: 'D', text: '88 cm' }
    ],
    correct: 'B',
    explanation: 'Circumference = 2 × π × r = 2 × (22/7) × 7 = 44 cm.'
  },
  {
    id: 5,
    topic: 'Coordinate Geometry',
    question: 'What is the slope (m) of the straight line passing through points (2, 3) and (6, 11)?',
    options: [
      { key: 'A', text: 'm = 2' },
      { key: 'B', text: 'm = 3' },
      { key: 'C', text: 'm = 4' },
      { key: 'D', text: 'm = 1/2' }
    ],
    correct: 'A',
    explanation: 'Slope m = (y₂ − y₁) / (x₂ − x₁) = (11 − 3) / (6 − 2) = 8 / 4 = 2.'
  }
];

class StudentController {
  constructor() {
    this.ws = null;
    this.session = null;
    this.timerInterval = null;
    this.heartbeatInterval = null;
    this.startTime = 0;
    this.isExamActive = false;
    this.isSubmitting = false;
    this.isExamSubmitted = false;
    this.host = 'localhost';
    this.port = 3456;

    // Exam State
    this.currentQuestionIdx = 0;
    this.answers = {}; // questionId -> 'A' | 'B' | 'C' | 'D'

    this.bindDomElements();
    this.attachEventListeners();
  }

  bindDomElements() {
    this.joinForm = document.getElementById('studentJoinForm');
    this.nameInput = document.getElementById('studentNameInput');
    this.studentIdInput = document.getElementById('studentIdInput');
    this.studentPinInput = document.getElementById('studentPinInput');
    this.codeInput = document.getElementById('studentCodeInput');
    this.serverHostInput = document.getElementById('studentServerHostInput');

    // Runner elements
    this.titleBar = document.getElementById('studentExamTitleBar');
    this.nameDisplay = document.getElementById('studentNameDisplay');
    this.liveBadge = document.getElementById('studentLiveBadge');
    this.timerDisplay = document.getElementById('examTimer');
    this.warningOverlay = document.getElementById('examWarningOverlay');
    this.btnDismissWarning = document.getElementById('btnDismissWarning');
    this.btnSubmitExam = document.getElementById('btnStudentSubmitExam');

    // In-app Submit Confirmation Modal
    this.modalConfirmSubmit = document.getElementById('modalConfirmSubmit');
    this.submitModalMessage = document.getElementById('submitModalMessage');
    this.btnCancelSubmitExam = document.getElementById('btnCancelSubmitExam');
    this.btnConfirmSubmitExam = document.getElementById('btnConfirmSubmitExam');

    // Math Exam DOM
    this.mathQuestionCard = document.getElementById('mathQuestionCard');
    this.mathResultsCard = document.getElementById('mathResultsCard');
    this.mathCategoryBadge = document.getElementById('mathCategoryBadge');
    this.mathProgressLabel = document.getElementById('mathProgressLabel');
    this.mathPillRow = document.getElementById('mathPillRow');
    this.mathQuestionText = document.getElementById('mathQuestionText');
    this.mathOptionsGrid = document.getElementById('mathOptionsGrid');
    this.btnMathPrev = document.getElementById('btnMathPrev');
    this.btnMathNext = document.getElementById('btnMathNext');
    this.mathAnsweredStatus = document.getElementById('mathAnsweredStatus');
    this.mathFinalScore = document.getElementById('mathFinalScore');
    this.mathScorePercent = document.getElementById('mathScorePercent');
    this.mathReviewList = document.getElementById('mathReviewList');
    this.btnExitFinishedExam = document.getElementById('btnExitFinishedExam');
  }

  attachEventListeners() {
    // Form submission
    this.joinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.initiateExam();
    });

    // Dismiss warning overlay
    this.btnDismissWarning.addEventListener('click', () => {
      this.warningOverlay.classList.remove('active');
      if (this.isExamActive && !this.isExamSubmitted) {
        this.liveBadge.className = 'status-badge active';
        this.liveBadge.innerText = '● Monitored & Secure';
        this.sendEvent('return', 'Returned to FormGuard exam');
      }
      window.focus();
    });

    // Submit Exam from top bar -> Opens in-app modal
    this.btnSubmitExam.addEventListener('click', () => {
      this.openSubmitModal();
    });

    // In-app submit modal buttons
    if (this.btnCancelSubmitExam) {
      this.btnCancelSubmitExam.addEventListener('click', () => {
        this.isSubmitting = false;
        if (this.modalConfirmSubmit) this.modalConfirmSubmit.classList.remove('active');
      });
    }

    if (this.btnConfirmSubmitExam) {
      this.btnConfirmSubmitExam.addEventListener('click', () => {
        if (this.modalConfirmSubmit) this.modalConfirmSubmit.classList.remove('active');
        this.isSubmitting = false;
        this.isExamActive = false;
        this.isExamSubmitted = true;
        this.processExamResults();
      });
    }

    // Math Navigation
    this.btnMathPrev.addEventListener('click', () => {
      if (this.currentQuestionIdx > 0) {
        this.currentQuestionIdx--;
        this.renderQuestion(this.currentQuestionIdx);
      }
    });

    this.btnMathNext.addEventListener('click', () => {
      if (this.currentQuestionIdx < MATH_QUESTIONS.length - 1) {
        this.currentQuestionIdx++;
        this.renderQuestion(this.currentQuestionIdx);
      } else {
        // Last question -> Open in-app submit modal
        this.openSubmitModal();
      }
    });

    // Exit Exam from Results Screen
    if (this.btnExitFinishedExam) {
      this.btnExitFinishedExam.addEventListener('click', async () => {
        await this.finalizeExam('submitted');
      });
    }

    // Setup native & browser focus / blur proctoring
    this.setupFocusTracking();
  }

  setupFocusTracking() {
    let lastViolationTime = 0;

    const triggerAltTabViolation = (combo = 'Alt+Tab') => {
      // STRICT FILTER: ONLY trigger if exam is actively in progress and student has NOT clicked submit or finished
      if (!this.isExamActive || this.isSubmitting || this.isExamSubmitted) return;

      const now = Date.now();
      if (now - lastViolationTime < 1500) return; // Debounce
      lastViolationTime = now;

      Utils.playWarningSound();
      this.warningOverlay.classList.add('active');
      this.liveBadge.className = 'status-badge away';
      this.liveBadge.innerText = '⚠️ ALT-TAB ATTEMPT (ALERT)';

      this.sendEvent('away', `Attempted to leave exam window using ${combo}`);
    };

    // 1. Electron IPC Alt-Tab and Window-Switch trap
    if (window.formguard && window.formguard.onAltTabDetected) {
      window.formguard.onAltTabDetected((payload) => {
        triggerAltTabViolation(payload?.key || 'Alt+Tab');
      });
    }

    // 2. Keyboard Lockdown: Specifically trap Alt+Tab, Alt+F4, Alt+Escape
    window.addEventListener('keydown', (e) => {
      if (!this.isExamActive || this.isSubmitting || this.isExamSubmitted) return;

      // Trap Alt + Tab
      if (e.altKey && (e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9)) {
        e.preventDefault();
        e.stopPropagation();
        triggerAltTabViolation('Alt+Tab');
        return;
      }

      // Trap Alt + F4 or Alt + Escape
      if (e.altKey && (e.key === 'F4' || e.code === 'F4' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
        triggerAltTabViolation(e.key === 'F4' ? 'Alt+F4' : 'Alt+Escape');
        return;
      }

      // Trap developer & inspect keys
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J'))) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // 3. Website/Browser Tab Switch Trap: fires ONLY if user switches browser tab or minimizes
    document.addEventListener('visibilitychange', () => {
      if (!this.isExamActive || this.isSubmitting || this.isExamSubmitted) return;
      if (document.visibilityState === 'hidden') {
        triggerAltTabViolation('Tab/Window Switch');
      }
    });

    // 4. Disable context menu / right click during exam
    window.addEventListener('contextmenu', (e) => {
      if (this.isExamActive && !this.isExamSubmitted) {
        e.preventDefault();
      }
    });
  }

  async initiateExam() {
    const code = this.codeInput.value.trim().toUpperCase();
    const studentId = (this.studentIdInput ? this.studentIdInput.value : '').trim().toUpperCase();
    const pin = (this.studentPinInput ? this.studentPinInput.value : '').trim();
    const name = this.nameInput ? this.nameInput.value.trim() : '';
    this.host = this.serverHostInput.value.trim() || 'localhost';

    if (!code || !studentId || !pin) {
      alert('Please enter your Exam Join Code, Student ID, and secret Access PIN.');
      return;
    }

    // Get hardware fingerprint and device info
    let deviceName = 'Student PC';
    let deviceId = `dev_${Math.random().toString(36).substring(2, 10)}`;
    let osInfo = 'Desktop';

    if (window.formguard) {
      try {
        const info = await window.formguard.getDeviceInfo();
        deviceId = info.deviceId || deviceId;
        deviceName = info.hostname || deviceName;
        osInfo = `${info.platform} (${info.arch})`;
      } catch (e) {
        console.warn('Failed to get device info:', e);
      }
    }

    // Connect to proctor server
    const wsUrl = `ws://${this.host}:${this.port}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        action: 'student-join',
        code,
        studentId,
        pin,
        name,
        deviceId,
        deviceName,
        os: osInfo
      }));
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleServerMessage(data);
      } catch (err) {
        console.error('[Student] Message error:', err);
      }
    };

    this.ws.onerror = () => {
      alert(`Could not connect to Teacher Proctor Hub at ${this.host}:${this.port}. Please verify the IP address or host.`);
    };

    this.ws.onclose = () => {
      if (this.isExamActive && !this.isExamSubmitted) {
        this.liveBadge.className = 'status-badge offline';
        this.liveBadge.innerText = '🔴 Reconnecting...';
      }
    };
  }

  async handleServerMessage(data) {
    if (data.type === 'error') {
      alert(`Exam Verification Failed:\n${data.message}`);
      if (this.ws) this.ws.close();
      return;
    }

    if (data.type === 'joined-success') {
      this.session = data;
      await this.startExamRunner();
    }

    if (data.type === 'teacher-command') {
      if (data.actionType === 'warn') {
        Utils.playWarningSound();
        alert(`🚨 MESSAGE FROM PROCTOR:\n\n"${data.message}"`);
      } else if (data.actionType === 'force-submit') {
        alert(`⚠️ Your exam session has been concluded by the proctor: ${data.message}`);
        await this.finalizeExam('terminated');
      }
    }
  }

  async startExamRunner() {
    this.isExamActive = true;
    this.isSubmitting = false;
    this.isExamSubmitted = false;
    this.startTime = Date.now();
    this.currentQuestionIdx = 0;
    this.answers = {};

    // Update UI headers
    this.titleBar.innerText = 'Math Assessment (Proctored)';
    this.nameDisplay.innerText = `${this.session.name || 'Student'} (${this.session.studentId})`;

    // Switch View to Exam Runner
    document.getElementById('viewStudentSetup').classList.remove('active');
    document.getElementById('viewStudentExam').classList.add('active');

    // Hide top navigation header during lockdown
    document.getElementById('appHeader').style.display = 'none';

    // Enter Strict Lockdown (Electron Kiosk or Browser HTML5 Fullscreen)
    if (window.formguard) {
      await window.formguard.setLockdown(true, true);
    } else {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn('Browser fullscreen request:', err);
      }
    }

    // Reset view state
    this.mathQuestionCard.style.display = 'flex';
    this.mathResultsCard.style.display = 'none';
    this.warningOverlay.classList.remove('active');

    // Start timers
    this.startStopwatch();
    this.startHeartbeat();

    // Render Question 1
    this.renderQuestion(0);
  }

  renderQuestion(idx) {
    const q = MATH_QUESTIONS[idx];
    if (!q) return;

    // Badges & Labels
    this.mathCategoryBadge.innerText = `Mathematics • ${q.topic}`;
    this.mathProgressLabel.innerText = `Question ${idx + 1} of ${MATH_QUESTIONS.length}`;
    this.mathQuestionText.innerText = q.question;

    // Render Navigation Pills
    this.mathPillRow.innerHTML = '';
    MATH_QUESTIONS.forEach((item, i) => {
      const pill = document.createElement('div');
      pill.className = `math-pill ${i === idx ? 'active' : ''} ${this.answers[item.id] ? 'answered' : ''}`;
      pill.innerText = i + 1;
      pill.title = `Jump to Question ${i + 1}`;
      pill.addEventListener('click', () => {
        this.currentQuestionIdx = i;
        this.renderQuestion(i);
      });
      this.mathPillRow.appendChild(pill);
    });

    // Render Options
    this.mathOptionsGrid.innerHTML = '';
    const selectedKey = this.answers[q.id];

    q.options.forEach(opt => {
      const card = document.createElement('div');
      const isSelected = selectedKey === opt.key;
      card.className = `math-option-card ${isSelected ? 'selected' : ''}`;

      card.innerHTML = `
        <div class="math-opt-key">${opt.key}</div>
        <div class="math-opt-text">${opt.text}</div>
      `;

      card.addEventListener('click', () => {
        this.answers[q.id] = opt.key;
        this.renderQuestion(idx);
      });

      this.mathOptionsGrid.appendChild(card);
    });

    // Navigation buttons state
    this.btnMathPrev.style.visibility = idx > 0 ? 'visible' : 'hidden';

    if (idx === MATH_QUESTIONS.length - 1) {
      this.btnMathNext.innerText = 'Submit Exam ✓';
      this.btnMathNext.className = 'btn btn-success btn-sm';
    } else {
      this.btnMathNext.innerText = 'Next Question →';
      this.btnMathNext.className = 'btn btn-primary btn-sm';
    }

    // Answer status
    const answeredCount = Object.keys(this.answers).length;
    this.mathAnsweredStatus.innerText = `${answeredCount} of ${MATH_QUESTIONS.length} Answered`;
  }

  openSubmitModal() {
    this.isSubmitting = true;
    const answeredCount = Object.keys(this.answers).length;
    const unanswered = MATH_QUESTIONS.length - answeredCount;

    if (this.submitModalMessage) {
      if (unanswered > 0) {
        this.submitModalMessage.innerText = `You have answered ${answeredCount} of ${MATH_QUESTIONS.length} questions. You still have ${unanswered} unanswered. Are you sure you want to submit now?`;
      } else {
        this.submitModalMessage.innerText = 'You have answered all 5 questions. Ready to submit your exam?';
      }
    }

    if (this.modalConfirmSubmit) {
      this.modalConfirmSubmit.classList.add('active');
    }
  }

  processExamResults() {
    this.isExamActive = false;
    this.isExamSubmitted = true;
    this.warningOverlay.classList.remove('active');

    clearInterval(this.timerInterval);
    clearInterval(this.heartbeatInterval);

    // Calculate score
    let score = 0;
    MATH_QUESTIONS.forEach(q => {
      if (this.answers[q.id] === q.correct) {
        score++;
      }
    });

    const percent = Math.round((score / MATH_QUESTIONS.length) * 100);

    // Send final submitted event and score to proctor
    this.sendEvent('submitted', `Completed Math Exam. Score: ${score}/${MATH_QUESTIONS.length} (${percent}%)`);

    // Render Results Screen
    this.mathFinalScore.innerText = `${score} / ${MATH_QUESTIONS.length}`;
    this.mathScorePercent.innerText = `${percent}% Correct • Completed in ${this.timerDisplay.innerText}`;

    // Render detailed review list
    this.mathReviewList.innerHTML = '';
    MATH_QUESTIONS.forEach(q => {
      const studentChoice = this.answers[q.id] || 'None';
      const isCorrect = studentChoice === q.correct;

      const item = document.createElement('div');
      item.style.padding = '8px 10px';
      item.style.borderRadius = '6px';
      item.style.background = isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
      item.style.border = `1px solid ${isCorrect ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`;

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 2px;">
          <span>Q${q.id}: ${q.topic}</span>
          <span style="color: ${isCorrect ? '#34d399' : '#f87171'};">${isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
        </div>
        <div style="font-size: 0.78rem; color: #cbd5e1;">Your Answer: <b>${studentChoice}</b> | Correct: <b>${q.correct}</b></div>
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">${q.explanation}</div>
      `;
      this.mathReviewList.appendChild(item);
    });

    // Switch view to results card
    this.mathQuestionCard.style.display = 'none';
    this.mathResultsCard.style.display = 'block';
  }

  sendEvent(eventType, detail = '') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      action: 'student-event',
      eventType,
      detail
    }));
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'student-heartbeat' }));
      }
    }, 3000);
  }

  startStopwatch() {
    this.timerInterval = setInterval(() => {
      const elapsedSecs = Math.floor((Date.now() - this.startTime) / 1000);
      this.timerDisplay.innerText = Utils.formatStopwatch(elapsedSecs);
    }, 1000);
  }

  async finalizeExam(reason = 'submitted') {
    this.isExamActive = false;
    this.isExamSubmitted = true;
    clearInterval(this.timerInterval);
    clearInterval(this.heartbeatInterval);

    // Release Strict Lockdown (Electron or Browser Fullscreen)
    if (window.formguard) {
      await window.formguard.exitLockdown();
    } else {
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch (err) {}
    }

    // Restore top header
    document.getElementById('appHeader').style.display = 'flex';

    // Return to setup or home
    document.getElementById('viewStudentExam').classList.remove('active');
    document.getElementById('viewHome').classList.add('active');
    document.getElementById('btnNavHome').style.display = 'none';

    if (this.ws) {
      this.ws.close();
    }
  }
}
