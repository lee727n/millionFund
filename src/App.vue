<script setup lang="ts">
// [WHY] 根组件，包含路由视图和底部导航
// [WHAT] 使用自定义 Tabbar 实现底部导航切换
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
    const mainPages = ['home', 'holding', 'ai-tracking', 'trade-center']
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
      holding: 'holding',
      'ai-tracking': 'ai',
      'trade-center': 'trader'
    }
    if (name && tabMap[name as string]) {
      activeTab.value = tabMap[name as string]
    }
  },
  { immediate: true }
)

function goToHolding() {
  router.push('/holding')
}

function goToHome() {
  router.push('/')
}

function goToAITracking() {
  router.push('/ai-tracking')
}

function goToTradeCenter() {
  router.push('/trade-center')
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
    <!-- [WHY] 使用 keep-alive 缓存指定页面，避免重复加载 -->
    <div class="page-wrapper">
      <router-view v-slot="{ Component }">
        <keep-alive include="home,ai-tracking,portfolio,market">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>

    <!-- 底部导航栏 - 3按钮 + 中心凸起圆形Trader -->
    <!-- [WHY] 布局：我的持仓 | AI追踪(中心) | 趋势行情，中心上方凸起圆形Trader -->
    <nav v-if="showTabbar" class="custom-tabbar">
      <!-- 左侧：我的持仓 -->
      <div class="tabbar-side-item" :class="{ 'is-active': activeTab === 'holding' }" @click="goToHolding">
        <van-icon name="balance-list-o" :size="22" />
        <span>我的持仓</span>
      </div>

      <!-- 中间：AI追踪 + 上方凸起圆形Trader -->
      <div class="tabbar-center-slot">
        <div class="tabbar-center-item" :class="{ 'is-active': activeTab === 'ai' }" @click="goToAITracking">
          <van-icon name="robot-o" :size="22" />
          <span>AI追踪</span>
        </div>
        <div 
          class="tabbar-raised-trader" 
          :class="{ 'is-active': activeTab === 'trader' }"
          @click="goToTradeCenter"
        >
          <van-icon name="chart-trending-o" :size="26" color="#fff" />
          <span>Trader</span>
        </div>
      </div>

      <!-- 右侧：趋势行情 -->
      <div class="tabbar-side-item" :class="{ 'is-active': activeTab === 'home' }" @click="goToHome">
        <van-icon name="home-o" :size="22" />
        <span>趋势行情</span>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.app-container {
  height: 100%;
  background: var(--bg-primary);
  transition: background-color 0.3s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.page-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* ============ 自定义 Tabbar 样式 ============ */
.custom-tabbar {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 64px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  padding: 0 8px;
  z-index: 100;
}

/* 两侧普通 tab 项 */
.tabbar-side-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
  font-size: 11px;
  gap: 2px;
  position: relative;
}

.tabbar-side-item::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 24px;
  background: var(--border-light);
}

.tabbar-side-item:active {
  transform: scale(0.95);
}

.tabbar-side-item.is-active {
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-weight: 600;
}

/* 中间区域 - AI追踪 + Trader圆形 */
.tabbar-center-slot {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.tabbar-center-slot::before,
.tabbar-center-slot::after {
  content: '';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 24px;
  background: var(--border-light);
}

.tabbar-center-slot::before {
  left: 0;
}

.tabbar-center-slot::after {
  right: 0;
}

.tabbar-center-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
  font-size: 11px;
  gap: 2px;
  padding-top: 32px;
}

.tabbar-center-item:active {
  transform: scale(0.95);
}

.tabbar-center-item.is-active {
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-weight: 600;
}

/* 中心凸起圆形 Trader 按钮 */
.tabbar-raised-trader {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 -2px 12px rgba(102, 126, 234, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.25s ease;
}

.tabbar-raised-trader span {
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  margin-top: 1px;
  letter-spacing: 0.3px;
}

.tabbar-raised-trader.is-active {
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  box-shadow: 0 -2px 14px rgba(14, 165, 233, 0.6);
}

.tabbar-raised-trader:active {
  transform: translateX(-50%) scale(0.92);
}

/* 浅色主题适配 */
[data-theme="light"] .custom-tabbar {
  background: #ffffff;
  border-top: 1px solid #e6eaef;
}

[data-theme="light"] .tabbar-side-item__text {
  color: #666 !important;
}
</style>
