<script setup lang="ts">
// [WHAT] 全景大屏 - 网页端专用，一个页面整合所有核心模块
// [WHY] 利用大屏空间，Portfolio持仓 + 量化观察 + AI追踪 + 交易记录 + AI分析 同屏展示

import { computed, ref, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { useAITrackingStore } from '@/stores/aiTracking'
import { useThemeStore } from '@/stores/theme'
import { getTrades } from '@/utils/storage'
import { analyzeTrades, type TradeAnalysisResult } from '@/utils/aiAnalyzer'
import { fetchMarketIndicesFast, fetchGlobalIndices, fetchFundAccurateData, type MarketIndexSimple, type GlobalIndex } from '@/api/fundFast'
import { getTradingSession, type TradingSession } from '@/api/tiantianApi'

const router = useRouter()
const holdingStore = useHoldingStore()
const aiTrackingStore = useAITrackingStore()
const themeStore = useThemeStore()

// ============ 基础状态 ============
const indices = ref<MarketIndexSimple[]>([])
const refreshing = ref(false)
let refreshTimer: number | undefined

// ============ 交易状态 ============
const isWeekend = computed(() => {
  const day = new Date().getDay()
  return day === 0 || day === 6
})
const tradingSession = ref<TradingSession>('closed')
const tradingStatus = computed(() => {
  const h = new Date().getHours()
  if (isWeekend.value) return { text: '休市', class: 'closed', sub: '周末' }
  if (h >= 9 && h < 11) return { text: '交易中', class: 'trading', sub: '上午盘' }
  if (h >= 11 && h < 13) return { text: '午休', class: 'noon', sub: '11:30-13:00' }
  if (h >= 13 && h < 15) return { text: '交易中', class: 'trading', sub: '下午盘' }
  return { text: '已休市', class: 'closed', sub: '' }
})

// 只统计真正持仓（排除 observe 量化观察）
const realHoldings = computed(() => holdingStore.holdings.filter(f => f.source !== 'observe'))

// ============ 更新进度 ============
const updateProgress = computed(() => {
  const all = realHoldings.value
  if (all.length === 0) return { updated: 0, total: 0, text: '无数据', class: 'closed', percent: 0 }
  const total = all.length
  const updated = all.filter(f => f.isUpdated).length
  const inTrading = tradingSession.value === 'morning' || tradingSession.value === 'afternoon'
  if (inTrading) return { updated, total, text: `交易中 ${updated}/${total}`, class: 'updating', percent: (updated / total) * 100 }
  if (updated === 0) return { updated, total, text: '未更新', class: 'not-updated', percent: 0 }
  if (updated < total) return { updated, total, text: `更新中 ${updated}/${total}`, class: 'updating', percent: (updated / total) * 100 }
  return { updated, total, text: `已更新 ${total}/${total}`, class: 'updated', percent: 100 }
})

// ============ 时间 ============
const currentTime = ref('')
function updateTime() {
  const d = new Date()
  currentTime.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

// ============ 基金实时数据缓存（供交易记录 + AI追踪 共用） ============
// 格式: Map<code, { estimate, nav, currentValue, dataSource }>
const liveFundData = ref<Map<string, any>>(new Map())

async function preloadAllFundPrices(fundCodes: string[]) {
  const uniqueCodes = [...new Set(fundCodes)]
  await Promise.all(uniqueCodes.map(async (code) => {
    try {
      const info = await fetchFundAccurateData(code, false, true)
      liveFundData.value.set(code, {
        estimate: info.estimate || 0,
        nav: info.nav || 0,
        currentValue: info.currentValue || 0,
        dataSource: info.dataSource,
        dayChange: info.dayChange || 0
      })
    } catch (e) { /* 静默失败 */ }
  }))
}

// ============ 计算交易记录 postReturn（复用 TradeCenter 逻辑） ============
function calcPostReturn(trade: any): number {
  const data = liveFundData.value.get(trade.code)
  if (!data || trade.netValue <= 0) return 0
  // 当前值：如果净值已更新用净值，否则用估值
  let currentValue = 0
  if (data.dataSource === 'nav' && data.nav > 0) {
    currentValue = data.nav
  } else if (data.estimate > 0) {
    currentValue = data.estimate
  } else {
    currentValue = data.currentValue || 0
  }
  if (currentValue <= 0) return 0
  return ((currentValue - trade.netValue) / trade.netValue) * 100
}

// ============ Portfolio 持仓 ============
function sortByChange(funds: any[]) {
  return [...funds].sort((a, b) => {
    const ca = parseFloat(a.todayChange || '0')
    const cb = parseFloat(b.todayChange || '0')
    return cb - ca
  })
}

function buildAccountFunds(source: string | null) {
  let funds: any[]
  if (source === null) {
    // source 为 undefined/null/空 的归为一组
    funds = holdingStore.holdings.filter(f =>
      f.source !== 'ali' && f.source !== 'TX' && f.source !== 'JD' && f.source !== 'observe'
    )
  } else {
    funds = holdingStore.holdings.filter(f => f.source === source)
  }
  const totalValue = funds.reduce((t, f) => t + (f.currentValue || 0) * (f.shares || 0), 0)
  return sortByChange(funds).map(f => ({
    ...f,
    marketValue: (f.currentValue || 0) * (f.shares || 0),
    ratio: totalValue > 0 ? ((f.currentValue || 0) * (f.shares || 0) / totalValue) * 100 : 0
  }))
}

const aliHoldings = computed(() => buildAccountFunds('ali'))
const txHoldings = computed(() => buildAccountFunds('TX'))
const jdHoldings = computed(() => buildAccountFunds('JD'))
const otherHoldings = computed(() => buildAccountFunds(null)) // source=undefined 的

function calcAccountStats(funds: any[]) {
  const marketValue = funds.reduce((t, f) => t + f.marketValue, 0)
  const todayProfit = funds.reduce((t, f) => t + (typeof f.todayProfit === 'number' ? f.todayProfit : parseFloat(f.todayProfit || '0')), 0)
  const prevValue = marketValue - todayProfit
  const profitPercent = prevValue > 0 ? (todayProfit / prevValue) * 100 : 0
  return { marketValue, todayProfit, profitPercent, count: funds.length }
}

const aliStats = computed(() => calcAccountStats(aliHoldings.value))
const txStats = computed(() => calcAccountStats(txHoldings.value))
const jdStats = computed(() => calcAccountStats(jdHoldings.value))
const otherStats = computed(() => calcAccountStats(otherHoldings.value))

const totalStats = computed(() => {
  const all = [...aliHoldings.value, ...txHoldings.value, ...jdHoldings.value, ...otherHoldings.value]
  const marketValue = all.reduce((t, f) => t + f.marketValue, 0)
  const todayProfit = all.reduce((t, f) => t + (typeof f.todayProfit === 'number' ? f.todayProfit : parseFloat(f.todayProfit || '0')), 0)
  const prevValue = marketValue - todayProfit
  const profitPercent = prevValue > 0 ? (todayProfit / prevValue) * 100 : 0
  return { marketValue, todayProfit, profitPercent, count: all.length }
})

// ============ 量化观察 ============
const observeHoldings = computed(() => {
  const funds = holdingStore.holdings.filter(f => f.source === 'observe')
  const totalValue = funds.reduce((t, f) => t + (f.currentValue || 0) * (f.shares || 0), 0)
  return sortByChange(funds).map(f => ({
    ...f,
    marketValue: (f.currentValue || 0) * (f.shares || 0),
    ratio: totalValue > 0 ? ((f.currentValue || 0) * (f.shares || 0) / totalValue) * 100 : 0
  }))
})

// ============ 交易记录（带 postReturn 计算 + 按基金分组） ============
const allTradesWithReturn = ref<any[]>([])

function refreshTrades() {
  const trades = getTrades()
  // 从 liveFundData 计算 postReturn
  allTradesWithReturn.value = trades
    .map(t => ({ ...t, postReturn: calcPostReturn(t) }))
    .sort((a, b) => {
      if (a.code !== b.code) return a.code.localeCompare(b.code)
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
}

// 按基金分组（复用 Trader 逻辑）
const groupedTrades = computed(() => {
  const holdingCodes = new Set(holdingStore.holdings.map((h: any) => h.code))
  const groups = new Map<string, any>()

  allTradesWithReturn.value.forEach(trade => {
    if (!groups.has(trade.code)) {
      const isCleared = !holdingCodes.has(trade.code)
      groups.set(trade.code, {
        code: trade.code,
        name: trade.name,
        source: trade.source,
        isCleared,
        trades: []
      })
    }
    groups.get(trade.code).trades.push(trade)
  })

  // 已清仓排后面
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isCleared !== b.isCleared) return a.isCleared ? 1 : -1
    return a.code.localeCompare(b.code)
  })
})

// 辅助：基金 logo
function getFundLogoUrl(code: string) {
  return `https://logo.eastmoney.com/${code}.png`
}
function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img) img.style.display = 'none'
}
// @ts-ignore
import aliIcon from '@/assets/ali.jpg'
// @ts-ignore
import txIcon from '@/assets/TX.jpg'
// @ts-ignore
import jdIcon from '@/assets/JD.jpg'
const accountIcons: Record<string, string> = { ali: aliIcon, TX: txIcon, JD: jdIcon }
function getSourceIconSrc(source?: string) {
  return source ? (accountIcons[source] || '') : ''
}

