// Main FormGuard Desktop Application Router & Coordinator

document.addEventListener('DOMContentLoaded', async () => {
  const views = {
    home: document.getElementById('viewHome'),
    teacher: document.getElementById('viewTeacher'),
    studentSetup: document.getElementById('viewStudentSetup'),
    studentExam: document.getElementById('viewStudentExam')
  };

  const btnNavHome = document.getElementById('btnNavHome');
  const serverIpDisplay = document.getElementById('serverIpDisplay');

  // Initialize Sub-Controllers
  const teacherController = new TeacherController();
  const studentController = new StudentController();

  let serverPort = 3456;
  let serverIps = ['127.0.0.1'];

  // Check if running inside Electron
  if (window.formguard) {
    try {
      const serverInfo = await window.formguard.getServerInfo();
      serverPort = serverInfo.port || 3456;
      serverIps = serverInfo.ips || ['127.0.0.1'];

      const primaryIp = serverIps[0] || '127.0.0.1';
      serverIpDisplay.innerText = `Hub: ${primaryIp}:${serverPort}`;
    } catch (e) {
      console.warn('Failed to get server info from main process:', e);
      serverIpDisplay.innerText = `Hub: Port ${serverPort}`;
    }
  } else {
    serverIpDisplay.innerText = 'Web Mode (Client)';
  }

  // Switch View Helper
  function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[viewName]) {
      views[viewName].classList.add('active');
    }

    // Toggle Back button
    if (viewName === 'home' || viewName === 'studentExam') {
      btnNavHome.style.display = 'none';
    } else {
      btnNavHome.style.display = 'inline-flex';
    }
  }

  // Navigation handlers
  btnNavHome.addEventListener('click', () => {
    switchView('home');
  });

  // Card Selection: Teacher
  document.getElementById('cardSelectTeacher').addEventListener('click', () => {
    switchView('teacher');
    teacherController.start(serverPort, 'localhost');
  });

  // Card Selection: Student
  document.getElementById('cardSelectStudent').addEventListener('click', () => {
    switchView('studentSetup');
    // Pre-fill Join Code if teacher already hosted
    if (teacherController.exam && teacherController.exam.code !== 'FG-READY') {
      document.getElementById('studentCodeInput').value = teacherController.exam.code;
    }
  });

  console.log('[FormGuard] Unified Desktop Application Initialized.');
});
