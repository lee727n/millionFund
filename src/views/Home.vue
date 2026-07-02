<script setup lang="ts">
// [WHY] 首页 - 展示自选基金列表、市场概览和快捷入口
// [WHAT] 支持下拉刷新、左滑删除、点击跳转搜索添加、设置提醒
// [REFACTOR] 已拆分为多个子组件：DashboardSummary、MarketOverview、HoldingsGrid、WatchlistSection

import { ref, onMounted, watch, computed, onUnmounted, onErrorCaptured } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useHoldingStore } from '@/stores/holding'
import { useNetworkStore } from '@/stores/network'
import { type MarketIndexSimple } from '@/api/fundFast'
import { showConfirmDialog, showToast } from 'vant'
import { logger, copyLogsToClipboard, exportLogsAsText } from '@/utils/logger'
import { useHomeData } from '@/composables/useHomeData'
import { useActionSheet } from '@/composables/useActionSheet'
import type { HoldingWithProfit } from '@/stores/holding'
import QuickActionsBar from '@/components/QuickActionsBar.vue'
import IntradayChartPopup from '@/components/IntradayChartPopup.vue'
import TopHoldingsPopup from '@/components/TopHoldingsPopup.vue'
import DashboardSummary from '@/components/home/DashboardSummary.vue'
import MarketOverview from '@/components/home/MarketOverview.vue'
import HoldingsGrid from '@/components/home/HoldingsGrid.vue'
import WatchlistSection from '@/components/home/WatchlistSection.vue'
import NewsFlashSection from '@/components/home/NewsFlashSection.vue'
import AssetAllocationChart from '@/components/home/AssetAllocationChart.vue'
import { ASSET_CLASS_CONFIG } from '@/types/holding'
import type { AssetClass } from '@/types/holding'

const router = useRouter()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()
const networkStore = useNetworkStore()
const { t, locale } = useI18n()

// 使用首页数据 hook
const { indices, globalIndices, tradingSession, currentTime, isRefreshing, loadIndices, loadGlobalIndices } = useHomeData()

// 弹窗可见性状态
const showTopHoldingsPopup = ref(false)
const topHoldingsFund = ref<{ code: string; name: string } | null>(null)

async function openTopHoldings(fund: HoldingWithProfit, event: Event) {
  event.stopPropagation()
  topHoldingsFund.value = { code: fund.code, name: fund.name }
  showTopHoldingsPopup.value = true
}

const showIntradayPopup = ref(false)
const intradayFund = ref<{ code: string; name: string } | null>(null)

function openIntradayModal(fund: HoldingWithProfit, event: Event) {
  event.stopPropagation()
  intradayFund.value = { code: fund.code, name: fund.name }
  showIntradayPopup.value = true
}

// 自动刷新开关状态
const autoRefreshEnabled = ref(true)
// 自动刷新定时器
let autoRefreshInterval: number | undefined
// [WHY] 子组件错误捕获 - 防止某只基金数据异常导致整个页面白屏
const hasError = ref(false)
const errorMessage = ref('')

// ActionSheet composable
const actionSheet = useActionSheet()

// [WHAT] 捕获所有子组件的渲染/运行时错误
onErrorCaptured((err, _instance, info) => {
  logger.error('[Home.vue] 组件错误', {
    error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    info,
  })
  hasError.value = true
  errorMessage.value = err instanceof Error ? err.message : String(err)
  // 返回 false 让错误继续冒泡到上层
  return false
})

// 监听自动刷新状态变化
watch(autoRefreshEnabled, (newValue) => {
  if (newValue) {
    // 启动自动刷新，每1分钟执行一次
    autoRefreshInterval = window.setInterval(refreshData, 60000)
    showToast('自动刷新已开启')
  } else {
    // 关闭自动刷新
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval)
      autoRefreshInterval = undefined
    }
    showToast('自动刷新已关闭')
  }
})

// [WHAT] 是否为周末
const isWeekend = computed(() => {
  const day = currentTime.value.getDay()
  return day === 0 || day === 6
})

