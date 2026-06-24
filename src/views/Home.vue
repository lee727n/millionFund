<script setup lang="ts">
// [WHY] 首页 - 展示自选基金列表、市场概览和快捷入口
// [WHAT] 支持下拉刷新、左滑删除、点击跳转搜索添加、设置提醒

import { ref, onMounted, watch, computed, onUnmounted, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useHoldingStore } from '@/stores/holding'
import { useNetworkStore } from '@/stores/network'
import { type MarketIndexSimple } from '@/api/fundFast'
import { showConfirmDialog, showToast } from 'vant'
import { getSourceLabel } from '@/config/sources'
import { logger, copyLogsToClipboard, exportLogsAsText } from '@/utils/logger'
import { useHomeData } from '@/composables/useHomeData'
import { useActionSheet } from '@/composables/useActionSheet'
import type { HoldingWithProfit } from '@/stores/holding'
import FundCard from '@/components/FundCard.vue'
import FundGridItem from '@/components/FundGridItem.vue'
import QuickActionsBar from '@/components/QuickActionsBar.vue'
import IntradayChartPopup from '@/components/IntradayChartPopup.vue'
import TopHoldingsPopup from '@/components/TopHoldingsPopup.vue'
import riseW from '@/assets/riseW.jpg'
import downW from '@/assets/downW.jpg'
import type { AssetClass } from '@/types/holding'
import { ASSET_CLASS_CONFIG } from '@/types/holding'

const router = useRouter()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()
const networkStore = useNetworkStore()

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