// AI 分析（使用 liveFundData 作为 fundDataMap）
const aiAnalysis = computed<TradeAnalysisResult>(() => {
  return analyzeTrades(getTrades(), liveFundData.value)
})

// ============ AI 追踪 ============
// 用 liveFundData 计算 buyChange/sellChange（和 AITracking.vue 一致的逻辑）
function computeTrackChange(code: string, nav: number): number {
  const data = liveFundData.value.get(code)
  if (!data || !nav) return 0
  const currentPrice = data.currentValue || data.nav || data.estimate || 0
  if (!currentPrice) return 0
  return ((currentPrice - nav) / nav) * 100
}

const aiTrackRecords = computed(() => {
  return aiTrackingStore.records.map(r => ({
    ...r,
    sellChange: computeTrackChange(r.sellCode, r.sellNav),
    buyChange: computeTrackChange(r.buyCode, r.buyNav)
  }))
})

const aiTrackStats = computed(() => {
  const records = aiTrackRecords.value
  const successCount = records.filter(r => r.buyChange >= r.sellChange).length
  const totalDiff = records.reduce((t, r) => t + (r.buyChange - r.sellChange), 0)
  return { total: records.length, success: successCount, totalChange: totalDiff }
})

// ============ 市场指数 ============
// 目标顺序：上证指数、创业板指、沪深300、日经225、道琼斯、纳斯达克
const targetIndexNames = ['上证指数', '创业板指', '沪深300', '日经225', '道琼斯', '纳斯达克']