// [WHAT] 顶部展示指数（上证指数、创业板指、纳斯达克）
const topIndices = computed(() => {
  const result: MarketIndexSimple[] = []
  // 上证指数
  const shIndex = indices.value.find(idx => idx.code === '000001')
  // 创业板指
  const cyIndex = indices.value.find(idx => idx.code === '399006')
  // 纳斯达克（从全球指数中查找）
  const nasdaqIndex = globalIndices.value.find(idx => idx.name.includes('纳斯达克'))
  
  if (shIndex) result.push(shIndex)
  if (cyIndex) result.push(cyIndex)
  if (nasdaqIndex) {
    result.push({
      code: nasdaqIndex.code,
      name: '纳斯达克',
      current: nasdaqIndex.price,
      change: nasdaqIndex.price * nasdaqIndex.changePercent / 100,
      changePercent: nasdaqIndex.changePercent
    })
  }
  
  return result
})

// [WHAT] 合并后的指数列表（大盘指数 + 全球指数）
const combinedIndices = computed(() => {
  // 使用Set存储已添加的指数名称，确保去重
  const addedIndexNames = new Set(indices.value.map(idx => idx.name))
  
  // 先添加大盘指数
  const result: MarketIndexSimple[] = [...indices.value]
  
  // 从全球指数中添加额外的指数，避免重复
  globalIndices.value.forEach(gidx => {
    // 检查是否已经添加过同名指数
    if (!addedIndexNames.has(gidx.name)) {
      // 添加到已添加列表
      addedIndexNames.add(gidx.name)
      // 转换为 MarketIndexSimple 类型
      result.push({
        code: gidx.code,
        name: gidx.name,
        current: gidx.price,
        change: gidx.price * gidx.changePercent / 100,
        changePercent: gidx.changePercent
      })
    }
  })
  
  return result
})

// [WHAT] 移动端专用指数列表 - 只显示6个主要指数，按指定顺序排列
const mobileIndices = computed(() => {
  const targetIndices = ['上证指数', '恒生指数', '日经225', '道琼斯', '标普500', '纳斯达克']
  return targetIndices.map(name => combinedIndices.value.find(idx => idx.name === name)).filter(Boolean) as MarketIndexSimple[]
})

// [WHAT] 计算当日盈亏总和（只计算非观察账户）
const totalTodayProfit = computed(() => {
  return normalHoldings.value.reduce((total, fund) => {
    if (fund.todayProfit) {
      return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
    }
    return total
  }, 0)
})

// [WHAT] 计算当日收益百分比（只计算非观察账户）
const totalTodayProfitPercent = computed(() => {
  const totalMarketValue = normalHoldings.value.reduce((total, fund) => {
    return total + (fund.marketValue || 0)
  }, 0)
  
  if (totalMarketValue === 0) return 0
  
  return (totalTodayProfit.value / totalMarketValue) * 100
})

// [WHAT] 计算观察账户当日收益
const observeTodayProfit = computed(() => {
  return observeHoldings.value.reduce((total, fund) => {
    if (fund.todayProfit) {
      return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
    }
    return total
  }, 0)
})

// [WHAT] 计算观察账户当日收益率
const observeTodayProfitPercent = computed(() => {
  const totalMarketValue = observeHoldings.value.reduce((total, fund) => {
    return total + (fund.marketValue || 0)
  }, 0)
  
  if (totalMarketValue === 0) return 0
  
  return (observeTodayProfit.value / totalMarketValue) * 100
})

// [WHAT] 排序方向
const sortDirection = ref<'up' | 'down' | 'none'>('down')

// [WHAT] UI模式：simple=简洁 / full=全功能
const uiMode = ref<'simple' | 'full'>('simple')

// [WHAT] 当前资产类别筛选（全平台支持）
const currentAssetClassFilter = ref<AssetClass | ''>('')

// [WHAT] 当前筛选来源
const currentSourceFilter = ref<string>('')

