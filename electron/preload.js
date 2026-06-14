const { contextBridge } = require('electron')

// 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
})