async function loadIndices() {
  try {
    const [a, b] = await Promise.all([fetchMarketIndicesFast(), fetchGlobalIndices()])
    // 合并成统一的 MarketIndexSimple 格式
    const merged: MarketIndexSimple[] = [...a]
    b.forEach((g: GlobalIndex) => {
      if (!merged.find(m => m.name === g.name)) {
        merged.push({
          code: g.code,
          name: g.name,
          current: g.price,
          change: g.price * g.changePercent / 100,
          changePercent: g.changePercent
        })
      }
    })
    // 按目标顺序排列
    const sorted = targetIndexNames
      .map(name => merged.find(m => m.name === name))
      .filter((x): x is MarketIndexSimple => !!x)
    indices.value = sorted
  } catch (e) { /* 静默 */ }
}

// ============ 核心刷新 ============
async function refreshAll() {
  refreshing.value = true
  try {
    // 1. 刷新持仓估值（会更新 holdingStore）
    await holdingStore.refreshEstimates()

    // 2. 收集所有需要实时价格的基金代码
    const codes = new Set<string>()
    // 交易记录里的
    getTrades().forEach(t => codes.add(t.code))
    // AI追踪里的
    aiTrackingStore.records.forEach(r => {
      codes.add(r.sellCode)
      codes.add(r.buyCode)
    })
    // 持仓里的
    holdingStore.holdings.forEach((h: any) => codes.add(h.code))

    // 3. 并发拉取所有基金实时数据
    await preloadAllFundPrices([...codes])

    // 4. 刷新交易记录涨跌幅
    refreshTrades()

    // 5. 刷新指数
    await loadIndices()
  } catch (e) {
    console.error('[Panorama] 刷新失败:', e)
  } finally {
    refreshing.value = false
  }
}