// [WHAT] 排序函数
function sortFunds(funds: any[]) {
  if (sortDirection.value === 'up') {
    return [...funds].sort((a, b) => {
      const changeA = parseFloat(a.todayChange || '0')
      const changeB = parseFloat(b.todayChange || '0')
      return changeA - changeB
    })
  } else if (sortDirection.value === 'down') {
    return [...funds].sort((a, b) => {
      const changeA = parseFloat(a.todayChange || '0')
      const changeB = parseFloat(b.todayChange || '0')
      return changeB - changeA
    })
  }
  return [...funds]
}

// [WHAT] 正常账户持仓（非观察），受来源和资产类别筛选影响
const normalHoldings = computed(() => {
  let funds = holdingStore.holdings.filter(fund => fund.source !== 'observe')
  if (currentSourceFilter.value) {
    funds = funds.filter(fund => fund.source === currentSourceFilter.value)
  }
  if (currentAssetClassFilter.value) {
    funds = funds.filter(fund => fund.assetClass === currentAssetClassFilter.value)
  }
  return sortFunds(funds)
})

// [WHAT] 观察账户持仓，始终显示，不受筛选影响
const observeHoldings = computed(() => {
  const funds = holdingStore.holdings.filter(fund => fund.source === 'observe')
  return sortFunds(funds)
})

// [WHAT] 沪深300实时涨跌幅
const hs300ChangePercent = computed(() => {
  const hs300 = indices.value.find(idx => idx.code === '000300')
  return hs300 ? hs300.changePercent : 0
})

// [WHAT] 排序持仓基金
function handleSort(direction: 'up' | 'down') {
  sortDirection.value = direction
}

// [WHAT] 按来源筛选基金
function filterBySource(source: string) {
  if (currentSourceFilter.value === source) {
    currentSourceFilter.value = ''
    showToast('已取消来源筛选')
  } else {
    currentSourceFilter.value = source
    showToast(`已筛选 ${source} 来源的基金`)
  }
}

// [WHAT] 按资产类别筛选持仓
function filterByAssetClass(assetClass: AssetClass | '') {
  if (currentAssetClassFilter.value === assetClass) {
    currentAssetClassFilter.value = ''
    showToast('已取消资产类别筛选')
  } else {
    currentAssetClassFilter.value = assetClass
    const label = assetClass ? ASSET_CLASS_CONFIG[assetClass].label : '全部'
    showToast(`已筛选：${label}`)
  }
}

// [WHY] 网络从离线恢复在线后，自动刷新首页数据
watch(
  () => networkStore.justRecovered,
  (recovered) => {
    if (recovered) {
    refreshData()
    }
  }
)

// [WHAT] 一键复制日志 - 方便用户反馈问题时粘贴运行记录
async function onCopyLogs(): Promise<void> {
  const ok = await copyLogsToClipboard()
  if (ok) {
    showToast(`日志已复制 (${logger.getAll().length}条, v${logger.getVersion()})`)
  } else {
    showToast('复制失败，请手动复制:\n\n' + exportLogsAsText())
  }
}

// [WHAT] 页面挂载时初始化数据（防御性检查：防止重复初始化）
let initialized = false
onMounted(async () => {
  if (initialized) {
    logger.warn('[Home] 重复挂载，跳过初始化')
    return
  }
  initialized = true
  
  logger.info('Home mounted', {
    watchlist: fundStore.watchlist?.length || 0,
    online: networkStore.isOnline,
  })
  fundStore.initWatchlist()
  // 初始化持仓数据
  holdingStore.initHoldings()
  // 如果自动刷新默认开启，则启动定时器
  if (autoRefreshEnabled.value) {
    autoRefreshInterval = window.setInterval(refreshData, 60000)
  }
})

onUnmounted(() => {
  // 清除自动刷新定时器
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval)
  }
})

// [WHAT] 刷新数据（统一的刷新入口）
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
    logger.info('refreshData ok', {
      indicesCount: indices.value.length,
      globalCount: globalIndices.value.length,
      holdingsCount: holdingStore.holdings?.length || 0,
    })
    showToast('刷新成功')
  } catch (err) {
    logger.error('refreshData failed', err)
    showToast('刷新失败，请重试')
  } finally {
    isRefreshing.value = false
  }
}

