const { app, BrowserWindow, ipcMain, globalShortcut, Menu, session } = require('electron');
const path = require('path');
const os = require('os');
const { ProctorServer, getLocalIpAddresses } = require('./server.js');

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let mainWindow = null;
let proctorServer = null;
let serverPort = 3456;
let isInLockdown = false;

async function startServer() {
  try {
    proctorServer = new ProctorServer(serverPort);
    await proctorServer.listen();
    console.log(`[FormGuard] Local server initiated on port ${serverPort}`);
  } catch (err) {
    console.error('[FormGuard] Error launching internal server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: 'FormGuard - Secure Exam Proctor & Monitor',
    backgroundColor: '#0f172a',
    frame: true, // Clean modern window frame
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  // Load the unified frontend
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Intercept window loss of focus during lockdown (Alt-Tab or task switch)
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed() && isInLockdown) {
      mainWindow.focus();
      mainWindow.webContents.send('alt-tab-detected', { key: 'Alt+Tab / Window Switch', timestamp: Date.now() });
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-window-focus', {
        timestamp: Date.now(),
        reason: 'User returned to FormGuard'
      });
    }
  });

  mainWindow.on('close', (e) => {
    if (isInLockdown) {
      e.preventDefault(); // Disallow closing during active exam lockdown
    }
  });
}

// IPC Handlers
ipcMain.handle('get-server-info', async () => {
  return {
    port: serverPort,
    ips: getLocalIpAddresses(),
    platform: process.platform,
    hostname: os.hostname()
  };
});

const crypto = require('crypto');
function getDeviceFingerprint() {
  const data = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.totalmem()}-${os.userInfo().username}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

ipcMain.handle('get-device-info', async () => {
  return {
    deviceId: getDeviceFingerprint(),
    hostname: os.hostname(),
    platform: process.platform,
    release: os.release(),
    arch: os.arch(),
    totalMemoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    username: os.userInfo().username
  };
});

ipcMain.handle('set-lockdown', async (_event, enable, strict = true) => {
  if (!mainWindow) return false;
  isInLockdown = enable;

  if (enable) {
    mainWindow.setFullScreen(true);
    if (strict) {
      mainWindow.setKiosk(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    // Specifically trap Alt+Tab, Alt+Escape, Alt+F4 and trigger violation
    const triggerAltTab = (keyName) => {
      if (isInLockdown && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.send('alt-tab-detected', { key: keyName, timestamp: Date.now() });
      }
    };

    try { globalShortcut.register('Alt+Tab', () => triggerAltTab('Alt+Tab')); } catch (e) {}
    try { globalShortcut.register('Alt+Escape', () => triggerAltTab('Alt+Escape')); } catch (e) {}
    try { globalShortcut.register('Alt+F4', () => triggerAltTab('Alt+F4')); } catch (e) {}
    try { globalShortcut.register('CommandOrControl+Tab', () => triggerAltTab('Ctrl+Tab')); } catch (e) {}
    try { globalShortcut.register('CommandOrControl+Shift+Tab', () => triggerAltTab('Ctrl+Shift+Tab')); } catch (e) {}

    // Block developer & navigation keys
    const silentBlockedKeys = [
      'CommandOrControl+Shift+I',
      'F12',
      'F11',
      'Escape',
      'CommandOrControl+R',
      'CommandOrControl+W',
      'CommandOrControl+Q'
    ];
    silentBlockedKeys.forEach(key => {
      try { globalShortcut.register(key, () => {}); } catch (e) {}
    });
  } else {
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
    globalShortcut.unregisterAll();
  }
  return true;
});

ipcMain.handle('exit-lockdown', async () => {
  if (!mainWindow) return false;
  isInLockdown = false;
  mainWindow.setKiosk(false);
  mainWindow.setFullScreen(false);
  mainWindow.setAlwaysOnTop(false);
  globalShortcut.unregisterAll();
  return true;
});

ipcMain.on('app-close', () => {
  if (!isInLockdown && mainWindow) mainWindow.close();
});

ipcMain.handle('open-google-login', async () => {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 540,
      height: 680,
      title: 'Sign in with Google - FormGuard',
      parent: mainWindow,
      modal: true,
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:formguard',
        contextIsolation: true
      }
    });

    authWin.loadURL('https://accounts.google.com/ServiceLogin');

    authWin.webContents.on('did-navigate', (_e, url) => {
      // If user successfully reached their Google account page or completed login
      if (url.includes('myaccount.google.com') || (url.includes('google.com') && !url.includes('signin') && !url.includes('ServiceLogin'))) {
        setTimeout(() => {
          if (!authWin.isDestroyed()) authWin.close();
          resolve(true);
        }, 1200);
      }
    });

    authWin.on('closed', () => {
      resolve(true);
    });
  });
});

// App Lifecycle
app.whenReady().then(async () => {
  // Set clean Chrome User-Agent across sessions so Google OAuth allows sign-in
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
  const persistSession = session.fromPartition('persist:formguard');
  persistSession.setUserAgent(CHROME_USER_AGENT);

  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (proctorServer) {
    await proctorServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