// ============ 生命周期 ============
onMounted(async () => {
  // 初始化交易状态
  tradingSession.value = getTradingSession()
  window.setInterval(() => { tradingSession.value = getTradingSession() }, 30000)

  updateTime()
  setInterval(updateTime, 1000)

  // 关键：初始化 holdingStore，否则持仓数据为空
  holdingStore.initHoldings()

  // 先加载指数（快）
  loadIndices()

  // 完整刷新（拉取所有基金实时数据）
  await refreshAll()

  // 60秒自动刷新
  refreshTimer = window.setInterval(refreshAll, 60000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// ============ 跳转 ============
function goDetail(code: string) {
  router.push(`/detail/${code}`)
}
function goPortfolio() { router.push('/portfolio') }
function goTradeCenter() { router.push('/trade-center') }
function goAITracking() { router.push('/ai-tracking') }

// ============ 工具函数 ============
function fmtMoney(v: number) {
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(2) + '万'
  return Math.round(v).toString()
}
function fmtPct(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}
function fmtIndexPct(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}

// AI追踪辅助
function getTrackDiff(r: any) {
  return (r.buyChange || 0) - (r.sellChange || 0)
}
function getTrackSuccess(r: any) {
  return (r.buyChange || 0) >= (r.sellChange || 0)
}
function getSignalIcon(signal: string) {
  const map: Record<string, string> = { take_profit: '🎯', buy_back: '🔄', cut_loss: '🛑', add_on_dip: '📉', observe: '👀' }
  return map[signal] || '⚪'
}
function getSignalLabel(signal: string) {
  const map: Record<string, string> = { take_profit: '止盈', buy_back: '回补', cut_loss: '止损', add_on_dip: '补仓', observe: '观察' }
  return map[signal] || '观望'
}

// 和 Home/Holding 页面保持一致：用 holding.isUpdated 判断
function getFundNameClass(fund: any): Record<string, boolean> {
  return {
    'fm-updated': !!fund.isUpdated,
    'fm-pending': !fund.isUpdated
  }
}
</script>

<template>
  <div class="panorama-dashboard">
    <!-- ========== 顶部状态栏 ========== -->
    <header class="top-bar">
      <div class="top-left">
        <span class="logo-dot"></span>
        <span class="top-title">AI 百万实盘 · 全景大屏</span>
      </div>

      <div class="top-stats">
        <div class="stat-block" :class="isWeekend ? 'closed' : (totalStats.todayProfit >= 0 ? 'up' : 'down')">
          <span class="stat-label">总市值</span>
          <span class="stat-value">{{ fmtMoney(totalStats.marketValue) }}</span>
        </div>
        <div class="stat-block" :class="isWeekend ? 'closed' : (totalStats.todayProfit >= 0 ? 'up' : 'down')">
          <span class="stat-label">今日盈亏</span>
          <span class="stat-value">{{ isWeekend ? '休市' : fmtMoney(totalStats.todayProfit) }}</span>
        </div>
        <div class="stat-block" :class="isWeekend ? 'closed' : (totalStats.profitPercent >= 0 ? 'up' : 'down')">
          <span class="stat-label">利润率</span>
          <span class="stat-value">{{ isWeekend ? '休市' : fmtPct(totalStats.profitPercent) }}</span>
        </div>
        <div class="stat-block trading-status" :class="tradingStatus.class">
          <span class="stat-label">交易状态</span>
          <span class="stat-value"><span class="live-dot"></span>{{ tradingStatus.text }}</span>
          <span class="stat-sub">{{ tradingStatus.sub }}</span>
        </div>
      </div>

      <div class="top-indices" v-if="indices.length > 0">
        <div 
          v-for="idx in indices.slice(0, 6)" 
          :key="idx.code" 
          class="index-tile"
          :class="idx.changePercent >= 0 ? 'up' : 'down'"
        >
          <span class="index-name">{{ idx.name }}</span>
          <span class="index-value">{{ idx.current.toFixed(2) }}</span>
          <span class="index-pct">{{ fmtIndexPct(idx.changePercent) }}</span>
        </div>
      </div>

      <div class="top-right">
        <!-- 主题切换（与 Holding 持仓页面同款） -->
        <div class="theme-toggle">
          <span 
            class="theme-toggle-btn" 
            :class="{ active: themeStore.actualTheme === 'light' }"
            @click="themeStore.setTheme('light')"
          >浅</span>
          <span 
            class="theme-toggle-btn" 
            :class="{ active: themeStore.actualTheme === 'dark' }"
            @click="themeStore.setTheme('dark')"
          >深</span>
        </div>
        <span class="clock">{{ currentTime }}</span>
        <button class="refresh-btn" :class="{ spinning: refreshing }" @click="refreshAll" :disabled="refreshing">↻</button>
      </div>
    </header>

    <!-- ========== 主区域：3 列布局 ========== -->
    <main class="main-grid">
      <!-- ========== 左列：Portfolio ========== -->
      <section class="col col-portfolio">
        <div class="panel-header">
          <span class="panel-title">💼 Portfolio 持仓</span>
          <span class="panel-sub">共 {{ totalStats.count }} 只 · 市值 {{ fmtMoney(totalStats.marketValue) }}</span>
          <span class="panel-link" @click="goPortfolio()">详情 →</span>
          <!-- 更新进度条 -->
          <div class="update-progress" :class="updateProgress.class">
            <div class="update-progress-bar">
              <div class="update-progress-fill" :style="{ width: updateProgress.percent + '%' }"></div>
            </div>
            <span class="update-progress-text">{{ updateProgress.text }}</span>
          </div>
        </div>

        <div class="col-scroll">
          <!-- 支付宝 -->
        <div class="account-block" v-if="aliHoldings.length > 0">
          <div class="account-header">
            <img src="@/assets/ali.jpg" class="account-icon" />
            <span class="account-name">支付宝</span>
            <span class="account-count">{{ aliStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(aliStats.marketValue) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (aliStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(aliStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div 
              v-for="fund in aliHoldings.slice(0, 8)" 
              :key="fund.code"
              class="fund-mini-card"
              @click="goDetail(fund.code)"
            >
              <!-- 第一行：名称 + QD + 评级 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name">{{ fund.name?.slice(0, 10) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
              </div>
              <!-- 第二行：code + 估/净 + 估值 + 今日涨跌 -->
              <div class="fm-row fm-row-mid">
                <span class="fm-code">{{ fund.code }}</span>
                <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                  {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                </span>
                <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                <span class="fm-today" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'">
                  {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
                </span>
              </div>
              <!-- 第三行：市值 + 累计涨跌 -->
              <div class="fm-row fm-row-bottom">
                <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                <span 
                  class="fm-added" 
                  v-if="fund.addedGain !== undefined" 
                  :class="fund.addedGain >= 0 ? 'up' : 'down'"
                >
                  累{{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                </span>
              </div>
            </div>
            <div v-if="aliHoldings.length > 8" class="fund-mini-more">+{{ aliHoldings.length - 8 }}</div>
          </div>
        </div>

        <!-- 腾讯 -->
        <div class="account-block" v-if="txHoldings.length > 0">
          <div class="account-header">
            <img src="@/assets/TX.jpg" class="account-icon" />
            <span class="account-name">腾讯</span>
            <span class="account-count">{{ txStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(txStats.marketValue) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (txStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(txStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div 
              v-for="fund in txHoldings.slice(0, 8)" 
              :key="fund.code"
              class="fund-mini-card"
              @click="goDetail(fund.code)"
            >
              <!-- 第一行：名称 + QD + 评级 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name">{{ fund.name?.slice(0, 10) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
              </div>
              <!-- 第二行：code + 估/净 + 估值 + 今日涨跌 -->
              <div class="fm-row fm-row-mid">
                <span class="fm-code">{{ fund.code }}</span>
                <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                  {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                </span>
                <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                <span class="fm-today" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'">
                  {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
                </span>
              </div>
              <!-- 第三行：市值 + 累计涨跌 -->
              <div class="fm-row fm-row-bottom">
                <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                <span 
                  class="fm-added" 
                  v-if="fund.addedGain !== undefined" 
                  :class="fund.addedGain >= 0 ? 'up' : 'down'"
                >
                  累{{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                </span>
              </div>
            </div>
            <div v-if="txHoldings.length > 8" class="fund-mini-more">+{{ txHoldings.length - 8 }}</div>
          </div>
        </div>

        <!-- 京东 -->
        <div class="account-block" v-if="jdHoldings.length > 0">
          <div class="account-header">
            <img src="@/assets/JD.jpg" class="account-icon" />
            <span class="account-name">京东</span>
            <span class="account-count">{{ jdStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(jdStats.marketValue) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (jdStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(jdStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div 
              v-for="fund in jdHoldings.slice(0, 8)" 
              :key="fund.code"
              class="fund-mini-card"
              @click="goDetail(fund.code)"
            >
              <!-- 第一行：名称 + QD + 评级 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name">{{ fund.name?.slice(0, 10) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
              </div>
              <!-- 第二行：code + 估/净 + 估值 + 今日涨跌 -->
              <div class="fm-row fm-row-mid">
                <span class="fm-code">{{ fund.code }}</span>
                <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                  {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                </span>
                <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                <span class="fm-today" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'">
                  {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
                </span>
              </div>
              <!-- 第三行：市值 + 累计涨跌 -->
              <div class="fm-row fm-row-bottom">
                <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                <span 
                  class="fm-added" 
                  v-if="fund.addedGain !== undefined" 
                  :class="fund.addedGain >= 0 ? 'up' : 'down'"
                >
                  累{{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                </span>
              </div>
            </div>
            <div v-if="jdHoldings.length > 8" class="fund-mini-more">+{{ jdHoldings.length - 8 }}</div>
          </div>
        </div>

        <!-- 其他/未分类（source=undefined 的旧数据） -->
        <div class="account-block" v-if="otherHoldings.length > 0">
          <div class="account-header">
            <span class="account-icon-fallback">📁</span>
            <span class="account-name">其他账户</span>
            <span class="account-count">{{ otherStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(otherStats.marketValue) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (otherStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(otherStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div 
              v-for="fund in otherHoldings.slice(0, 8)" 
              :key="fund.code"
              class="fund-mini-card"
              @click="goDetail(fund.code)"
            >
              <!-- 第一行：名称 + QD + 评级 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name">{{ fund.name?.slice(0, 10) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
              </div>
              <!-- 第二行：code + 估/净 + 估值 + 今日涨跌 -->
              <div class="fm-row fm-row-mid">
                <span class="fm-code">{{ fund.code }}</span>
                <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                  {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                </span>
                <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                <span class="fm-today" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'">
                  {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
                </span>
              </div>
              <!-- 第三行：市值 + 累计涨跌 -->
              <div class="fm-row fm-row-bottom">
                <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                <span 
                  class="fm-added" 
                  v-if="fund.addedGain !== undefined" 
                  :class="fund.addedGain >= 0 ? 'up' : 'down'"
                >
                  累{{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                </span>
              </div>
            </div>
            <div v-if="otherHoldings.length > 8" class="fund-mini-more">+{{ otherHoldings.length - 8 }}</div>
          </div>
        </div>

        <div v-if="totalStats.count === 0" class="empty-hint">暂无持仓数据</div>
        </div><!-- /col-scroll -->
      </section>

      <!-- ========== 中列：量化观察 + AI追踪 ========== -->
      <section class="col col-center">
        <!-- 量化观察 -->
        <div class="panel-block">
          <div class="panel-header">
            <span class="panel-title">🔍 量化观察</span>
            <span class="panel-sub">{{ observeHoldings.length }} 只观察中</span>
          </div>
          <div class="observe-list" v-if="observeHoldings.length > 0">
            <div 
              v-for="fund in observeHoldings" 
              :key="fund.code"
              class="observe-row"
              @click="goDetail(fund.code)"
            >
              <span class="observe-name" :title="fund.name">{{ fund.name?.slice(0, 10) }}</span>
              <span 
                class="observe-today"
                :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'"
              >
                {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
              </span>
              <span 
                class="observe-added" 
                v-if="fund.addedGain !== undefined" 
                :class="fund.addedGain >= 0 ? 'up' : 'down'"
              >
                累{{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
              </span>
              <div class="observe-bar">
                <div 
                  class="observe-bar-inner" 
                  :class="fund.addedGain !== undefined ? (fund.addedGain >= 0 ? 'up' : 'down') : (fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down')"
                  :style="{ width: Math.min(Math.abs((fund.addedGain !== undefined ? fund.addedGain : parseFloat(fund.todayChange || '0'))) * 5, 100) + '%' }"
                ></div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">暂无观察标的</div>
        </div>

        <!-- AI 追踪 -->
        <div class="panel-block panel-block-tracking">
          <div class="panel-header">
            <span class="panel-title">🤖 AI 追踪</span>
            <span class="panel-sub">{{ aiTrackStats.success }}/{{ aiTrackStats.total }} 成功</span>
            <span class="panel-link" @click="goAITracking()">详情 →</span>
          </div>
          <div class="track-list" v-if="aiTrackRecords.length > 0">
            <div 
              v-for="record in aiTrackRecords.slice(0, 8)" 
              :key="record.id"
              class="track-row"
              :class="getTrackSuccess(record) ? 'success' : 'fail'"
            >
              <div class="track-funds">
                <span class="track-fund-name">{{ (record.sellName || record.sellCode)?.slice(0, 6) }}</span>
                <span class="track-arrow">→</span>
                <span class="track-fund-name">{{ (record.buyName || record.buyCode)?.slice(0, 6) }}</span>
              </div>
              <div class="track-changes">
                <span class="track-change-item" :class="(record.sellChange || 0) >= 0 ? 'up' : 'down'">
                  卖 {{ fmtPct(record.sellChange || 0) }}
                </span>
                <span class="track-change-item" :class="(record.buyChange || 0) >= 0 ? 'up' : 'down'">
                  买 {{ fmtPct(record.buyChange || 0) }}
                </span>
                <span class="track-diff" :class="getTrackSuccess(record) ? 'up' : 'down'">
                  {{ getTrackDiff(record) >= 0 ? '+' : '' }}{{ getTrackDiff(record).toFixed(2) }}%
                </span>
              </div>
            </div>
            <div v-if="aiTrackRecords.length > 8" class="track-more">+{{ aiTrackRecords.length - 8 }} 调仓记录</div>
          </div>
          <div v-else class="empty-hint">暂无 AI 调仓记录</div>
        </div>
      </section>

      <!-- ========== 右列：交易记录 + AI 交易分析 ========== -->
      <section class="col col-right">
        <!-- AI 交易分析 -->
        <div class="panel-block">
          <div class="panel-header">
            <span class="panel-title">📊 AI 交易分析</span>
            <span class="panel-sub">{{ aiAnalysis.summary.totalTrades }} 笔交易</span>
            <span class="panel-link" @click="goTradeCenter()">详情 →</span>
          </div>

          <!-- 汇总统计 -->
          <div class="ai-summary">
            <div class="ai-stat" :class="aiAnalysis.summary.totalPnL >= 0 ? 'up' : 'down'">
              <span class="ai-stat-value">{{ aiAnalysis.summary.totalPnL >= 0 ? '+' : '' }}{{ fmtMoney(aiAnalysis.summary.totalPnL) }}</span>
              <span class="ai-stat-label">累计盈亏</span>
            </div>
            <div class="ai-stat" v-if="aiAnalysis.summary.bestTrade">
              <span class="ai-stat-value up">{{ aiAnalysis.summary.bestTrade.return.toFixed(1) }}%</span>
              <span class="ai-stat-label">最佳 {{ (aiAnalysis.summary.bestTrade.name || '').slice(0, 6) }}</span>
            </div>
            <div class="ai-stat" v-if="aiAnalysis.summary.worstTrade">
              <span class="ai-stat-value down">{{ aiAnalysis.summary.worstTrade.return.toFixed(1) }}%</span>
              <span class="ai-stat-label">最差 {{ (aiAnalysis.summary.worstTrade.name || '').slice(0, 6) }}</span>
            </div>
            <div class="ai-stat">
              <span class="ai-stat-value">{{ aiAnalysis.signals.length }}</span>
              <span class="ai-stat-label">待处理信号</span>
            </div>
          </div>

          <!-- 信号列表 -->
          <div class="ai-signal-list" v-if="aiAnalysis.signals.length > 0">
            <div 
              v-for="signal in aiAnalysis.signals.slice(0, 5)" 
              :key="signal.id"
              class="ai-signal-row"
              @click="router.push(`/detail/${signal.fundCode}`)"
            >
              <span class="signal-badge">{{ getSignalIcon(signal.signal) }} {{ getSignalLabel(signal.signal) }}</span>
              <span class="signal-name" :title="signal.fundName">{{ signal.fundName?.slice(0, 8) }}</span>
              <span class="signal-score" :class="signal.returnRate >= 0 ? 'up' : 'down'">
                {{ signal.returnRate >= 0 ? '+' : '' }}{{ signal.returnRate.toFixed(1) }}%
              </span>
            </div>
          </div>
          <div v-else class="ai-no-signal">✅ 暂无交易信号</div>
        </div>

        <!-- 交易记录（按基金分组，Trader 同款 UI） -->
        <div class="panel-block panel-block-trades">
          <div class="panel-header">
            <span class="panel-title">📋 交易记录</span>
            <span class="panel-sub">{{ allTradesWithReturn.length }} 条 · {{ groupedTrades.length }} 只基金</span>
          </div>
          <div class="trade-list grouped" v-if="groupedTrades.length > 0">
            <div 
              v-for="group in groupedTrades" 
              :key="group.code"
              class="trade-fund-card"
              :class="{ 'is-cleared': group.isCleared }"
            >
              <div class="trade-fund-header" @click="goDetail(group.code)">
                <img :src="getFundLogoUrl(group.code)" class="trade-fund-logo" @error="onLogoError" />
                <img 
                  v-if="group.source && getSourceIconSrc(group.source)" 
                  :src="getSourceIconSrc(group.source)" 
                  class="trade-fund-source" 
                />
                <span class="trade-fund-name" :title="group.name">{{ group.name?.slice(0, 10) }}</span>
                <span class="trade-fund-code">{{ group.code }}</span>
                <span v-if="group.isCleared" class="trade-cleared-tag">已清仓</span>
              </div>
              <div class="trade-fund-items">
                <div
                  v-for="trade in group.trades"
                  :key="trade.id"
                  class="trade-item"
                  :class="trade.type"
                >
                  <span class="trade-type-badge" :class="trade.type">
                    {{ trade.type === 'buy' ? '加仓' : '减仓' }}
                  </span>
                  <span class="trade-date">{{ trade.date }}</span>
                  <span class="trade-amount">{{ trade.amount?.toFixed(0) }}元</span>
                  <span class="trade-nav" :class="{ 'is-estimate': trade.estimated }">
                    {{ trade.netValue?.toFixed(4) }}
                    <span class="nav-tag">{{ trade.estimated ? '估' : '净' }}</span>
                  </span>
                  <span 
                    class="trade-return" 
                    :class="(trade.postReturn ?? 0) >= 0 ? 'up' : 'down'"
                  >
                    {{ (trade.postReturn ?? 0) >= 0 ? '+' : '' }}{{ (trade.postReturn ?? 0).toFixed(2) }}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">暂无交易记录</div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* ============ 全局 ============ */
.panorama-dashboard {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
}

/* ============ 顶部状态栏 ============ */
.top-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.top-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-dot {
  width: 10px;
  height: 10px;
  background: linear-gradient(135deg, #f87171, #6366f1);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.5);
}

.top-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.top-stats {
  display: flex;
  gap: 20px;
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-sub {
  font-size: 9px;
  color: var(--text-muted);
}

.stat-block.up .stat-value,
.account-pct.up,
.observe-today.up,
.observe-added.up,
.track-change-item.up,
.track-diff.up,
.ai-stat-value.up,
.signal-score.up,
.trade-return.up,
.fm-today.up {
  color: var(--color-up) !important;
}

.stat-block.down .stat-value,
.account-pct.down,
.observe-today.down,
.observe-added.down,
.track-change-item.down,
.track-diff.down,
.ai-stat-value.down,
.signal-score.down,
.trade-return.down,
.fm-added.down {
  color: var(--color-down) !important;
}

.stat-block.closed .stat-value,
.account-pct.closed {
  color: var(--text-secondary) !important;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-up);
  animation: pulse 2s infinite;
}

.trading-status.closed .live-dot { background: var(--text-muted); animation: none; }
.trading-status.noon .live-dot { background: #f0883e; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.top-indices {
  display: flex;
  gap: 10px;
  flex: 1;
  justify-content: center;
}

.index-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  min-width: 90px;
}

.index-tile.up { border-top: 2px solid var(--color-up); }
.index-tile.down { border-top: 2px solid var(--color-down); }

.index-name {
  font-size: 10px;
  color: var(--text-muted);
}

.index-value {
  font-size: 13px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
}

.index-pct {
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
}

.index-tile.up .index-value,
.index-tile.up .index-pct { color: var(--color-up); }
.index-tile.down .index-value,
.index-tile.down .index-pct { color: var(--color-down); }

.top-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 主题切换按钮（与 Holding.vue 同款） */
.theme-toggle {
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-light);
}

.theme-toggle-btn {
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.theme-toggle-btn.active {
  background: var(--primary-color);
  color: #fff;
  font-weight: 600;
}

.theme-toggle-btn:hover:not(.active) {
  color: var(--text-primary);
}

.clock {
  font-size: 12px;
  font-family: 'SF Mono', Consolas, monospace;
  color: var(--text-secondary);
}

.refresh-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  color: var(--text-primary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.refresh-btn:hover { background: var(--bg-tertiary); }
.refresh-btn.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ============ 主区域 ============ */
.main-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.2fr;
  gap: 12px;
  padding: 12px;
  min-height: 0;
  overflow: hidden;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

/* ============ Panel 通用 ============ */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
}

.panel-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 4px;
}

.panel-link {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}

.panel-link:hover {
  color: var(--color-primary, #3b82f6);
  background: var(--bg-tertiary);
}

/* 更新进度条（与 Home.vue 统一） */
.update-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* not-updated: 灰色（未开始） */
.update-progress.not-updated { color: var(--text-secondary); background: rgba(158,158,158,0.1); }
.update-progress.not-updated .update-progress-fill { background: var(--text-muted); }

/* updating: 绿色（更新中） */
.update-progress.updating { color: #4caf50; background: rgba(76,175,80,0.1); }
.update-progress.updating .update-progress-fill { background: #4caf50; }

/* updated: 橙色（全部更新完） */
.update-progress.updated { color: #ff9800; background: rgba(255,152,0,0.1); }
.update-progress.updated .update-progress-fill { background: #ff9800; }

.update-progress.closed { color: var(--text-secondary); background: rgba(158,158,158,0.1); }
.update-progress.closed .update-progress-fill { background: var(--text-muted); }

.update-progress-bar {
  width: 40px;
  height: 4px;
  background: rgba(0,0,0,0.15);
  border-radius: 2px;
  overflow: hidden;
}

.update-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s;
}

.update-progress-text {
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
}

.empty-hint {
  padding: 30px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* ============ Portfolio 左列 ============ */
.col-portfolio {
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-light);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.col-portfolio .panel-header {
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.col-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 50px;
}

.account-block {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
}

.account-block:last-child { border-bottom: none; }

.account-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.account-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.account-icon-fallback {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: var(--bg-primary);
}

.account-name {
  font-size: 13px;
  font-weight: 600;
}

.account-count {
  font-size: 10px;
  color: var(--text-muted);
}

.account-spacer { flex: 1; }

.account-stat {
  font-size: 13px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
}

.account-pct {
  font-size: 13px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  min-width: 60px;
  text-align: right;
}

.fund-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.fund-mini-card {
  padding: 7px 8px;
  background: var(--bg-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.fund-mini-card:hover {
  border-color: var(--color-primary, #3b82f6);
  transform: translateY(-1px);
  background: var(--bg-secondary);
}

.fm-row {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
}

.fm-row-top {
  min-height: 14px;
}

.fm-row-mid {
  gap: 3px;
}

.fm-row-bottom {
  justify-content: space-between;
}

.fm-qd-tag {
  font-size: 8px;
  padding: 0 3px;
  border-radius: 3px;
  background: #9333ea;
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
}

.fm-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  transition: color 0.3s;
}

/* 交易时间内：已更新=橙色，未更新=绿色 */
.fm-name.fm-updated { color: #ff9800; }
.fm-name.fm-pending { color: #4caf50; }

.fm-score {
  font-size: 9px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}
.fm-score.level-S { background: rgba(255,107,107,0.2); color: #ff6b6b; }
.fm-score.level-A { background: rgba(255,167,38,0.2); color: #ffa726; }
.fm-score.level-B { background: rgba(102,187,106,0.2); color: #66bb6a; }
.fm-score.level-C { background: rgba(66,165,245,0.2); color: #42a5f5; }
.fm-score.level-D { background: rgba(120,144,156,0.2); color: #78909c; }

.fm-code {
  font-size: 9px;
  font-family: 'SF Mono', Consolas, monospace;
  color: var(--text-muted);
  flex-shrink: 0;
}

.fm-val-label {
  font-size: 8px;
  font-weight: 600;
  padding: 0 3px;
  border-radius: 2px;
  flex-shrink: 0;
}
.fm-val-label.is-nav { background: rgba(120,144,156,0.2); color: var(--text-muted); }
.fm-val-label.is-est { background: rgba(245,158,11,0.2); color: #f59e0b; }

.fm-value {
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
  color: var(--text-primary);
  flex-shrink: 0;
}

.fm-today {
  font-size: 11px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  margin-left: auto;
  flex-shrink: 0;
}
.fm-today.up { color: var(--color-up); }
.fm-today.down { color: var(--color-down); }

.fm-market {
  font-size: 10px;
  color: var(--text-secondary);
  font-family: 'SF Mono', Consolas, monospace;
}

.fm-added {
  font-size: 10px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.fm-added.up { background: rgba(255,107,107,0.12); color: var(--color-up); }
.fm-added.down { background: rgba(81,207,102,0.12); color: var(--color-down); }

.fund-mini-more {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-primary);
  border-radius: 6px;
  min-height: 52px;
  border: 1px dashed var(--border-light);
}

/* ============ 中列 ============ */
.col-center {
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 30px;
}

.panel-block {
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-light);
  overflow: hidden;
}

/* 量化观察 */
.observe-list {
  padding: 8px 14px;
  max-height: calc(50vh - 120px);
  overflow-y: auto;
}

.observe-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.15s;
}

.observe-row:hover { background: var(--bg-tertiary); }
.observe-row:last-child { border-bottom: none; }

.observe-name {
  font-size: 12px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.observe-today {
  font-size: 12px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  min-width: 52px;
  text-align: right;
  flex-shrink: 0;
}

.observe-added {
  font-size: 10px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.observe-added.up { background: rgba(255,107,107,0.12); color: var(--color-up); }
.observe-added.down { background: rgba(81,207,102,0.12); color: var(--color-down); }

.observe-bar {
  width: 40px;
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}

.observe-bar-inner {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

.observe-bar-inner.up { background: var(--color-up); }
.observe-bar-inner.down { background: var(--color-down); }

/* AI 追踪 */
.panel-block-tracking { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.panel-block-tracking .panel-header { flex-shrink: 0; }

.track-list {
  padding: 8px 14px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.track-row {
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 6px;
  margin-bottom: 6px;
  border-left: 3px solid transparent;
}

.track-row.success { border-left-color: var(--color-up); }
.track-row.fail { border-left-color: var(--color-down); }

.track-funds {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
}

.track-fund-name {
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-arrow { color: var(--text-muted); font-size: 11px; }

.track-changes {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-family: 'SF Mono', Consolas, monospace;
}

.track-diff {
  margin-left: auto;
  font-weight: 700;
  font-size: 12px;
}

.track-more {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px;
}

/* ============ 右列 ============ */
.col-right {
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 30px;
}

/* AI 交易分析 */
.ai-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
}

.ai-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background: var(--bg-primary);
  border-radius: 5px;
}

.ai-stat-value {
  font-size: 14px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
}

.ai-stat-label {
  font-size: 10px;
  color: var(--text-muted);
}

.ai-signal-list {
  padding: 6px 14px;
  max-height: 180px;
  overflow-y: auto;
}

.ai-signal-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}

.ai-signal-row:hover { background: var(--bg-tertiary); }
.ai-signal-row:last-child { border-bottom: none; }

.signal-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  flex-shrink: 0;
}

.signal-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signal-score {
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
}

.ai-no-signal {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 交易记录 */
.panel-block-trades { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.panel-block-trades .panel-header { flex-shrink: 0; }

/* 交易记录 - 分组卡片风格（Trader 同款） */
.trade-list.grouped {
  padding: 4px 12px 30px 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trade-fund-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
}

.trade-fund-card.is-cleared {
  opacity: 0.75;
  border-style: dashed;
}

.trade-fund-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.trade-fund-logo {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--bg-primary);
  flex-shrink: 0;
}

.trade-fund-source {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
  margin-left: -4px;
  border: 1px solid var(--bg-secondary);
}

.trade-fund-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.trade-fund-code {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'SF Mono', Consolas, monospace;
}

.trade-cleared-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-up);
  font-weight: 600;
  flex-shrink: 0;
}

.trade-fund-items {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 6px;
}

.trade-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 1.4;
}

.trade-type-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
  min-width: 30px;
  text-align: center;
}

.trade-type-badge.buy { background: rgba(34, 197, 94, 0.15); color: var(--color-up); }
.trade-type-badge.sell { background: rgba(239, 68, 68, 0.15); color: var(--color-down); }

.trade-date {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'SF Mono', Consolas, monospace;
  flex-shrink: 0;
}

.trade-amount {
  font-size: 11px;
  font-family: 'SF Mono', Consolas, monospace;
  color: var(--text-secondary);
  min-width: 55px;
  text-align: right;
}

.trade-nav {
  font-size: 10px;
  font-family: 'SF Mono', Consolas, monospace;
  color: var(--text-muted);
  min-width: 58px;
  text-align: right;
}

.trade-nav.is-estimate {
  color: #f59e0b;
}

.nav-tag {
  font-size: 8px;
  padding: 0 3px;
  margin-left: 2px;
  border-radius: 2px;
  background: rgba(255,255,255,0.08);
}

.trade-return {
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 11px;
  min-width: 50px;
  text-align: right;
  margin-left: auto;
}

/* 滚动条美化 */
.col-center::-webkit-scrollbar,
.col-right::-webkit-scrollbar,
.observe-list::-webkit-scrollbar,
.track-list::-webkit-scrollbar,
.trade-list::-webkit-scrollbar,
.ai-signal-list::-webkit-scrollbar {
  width: 6px;
}

.col-center::-webkit-scrollbar-track,
.col-right::-webkit-scrollbar-track,
.observe-list::-webkit-scrollbar-track,
.track-list::-webkit-scrollbar-track,
.trade-list::-webkit-scrollbar-track,
.ai-signal-list::-webkit-scrollbar-track {
  background: transparent;
}

.col-center::-webkit-scrollbar-thumb,
.col-right::-webkit-scrollbar-thumb,
.observe-list::-webkit-scrollbar-thumb,
.track-list::-webkit-scrollbar-thumb,
.trade-list::-webkit-scrollbar-thumb,
.ai-signal-list::-webkit-scrollbar-thumb {
  background: var(--border-light);
  border-radius: 3px;
}
</style>