// [WHAT] 删除自选基金
async function handleDelete(code: string) {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: '确定要从自选中删除该基金吗？'
    })
    fundStore.removeFund(code)
    showToast('已删除')
  } catch {
    // 用户取消
  }
}

// [WHY] 长按基金卡片弹出快捷操作菜单
// [WHAT] 查看详情 / 加入持仓 / 删除自选
async function onFundLongPress(code: string, fundName: string) {
  actionSheet.open({
    title: `${fundName || '基金'} · 快捷操作`,
    actions: [
      { name: '查看详情', key: 'detail' },
      { name: '加入持仓', key: 'holding' },
      { name: '删除自选', key: 'delete' }
    ],
    context: { code, fundName }
  })
}

function onActionSheetSelect(index: number) {
  const result = actionSheet.onSelect(index)
  if (!result) return
  
  const { action, context } = result
  const code = context.code as string
  const fundName = context.fundName as string
  
  if (action.key === 'detail') {
    router.push(`/detail/${code}`)
  } else if (action.key === 'holding') {
    const existing = holdingStore.holdings.find(h => h.code === code)
    if (existing) {
      showToast('持仓中已存在该基金')
    } else {
      holdingStore.addOrUpdateHolding({
        code: code,
        name: fundName || '',
        buyNetValue: 0,
        shares: 0,
        buyDate: '',
        holdingDays: 0,
        source: '手动',
        isQDII: false,
        createdAt: Date.now()
      })
      showToast('已加入持仓，请补充买入信息')
    }
  } else if (action.key === 'delete') {
    handleDelete(code)
  }
}

// [WHAT] 下拉刷新处理
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

// [WHAT] 跳转到搜索页
function goToSearch() {
  router.push('/search')
}

// [WHAT] 跳转到基金详情页
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

// [WHAT] 处理子组件事件
function handleFilterBySource(source: string) {
  filterBySource(source)
}

function handleFilterByAssetClass(assetClass: AssetClass | '') {
  filterByAssetClass(assetClass)
}
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
        <!-- 移动端：参考均线和指数横向排列，每个都是上下布局 -->
        <div class="mobile-indices-container mobile-only">
          <div class="mobile-ma-item">
            <span class="mobile-ma-name">{{ t('home.reference_ma') }}</span>
            <span class="mobile-ma-value">
              {{ hs300ChangePercent >= 0 ? '+' : '' }}{{ hs300ChangePercent.toFixed(2) }}%
            </span>
          </div>
          <!-- 指数 - 根据涨跌变化配色 -->
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
    <div class="asset-class-filter" v-if="holdingStore.holdings.length > 0">
      <div class="filter-tabs">
        <span 
          class="filter-tab" 
          :class="{ active: currentAssetClassFilter === '' }"
          @click="filterByAssetClass('')"
        >{{ t('home.filter_all') }}</span>
        <span 
          v-for="(config, assetClass) in ASSET_CLASS_CONFIG" 
          :key="assetClass"
          class="filter-tab"
          :class="{ active: currentAssetClassFilter === assetClass }"
          @click="filterByAssetClass(assetClass as AssetClass)"
        >
          {{ config.label }}
        </span>
      </div>
    </div>
    
    <!-- 下拉刷新列表 -->
    <van-pull-refresh 
      v-model="fundStore.isRefreshing" 
      @refresh="onRefresh"
      class="fund-list-container"
      :data-test-id="'loading'"
    >

      <div v-if="hasError" class="error-fallback" :data-test-id="'error-message'">
        <div class="error-icon">⚠️</div>
        <div class="error-title">{{ t('home.error_title') }}</div>
        <div class="error-detail">{{ errorMessage || t('home.error_detail') }}</div>
        <van-button round type="primary" @click="() => { hasError = false; refreshData(); }">
          {{ t('home.retry') }}
        </van-button>
      </div>
      
      <!-- 资产总览 -->
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
        @update:sort-direction="handleSort"
        @update:ui-mode="(mode) => uiMode = mode"
        @filter-by-source="handleFilterBySource"
        @filter-by-asset-class="handleFilterByAssetClass"
      />

      <!-- 持仓列表 -->
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

      <!-- 市场概览 -->
      <MarketOverview
        v-if="combinedIndices.length > 0"
        :combined-indices="combinedIndices"
        :mobile-indices="mobileIndices"
      />

      <!-- 资产分配图 -->
      <AssetAllocationChart />

      <!-- 资讯快讯 -->
      <NewsFlashSection />

      <!-- 自选基金列表 -->
      <WatchlistSection
        :watchlist="fundStore.watchlist"
        :last-refresh-time="fundStore.lastRefreshTime"
        @delete="handleDelete"
        @go-to-detail="goToDetail"
        @go-to-search="goToSearch"
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
.hidden {
  display: none !important;
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

.home-page {
  /* [WHY] 使用 100% 高度适配 flex 布局 */
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

.header-ma-badge {
  margin-left: 50px;
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

/* 顶部指数样式 - 网页端横向方框 */
.top-indices-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 20px;
  flex: 1;
}

.top-index-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.top-index-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-color);
}

