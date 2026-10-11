const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('formguard', {
  isElectron: true,
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  setLockdown: (enable, strict = true) => ipcRenderer.invoke('set-lockdown', enable, strict),
  exitLockdown: () => ipcRenderer.invoke('exit-lockdown'),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  openGoogleLogin: () => ipcRenderer.invoke('open-google-login'),
  
  // Window events
  onAltTabDetected: (callback) => {
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on('alt-tab-detected', subscription);
    return () => ipcRenderer.removeListener('alt-tab-detected', subscription);
  },
  onNativeBlur: (callback) => {
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on('native-window-blur', subscription);
    return () => ipcRenderer.removeListener('native-window-blur', subscription);
  },
  onNativeFocus: (callback) => {
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on('native-window-focus', subscription);
    return () => ipcRenderer.removeListener('native-window-focus', subscription);
  },
  
  // App controls
  closeApp: () => ipcRenderer.send('app-close'),
  minimizeApp: () => ipcRenderer.send('app-minimize')
});
