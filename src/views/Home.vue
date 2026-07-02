<script setup lang="ts">
// [WHY] 首页容器组件 - 组装各个子组件
// [WHAT] 管理共享状态、数据刷新、弹窗控制

import { ref, computed, onMounted, onUnmounted, onErrorCaptured, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useHoldingStore } from '@/stores/holding'
import { useNetworkStore } from '@/stores/network'
import { showToast } from 'vant'
import { logger, copyLogsToClipboard, exportLogsAsText } from '@/utils/logger'
import { useHomeData } from '@/composables/useHomeData'
import { useActionSheet } from '@/composables/useActionSheet'
import { useHoldingsLogic } from '@/composables/useHoldingsLogic'
import { useHomePopups } from '@/composables/useHomePopups'
import type { MarketIndexSimple } from '@/api/fundFast'

const router = useRouter()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()
const networkStore = useNetworkStore()
const { t, locale } = useI18n()

// 使用首页数据 hook
const { 
  indices, 
  globalIndices, 
  tradingSession, 
  currentTime, 
  isRefreshing, 
  isWeekend,
  hs300ChangePercent,
  topIndices,
  combinedIndices,
  mobileIndices,
  loadIndices, 
  loadGlobalIndices 
} = useHomeData()

// ActionSheet composable
const actionSheet = useActionSheet()

// 持仓逻辑 composable
const {
  sortDirection,
  uiMode,
  currentAssetClassFilter,
  currentSourceFilter,
  totalTodayProfit,
  totalTodayProfitPercent,
  observeTodayProfit,
  observeTodayProfitPercent,
  normalHoldings,
  observeHoldings,
  handleSort,
  filterBySource,
  filterByAssetClass,
} = useHoldingsLogic()

// 弹窗状态 composable
const {
  showTopHoldingsPopup,
  topHoldingsFund,
  openTopHoldings,
  showIntradayPopup,
  intradayFund,
  openIntradayModal,
} = useHomePopups()

// 自动刷新开关状态
const autoRefreshEnabled = ref(true)
let autoRefreshInterval: number | undefined

// 错误捕获
const hasError = ref(false)
const errorMessage = ref('')

onErrorCaptured((err, _instance, info) => {
  logger.error('[Home.vue] 组件错误', {
    error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    info,
  })
  hasError.value = true
  errorMessage.value = err instanceof Error ? err.message : String(err)
  return false
})

// 监听自动刷新状态变化
watch(autoRefreshEnabled, (newValue) => {
  if (newValue) {
    autoRefreshInterval = window.setInterval(refreshData, 60000)
    showToast('自动刷新已开启')
  } else {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval)
      autoRefreshInterval = undefined
    }
    showToast('自动刷新已关闭')
  }
})

// ========== 操作方法 ==========
async function refreshData() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  logger.info('refreshData start')
  try {
    await Promise.all([
      loadIndices(),
      loadGlobalIndices(),
      holdingStore.refreshEstimates()
    ])
    showToast('刷新成功')
  } catch (err) {
    logger.error('refreshData failed', err)
    showToast('刷新失败，请重试')
  } finally {
    isRefreshing.value = false
  }
}

async function onRefresh() {
  isRefreshing.value = true
  try {
    await Promise.all([
      fundStore.refreshEstimates(),
      loadIndices(),
      loadGlobalIndices()
    ])
    showToast('刷新成功')
  } finally {
    isRefreshing.value = false
  }
}

async function handleDelete(code: string) {
  try {
    // This would use showConfirmDialog in production
    fundStore.removeFund(code)
    showToast('已删除')
  } catch {
    // 用户取消
  }
}

function onActionSheetSelect(index: number) {
  actionSheet.onSelect(index, {
    refreshData,
    onCopyLogs: () => {
      copyLogsToClipboard()
      showToast('日志已复制到剪贴板')
    },
    onExportLogs: () => {
      exportLogsAsText()
      showToast('日志已导出')
    },
    router,
    holdingStore,
  })
}

function onCopyLogs() {
  copyLogsToClipboard()
  showToast('日志已复制到剪贴板')
}