.top-index-item.up {
  border-color: rgba(255, 107, 107, 0.3);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(255, 107, 107, 0.08) 100%);
}

.top-index-item.down {
  border-color: rgba(81, 207, 102, 0.3);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(81, 207, 102, 0.08) 100%);
}

.top-index-name {
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.top-index-change {
  font-weight: 700;
  font-family: var(--font-number);
  white-space: nowrap;
}

.top-index-item.up .top-index-change {
  color: var(--color-up);
}

.top-index-item.down .top-index-change {
  color: var(--color-down);
}

.fund-list-container {
  /* [WHY] 使用 flex: 1 自动撑满剩余空间 */
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* [WHY] 下拉刷新需要这个属性 */
  overscroll-behavior-y: contain;
  /* [WHY] Android WebView 需要明确的触摸行为 */
  touch-action: pan-y;
}

/* ========== 资产类别筛选栏 ========== */
.asset-class-filter {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.filter-tabs::-webkit-scrollbar {
  display: none;
}

.filter-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.filter-tab:hover {
  background: var(--bg-hover);
  border-color: var(--color-primary);
}

.filter-tab.active {
  color: #fff;
  background: var(--color-primary);
  border-color: var(--color-primary);
  font-weight: 600;
}

/* 底部占位 */
.bottom-spacer {
  height: calc(60px + env(safe-area-inset-bottom, 0px));
}

/* 移动端和网页端控制 */
@media (max-width: 767px) {
  /* 移动端：隐藏搜索框 */
  .search-bar {
    display: none;
  }
  
  /* 移动端：隐藏网页端按钮 */
  .title-left .web-only {
    display: none;
  }

  /* 移动端：指数显示容器 - 横向排列 */
  .mobile-indices-container {
    display: flex;
    flex-direction: row;
    gap: 6px;
    margin-left: 8px;
    flex-wrap: nowrap;
    overflow-x: auto;
  }
  
  /* 移动端：参考均线项 - 保持蓝色 */
  .mobile-ma-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 8px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 6px;
    min-width: 56px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .mobile-ma-name {
    font-size: 10px;
    color: #60a5fa;
    white-space: nowrap;
  }
  
  .mobile-ma-value {
    font-size: 11px;
    font-weight: 600;
    margin-top: 2px;
    color: #60a5fa;
    font-family: var(--font-number);
  }
  
  /* 移动端：单个指数项 - 根据涨跌变化配色 */
  .mobile-index-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    min-width: 56px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .mobile-index-name {
    font-size: 10px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  
  .mobile-index-change {
    font-size: 11px;
    font-weight: 600;
    margin-top: 2px;
    font-family: var(--font-number);
  }
  
  .mobile-index-item.up .mobile-index-change {
    color: var(--color-up);
  }
  
  .mobile-index-item.down .mobile-index-change {
    color: var(--color-down);
  }
}

@media (min-width: 768px) {
  .mobile-only {
    display: none !important;
  }
  
  /* 网页端：显示网页端元素 */
  .web-only {
    display: block;
  }
  
  .web-only.web-only {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

@media (max-width: 767px) {
  .web-only {
    display: none !important;
  }
}
</style>
