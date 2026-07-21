<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import FundGridItem from '@/components/FundGridItem.vue'
import riseW from '@/assets/riseW.jpg'
import downW from '@/assets/downW.jpg'
import { showToast } from 'vant'

const router = useRouter()
const holdingStore = useHoldingStore()

const uiMode = ref<'simple' | 'full'>('full')
const tradingSession = ref('')
const tradingStatus = ref({ text: '交易中', subText: '', class: '' })
const isWeekend = ref(false)
const sortDirection = ref<'up' | 'down' | 'none'>('down')
const autoRefreshEnabled = ref(true)
let autoRefreshInterval: number | undefined

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
  return funds
}

function handleSort(direction: 'up' | 'down') {
  sortDirection.value = direction
}

async function refreshData() {
  try {
    await holdingStore.refreshEstimates()
  } catch {
    console.error('刷新失败')
  }
}

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

const aliHoldings = computed(() => {
  const funds = holdingStore.holdings.filter(fund => fund.source === 'ali')
  const totalValue = funds.reduce((total, fund) => {
    const currentValue = fund.currentValue || 0
    const shares = fund.shares || 0
    return total + (currentValue * shares)
  }, 0)
  const fundsWithRatio = funds.map(fund => {
    const ratio = totalValue > 0 ? ((fund.currentValue || 0) * (fund.shares || 0) / totalValue) : 0
    return { ...fund, ratio }
  })
  return sortFunds(fundsWithRatio)
})

const aliMarketValue = computed(() => {
  return aliHoldings.value.reduce((total, fund) => total + (fund.marketValue || 0), 0)
})

const aliTodayProfit = computed(() => {
  return aliHoldings.value.reduce((total, fund) => {
    if (fund.todayProfit) {
      return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
    }
    return total
  }, 0)
})

const aliTodayProfitPercent = computed(() => {
  if (aliMarketValue.value === 0) return 0
  return (aliTodayProfit.value / aliMarketValue.value) * 100
})

const txHoldings = computed(() => {
  const funds = holdingStore.holdings.filter(fund => fund.source === 'TX')
  const totalValue = funds.reduce((total, fund) => {
    const currentValue = fund.currentValue || 0
    const shares = fund.shares || 0
    return total + (currentValue * shares)
  }, 0)
  const fundsWithRatio = funds.map(fund => {
    const ratio = totalValue > 0 ? ((fund.currentValue || 0) * (fund.shares || 0) / totalValue) : 0
    return { ...fund, ratio }
  })
  return sortFunds(fundsWithRatio)
})

const txMarketValue = computed(() => {
  return txHoldings.value.reduce((total, fund) => total + (fund.marketValue || 0), 0)
})

const txTodayProfit = computed(() => {
  return txHoldings.value.reduce((total, fund) => {
    if (fund.todayProfit) {
      return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
    }
    return total
  }, 0)
})

const txTodayProfitPercent = computed(() => {
  if (txMarketValue.value === 0) return 0
  return (txTodayProfit.value / txMarketValue.value) * 100
})

const jdHoldings = computed(() => {
  const funds = holdingStore.holdings.filter(fund => fund.source === 'JD')
  const totalValue = funds.reduce((total, fund) => {
    const currentValue = fund.currentValue || 0
    const shares = fund.shares || 0
    return total + (currentValue * shares)
  }, 0)
  const fundsWithRatio = funds.map(fund => {
    const ratio = totalValue > 0 ? ((fund.currentValue || 0) * (fund.shares || 0) / totalValue) : 0
    return { ...fund, ratio }
  })
  return sortFunds(fundsWithRatio)
})

const jdMarketValue = computed(() => {
  return jdHoldings.value.reduce((total, fund) => total + (fund.marketValue || 0), 0)
})

const jdTodayProfit = computed(() => {
  return jdHoldings.value.reduce((total, fund) => {
    if (fund.todayProfit) {
      return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
    }
    return total
  }, 0)
})

const jdTodayProfitPercent = computed(() => {
  if (jdMarketValue.value === 0) return 0
  return (jdTodayProfit.value / jdMarketValue.value) * 100
})

