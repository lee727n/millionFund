<script setup lang="ts">
// [WHY] 持仓列表组件
// [WHAT] 展示持仓基金列表，包含收益统计、排序、来源筛选功能

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { useFundStore } from '@/stores/fund'
import { showToast } from 'vant'
import { logger, copyLogsToClipboard, exportLogsAsText } from '@/utils/logger'
import { getSourceLabel } from '@/config/sources'
import type { HoldingWithProfit } from '@/stores/holding'
import type { AssetClass } from '@/types/holding'
import { ASSET_CLASS_CONFIG } from '@/types/holding'
import FundGridItem from '@/components/FundGridItem.vue'
import IntradayChartPopup from '@/components/IntradayChartPopup.vue'
import TopHoldingsPopup from '@/components/TopHoldingsPopup.vue'

const props = defineProps<{
  tradingSession: 'pre_market' | 'morning' | 'noon_break' | 'afternoon' | 'post_market' | 'weekend' | 'holiday'
  currentTime: Date
  isRefreshing: boolean
  autoRefreshEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'update:autoRefreshEnabled', value: boolean): void
}>()

const { t, locale } = useI18n()
const router = useRouter()
const holdingStore = useHoldingStore()
const fundStore = useFundStore()

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
const autoRefreshEnabled = computed({
  get: () => props.autoRefreshEnabled,
  set: (value) => emit('update:autoRefreshEnabled', value)
})

// [WHAT] 是否为周末
const isWeekend = computed(() => {
  const day = props.currentTime.getDay()
  return day === 0 || day === 6
})

// [WHAT] 交易状态文本和样式
const tradingStatus = computed(() => {
  if (props.isRefreshing) {
    return { text: '刷新中...', subText: '正在获取最新数据', class: 'refreshing', icon: 'replay' }
  }
  const session = props.tradingSession
  const now = props.currentTime
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

// [WHAT] 计算当日盈亏总和（只计算非观察账户）
const totalTodayProfit = computed(() => {
  return normalHoldings.value.reduce((total, fund) => {
    if (fund.todayProfit) {
      return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
    }
    return total
  }, 0)
})

// [WHAT] 计算当日收益百分比
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

// [WHAT] 当前资产类别筛选
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
  const isInTrading = props.tradingSession === 'morning' || props.tradingSession === 'afternoon'

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
</script>

<template>
  <div class="holdings-section" v-if="holdingStore.holdings.length > 0">
    <div class="overview-title">
      <div class="title-left">
        <span class="live-dot" :class="tradingStatus.class"></span>
        <span>{{ t('home.holding_trend') }}</span>
        <div class="mobile-profit-summary mobile-only">
          <span :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
            {{ isWeekend ? t('home.market_closed_short') : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
          </span>
          <span :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
            {{ isWeekend ? '' : t('home.profit_short') + Math.round(totalTodayProfit) }}
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
            >{{ t("common.simple") }}</span>
            <span 
              class="ui-mode-btn" 
              :class="{ active: uiMode === 'full' }"
              @click="uiMode = 'full'"
            >{{ t("common.full") }}</span>
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
            <span class="profit-label">{{ t('home.profit_rate') }}</span>
            <span class="profit-percent" :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
              {{ isWeekend ? t('home.market_closed') : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
            </span>
          </div>
          <div class="profit-divider"></div>
          <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
            <span class="profit-label">{{ t('home.today_profit') }}</span>
            <span class="profit-value">{{ isWeekend ? t('home.market_closed') : ((totalTodayProfit >= 0 ? '+' : '') + totalTodayProfit.toFixed(2) + '元') }}</span>
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
          >{{ t("common.simple") }}</span>
          <span 
            class="ui-mode-btn" 
            :class="{ active: uiMode === 'full' }"
            @click="uiMode = 'full'"
          >{{ t("common.full") }}</span>
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
        <span class="observe-divider-text">{{ t("home.quant_observe") }}</span>
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
  </div>
</template>

<script setup lang="ts">
import riseW from '@/assets/riseW.jpg'
import downW from '@/assets/downW.jpg'
</script>

<style scoped>
.holdings-section {
  padding: 0 12px;
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

/* ... rest of the styles ... */
</style>