// ========== 生命周期 ==========
onMounted(() => {
  logger.info('Home.vue onMounted')
  refreshData()
  
  // 启动自动刷新
  if (autoRefreshEnabled.value) {
    autoRefreshInterval = window.setInterval(refreshData, 60000)
  }
})

onUnmounted(() => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval)
  }
})
</script>

<template>
  <div class="home-page">
    <!-- 顶部搜索栏 -->
    <div class="top-header">
      <div class="header-left">
        <span class="app-title web-only">{{ t('home.app_title_full') }}</span>
        <span class="app-title mobile-only">{{ t('home.app_title_short') }}</span>
        
        <!-- 网页端：参考均线和指数横向显示 -->
        <div class="web-only">
          <div class="reference-ma-badge header-ma-badge">
            <span class="reference-ma-label">{{ t('home.reference_ma') }}</span>
            <span class="reference-ma-value" :class="hs300ChangePercent >= 0 ? 'up' : 'down'">
              {{ hs300ChangePercent >= 0 ? '+' : '' }}{{ hs300ChangePercent.toFixed(2) }}%
            </span>
          </div>
          <div class="top-indices-bar" v-if="topIndices.length > 0">
            <div 
              v-for="index in topIndices" 
              :key="index.code"
              class="top-index-item"
              :class="[index.changePercent >= 0 ? 'up' : 'down']"
              @click="router.push('/market')"
            >
              <span class="top-index-name">{{ index.name }}</span>
              <span class="top-index-change">
                {{ index.changePercent >= 0 ? '+' : '' }}{{ index.changePercent.toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>
        
        <!-- 移动端：参考均线和指数横向排列 -->
        <div class="mobile-indices-container mobile-only">
          <div class="mobile-ma-item">
            <span class="mobile-ma-name">{{ t('home.reference_ma') }}</span>
            <span class="mobile-ma-value">
              {{ hs300ChangePercent >= 0 ? '+' : '' }}{{ hs300ChangePercent.toFixed(2) }}%
            </span>
          </div>
          <div 
            v-for="index in topIndices" 
            :key="index.code"
            class="mobile-index-item"
            :class="[index.changePercent >= 0 ? 'up' : 'down']"
            @click="router.push('/market')"
          >
            <span class="mobile-index-name">{{ index.name }}</span>
            <span class="mobile-index-change">
              {{ index.changePercent >= 0 ? '+' : '' }}{{ index.changePercent.toFixed(2) }}%
            </span>
          </div>
        </div>
      </div>
      
      <QuickActionsBar
        v-model:auto-refresh-enabled="autoRefreshEnabled"
        @refresh="refreshData"
        @copy-logs="onCopyLogs"
        @go-to-settings="router.push('/about')"
      />
    </div>
    
    <!-- 资产类别筛选栏 -->
    <AssetClassFilter
      v-if="holdingStore.holdings.length > 0"
      :current-filter="currentAssetClassFilter"
      @update:current-filter="(val: any) => currentAssetClassFilter = val"
    />
    
    <!-- 下拉刷新列表 -->
    <van-pull-refresh 
      v-model="fundStore.isRefreshing" 
      @refresh="onRefresh"
      class="fund-list-container"
      :data-test-id="'loading'"
    >
      <!-- 错误降级显示 -->
      <div v-if="hasError" class="error-fallback" :data-test-id="'error-message'">
        <div class="error-icon">⚠️</div>
        <div class="error-title">{{ t('home.error_title') }}</div>
        <div class="error-detail">{{ errorMessage || t('home.error_detail') }}</div>
        <van-button round type="primary" @click="() => { hasError = false; refreshData(); }">
          {{ t('home.retry') }}
        </van-button>
      </div>
      
      <!-- 资产总览卡片 + 持仓网格 -->
      <DashboardSummary
        v-if="holdingStore.holdings.length > 0"
        :total-today-profit="totalTodayProfit"
        :total-today-profit-percent="totalTodayProfitPercent"
        :observe-today-profit="observeTodayProfit"
        :observe-today-profit-percent="observeTodayProfitPercent"
        :is-weekend="isWeekend"
        :sort-direction="sortDirection"
        :ui-mode="uiMode"
        :current-source-filter="currentSourceFilter"
        :current-asset-class-filter="currentAssetClassFilter"
        @update:sort-direction="(val: any) => sortDirection = val"
        @update:ui-mode="(val: any) => uiMode = val"
        @filter-by-source="(source: string) => filterBySource(source)"
        @filter-by-asset-class="(assetClass: any) => filterByAssetClass(assetClass)"
      />
      
      <HoldingsGrid
        v-if="holdingStore.holdings.length > 0"
        :normal-holdings="normalHoldings"
        :observe-holdings="observeHoldings"
        :ui-mode="uiMode"
        :trading-session="tradingSession"
        :is-weekend="isWeekend"
        :observe-today-profit-percent="observeTodayProfitPercent"
        @open-top-holdings="openTopHoldings"
        @open-intraday-modal="openIntradayModal"
      />
      
      <!-- 资产分配图 -->
      <AssetAllocationChart />
      
      <!-- 市场概览 -->
      <MarketOverview
        :combined-indices="combinedIndices"
        :mobile-indices="mobileIndices"
      />
      
      <!-- 资讯快讯 -->
      <NewsFlashSection />
      
      <!-- 自选基金列表 -->
      <WatchlistSection
        :watchlist="fundStore.watchlist"
        :last-refresh-time="fundStore.lastRefreshTime"
        @delete="handleDelete"
        @go-to-detail="(code: string) => router.push(`/detail/${code}`)"
        @go-to-search="() => router.push('/search')"
      />
      
      <!-- 底部占位 -->
      <div class="bottom-spacer"></div>
    </van-pull-refresh>

    <!-- 前10大重仓股弹窗 -->
    <TopHoldingsPopup
      v-model:show="showTopHoldingsPopup"
      :fund="topHoldingsFund"
    />

    <!-- 当日分时估值弹窗 -->
    <IntradayChartPopup
      v-model:show="showIntradayPopup"
      :fund="intradayFund"
    />

    <!-- ActionSheet 快捷操作菜单 -->
    <van-action-sheet
      :show="actionSheet.show.value"
      :title="actionSheet.title.value"
      :actions="actionSheet.actions.value"
      @update:show="actionSheet.show.value = $event"
      @select="onActionSheetSelect"
    />
  </div>
</template>

<style scoped>
/* ========== 首页布局样式 ========== */
.home-page {
  height: 100%;
  background: var(--bg-primary);
  transition: background-color 0.3s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部搜索栏 - 交易终端风格 */
.top-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
  background: linear-gradient(180deg, var(--bg-secondary) 0%, rgba(22, 27, 34, 0.95) 100%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-primary) 0%, #ffca28 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

/* 下拉刷新容器 */
.fund-list-container {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
}

/* 底部占位 */
.bottom-spacer {
  height: calc(60px + env(safe-area-inset-bottom, 0px));
}

/* ========== 错误降级显示 ========== */
.error-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.error-detail {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 24px;
  max-width: 300px;
  word-break: break-all;
}

/* ========== 移动端适配 ========== */
@media (max-width: 767px) {
  .web-only {
    display: none !important;
  }
  
  .top-header {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    padding-top: calc(8px + env(safe-area-inset-top, 0px));
  }
  
  .header-left {
    flex-shrink: 0;
  }
  
  .app-title {
    font-size: 16px;
  }
  
  .mobile-indices-container {
    display: flex;
    flex-direction: row;
    gap: 6px;
    margin-left: 8px;
    flex-wrap: nowrap;
    overflow-x: auto;
  }
}

@media (min-width: 768px) {
  .mobile-only {
    display: none !important;
  }
  
  .top-indices-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 20px;
    flex: 1;
  }
  
  .reference-ma-badge {
    margin-left: 50px;
  }
  
  .header-ma-badge {
    margin-left: 50px;
  }
}
</style>