const totalMarketValueAll = computed(() => {
  return aliMarketValue.value + txMarketValue.value + jdMarketValue.value
})

const totalTodayProfitAll = computed(() => {
  return aliTodayProfit.value + txTodayProfit.value + jdTodayProfit.value
})

const totalTodayProfitPercentAll = computed(() => {
  if (totalMarketValueAll.value === 0) return 0
  return (totalTodayProfitAll.value / totalMarketValueAll.value) * 100
})

function checkTradingSession() {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  const minute = now.getMinutes()

  if (day === 0 || day === 6) {
    isWeekend.value = true
    tradingStatus.value = { text: '已收盘', subText: '09:30 开盘', class: 'closed' }
    tradingSession.value = 'closed'
    return
  }

  isWeekend.value = false

  const isMorningSession = (hour === 9 && minute >= 30) || (hour > 9 && hour < 11) || (hour === 11 && minute <= 30)
  const isNoonBreak = (hour === 11 && minute > 30) || (hour > 11 && hour < 13)
  const isAfternoonSession = (hour >= 13 && hour < 15)

  if (isMorningSession) {
    tradingStatus.value = { text: '交易中', subText: `上午盘 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`, class: 'trading' }
    tradingSession.value = 'morning'
  } else if (isNoonBreak) {
    tradingStatus.value = { text: '午休中', subText: '13:00 开盘', class: 'noon' }
    tradingSession.value = 'noon'
  } else if (isAfternoonSession) {
    tradingStatus.value = { text: '交易中', subText: `下午盘 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`, class: 'trading' }
    tradingSession.value = 'afternoon'
  } else {
    tradingStatus.value = { text: '已收盘', subText: '09:30 开盘', class: 'closed' }
    tradingSession.value = 'closed'
  }
}

function openTopHoldings(fund: any, event: Event) {
  event.stopPropagation()
}

function openIntradayModal(fund: any, event: Event) {
  event.stopPropagation()
}

function handleFundLongpress() {
}

let sessionTimer: number | null = null

onMounted(async () => {
  await holdingStore.initHoldings()
  checkTradingSession()
  sessionTimer = window.setInterval(checkTradingSession, 60000)
  if (autoRefreshEnabled.value) {
    autoRefreshInterval = window.setInterval(refreshData, 60000)
  }
})

onUnmounted(() => {
  if (sessionTimer) clearInterval(sessionTimer)
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval)
  }
})
</script>

