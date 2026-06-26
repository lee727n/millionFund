// Electron 42+ main process entry
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

// 保持窗口引用，防止被垃圾回收
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 390,
    height: 844,
    minWidth: 360,
    minHeight: 640,
    title: 'AI百万实盘',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // macOS 无边框风格
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  })

  // 开发模式加载 Vite dev server，生产模式加载打包文件
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// macOS: 点击 dock 图标时重新创建窗口
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