// [WHAT] 交易状态文本和样式（使用增强版的 getTradingSession）
const tradingStatus = computed(() => {
  // [WHY] 数据刷新中时显示转动的 loading 图标
  if (isRefreshing.value) {
    return { text: '刷新中...', subText: '正在获取最新数据', class: 'refreshing', icon: 'replay' }
  }
  const session = tradingSession.value
  const now = currentTime.value
  const hour = now.getHours()
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`
  
  switch (session) {
    case 'morning':
      return { text: '交易中', subText: `上午盘 ${timeStr}`, class: 'trading', icon: 'live' }
    case 'noon_break':
      return { text: '午休中', subText: `13:00 开盘`, class: 'break', icon: 'pause' }
    case 'afternoon':
      return { text: '交易中', subText: `下午盘 ${timeStr}`, class: 'trading', icon: 'live' }
    case 'pre_market':
      return { text: '等待开盘', subText: `09:30 开盘 ${timeStr}`, class: 'pre-market', icon: 'clock' }
    case 'post_market':
      return { text: '已收盘', subText: `下次 09:30 开盘`, class: 'closed', icon: 'clock' }
    case 'weekend':
      return { text: '周末休市', subText: '下周一会开盘', class: 'closed', icon: 'calendar-o' }
    case 'holiday':
      return { text: '节假日休市', subText: '节后恢复交易', class: 'closed', icon: 'calendar-o' }
    default:
      return { text: '已收盘', subText: '09:30 开盘', class: 'closed', icon: 'clock' }
  }
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

// [WHAT] 京东账户更新状态
const jdUpdateStatus = computed(() => {
  const allHoldings = holdingStore.holdings
  if (allHoldings.length === 0) return null

  const totalCount = allHoldings.length
  const updatedCount = allHoldings.filter(fund => fund.isUpdated).length
  const isInTrading = tradingSession.value === 'morning' || tradingSession.value === 'afternoon'

  // 交易时间内：显示未更新
  if (isInTrading) {
    return { text: '未更新', class: 'not-updated' }
  }
  // 非交易时间：根据更新状态判断
  if (updatedCount === 0) {
    return { text: '未更新', class: 'not-updated' }
  }
  if (updatedCount < totalCount) {
    return { text: `更新中${updatedCount}/${totalCount}`, class: 'updating' }
  }
  return { text: '已更新', class: 'updated' }
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
    showToast(`已筛选 ${getSourceLabel(source)} 来源的基金`)
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

</script>

<template>
  <div class="home-page">
    <!-- 顶部搜索栏 -->
    <div class="top-header">
      <div class="header-left">
        <span class="app-title web-only">AI 百万实盘</span>
        <span class="app-title mobile-only">AI实盘</span>
        <!-- 网页端：参考均线和指数横向显示 -->
        <div class="web-only">
          <div class="reference-ma-badge header-ma-badge">
            <span class="reference-ma-label">参考均线</span>
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
          <!-- 参考均线 - 保持蓝色，不受涨跌影响 -->
          <div class="mobile-ma-item">
            <span class="mobile-ma-name">参考均线</span>
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
        >全部</span>
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

      <!-- [WHY] 渲染错误的降级显示：给用户刷新的机会而不是白屏 -->
      <div v-if="hasError" class="error-fallback" :data-test-id="'error-message'">
        <div class="error-icon">⚠️</div>
        <div class="error-title">页面加载出现问题</div>
        <div class="error-detail">{{ errorMessage || '部分数据暂时无法加载' }}</div>
        <van-button round type="primary" @click="() => { hasError = false; refreshData(); }">
          点击重试
        </van-button>
      </div>
      
      <!-- 持仓趋势 -->
      <div class="market-overview" v-if="holdingStore.holdings.length > 0">
        <div class="overview-title">
          <div class="title-left">
            <span class="live-dot" :class="tradingStatus.class"></span>
            <span>持仓趋势</span>
            <div class="mobile-profit-summary mobile-only">
              <span :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
                {{ isWeekend ? '休市' : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
              </span>
              <span :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
                {{ isWeekend ? '' : '盈亏' + Math.round(totalTodayProfit) }}
              </span>
            </div>
            <!-- 网页端：按钮在第一行 -->
            <div class="sort-buttons web-only">
              <img 
                :src="riseW" 
                class="sort-web-icon"
                :class="{ active: sortDirection === 'up' }"
                @click="handleSort('up')"
                alt="升序" 
              />
              <img 
                :src="downW" 
                class="sort-web-icon"
                :class="{ active: sortDirection === 'down' }"
                @click="handleSort('down')"
                alt="降序" 
              />
            </div>
            <div class="source-buttons web-only">
              <div class="ui-mode-toggle">
                <span 
                  class="ui-mode-btn" 
                  :class="{ active: uiMode === 'simple' }"
                  @click="uiMode = 'simple'"
                >简</span>
                <span 
                  class="ui-mode-btn" 
                  :class="{ active: uiMode === 'full' }"
                  @click="uiMode = 'full'"
                >全</span>
              </div>
              <van-button 
                size="small" 
                class="source-button"
                :class="{ active: currentSourceFilter === 'ali' }"
                @click="filterBySource('ali')"
              >
                <img src="@/assets/ali.jpg" class="source-icon" alt="支付宝" />
              </van-button>
              <van-button 
                size="small" 
                class="source-button"
                :class="{ active: currentSourceFilter === 'TX' }"
                @click="filterBySource('TX')"
              >
                <img src="@/assets/TX.jpg" class="source-icon" alt="腾讯" />
              </van-button>
              <van-button 
                size="small" 
                class="source-button"
                :class="{ active: currentSourceFilter === 'JD' }"
                @click="filterBySource('JD')"
              >
                <img src="@/assets/JD.jpg" class="source-icon" alt="京东" />
              </van-button>
              <span v-if="jdUpdateStatus" class="jd-update-status" :class="jdUpdateStatus.class">
                {{ jdUpdateStatus.text }}
              </span>
            </div>
          </div>
          <div class="holding-stats">
            <div class="profit-section">
              <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
                <span class="profit-label">利润率</span>
                <span class="profit-percent" :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
                  {{ isWeekend ? '休市' : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
                </span>
              </div>
              <div class="profit-divider"></div>
              <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
                <span class="profit-label">今日盈亏</span>
                <span class="profit-value">{{ isWeekend ? '休市' : ((totalTodayProfit >= 0 ? '+' : '') + totalTodayProfit.toFixed(2) + '元') }}</span>
              </div>
            </div>
            <div class="trading-status" :class="tradingStatus.class">
              <span class="status-text">{{ tradingStatus.text }}</span>
              <span class="status-time">{{ tradingStatus.subText }}</span>
            </div>
          </div>
        </div>
        <!-- 移动端：第二行按钮 -->
        <div class="overview-buttons mobile-only">
          <div class="sort-buttons">
            <div 
              class="sort-icon-button"
              :class="{ active: sortDirection === 'up' }"
              @click="handleSort('up')"
            >
              <img 
                :src="riseW" 
                class="sort-icon" 
                alt="升序" 
              />
            </div>
            <div 
              class="sort-icon-button"
              :class="{ active: sortDirection === 'down' }"
              @click="handleSort('down')"
            >
              <img 
                :src="downW" 
                class="sort-icon" 
                alt="降序" 
              />
            </div>
          </div>
          <div class="source-buttons">
            <div class="ui-mode-toggle">
              <span 
                class="ui-mode-btn" 
                :class="{ active: uiMode === 'simple' }"
                @click="uiMode = 'simple'"
              >简</span>
              <span 
                class="ui-mode-btn" 
                :class="{ active: uiMode === 'full' }"
                @click="uiMode = 'full'"
              >全</span>
            </div>
            <van-button 
              size="small" 
              class="source-button"
              :class="{ active: currentSourceFilter === 'ali' }"
              @click="filterBySource('ali')"
            >
              <img src="@/assets/ali.jpg" class="source-icon" alt="支付宝" />
            </van-button>
            <van-button 
              size="small" 
              class="source-button"
              :class="{ active: currentSourceFilter === 'TX' }"
              @click="filterBySource('TX')"
            >
              <img src="@/assets/TX.jpg" class="source-icon" alt="腾讯" />
            </van-button>
            <van-button 
              size="small" 
              class="source-button"
              :class="{ active: currentSourceFilter === 'JD' }"
              @click="filterBySource('JD')"
            >
              <img src="@/assets/JD.jpg" class="source-icon" alt="京东" />
            </van-button>
            <span v-if="jdUpdateStatus" class="jd-update-status" :class="jdUpdateStatus.class">
              {{ jdUpdateStatus.text }}
            </span>
          </div>
        </div>
        <div class="index-grid">
          <FundGridItem
            v-for="fund in normalHoldings"
            :key="fund.code"
            :fund="fund"
            :ui-mode="uiMode"
            :trading-session="tradingSession"
            @click="router.push(`/detail/${fund.code}`)"
            @open-top-holdings="openTopHoldings(fund, $event)"
            @open-intraday-modal="openIntradayModal(fund, $event)"
          />
          <div v-if="observeHoldings.length > 0" class="observe-divider">
            <div class="observe-divider-line"></div>
            <span class="observe-divider-text">量化观察</span>
            <span 
              class="observe-profit-badge" 
              :class="isWeekend ? 'closed' : (observeTodayProfitPercent >= 0 ? 'up' : 'down')"
              v-if="observeHoldings.length > 0"
            >
              {{ isWeekend ? '休市' : ((observeTodayProfitPercent >= 0 ? '+' : '') + observeTodayProfitPercent.toFixed(2) + '%') }}
            </span>
            <div class="observe-divider-line"></div>
          </div>
          <FundGridItem
            v-for="fund in observeHoldings"
            :key="fund.code"
            :fund="fund"
            :ui-mode="uiMode"
            :trading-session="tradingSession"
            @click="router.push(`/detail/${fund.code}`)"
            @open-top-holdings="openTopHoldings(fund, $event)"
            @open-intraday-modal="openIntradayModal(fund, $event)"
          />
        </div>
      </div>
            <!-- 大盘指数概览 - 交易终端风格 -->
      <div class="market-overview" v-if="combinedIndices.length > 0">
        <div class="overview-title">
          <div class="title-left">
            <span class="live-dot" :class="tradingStatus.class"></span>
            <span>全球主要指数</span>
          </div>
          <div class="trading-status" :class="tradingStatus.class">
            <span class="status-text">{{ tradingStatus.text }}</span>
            <span class="status-time">{{ tradingStatus.subText }}</span>
          </div>
        </div>
        <!-- 网页端：显示所有指数 -->
        <div class="index-grid market-index-grid web-only">
          <div 
            v-for="index in combinedIndices" 
            :key="index.code" 
            class="index-item market-index-item"
            :class="[index.changePercent >= 0 ? 'up' : 'down']"
            @click="router.push('/market')"
          >
            <div class="market-index-content">
              <div class="market-index-left">
                <div class="market-index-name">{{ index.name }}</div>
                <div class="market-index-value">
                  <span class="market-index-value-num">{{ index.current.toFixed(2) }}</span>
                </div>
              </div>
              <div class="market-index-right">
                <div class="market-index-change">
                <van-icon :name="index.changePercent >= 0 ? 'arrow-up' : 'arrow-down'" size="14" />
                <span>{{ index.changePercent >= 0 ? '+' : '' }}{{ Math.abs(index.changePercent).toFixed(2) }}%</span>
              </div>
              </div>
            </div>
            <div class="market-index-bar"></div>
          </div>
        </div>
        
        <!-- 移动端：只显示6个主要指数 -->
        <div class="index-grid market-index-grid mobile-only">
          <div 
            v-for="index in mobileIndices" 
            :key="index.code" 
            class="index-item market-index-item"
            :class="[index.changePercent >= 0 ? 'up' : 'down']"
            @click="router.push('/market')"
          >
            <div class="mobile-market-layout">
              <!-- 第一行：指数名称 -->
              <div class="mobile-market-row mobile-market-row-1">
                <div class="market-index-name">{{ index.name }}</div>
              </div>
              
              <!-- 第二行：涨跌幅度 -->
              <div class="mobile-market-row mobile-market-row-2">
                <div class="market-index-change">
                  <van-icon :name="index.changePercent >= 0 ? 'arrow-up' : 'arrow-down'" size="14" />
                  <span>{{ index.changePercent >= 0 ? '+' : '' }}{{ Math.abs(index.changePercent).toFixed(2) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      

      

      
      <!-- 自选基金标题 -->
      <div class="section-header" v-if="fundStore.watchlist.length > 0">
        <span class="section-title">自选基金</span>
        <span class="fund-count">{{ fundStore.watchlist.length }}只</span>
      </div>
      
      <!-- 有自选基金时显示列表 -->
      <template v-if="fundStore.watchlist.length > 0">
        <!-- 刷新时间提示 -->
        <div v-if="fundStore.lastRefreshTime" class="refresh-time">
          <span>最后刷新：{{ fundStore.lastRefreshTime }}</span>
        </div>
        
        <!-- 基金列表 -->
        <FundCard
          v-for="fund in fundStore.watchlist"
          :key="fund.code"
          :fund="fund"
          @delete="handleDelete"
          @click="goToDetail"
          @longpress="onFundLongPress"
        />
      </template>

      <!-- 首次启动 / 空状态引导卡片 -->
      <div v-if="fundStore.watchlist.length === 0" class="onboarding-card">
        <div class="onboarding-icon">📈</div>
        <div class="onboarding-title">欢迎使用基金管理</div>
        <div class="onboarding-desc">
          在这里管理你的自选和持仓基金<br />
          实时掌握涨跌情况和投资收益
        </div>
        <div class="onboarding-actions">
          <van-button round block type="primary" @click="goToSearch" data-test-id="search-button">
            🔍 添加自选基金
          </van-button>
          <van-button round block plain @click="router.push('/holding')">
            💰 添加持仓记录
          </van-button>
        </div>
        <div class="onboarding-tips">
          <div>💡 小提示：在持仓页长按基金可快速操作</div>
        </div>
      </div>
      
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

/* ========== 首次启动引导卡片 ========== */
.onboarding-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: linear-gradient(160deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.onboarding-icon {
  font-size: 64px;
  margin-bottom: 20px;
  animation: bounceIn 0.8s ease;
}

@keyframes bounceIn {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.onboarding-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.onboarding-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 28px;
}

.onboarding-actions {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.onboarding-tips {
  margin-top: 24px;
  font-size: 12px;
  color: var(--text-tertiary);
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

.search-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.search-bar:active {
  background: var(--bg-active);
  border-color: var(--color-primary);
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

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.auto-refresh-label {
  font-size: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.header-right .van-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all 0.2s;
}

.header-right .van-icon:active {
  background: var(--bg-active);
  color: var(--color-primary);
}

/* 公告栏 */       
.notice-bar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-secondary);
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.notice-icon {
  color: var(--text-secondary);
  margin-right: 8px;
  flex-shrink: 0;
}

.notice-swipe {
  flex: 1;
  height: 20px;
  line-height: 20px;
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

/* 大盘指数概览 - 交易终端风格 */
.market-overview {
  padding: 16px;
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.overview-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  flex-wrap: nowrap;
  white-space: nowrap;
}

.mobile-profit-summary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  white-space: nowrap;
  flex-wrap: nowrap;
}

.mobile-profit-summary span {
  margin-right: 10px;
}

.mobile-profit-summary span:last-child {
  margin-right: 0;
}

.mobile-profit-summary .up {
  color: var(--color-up);
}

.mobile-profit-summary .down {
  color: var(--color-down);
}

.mobile-profit-summary .closed {
  color: #999;
}

.update-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.update-status.updated {
  color: var(--color-down);
  background: rgba(67, 160, 79, 0.1);
}

.update-status.not-updated {
  color: var(--text-secondary);
  background: rgba(158, 158, 158, 0.1);
}

.sort-buttons {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.sort-web-icon {
  width: 36px;
  height: 36px;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.2s ease;
  border-radius: 6px;
  padding: 4px;
}

.sort-web-icon:hover {
  opacity: 0.8;
}

.sort-web-icon.active {
  opacity: 1;
  background: rgba(59, 130, 246, 0.1);
}

.source-buttons {
  display: flex;
  gap: 8px;
  margin-left: 12px;
  align-items: center;
}

.reference-ma-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  margin-left: 8px;
}

.reference-ma-label {
  font-size: 12px;
  color: #3b82f6;
  font-weight: 500;
}

.reference-ma-value {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-number);
}

.reference-ma-value.up {
  color: #3b82f6;
}

.reference-ma-value.down {
  color: #3b82f6;
}

.ui-mode-toggle {
  display: flex;
  align-items: center;
  background: var(--bg-primary, #f5f5f5);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-light, #e0e0e0);
  margin-right: 4px;
}

.ui-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #999);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.ui-mode-btn:first-child {
  border-right: 1px solid var(--border-light, #e0e0e0);
}

.ui-mode-btn.active {
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-weight: 600;
}

.ui-mode-btn:hover:not(.active) {
  background: var(--bg-secondary, #eee);
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 24px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-right: 4px;
}

.filter-label {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.source-button {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  overflow: hidden;
}

.source-button.active {
  box-shadow: 0 0 0 2px #0ea5e9;
}

.jd-update-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.jd-update-status.updated {
  color: #ff9800;
  background: rgba(255, 152, 0, 0.1);
}

.jd-update-status.updating {
  color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.jd-update-status.not-updated {
  color: var(--text-secondary);
  background: rgba(158, 158, 158, 0.1);
}

.all-button,
.qdii-button {
  padding: 0 8px;
  min-width: 40px;
  height: 24px;
  font-size: 11px;
}

.source-button:not(.all-button):not(.qdii-button) {
  padding: 0;
  min-width: 24px;
  height: 24px;
}

.source-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 3px;
}

.sort-buttons .van-button {
  font-size: 11px;
  padding: 4px 8px;
  min-width: unset;
}

.sort-buttons .van-button--primary {
  background: linear-gradient(180deg, #0ea5e9, #22d3ee) !important;
  border-color: transparent !important;
  color: #05263b !important;
  font-weight: 600;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all 0.3s;
}

.live-dot.trading {
  background: var(--color-down);
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 8px var(--color-down);
}

.live-dot.break {
  background: var(--color-primary);
  animation: pulse 3s ease-in-out infinite;
  box-shadow: 0 0 6px var(--color-primary);
}

.live-dot.closed {
  background: var(--text-muted);
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* 交易状态标签 */
.trading-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.status-text {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.trading-status.trading .status-text {
  background: rgba(81, 207, 102, 0.15);
  color: var(--color-down);
}

.trading-status.break .status-text {
  background: rgba(255, 193, 7, 0.15);
  color: var(--color-primary);
}

.trading-status.closed .status-text {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* [WHY] 刷新中的状态：蓝色标签 + 旋转图标 */
.trading-status.refreshing .status-text {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
}

.trading-status.refreshing .status-icon {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-time {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-number);
}

.holding-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overview-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

@media (max-width: 767px) {
  /* 移动端：隐藏网页端按钮 */
  .title-left .web-only {
    display: none;
  }

  .jd-update-status {
    margin-left: 4px;
    font-size: 11px;
    padding: 2px 6px;
  }
  
  /* 移动端：显示第二行按钮 */
  .overview-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  
  .overview-buttons .sort-buttons {
    display: flex;
    gap: 8px;
  }
  
  /* 移动端：小图标按钮样式 */
  .sort-icon-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .sort-icon-button.active {
    background: linear-gradient(180deg, #0ea5e9, #22d3ee);
    border-color: transparent;
  }
  
  .sort-icon-button:active {
    background: var(--bg-active);
  }
  
  .sort-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    padding: 4px;
  }
  
  .overview-buttons .source-buttons {
    display: flex;
    gap: 8px;
  }
  
  /* 移动端：调整利润率和今日盈亏的样式 - 移到第二行 */
   
  /* 移动端 holding-stats 只显示交易状态 */
  .holding-stats .profit-section {
    display: none;
  }
  
  .holding-stats {
    margin-left: auto;
  }
  
  .profit-row {
    margin-top: 8px;
    margin-bottom: 8px;
  }
  
  .profit-row .profit-section {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }
  
  .profit-row .profit-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
    flex: 1;
  }
  
  .profit-row .profit-divider {
    width: 1px;
    height: 16px;
    background: var(--border-color);
    flex-shrink: 0;
  }
  
  .profit-row .profit-label {
    font-size: 10px;
    color: var(--text-secondary);
  }
  
  .profit-row .profit-value,
  .profit-row .profit-percent {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-number);
  }
}

@media (min-width: 768px) {
  /* 网页端：隐藏第二行按钮 */
  .overview-buttons {
    display: none;
  }
  
  /* 网页端：显示第一行按钮 */
  .title-left .web-only {
    display: flex;
  }
  
  .title-left .web-only.sort-buttons {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }
  
  .title-left .web-only.source-buttons {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }
}

.profit-section {
  display: flex;
  gap: 16px;
  align-items: baseline;
}

.profit-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 70px;
}

.profit-divider {
  width: 1px;
  background: var(--border-color);
  align-self: stretch;
}

.profit-item.up .profit-value,
.profit-item.up .profit-percent {
  color: var(--color-up);
}

.profit-item.down .profit-value,
.profit-item.down .profit-percent {
  color: var(--color-down);
}

.profit-item.closed .profit-value,
.profit-item.closed .profit-percent {
  color: #999;
}

.profit-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.profit-value,
.profit-percent {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-number);
  white-space: nowrap;
}

.view-more {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-secondary);
  padding: 6px 10px;
  background: var(--color-secondary-bg);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.view-more:active {
  background: var(--bg-active);
}

.index-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.index-item {
  padding: 4px 4px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.index-item:active {
  transform: scale(0.98);
}

.index-item.up {
  border-color: rgba(255, 107, 107, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(255, 107, 107, 0.05) 100%);
}

.index-item.down {
  border-color: rgba(81, 207, 102, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(81, 207, 102, 0.05) 100%);
}

.index-name {
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  height: 16px;
  line-height: 16px;
}

/* 基金名称内容容器 */
.fund-name-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 6px;
}

/* 基金名称左侧（平台图标） */
.fund-name-left {
  flex-shrink: 0;
}

/* 基金名称中间（QDII标识） */
.fund-name-middle {
  flex-shrink: 0;
}

/* 基金名称右侧（基金名称） */
.fund-name-right {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

/* 平台图标样式 */
.source-icon-small {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  object-fit: contain;
}

/* QDII标签样式 */
.qdii-tag {
  display: inline-block;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 500;
  color: #ffffff;
  background-color: #9333ea;
  border-radius: 8px;
  vertical-align: middle;
}

/* 确保垂直居中对齐 */
.fund-name-left,
.fund-name-middle,
.fund-name-right {
  display: flex;
  align-items: center;
  height: 100%;
}

.index-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0;
  margin-bottom: 3px;
}

.index-left {
  flex: 0 0 40%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.index-right {
  flex: 0 0 60%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fund-code {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-number);
  letter-spacing: -0.2px;
  color: var(--color-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.fund-sectors {
  font-size: 9px;
  color: var(--text-muted);
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  width: 100%;
}

.index-change {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-number);
  padding: 6px 10px;
  border-radius: 8px;
  width: 100%;
  text-align: center;
  margin-right: 11px;
}

.index-item.up .index-change {
  color: var(--color-up);
  background: rgba(255, 107, 107, 0.12);
}

.index-item.down .index-change {
  color: var(--color-down);
  background: rgba(81, 207, 102, 0.12);
}

/* 趋势预测 */
.index-trend {
  padding: 8px 10px;
}

.index-trend .trend-prediction {
  display: flex;
  align-items: stretch;
  gap: 0;
  width: 100%;
}

.index-trend .trend-column {
  flex: 0 0 25%;
  width: 25%;
  max-width: 25%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.index-trend .trend-column-1 {
  flex: 0 0 25%;
  width: 25%;
  max-width: 25%;
  border-right: 1px solid var(--border-color);
  padding-right: 8px;
}

.index-trend .trend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  text-align: center;
}

.index-trend .trend-item-vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
}

.index-trend .trend-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.2;
}

.index-trend .trend-value {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

.index-trend .trend-text {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.index-trend .trend-text.up {
  color: var(--color-up);
}

.index-trend .trend-text.down {
  color: var(--color-down);
}

.index-trend .trend-value.up {
  color: var(--color-up);
}

.index-trend .trend-value.down {
  color: var(--color-down);
}

/* 底部进度条效果 */
.index-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
}

.index-item.up .index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-up) 50%, transparent 100%);
}

.index-item.down .index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-down) 50%, transparent 100%);
}

/* 全球指数 */
.global-indices {
  padding: 12px;
  background: var(--bg-secondary);
  margin: 8px 12px;
  border-radius: 12px;
}

.global-indices .section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.global-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.global-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.global-name {
  font-size: 12px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.region-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
  flex-shrink: 0;
}

.region-tag.cn { background: #fee2e2; color: #dc2626; }
.region-tag.hk { background: #fef3c7; color: #d97706; }
.region-tag.us { background: #dbeafe; color: #2563eb; }
.region-tag.eu { background: #e0e7ff; color: #4f46e5; }
.region-tag.asia { background: #d1fae5; color: #059669; }

.global-price {
  font-size: 13px;
  font-weight: 600;
  margin: 0 8px;
}

.global-change {
  font-size: 12px;
  font-weight: 500;
  min-width: 55px;
  text-align: right;
}

.global-item.up .global-price,
.global-item.up .global-change {
  color: var(--color-up);
}

.global-item.down .global-price,
.global-item.down .global-change {
  color: var(--color-down);
}

.expand-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 10px 0 4px;
  cursor: pointer;
}



/* 自选基金标题 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 8px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.fund-count {
  font-size: 12px;
  color: var(--text-secondary);
}



/* 全球主要指数样式 */
.index-grid.market-index-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.market-index-item {
  padding: 8px 6px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.market-index-item:active {
  transform: scale(0.98);
}

.market-index-item.up {
  border-color: rgba(255, 107, 107, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(255, 107, 107, 0.05) 100%);
}

.market-index-item.down {
  border-color: rgba(81, 207, 102, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(81, 207, 102, 0.05) 100%);
}

.market-index-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.market-index-left {
  flex: 0 0 40%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.market-index-right {
  flex: 0 0 60%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.market-index-name {
  font-size: 10px;
  color: var(--text-secondary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  height: 14px;
  line-height: 14px;
  margin-bottom: 2px;
}

.market-index-value {
  text-align: center;
}

.market-index-value-num {
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-number);
  color: var(--text-primary);
}

.market-index-change {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-number);
  text-align: center;
  padding: 4px 8px;
  border-radius: 6px;
  width: 100%;
  justify-content: center;
}

.market-index-item.up .market-index-change {
  color: var(--color-up);
}

.market-index-item.down .market-index-change {
  color: var(--color-down);
}

.market-index-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  margin-top: 4px;
}

.market-index-item.up .market-index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-up) 50%, transparent 100%);
}

.market-index-item.down .market-index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-down) 50%, transparent 100%);
}

/* 底部占位 */
.bottom-spacer {
  height: calc(60px + env(safe-area-inset-bottom, 0px));
}

.refresh-time {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 0;
  background: var(--bg-primary);
}

.alert-badge {
  padding: 2px 8px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 10px;
  font-size: 10px;
}

/* 提醒设置弹窗 */
.alert-dialog {
  padding: 16px;
  background: var(--bg-secondary);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.dialog-fund {
  font-size: 14px;
  color: var(--text-secondary);
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.dialog-footer {
  padding-top: 16px;
}

/* 移动端和网页端控制 */
@media (max-width: 767px) {
  /* 移动端：隐藏搜索框 */
  .search-bar {
    display: none;
  }
  
  /* 移动端：持仓趋势每行3个 */
  .index-grid:not(.market-index-grid) {
    grid-template-columns: repeat(3, 1fr);
    gap: 0px;
    margin-top: 10px;
  }
  
  /* 移动端：item内部布局 */
  .mobile-item-layout {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0px;
  }
  
  .mobile-item-row {
    display: flex;
    align-items: center;
    width: 100%;
  }
  
  /* 第一行：图标 + 基金名称 */
  .mobile-item-row-1 {
    min-height: 14px;
    padding: 0px 0;
  }
  
  .mobile-item-row-1 .fund-name-content {
    gap: 3px;
  }
  
  .mobile-item-row-1 .source-icon-small {
    width: 10px;
    height: 10px;
  }
  
  .mobile-item-row-1 .qdii-tag {
    font-size: 7px;
    padding: 1px 2px;
  }
  
  .mobile-item-row-1 .fund-name-right {
    font-size: 10px;
    line-height: 1.2;
  }
  
  /* 第二行：基金代码 和 行业板块 */
  .mobile-item-row-2 {
    justify-content: space-between;
    gap: 3px;
    min-height: 12px;
    padding: 0px 0;
  }
  
  .mobile-item-row-2 .fund-code {
    font-size: 9px;
    font-weight: 600;
    flex-shrink: 0;
  }
  
  .mobile-item-row-2 .fund-sectors {
    font-size: 8px;
    color: var(--text-secondary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  /* 第三行：涨跌幅模块 */
  .mobile-item-row-3 {
    justify-content: center;
    min-height: 14px;
    padding: 0px 0;
  }
  
  .mobile-item-row-3 .index-change {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    margin-right: 0;
  }
  
  /* 第四行：趋势预测 */
  .mobile-item-row-4 {
    justify-content: space-between;
    min-height: 12px;
    padding: 0px 4px;
  }
  
  .mobile-item-row-4 .trend-prediction {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 4px;
  }
  
  .mobile-item-row-4 .trend-item {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
  }
  
  .mobile-item-row-4 .trend-item-vertical {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
  }
  
  .mobile-item-row-4 .trend-label {
    font-size: 8px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
  
  .mobile-item-row-4 .trend-value {
    font-size: 8px;
    font-weight: 600;
  }
  
  .mobile-item-row-4 .trend-value.up {
    color: var(--up-color);
  }
  
  .mobile-item-row-4 .trend-value.down {
    color: var(--down-color);
  }
  
  .mobile-item-row-4 .trend-text {
    font-size: 8px;
    font-weight: 500;
  }
  
  .mobile-item-row-4 .trend-text.up {
    color: var(--up-color);
  }
  
  .mobile-item-row-4 .trend-text.down {
    color: var(--down-color);
  }
  
  /* 移动端：全球主要指数布局 */
  .index-grid.market-index-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 0px;
  }
  
  .mobile-market-layout {
    display: flex;
    flex-direction: column;
    gap: 0px;
    padding: 0px;
  }
  
  .mobile-market-row {
    display: flex;
    align-items: center;
    width: 100%;
  }
  
  /* 第一行：指数名称 */
  .mobile-market-row-1 {
    min-height: 16px;
    padding: 0px 0;
  }
  
  .mobile-market-row-1 .market-index-name {
    font-size: 10px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }
  
  /* 第二行：涨跌幅度 */
  .mobile-market-row-2 {
    justify-content: center;
    min-height: 18px;
    padding: 0px 0;
  }
  
  .mobile-market-row-2 .market-index-change {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
  }
  
  /* 移动端：隐藏快捷入口和自选基金 */
  .quick-actions {
    display: none;
  }
  
  .section-header {
    display: none;
  }
  
  .refresh-time {
    display: none;
  }
  
  /* 移动端：标题和按钮在一行 */
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
  
  .header-right {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  
  .mobile-only {
    display: flex;
    align-items: center;
    gap: 0px;
  }
  
  .auto-refresh-label {
    font-size: 11px;
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
  
  .mobile-ma-item:hover {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.5);
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
  
  .mobile-index-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  
  /* 上涨样式 */
  .mobile-index-item.up {
    border-color: rgba(255, 107, 107, 0.3);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 107, 107, 0.08) 100%);
  }
  
  /* 下跌样式 */
  .mobile-index-item.down {
    border-color: rgba(81, 207, 102, 0.3);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(81, 207, 102, 0.08) 100%);
  }
  
  /* 移动端：指数名称 */
  .mobile-index-name {
    font-size: 10px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  
  /* 移动端：指数涨跌幅 */
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
  
  /* 网页端：隐藏利润行 */
  .profit-row {
    display: none;
  }
  
  /* 网页端：显示网页端元素 */
  .web-only {
    display: block;
  }
  
  /* 网页端：确保按钮水平排列 */
  .web-only.web-only {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  /* 网页端：全球指数保持grid布局 */
  .index-grid.market-index-grid.web-only {
    display: grid;
  }
}

@media (max-width: 767px) {
  .web-only {
    display: none !important;
  }
}

/* ========== 前10大重仓股 ========== */
.index-holdings {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: 2px;
  width: 100%;
}

.top-holdings-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  padding: 3px 8px;
  border-radius: 6px;
  width: 100%;
  color: #05263b;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
}

.top-holdings-arrow {
  color: #05263b;
}

/* ========== 当日分时估值 ========== */
.intraday-section {
  margin-top: 2px;
  overflow: hidden;
  width: 100%;
}

.intraday-arrow {
  color: #05263b;
  transition: transform 0.2s;
}

.intraday-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  color: #05263b;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  border-radius: 6px;
  padding: 3px 8px;
  width: 100%;
  text-align: center;
}

.intraday-label-mobile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  color: #05263b;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  border-radius: 6px;
  padding: 3px 8px;
  text-align: center;
  width: 100%;
}

.intraday-time {
  font-size: 10px;
  color: #999;
}

.intraday-content {
  padding: 0 12px 8px;
}

.intraday-loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.intraday-chart-wrapper {
  background: var(--bg-primary, rgba(0,0,0,0.02));
  border-radius: 8px;
  padding: 8px;
}

.intraday-summary {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.intraday-latest {
  font-size: 13px;
  font-weight: 600;
}

.intraday-canvas {
  width: 100%;
  height: 140px;
}

.intraday-empty {
  text-align: center;
  padding: 20px 0;
  font-size: 12px;
  color: #999;
}

.mobile-item-row-5 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  margin-top: 2px;
  cursor: pointer;
}

.top-holdings-popup {
  padding: 20px;
}

.top-holdings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.top-holdings-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-holdings-icon {
  font-size: 18px;
}

.top-holdings-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.top-holdings-fund-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.top-holdings-fund-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.top-holdings-fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.top-holdings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  max-height: 55vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.top-holdings-card {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  overflow: hidden;
}

.thc-name {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  display: block;
  margin-bottom: 4px;
}

.thc-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thc-change {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--text-secondary);
}

.thc-change.up {
  color: var(--color-up);
  background: rgba(255, 107, 107, 0.12);
}

.thc-change.down {
  color: var(--color-down);
  background: rgba(81, 207, 102, 0.12);
}

.thc-weight {
  font-size: 11px;
  color: var(--text-secondary);
}

.top-holdings-close-btn {
  width: 100%;
  height: 40px;
  margin-top: 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.top-holdings-close-btn:hover {
  opacity: 0.9;
}

.top-holdings-close-btn:active {
  opacity: 0.8;
}

.top-holdings-empty {
  text-align: center;
  padding: 30px 0;
  color: #999;
  font-size: 14px;
}

.top-holdings-loading {
  display: flex;
  justify-content: center;
  padding: 30px 0;
}

/* ========== 当日分时估值弹窗 ========== */
.intraday-popup {
  padding: 20px;
}

.intraday-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.intraday-popup-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.intraday-popup-icon {
  color: var(--color-primary);
}

.intraday-popup-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.intraday-popup-fund-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.intraday-popup-fund-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.intraday-popup-fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.intraday-popup-chart {
  min-height: 200px;
}

.intraday-popup-chart-wrapper {
  background: var(--bg-primary, rgba(0,0,0,0.02));
  border-radius: 10px;
  padding: 12px;
}

.intraday-popup-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.intraday-popup-latest {
  font-size: 15px;
  font-weight: 600;
}

.intraday-popup-time {
  font-size: 12px;
  color: #999;
}

.intraday-popup-canvas {
  width: 100%;
  height: 220px;
}

.intraday-popup-empty {
  text-align: center;
  padding: 40px 0;
  color: #999;
  font-size: 14px;
}

.intraday-popup-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.intraday-popup-close-btn {
  width: 100%;
  height: 40px;
  margin-top: 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.intraday-popup-close-btn:hover {
  opacity: 0.9;
}

.intraday-popup-close-btn:active {
  opacity: 0.8;
}

/* ========== 观察基金分割线 ========== */
.observe-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  margin: 4px 0;
  grid-column: 1 / -1;
}

.observe-divider-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    to right,
    var(--border-color) 0px,
    var(--border-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

.observe-divider-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  font-weight: 500;
}

.observe-profit-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  white-space: nowrap;
  margin-left: 8px;
}

.observe-profit-badge.up {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.observe-profit-badge.down {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.observe-profit-badge.closed {
  background: rgba(153, 153, 153, 0.1);
  color: #999;
}

@media (max-width: 767px) {
  .observe-divider {
    padding: 8px 4px;
    margin: 2px 0;
  }
  
  .observe-divider-text {
    font-size: 11px;
  }
}

/* ========== 添加后涨幅 ========== */
.added-gain-section {
  margin-top: 2px;
  overflow: hidden;
  width: 100%;
}

.added-gain-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  padding: 3px 8px;
  border-radius: 6px;
  width: 100%;
}

.added-gain-badge.up {
  color: var(--color-up);
  background: rgba(255, 107, 107, 0.12);
}

.added-gain-badge.down {
  color: var(--color-down);
  background: rgba(81, 207, 102, 0.12);
}

/* 移动端：去掉累计涨幅背景色，减小字体 */
@media (max-width: 767px) {
  .added-gain-badge.up,
  .added-gain-badge.down {
    background: transparent;
  }
  
  .mobile-added-gain {
    font-size: 10px;
    gap: 0;
  }
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
</style>