<template>
  <div class="portfolio-page">
    <div class="market-overview">
      <div class="section-title-row">
        <div class="section-title-left">
          <span class="section-dot"></span>
          <span class="section-title">持仓趋势</span>
          <div class="sort-buttons">
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
          <span class="ui-mode-btn" :class="{ active: uiMode === 'simple' }" @click="uiMode = 'simple'">简</span>
          <span class="ui-mode-btn" :class="{ active: uiMode === 'full' }" @click="uiMode = 'full'">全</span>
        </div>

        <div class="title-center">
          <div class="summary-stat">
            <span class="summary-label">持仓市值</span>
            <span class="summary-value">{{ totalMarketValueAll.toFixed(2) }}元</span>
          </div>
          <div class="summary-stat" :class="isWeekend ? 'closed' : (totalTodayProfitPercentAll >= 0 ? 'up' : 'down')">
            <span class="summary-label">利润率</span>
            <span class="summary-value">{{ isWeekend ? '休市' : ((totalTodayProfitPercentAll >= 0 ? '+' : '') + totalTodayProfitPercentAll.toFixed(2) + '%') }}</span>
          </div>
          <div class="summary-stat" :class="isWeekend ? 'closed' : (totalTodayProfitAll >= 0 ? 'up' : 'down')">
            <span class="summary-label">今日盈亏</span>
            <span class="summary-value">{{ isWeekend ? '休市' : ((totalTodayProfitAll >= 0 ? '+' : '') + totalTodayProfitAll.toFixed(2) + '元') }}</span>
          </div>
        </div>

        <div class="trading-status" :class="tradingStatus.class">
          <span class="status-text">{{ tradingStatus.text }}</span>
          <span class="status-time">{{ tradingStatus.subText }}</span>
        </div>

        <div class="refresh-controls">
          <div class="auto-refresh-label">
            <span>{{ autoRefreshEnabled ? '自动刷新开' : '自动刷新关' }}</span>
          </div>
          <van-switch v-model="autoRefreshEnabled" size="20" />
          <van-icon name="replay" size="22" @click="refreshData" />
        </div>
      </div>

      <div class="web-accounts-content">
        <div class="web-account-column" v-if="aliHoldings.length > 0">
          <div class="web-account-column-header">
            <div class="web-account-col account-info">
              <img src="@/assets/ali.jpg" class="web-account-column-icon" alt="支付宝" />
              <div class="web-account-title-wrap">
                <span class="web-account-title">支付宝</span>
                <span class="web-account-count">{{ aliHoldings.length }}只</span>
              </div>
            </div>
            <div class="web-account-col">
              <span class="web-account-stat-label">持仓市值</span>
              <span class="web-account-stat-value">{{ aliMarketValue.toFixed(2) }}元</span>
            </div>
            <div class="web-account-col" :class="isWeekend ? 'closed' : (aliTodayProfitPercent >= 0 ? 'up' : 'down')">
              <span class="web-account-stat-label">利润率</span>
              <span class="web-account-stat-value">{{ isWeekend ? '休市' : ((aliTodayProfitPercent >= 0 ? '+' : '') + aliTodayProfitPercent.toFixed(2) + '%') }}</span>
            </div>
            <div class="web-account-col" :class="isWeekend ? 'closed' : (aliTodayProfit >= 0 ? 'up' : 'down')">
              <span class="web-account-stat-label">今日盈亏</span>
              <span class="web-account-stat-value">{{ isWeekend ? '休市' : ((aliTodayProfit >= 0 ? '+' : '') + aliTodayProfit.toFixed(2) + '元') }}</span>
            </div>
          </div>
          <div class="web-account-column-grid">
            <FundGridItem
              v-for="fund in aliHoldings"
              :key="fund.code"
              :fund="fund"
              :ui-mode="uiMode"
              :trading-session="tradingSession"
              @click="router.push(`/detail/${fund.code}`)"
              @open-top-holdings="openTopHoldings(fund, $event)"
              @open-intraday-modal="openIntradayModal(fund, $event)"
              @longpress="handleFundLongpress"
            />
          </div>
        </div>

        <div class="web-account-column" v-if="txHoldings.length > 0">
          <div class="web-account-column-header">
            <div class="web-account-col account-info">
              <img src="@/assets/TX.jpg" class="web-account-column-icon" alt="腾讯" />
              <div class="web-account-title-wrap">
                <span class="web-account-title">腾讯</span>
                <span class="web-account-count">{{ txHoldings.length }}只</span>
              </div>
            </div>
            <div class="web-account-col">
              <span class="web-account-stat-label">持仓市值</span>
              <span class="web-account-stat-value">{{ txMarketValue.toFixed(2) }}元</span>
            </div>
            <div class="web-account-col" :class="isWeekend ? 'closed' : (txTodayProfitPercent >= 0 ? 'up' : 'down')">
              <span class="web-account-stat-label">利润率</span>
              <span class="web-account-stat-value">{{ isWeekend ? '休市' : ((txTodayProfitPercent >= 0 ? '+' : '') + txTodayProfitPercent.toFixed(2) + '%') }}</span>
            </div>
            <div class="web-account-col" :class="isWeekend ? 'closed' : (txTodayProfit >= 0 ? 'up' : 'down')">
              <span class="web-account-stat-label">今日盈亏</span>
              <span class="web-account-stat-value">{{ isWeekend ? '休市' : ((txTodayProfit >= 0 ? '+' : '') + txTodayProfit.toFixed(2) + '元') }}</span>
            </div>
          </div>
          <div class="web-account-column-grid">
            <FundGridItem
              v-for="fund in txHoldings"
              :key="fund.code"
              :fund="fund"
              :ui-mode="uiMode"
              :trading-session="tradingSession"
              @click="router.push(`/detail/${fund.code}`)"
              @open-top-holdings="openTopHoldings(fund, $event)"
              @open-intraday-modal="openIntradayModal(fund, $event)"
              @longpress="handleFundLongpress"
            />
          </div>
        </div>

        <div class="web-account-column" v-if="jdHoldings.length > 0">
          <div class="web-account-column-header">
            <div class="web-account-col account-info">
              <img src="@/assets/JD.jpg" class="web-account-column-icon" alt="京东" />
              <div class="web-account-title-wrap">
                <span class="web-account-title">京东</span>
                <span class="web-account-count">{{ jdHoldings.length }}只</span>
              </div>
            </div>
            <div class="web-account-col">
              <span class="web-account-stat-label">持仓市值</span>
              <span class="web-account-stat-value">{{ jdMarketValue.toFixed(2) }}元</span>
            </div>
            <div class="web-account-col" :class="isWeekend ? 'closed' : (jdTodayProfitPercent >= 0 ? 'up' : 'down')">
              <span class="web-account-stat-label">利润率</span>
              <span class="web-account-stat-value">{{ isWeekend ? '休市' : ((jdTodayProfitPercent >= 0 ? '+' : '') + jdTodayProfitPercent.toFixed(2) + '%') }}</span>
            </div>
            <div class="web-account-col" :class="isWeekend ? 'closed' : (jdTodayProfit >= 0 ? 'up' : 'down')">
              <span class="web-account-stat-label">今日盈亏</span>
              <span class="web-account-stat-value">{{ isWeekend ? '休市' : ((jdTodayProfit >= 0 ? '+' : '') + jdTodayProfit.toFixed(2) + '元') }}</span>
            </div>
          </div>
          <div class="web-account-column-grid">
            <FundGridItem
              v-for="fund in jdHoldings"
              :key="fund.code"
              :fund="fund"
              :ui-mode="uiMode"
              :trading-session="tradingSession"
              @click="router.push(`/detail/${fund.code}`)"
              @open-top-holdings="openTopHoldings(fund, $event)"
              @open-intraday-modal="openIntradayModal(fund, $event)"
              @longpress="handleFundLongpress"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.portfolio-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

