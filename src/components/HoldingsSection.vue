<script setup lang="ts">
// [WHY] 持仓列表组件
// [WHAT] 展示持仓基金列表，包含收益统计、排序、来源筛选功能

import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { showToast } from 'vant'
import { getSourceLabel } from '@/config/sources'
import type { HoldingWithProfit } from '@/stores/holding'
import type { AssetClass } from '@/types/holding'
import { ASSET_CLASS_CONFIG } from '@/types/holding'
import FundGridItem from '@/components/FundGridItem.vue'

const props = defineProps<{
  tradingSession: 'pre_market' | 'morning' | 'noon_break' | 'afternoon' | 'post_market' | 'weekend' | 'holiday'
  currentTime: Date
}>()

const { t } = useI18n()
const router = useRouter()
const holdingStore = useHoldingStore()

// [WHAT] 排序方向
const sortDirection = ref<'up' | 'down' | 'none'>('down')

// [WHAT] UI模式：simple=简洁 / full=全功能
const uiMode = ref<'simple' | 'full'>('simple')

// [WHAT] 当前资产类别筛选
const currentAssetClassFilter = ref<AssetClass | ''>('')

// [WHAT] 当前筛选来源
const currentSourceFilter = ref<string>('')

// [WHAT] 是否为周末
const isWeekend = computed(() => {
  const day = props.currentTime.getDay()
  return day === 0 || day === 6
})

// [WHAT] 交易状态文本和样式
const tradingStatus = computed(() => {
  const session = props.tradingSession
  const now = props.currentTime
  const hour = now.getHours()
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`
  
  switch (session) {
    case 'morning':
      return { text: '交易中', subText: `上午盘 ${timeStr}`, class: 'trading' }
    case 'noon_break':
      return { text: '午休中', subText: `13:00 开盘`, class: 'break' }
    case 'afternoon':
      return { text: '交易中', subText: `下午盘 ${timeStr}`, class: 'trading' }
    case 'pre_market':
      return { text: '等待开盘', subText: `09:30 开盘 ${timeStr}`, class: 'pre-market' }
    case 'post_market':
      return { text: '已收盘', subText: `下次 09:30 开盘`, class: 'closed' }
    case 'weekend':
      return { text: '周末休市', subText: '下周一会开盘', class: 'closed' }
    case 'holiday':
      return { text: '节假日休市', subText: '节后恢复交易', class: 'closed' }
    default:
      return { text: '已收盘', subText: '09:30 开盘', class: 'closed' }
  }
})

// [WHAT] 计算当日盈亏总和
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

// [WHAT] 正常账户持仓
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

// [WHAT] 观察账户持仓
const observeHoldings = computed(() => {
  const funds = holdingStore.holdings.filter(fund => fund.source === 'observe')
  return sortFunds(funds)
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
      </div>
      <div class="holding-stats">
        <div class="profit-section">
          <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
            <span class="profit-label">{{ t('home.profit_rate') }}</span>
            <span class="profit-percent">
              {{ isWeekend ? t('home.market_closed') : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
            </span>
          </div>
          <div class="profit-divider"></div>
          <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
            <span class="profit-label">{{ t('home.today_profit') }}</span>
            <span class="profit-value">{{ isWeekend ? t('home.market_closed') : ((totalTodayProfit >= 0 ? '+' : '') + totalTodayProfit.toFixed(2) + '元') }}</span>
          </div>
        </div>
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
      />
      <div v-if="observeHoldings.length > 0" class="observe-divider">
        <div class="observe-divider-line"></div>
        <span class="observe-divider-text">{{ t("home.quant_observe") }}</span>
        <div class="observe-divider-line"></div>
      </div>
      <FundGridItem
        v-for="fund in observeHoldings"
        :key="fund.code"
        :fund="fund"
        :ui-mode="uiMode"
        :trading-session="tradingSession"
        @click="router.push(`/detail/${fund.code}`)"
      />
    </div>
  </div>
</template>

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
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.holding-stats {
  display: flex;
  align-items: center;
  gap: 12px;
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

.profit-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.profit-value,
.profit-percent {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-number);
}

.index-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.observe-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}

.observe-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.observe-divider-text {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
