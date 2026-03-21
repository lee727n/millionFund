<script setup lang="ts">
// [WHY] 根组件，包含路由视图和底部导航
// [WHAT] 使用 Vant Tabbar 实现底部导航切换
// [NOTE] 公告和更新检查已移至 Home.vue 中处理
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'

// [WHAT] 水印文字
const watermarkText = '软件AI百万实盘NEW'

const route = useRoute()
const router = useRouter()

// [WHY] 处理 Android 返回键，防止直接退出应用
// [WHAT] 在主页时需要双击才能退出
let lastBackTime = 0
let backButtonHandler: ((e: any) => void) | null = null

onMounted(() => {
  // [WHAT] 仅在 Capacitor 原生环境下处理返回键
  // [WHY] Web 环境不需要处理
  const Capacitor = (window as any).Capacitor
  if (!Capacitor?.isNativePlatform?.()) return
  
  // [WHAT] 使用 Capacitor 全局对象注册返回键监听
  // [WHY] 避免导入 @capacitor/app 模块（Web 环境可能未安装）
  const plugins = Capacitor.Plugins
  if (!plugins?.App) return
  
  plugins.App.addListener('backButton', () => {
    // [WHY] 如果不在主页，正常返回上一页
    const mainPages = ['home', 'holding']
    const isMainPage = mainPages.includes(route.name as string)
    
    if (!isMainPage && window.history.length > 1) {
      router.back()
      return
    }
    
    // [WHY] 在主页时，双击退出
    const now = Date.now()
    if (now - lastBackTime < 2000) {
      // 2秒内双击返回键，退出应用
      plugins.App.exitApp()
    } else {
      lastBackTime = now
      showToast('再按一次退出应用')
    }
  })
  
  backButtonHandler = () => plugins.App.removeAllListeners()
})

onUnmounted(() => {
  if (backButtonHandler) {
    backButtonHandler(null)
  }
})

// [WHAT] 当前激活的 tab
const activeTab = ref('home')

// [WHAT] 需要隐藏底部导航的页面
const hiddenTabbarPages = ['search', 'detail', 'trades']
const showTabbar = computed(() => !hiddenTabbarPages.includes(route.name as string))

// [WHY] 路由变化时同步更新 tab 状态
watch(
  () => route.name,
  (name) => {
    const tabMap: Record<string, string> = {
      home: 'home',
      holding: 'holding'
    }
    if (name && tabMap[name as string]) {
      activeTab.value = tabMap[name as string]
    }
  },
  { immediate: true }
)

// [WHAT] 切换 tab 时跳转路由
function onTabChange(name: string | number) {
  const routeMap: Record<string, string> = {
    home: '/',
    holding: '/holding'
  }
  if (routeMap[name as string]) {
    router.push(routeMap[name as string])
  }
}
</script>

<template>
  <div class="app-container">
    <!-- 全局水印 -->
    <!-- <div class="watermark">
      <div class="watermark-content">
        <span v-for="i in 50" :key="i" class="watermark-text">{{ watermarkText }}</span>
      </div>
    </div> -->

    <!-- 路由视图 -->
    <!-- [WHY] 暂时禁用 keep-alive 避免页面缓存混乱 -->
    <!-- [WHY] 包装容器确保页面撑满剩余空间，正确处理 Android 滚动 -->
    <div class="page-wrapper">
      <router-view />
    </div>

    <!-- 底部导航栏 -->
    <van-tabbar
      v-if="showTabbar"
      v-model="activeTab"
      @change="onTabChange"
    >
      <van-tabbar-item name="holding" icon="balance-list-o">我的持仓</van-tabbar-item>
      <van-tabbar-item name="home" icon="home-o">趋势行情</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.app-container {
  /* [WHY] 固定高度，让子组件处理滚动 */
  height: 100%;
  /* [WHY] 使用主题变量 */
  background: var(--bg-primary);
  transition: background-color 0.3s;
  /* [WHY] 防止容器本身滚动，由子页面处理 */
  overflow: hidden;
  /* [WHY] 弹性布局，让 router-view 撑满剩余空间 */
  display: flex;
  flex-direction: column;
  /* [WHAT] 添加安全区支持，避免与系统状态栏重叠 */
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* [WHY] 页面包装器，撑满 tabbar 之外的所有空间 */
.page-wrapper {
  flex: 1;
  overflow: hidden;
  /* [WHY] 相对定位，让子页面可以使用绝对定位或百分比高度 */
  position: relative;
}

/* [WHY] 全局水印样式 */
/* [WHAT] 覆盖整个页面，半透明，不可点击 */
.watermark {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  pointer-events: none; /* [WHY] 不阻挡用户点击 */
  overflow: hidden;
}

.watermark-content {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  transform: rotate(-30deg); /* [WHY] 斜向排列更美观 */
}

.watermark-text {
  display: inline-block;
  padding: 30px 50px;
  font-size: 16px;
  font-weight: 500;
  color: rgba(128, 128, 128, 0.15); /* [WHY] 半透明灰色，不影响阅读 */
  white-space: nowrap;
  user-select: none;
}

/* 选中时的背景色 */
:deep(.van-tabbar-item--active) {
  background-color: #9c27b0 !important;
  color: white !important;
}
</style>
