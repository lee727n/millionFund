// [WHY] 应用入口文件，初始化 Vue 应用和插件
// [WHAT] 注册 Pinia、Vue Router、Vant 等插件

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

// [WHY] 导入 Vant 样式和必要的函数组件样式
import 'vant/lib/index.css'

// 导入全局样式
import './style.css'

// [WHY] 导入主题CSS变量
import './styles/theme.css'

// [WHY] 导入响应式布局样式
import './styles/responsive.css'

const pinia = createPinia()
const app = createApp(App)

// [WHAT] 注册 Pinia 状态管理
app.use(pinia)

// [WHAT] 注册 Vue Router
app.use(router)

app.mount('#app')

// [WHAT] 检查版本并清除旧缓存
import { checkVersionAndClearCache } from './utils/storage'
checkVersionAndClearCache()

// [WHAT] 初始化主题
import { useThemeStore } from './stores/theme'
const themeStore = useThemeStore()
themeStore.initTheme()

// [WHAT] 初始化移动端默认缓存
// [WHY] 移动端 WebView 对 JSONP 有限制，首次运行需要预设数据
import { initMobileDefaultCache } from './api/tiantianApi'
initMobileDefaultCache()
