// [WHY] 应用入口文件，初始化 Vue 应用和插件
// [WHAT] 注册 Pinia、Vue Router、Vant 等插件
// [NOTE] 所有 import 必须在文件顶部（ESM 规范），非顶层 import 会导致打包异常

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

import { logger } from '@/utils/logger'
import { checkVersionAndClearCache, checkSchemaAndMigrate } from '@/utils/storage'
import { useThemeStore } from '@/stores/theme'
import { initMobileDefaultCache, initHolidayData } from '@/api/tiantianApi'

// [WHY] 导入 Vant 样式和必要的函数组件样式
import 'vant/lib/index.css'
import './style.css'
import './styles/theme.css'
import './styles/responsive.css'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

// [WHY] 全局 Vue 错误处理器 - 捕获组件渲染/事件处理中的未处理异常
// [NOTE] 同时写入 logger，便于用户通过"复制日志"带过来
app.config.errorHandler = (err, _instance, info) => {
  logger.error('[Vue Error]', { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), info })
}

// [WHY] 全局未处理 Promise 拒绝 - 捕获 async 函数中未 catch 的错误
// [NOTE] 同样写入 logger
window.onunhandledrejection = (event) => {
  const reason = event.reason
  logger.error('[Unhandled Rejection]', {
    reason: reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
}

// [WHAT] 注册 PWA Service Worker（仅在生产环境，且非 Electron 环境）
// [WHY] Electron 环境不支持 Service Worker，且 Linux aarch64 环境下可能失败
const isElectronEnv = typeof (window as any).electronAPI !== 'undefined' || navigator.userAgent?.includes('Electron')
const isSupportedSWEnvironment = 'serviceWorker' in navigator 
  && window.location.protocol !== 'file:' 
  && !isElectronEnv
  && !(/Linux aarch64/.test(navigator.userAgent || ''))

if (isSupportedSWEnvironment) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      logger.info('Service Worker 注册成功', { scope: reg.scope })
    }).catch((err) => {
      logger.warn('Service Worker 注册失败', err)
    })
  })
} else {
  logger.info('Service Worker 注册跳过（环境不支持）', { 
    isElectron: isElectronEnv, 
    userAgent: navigator.userAgent 
  })
}

app.mount('#app')

// [WHAT] 检查版本并清除旧缓存
// [WHY] 版本号变更后需要清理旧的 localStorage 数据，避免读到格式不一致的旧数据
checkVersionAndClearCache()
logger.info('版本缓存检查')

// [WHY] 数据 schema 迁移：老用户升级后需要补全新字段，否则会读取到 undefined
checkSchemaAndMigrate().then((result) => {
  logger.info('Schema 迁移', { applied: result.appliedMigrations.length, finalVersion: result.finalVersion })
}).catch((err) => {
  logger.warn('Schema 迁移失败', err)
})

// [WHAT] 初始化主题
const themeStore = useThemeStore()
themeStore.initTheme()
logger.info('主题初始化', { current: themeStore.currentTheme })

// [WHAT] 初始化移动端默认缓存
// [WHY] 移动端 WebView 对 JSONP 有限制，首次运行需要预设数据
try {
  initMobileDefaultCache()
  logger.info('移动端默认缓存初始化完成')
} catch (err) {
  logger.warn('移动端默认缓存初始化失败', err)
}

	// [WHAT] 初始化节假日数据（API + 兜底降级）
	// [WHY] 替代硬编码集合，每年自动适配无需手动更新
	// [NOTE] fire-and-forget，先由兜底保障，API 返回后自动覆盖
	initHolidayData().then(() => {
	  logger.info('节假日数据初始化完成')
	}).catch((err) => {
	  logger.warn('节假日数据初始化失败，使用兜底数据', err)
	})