.market-overview {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.market-overview > * {
  flex-shrink: 0;
  width: 100%;
}

.section-title-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
}

.section-title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-dot {
  width: 8px;
  height: 8px;
  background: #4CAF50;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.ui-mode-btn {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.ui-mode-btn.active {
  background: var(--color-secondary-bg);
  color: var(--color-secondary);
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

.title-center {
  display: flex;
  gap: 30px;
  margin-left: auto;
  margin-right: 20px;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.summary-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.summary-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.summary-stat.up .summary-value {
  color: var(--color-up);
}

.summary-stat.down .summary-value {
  color: var(--color-down);
}

.summary-stat.closed .summary-value {
  color: var(--text-secondary);
}

.trading-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.status-text {
  font-size: 14px;
  font-weight: 600;
}

.status-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.trading-status.trading .status-text {
  color: var(--color-down);
}

.trading-status.noon .status-text {
  color: #FFC107;
}

.trading-status.closed .status-text {
  color: var(--text-secondary);
}

.refresh-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
}

.auto-refresh-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.web-accounts-content {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 16px;
}

.web-account-column {
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-light);
}

.web-account-column-header {
  display: flex;
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
  gap: 8px;
}

.web-account-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.web-account-col.account-info {
  flex-direction: row;
  gap: 8px;
}

.web-account-column-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  object-fit: cover;
}

.web-account-title-wrap {
  display: flex;
  flex-direction: column;
}

.web-account-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.web-account-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.web-account-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.web-account-stat-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.web-account-col.up .web-account-stat-value {
  color: var(--color-up);
}

.web-account-col.down .web-account-stat-value {
  color: var(--color-down);
}

.web-account-col.closed .web-account-stat-value {
  color: var(--text-secondary);
}

.web-account-column-grid {
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(50% - 4px), 1fr));
  gap: 8px;
}

.web-account-column-grid :deep(.index-item) {
  width: auto;
  flex-shrink: 1;
}

.web-account-column-grid :deep(.index-holdings.web-only) {
  display: none;
}

.web-account-column-grid :deep(.intraday-section.web-only) {
  display: none;
}

</style>
