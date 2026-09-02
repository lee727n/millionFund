<script setup lang="ts">
// [WHAT] 全景大屏 - 网页端专用，一个页面整合所有核心模块
// [WHY] 利用大屏空间，Portfolio持仓 + 量化观察 + AI追踪 + 交易记录 + AI分析 同屏展示

import { computed, ref, onMounted, onUnmounted, reactive, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { useAITrackingStore } from '@/stores/aiTracking'
import { useThemeStore } from '@/stores/theme'
import { getTrades, addTrade } from '@/utils/storage'
import { analyzeTrades, type TradeAnalysisResult } from '@/utils/aiAnalyzer'
import { fetchMarketIndicesFast, fetchGlobalIndices, fetchFundAccurateData, fetchLatestNetValue, fetchNetValueHistoryFast, fetchTopHoldings, type MarketIndexSimple, type GlobalIndex, type HoldingStock } from '@/api/fundFast'
import { getTradingSession, type TradingSession } from '@/api/tiantianApi'
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant'

const router = useRouter()
const holdingStore = useHoldingStore()
const aiTrackingStore = useAITrackingStore()
const themeStore = useThemeStore()

// ============ 基础状态 ============
const indices = ref<MarketIndexSimple[]>([])
const refreshing = ref(false)
let refreshTimer: number | undefined

// 刷新闪动标记：每次刷新后递增，触发 fm-today 动画
const flashTick = ref(0)
const flashActive = ref(false)
watch(flashTick, async () => {
  flashActive.value = false
  await nextTick()
  flashActive.value = true
  setTimeout(() => { flashActive.value = false }, 800)
})

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
  if (inTrading) return { updated, total, text: '交易中', class: 'updating', percent: (updated / total) * 100 }
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

// ============ 前10大重仓股弹窗 ============
const topHoldingsModal = ref<{ open: boolean; fund: any; stocks: HoldingStock[]; loading: boolean }>({
  open: false, fund: null, stocks: [], loading: false
})
async function openTopHoldings(fund: any, event: Event) {
  event.stopPropagation()
  topHoldingsModal.value = { open: true, fund, stocks: [], loading: true }
  try {
    const stocks = await fetchTopHoldings(fund.code)
    topHoldingsModal.value.stocks = stocks
  } catch (err) {
    console.error('获取重仓股失败:', err)
  } finally {
    topHoldingsModal.value.loading = false
  }
}

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
  return aiTrackingStore.records
    .map(r => {
      const sellLive = liveFundData.value.get(r.sellCode)
      const buyLive = liveFundData.value.get(r.buyCode)
      return {
        ...r,
        sellChange: computeTrackChange(r.sellCode, r.sellNav),
        buyChange: computeTrackChange(r.buyCode, r.buyNav),
        sellToday: sellLive?.dayChange ?? 0,
        buyToday: buyLive?.dayChange ?? 0
      }
    })
    .sort((a, b) => {
      const diffA = (a.buyChange || 0) - (a.sellChange || 0)
      const diffB = (b.buyChange || 0) - (b.sellChange || 0)
      return diffB - diffA
    })
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

    // 6. 触发闪动效果
    flashTick.value++
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

// ============ 长按快捷操作 ============
const selectedFundForAction = ref<any>(null)
const showFundActionBar = ref(false)
const actionBarPosition = reactive({ top: 0, left: 0, width: 350 })
const longpressTimer = ref<number | null>(null)
const isLongpressTriggered = ref(false)

function startLongpressTimer(event: TouchEvent | MouseEvent, fund: any) {
  isLongpressTriggered.value = false
  longpressTimer.value = window.setTimeout(() => {
    isLongpressTriggered.value = true
    if (navigator.vibrate) navigator.vibrate(10)
    selectedFundForAction.value = fund
    const target = (event.target as HTMLElement).closest('.fund-mini-card') as HTMLElement
    if (!target) return
    const rect = target.getBoundingClientRect()
    const gap = 8
    let left = rect.left
    let top = rect.bottom + gap
    const abW = 320
    const abH = 36
    if (left + abW > window.innerWidth) left = window.innerWidth - abW - 16
    if (left < 16) left = 16
    if (top + abH > window.innerHeight) top = rect.top - abH - gap
    actionBarPosition.top = top
    actionBarPosition.left = left
    actionBarPosition.width = abW
    showFundActionBar.value = true
  }, 500)
}

function endLongpressTimer() {
  if (longpressTimer.value) {
    clearTimeout(longpressTimer.value)
    longpressTimer.value = null
  }
}

function closeActionBar() {
  showFundActionBar.value = false
}

function handleCardTouchStart(e: TouchEvent, fund: any) { startLongpressTimer(e, fund) }
function handleCardTouchEnd(e: TouchEvent) {
  endLongpressTimer()
  if (isLongpressTriggered.value) e.preventDefault()
}
function handleCardTouchMove() { endLongpressTimer() }
function handleCardMouseDown(e: MouseEvent, fund: any) { startLongpressTimer(e, fund) }
function handleCardMouseUp() { endLongpressTimer() }
function handleCardMouseMove() { endLongpressTimer() }

// 操作按钮
function handleActionTrade() { openTradeDialog() }
function handleActionConvert() { openAddAITrackingDialog() }
function handleActionAdjust() { openCostDialog() }
function handleActionSource() { openSourceDialog() }
function handleActionDelete() {
  closeActionBar()
  if (selectedFundForAction.value) {
    showConfirmDialog({
      title: '确认删除',
      message: `确认删除 ${selectedFundForAction.value.name} (${selectedFundForAction.value.code})？`,
    })
      .then(() => {
        holdingStore.removeHolding(selectedFundForAction.value.code)
        showToast('已删除')
      })
      .catch(() => {})
  }
}

// ============ 交易弹窗（加仓/减仓）============
const showTradeDialog = ref(false)
const tradeFormData = ref({
  type: 'buy' as 'buy' | 'sell',
  amount: '',
  netValue: '',
  date: '',
  isEstimate: true
})
async function openTradeDialog() {
  closeActionBar()
  const holding = selectedFundForAction.value
  if (!holding) return
  tradeFormData.value = {
    type: 'buy',
    amount: '',
    netValue: holding.currentValue ? holding.currentValue.toFixed(4) : '',
    date: new Date().toLocaleDateString('en-CA'),
    isEstimate: true
  }
  showTradeDialog.value = true
  await nextTick()
  try {
    const data = await fetchFundAccurateData(holding.code, holding.isQDII, true)
    const shouldUseNav = data.dataSource === 'nav' && data.nav > 0
    if (shouldUseNav) {
      tradeFormData.value.netValue = data.nav.toFixed(4)
      tradeFormData.value.isEstimate = false
    } else {
      const v = (data.estimate || data.currentValue || 0)
      if (v > 0) {
        tradeFormData.value.netValue = v.toFixed(4)
        tradeFormData.value.isEstimate = true
      }
    }
  } catch {}
}
async function submitTrade() {
  const holding = selectedFundForAction.value
  if (!holding) return
  const amount = parseFloat(tradeFormData.value.amount)
  const netValue = parseFloat(tradeFormData.value.netValue)
  const type = tradeFormData.value.type
  const date = tradeFormData.value.date || new Date().toLocaleDateString('en-CA')
  if (!amount || amount <= 0) return showToast('请输入有效的交易金额')
  if (!netValue || netValue <= 0) return showToast('请输入有效的净值')
  const shares = amount / netValue
  showLoadingToast({ message: '提交中...', forbidClick: true })
  try {
    addTrade({
      id: '', code: holding.code, name: holding.name, type, date, amount,
      netValue, shares, fee: 0, estimated: tradeFormData.value.isEstimate,
      estimateAtTrade: tradeFormData.value.isEstimate ? netValue : undefined,
      source: holding.source, createdAt: Date.now()
    })
    const cur = holdingStore.holdings.find(h => h.code === holding.code)
    if (cur) {
      if (type === 'buy') cur.shares = (cur.shares || 0) + shares
      else {
        if (shares > (cur.shares || 0)) {
          closeToast(); showToast(`减仓份额超过当前持仓(${cur.shares?.toFixed(2)}份)`)
          return
        }
        cur.shares = cur.shares - shares
      }
      cur.currentValue = netValue
      holdingStore.addOrUpdateHolding(cur)
    }
    closeToast()
    showToast({ message: `${type === 'buy' ? '加仓' : '减仓'}成功`, duration: 2000 })
    showTradeDialog.value = false
    selectedFundForAction.value = null
  } catch (e) {
    closeToast(); showToast('交易提交失败')
  }
}

// ============ 调成本弹窗 ============
const showCostDialog = ref(false)
const costFormData = ref({ amount: '', profit: '' })
function openCostDialog() {
  closeActionBar()
  const holding = selectedFundForAction.value
  if (!holding) return showToast('暂未持有该基金')
  costFormData.value = {
    amount: (holding.marketValue || holding.shares * holding.currentValue || 0).toString(),
    profit: (holding.profit !== undefined ? holding.profit : (holding.currentValue && holding.buyNetValue ? (holding.currentValue - holding.buyNetValue) * holding.shares : 0)).toString()
  }
  showCostDialog.value = true
}
async function submitCostAdjust() {
  const holding = selectedFundForAction.value
  if (!holding) return
  // 从 store 拿最新状态，避免 selectedFundForAction 是陈旧快照
  const cur = holdingStore.holdings.find((h) => h.code === holding.code)
  const base = cur || holding as any
  const marketValue = parseFloat(costFormData.value.amount)
  const profit = parseFloat(costFormData.value.profit)
  if (!marketValue || marketValue <= 0) return showToast('请输入有效的持仓市值')
  if (isNaN(profit)) return showToast('请输入有效的持仓收益')
  showLoadingToast({ message: '获取最新净值...', forbidClick: true })
  try {
    let latestNetValue: number | null = null
    let latestDate = ''
    const accurate = await fetchFundAccurateData(base.code, base.isQDII, true)
    if (accurate && accurate.nav > 0) {
      latestNetValue = accurate.nav
      latestDate = accurate.navDate
    }
    if (!latestNetValue) {
      const r = await fetchLatestNetValue(base.code)
      if (r && r.netValue > 0) { latestNetValue = r.netValue; latestDate = r.date }
    }
    if (!latestNetValue) { closeToast(); return showToast('获取最新净值失败') }
    const newShares = marketValue / latestNetValue
    const costNetValue = newShares > 0 ? (marketValue - profit) / newShares : latestNetValue
    const addedGain = ((latestNetValue - costNetValue) / costNetValue) * 100
    holdingStore.addOrUpdateHolding({
      code: base.code, name: base.name, buyNetValue: costNetValue, shares: newShares,
      buyDate: base.buyDate, holdingDays: base.holdingDays,
      industrySectors: base.industrySectors, source: base.source,
      isQDII: base.isQDII, createdAt: base.createdAt,
      currentValue: latestNetValue, addedGain, marketValue, profit
    })
    closeToast()
    showToast({ message: `成本已更新，份额 ${newShares.toFixed(2)}，成本净值 ${costNetValue.toFixed(4)}`, duration: 2500 })
    showCostDialog.value = false
    selectedFundForAction.value = null
  } catch (e) {
    closeToast(); showToast('调整失败')
  }
}

// ============ 来源弹窗 ============
const showSourceDialog = ref(false)
const sourceFormData = ref({ source: '' as string, isQDII: false })
function openSourceDialog() {
  closeActionBar()
  const holding = selectedFundForAction.value
  if (!holding) return
  sourceFormData.value = { source: holding.source || '', isQDII: holding.isQDII || false }
  showSourceDialog.value = true
}
function submitSourceChange() {
  const holding = selectedFundForAction.value
  if (!holding) return
  const cur = holdingStore.holdings.find(h => h.code === holding.code)
  if (cur) {
    cur.source = sourceFormData.value.source.trim() || undefined
    cur.isQDII = sourceFormData.value.isQDII
    holdingStore.addOrUpdateHolding(cur)
    showToast('已更新')
  }
  showSourceDialog.value = false
  selectedFundForAction.value = null
}

// ============ AI追踪添加弹窗 ============
type NewRecord = { date: string; sellCode: string; sellName: string; buyCode: string; buyName: string }
const showAddModal = ref(false)
const newRecord = ref<NewRecord>({ date: '', sellCode: '', sellName: '', buyCode: '', buyName: '' })
function resetNewRecord() {
  newRecord.value = { date: '', sellCode: '', sellName: '', buyCode: '', buyName: '' }
}
function openAddAITrackingDialog() {
  closeActionBar()
  resetNewRecord()
  const h = selectedFundForAction.value
  if (h) {
    newRecord.value.sellCode = h.code
    newRecord.value.sellName = h.name
    newRecord.value.date = new Date().toLocaleDateString('en-CA')
  }
  showAddModal.value = true
}
async function fetchFundInfoForAIT(type: 'sell' | 'buy') {
  const code = type === 'sell' ? newRecord.value.sellCode : newRecord.value.buyCode
  if (!code) return
  try {
    const info = await fetchFundAccurateData(code)
    if (info) {
      if (type === 'sell') newRecord.value.sellName = info.name
      else newRecord.value.buyName = info.name
    }
  } catch {}
}
async function confirmAddRecord() {
  if (!newRecord.value.sellCode || !newRecord.value.buyCode) {
    showToast({ message: '请填写基金代码', duration: 2000 }); return
  }
  showLoadingToast('添加中...')
  try {
    let sellName = newRecord.value.sellName, buyName = newRecord.value.buyName
    let sellNav = 0, buyNav = 0, sellNavEstimated = false, buyNavEstimated = false
    const targetDate = newRecord.value.date || new Date().toLocaleDateString('en-CA')
    if (newRecord.value.date) {
      const days = Math.ceil((Date.now() - new Date(newRecord.value.date).getTime()) / 86400000) + 10
      const [sellH, buyH] = await Promise.all([
        fetchNetValueHistoryFast(newRecord.value.sellCode, days),
        fetchNetValueHistoryFast(newRecord.value.buyCode, days)
      ])
      const sr = sellH.records?.find((r: any) => r.date === newRecord.value.date)
      const br = buyH.records?.find((r: any) => r.date === newRecord.value.date)
      if (sr && br) {
        sellName = sellName || newRecord.value.sellCode
        buyName = buyName || newRecord.value.buyCode
        sellNav = sr.netValue; buyNav = br.netValue
      } else {
        sellNavEstimated = buyNavEstimated = true
        const [si, bi] = await Promise.all([
          fetchFundAccurateData(newRecord.value.sellCode, false, true),
          fetchFundAccurateData(newRecord.value.buyCode, false, true)
        ])
        if (si && si.currentValue > 0) { sellName = si.name; sellNav = si.currentValue }
        else { closeToast(); showToast('获取卖出基金信息失败'); return }
        if (bi && bi.currentValue > 0) { buyName = bi.name; buyNav = bi.currentValue }
        else { closeToast(); showToast('获取买入基金信息失败'); return }
      }
    } else {
      sellNavEstimated = buyNavEstimated = true
      const [si, bi] = await Promise.all([
        fetchFundAccurateData(newRecord.value.sellCode),
        fetchFundAccurateData(newRecord.value.buyCode)
      ])
      if (si && si.currentValue > 0) { sellName = si.name; sellNav = si.currentValue }
      else { closeToast(); showToast('获取卖出基金信息失败'); return }
      if (bi && bi.currentValue > 0) { buyName = bi.name; buyNav = bi.currentValue }
      else { closeToast(); showToast('获取买入基金信息失败'); return }
    }
    aiTrackingStore.addRecord({
      sellCode: newRecord.value.sellCode, sellName, sellNav, sellNavEstimated,
      buyCode: newRecord.value.buyCode, buyName, buyNav, buyNavEstimated, date: targetDate
    })
    closeToast()
    showToast({ message: '已添加到 AI 追踪', duration: 2000 })
    showAddModal.value = false
    resetNewRecord()
  } catch (e) { closeToast(); showToast('添加失败') }
}

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
// 根据基金 code 查找 AI 交易信号
function getFundSignal(fundCode: string) {
  return aiAnalysis.value.signals?.find((s: any) => s.fundCode === fundCode)
}

// 交易中：统一灰白色；非交易中：已更新=黄，未更新=绿
function getFundNameClass(fund: any): Record<string, boolean> {
  const inTrading = tradingSession.value === 'morning' || tradingSession.value === 'afternoon'
  if (inTrading) return { 'fm-in-trading': true }
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
          <!-- 更新进度 -->
          <div class="update-progress" :class="[updateProgress.class, { 'in-trading': tradingSession === 'morning' || tradingSession === 'afternoon' }]">
            <!-- 交易中：绿点呼吸 + 文字 -->
            <template v-if="tradingSession === 'morning' || tradingSession === 'afternoon'">
              <span class="up-live-dot"></span>
              <span class="update-progress-text">{{ updateProgress.text }}</span>
            </template>
            <!-- 非交易中：进度条 + 文字 -->
            <template v-else>
              <div class="update-progress-bar">
                <div class="update-progress-fill" :style="{ width: updateProgress.percent + '%' }"></div>
              </div>
              <span class="update-progress-text">{{ updateProgress.text }}</span>
            </template>
          </div>
        </div>

        <div class="col-scroll">
          <!-- 支付宝 -->
        <div class="account-block block-ali" v-if="aliHoldings.length > 0">
          <div class="account-header">
            <img src="@/assets/ali.jpg" class="account-icon" />
            <span class="account-name">支付宝</span>
            <span class="account-count">{{ aliStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(aliStats.marketValue) }}</span>
            <span
              class="account-profit"
              :class="isWeekend ? 'closed' : (aliStats.todayProfit >= 0 ? 'up' : 'down')"
            >{{ isWeekend ? '' : (aliStats.todayProfit >= 0 ? '+' : '') + fmtMoney(aliStats.todayProfit) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (aliStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(aliStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div class="fund-grid-scroll">
              <div 
                v-for="fund in aliHoldings" 
                :key="fund.code"
                class="fund-mini-card"
                @click="goDetail(fund.code)"
                @touchstart="handleCardTouchStart($event, fund)"
                @touchend="handleCardTouchEnd"
                @touchmove="handleCardTouchMove"
                @mousedown="handleCardMouseDown($event, fund)"
                @mouseup="handleCardMouseUp"
                @mousemove="handleCardMouseMove"
              >
              <!-- 今日涨幅徽章（绝对定位右上角，只这一个用绝对定位） -->
              <span class="fm-today" :class="[fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down', { 'no-data': !fund.todayChange, 'flash': flashActive }]">
                <span class="fm-today-arrow">{{ fund.todayChange && parseFloat(fund.todayChange) >= 0 ? '▲' : (fund.todayChange ? '▼' : '') }}</span>
                {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
              </span>
              <!-- 第一行：QD + 名称 + 评级 + AI信号图标 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name" @click.stop="openTopHoldings(fund, $event)">{{ fund.name?.slice(0, 8) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
                <span 
                  v-if="getFundSignal(fund.code)" 
                  class="fm-ai-signal" 
                  :class="'signal-' + getFundSignal(fund.code).signal"
                  :title="'AI建议：' + getSignalLabel(getFundSignal(fund.code).signal)"
                >{{ getSignalIcon(getFundSignal(fund.code).signal) }}</span>
              </div>
              <!-- 第二行：code+估/净+估值 靠左，市值+累计 靠右 -->
              <div class="fm-row fm-row-bottom">
                <div class="fm-row-bottom-left">
                  <span class="fm-code">{{ fund.code }}</span>
                  <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                    {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                  </span>
                  <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                </div>
                <div class="fm-row-bottom-right">
                  <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                  <span 
                    class="fm-added" 
                    v-if="fund.addedGain !== undefined" 
                    :class="fund.addedGain >= 0 ? 'up' : 'down'"
                  >
                    累计 {{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <!-- 腾讯 -->
        <div class="account-block block-tx" v-if="txHoldings.length > 0">
          <div class="account-header">
            <img src="@/assets/TX.jpg" class="account-icon" />
            <span class="account-name">腾讯</span>
            <span class="account-count">{{ txStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(txStats.marketValue) }}</span>
            <span
              class="account-profit"
              :class="isWeekend ? 'closed' : (txStats.todayProfit >= 0 ? 'up' : 'down')"
            >{{ isWeekend ? '' : (txStats.todayProfit >= 0 ? '+' : '') + fmtMoney(txStats.todayProfit) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (txStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(txStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div class="fund-grid-scroll">
              <div 
                v-for="fund in txHoldings" 
                :key="fund.code"
                class="fund-mini-card"
                @click="goDetail(fund.code)"
                @touchstart="handleCardTouchStart($event, fund)"
                @touchend="handleCardTouchEnd"
                @touchmove="handleCardTouchMove"
                @mousedown="handleCardMouseDown($event, fund)"
                @mouseup="handleCardMouseUp"
                @mousemove="handleCardMouseMove"
              >
              <!-- 今日涨幅徽章（绝对定位右上角，只这一个用绝对定位） -->
              <span class="fm-today" :class="[fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down', { 'no-data': !fund.todayChange, 'flash': flashActive }]">
                <span class="fm-today-arrow">{{ fund.todayChange && parseFloat(fund.todayChange) >= 0 ? '▲' : (fund.todayChange ? '▼' : '') }}</span>
                {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
              </span>
              <!-- 第一行：QD + 名称 + 评级 + AI信号图标 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name" @click.stop="openTopHoldings(fund, $event)">{{ fund.name?.slice(0, 8) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
                <span 
                  v-if="getFundSignal(fund.code)" 
                  class="fm-ai-signal" 
                  :class="'signal-' + getFundSignal(fund.code).signal"
                  :title="'AI建议：' + getSignalLabel(getFundSignal(fund.code).signal)"
                >{{ getSignalIcon(getFundSignal(fund.code).signal) }}</span>
              </div>
              <!-- 第二行：code+估/净+估值 靠左，市值+累计 靠右 -->
              <div class="fm-row fm-row-bottom">
                <div class="fm-row-bottom-left">
                  <span class="fm-code">{{ fund.code }}</span>
                  <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                    {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                  </span>
                  <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                </div>
                <div class="fm-row-bottom-right">
                  <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                  <span 
                    class="fm-added" 
                    v-if="fund.addedGain !== undefined" 
                    :class="fund.addedGain >= 0 ? 'up' : 'down'"
                  >
                    累计 {{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <!-- 京东 -->
        <div class="account-block block-jd" v-if="jdHoldings.length > 0">
          <div class="account-header">
            <img src="@/assets/JD.jpg" class="account-icon" />
            <span class="account-name">京东</span>
            <span class="account-count">{{ jdStats.count }} 只</span>
            <div class="account-spacer"></div>
            <span class="account-stat">{{ fmtMoney(jdStats.marketValue) }}</span>
            <span
              class="account-profit"
              :class="isWeekend ? 'closed' : (jdStats.todayProfit >= 0 ? 'up' : 'down')"
            >{{ isWeekend ? '' : (jdStats.todayProfit >= 0 ? '+' : '') + fmtMoney(jdStats.todayProfit) }}</span>
            <span 
              class="account-pct" 
              :class="isWeekend ? 'closed' : (jdStats.profitPercent >= 0 ? 'up' : 'down')"
            >
              {{ isWeekend ? '休市' : fmtPct(jdStats.profitPercent) }}
            </span>
          </div>
          <div class="fund-mini-grid">
            <div class="fund-grid-scroll">
              <div 
                v-for="fund in jdHoldings" 
                :key="fund.code"
                class="fund-mini-card"
                @click="goDetail(fund.code)"
                @touchstart="handleCardTouchStart($event, fund)"
                @touchend="handleCardTouchEnd"
                @touchmove="handleCardTouchMove"
                @mousedown="handleCardMouseDown($event, fund)"
                @mouseup="handleCardMouseUp"
                @mousemove="handleCardMouseMove"
              >
              <!-- 今日涨幅徽章（绝对定位右上角，只这一个用绝对定位） -->
              <span class="fm-today" :class="[fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down', { 'no-data': !fund.todayChange, 'flash': flashActive }]">
                <span class="fm-today-arrow">{{ fund.todayChange && parseFloat(fund.todayChange) >= 0 ? '▲' : (fund.todayChange ? '▼' : '') }}</span>
                {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
              </span>
              <!-- 第一行：QD + 名称 + 评级 + AI信号图标 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name" @click.stop="openTopHoldings(fund, $event)">{{ fund.name?.slice(0, 8) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
                <span 
                  v-if="getFundSignal(fund.code)" 
                  class="fm-ai-signal" 
                  :class="'signal-' + getFundSignal(fund.code).signal"
                  :title="'AI建议：' + getSignalLabel(getFundSignal(fund.code).signal)"
                >{{ getSignalIcon(getFundSignal(fund.code).signal) }}</span>
              </div>
              <!-- 第二行：code+估/净+估值 靠左，市值+累计 靠右 -->
              <div class="fm-row fm-row-bottom">
                <div class="fm-row-bottom-left">
                  <span class="fm-code">{{ fund.code }}</span>
                  <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                    {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                  </span>
                  <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                </div>
                <div class="fm-row-bottom-right">
                  <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                  <span 
                    class="fm-added" 
                    v-if="fund.addedGain !== undefined" 
                    :class="fund.addedGain >= 0 ? 'up' : 'down'"
                  >
                    累计 {{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                  </span>
                </div>
              </div>
            </div>
            </div>
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
            <div class="fund-grid-scroll">
              <div 
                v-for="fund in otherHoldings" 
                :key="fund.code"
                class="fund-mini-card"
                @click="goDetail(fund.code)"
                @touchstart="handleCardTouchStart($event, fund)"
                @touchend="handleCardTouchEnd"
                @touchmove="handleCardTouchMove"
                @mousedown="handleCardMouseDown($event, fund)"
                @mouseup="handleCardMouseUp"
                @mousemove="handleCardMouseMove"
              >
              <!-- 今日涨幅徽章（绝对定位右上角，只这一个用绝对定位） -->
              <span class="fm-today" :class="[fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down', { 'no-data': !fund.todayChange, 'flash': flashActive }]">
                <span class="fm-today-arrow">{{ fund.todayChange && parseFloat(fund.todayChange) >= 0 ? '▲' : (fund.todayChange ? '▼' : '') }}</span>
                {{ fund.todayChange ? fmtPct(parseFloat(fund.todayChange)) : '--' }}
              </span>
              <!-- 第一行：QD + 名称 + 评级 + AI信号图标 -->
              <div class="fm-row fm-row-top">
                <span v-if="fund.isQDII" class="fm-qd-tag">QD</span>
                <span class="fm-name" :class="getFundNameClass(fund)" :title="fund.name" @click.stop="openTopHoldings(fund, $event)">{{ fund.name?.slice(0, 8) }}</span>
                <span v-if="fund.fundScore" class="fm-score" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
                <span 
                  v-if="getFundSignal(fund.code)" 
                  class="fm-ai-signal" 
                  :class="'signal-' + getFundSignal(fund.code).signal"
                  :title="'AI建议：' + getSignalLabel(getFundSignal(fund.code).signal)"
                >{{ getSignalIcon(getFundSignal(fund.code).signal) }}</span>
              </div>
              <!-- 第二行：code+估/净+估值 靠左，市值+累计 靠右 -->
              <div class="fm-row fm-row-bottom">
                <div class="fm-row-bottom-left">
                  <span class="fm-code">{{ fund.code }}</span>
                  <span class="fm-val-label" :class="liveFundData.get(fund.code)?.dataSource === 'nav' ? 'is-nav' : 'is-est'">
                    {{ liveFundData.get(fund.code)?.dataSource === 'nav' ? '净' : '估' }}
                  </span>
                  <span class="fm-value">{{ (fund.currentValue ?? 0).toFixed(3) }}</span>
                </div>
                <div class="fm-row-bottom-right">
                  <span class="fm-market">{{ fmtMoney((fund.currentValue ?? 0) * (fund.shares ?? 0)) }}</span>
                  <span 
                    class="fm-added" 
                    v-if="fund.addedGain !== undefined" 
                    :class="fund.addedGain >= 0 ? 'up' : 'down'"
                  >
                    累计 {{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(1) }}%
                  </span>
                </div>
              </div>
            </div>
            </div>
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
              <span class="observe-name" :title="fund.name" @click.stop="openTopHoldings(fund, $event)">{{ fund.name?.slice(0, 10) }}</span>
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
              v-for="record in aiTrackRecords" 
              :key="record.id"
              class="track-row"
              :class="getTrackSuccess(record) ? 'success' : 'fail'"
            >
              <div class="track-funds">
                <span class="track-fund-name">{{ (record.sellName || record.sellCode)?.slice(0, 6) }}</span>
                <span class="track-arrow">→</span>
                <span class="track-fund-name">{{ (record.buyName || record.buyCode)?.slice(0, 6) }}</span>
                <span class="track-diff" :class="getTrackSuccess(record) ? 'up' : 'down'">
                  {{ getTrackDiff(record) >= 0 ? '+' : '' }}{{ getTrackDiff(record).toFixed(2) }}%
                </span>
              </div>
              <div class="track-changes">
                <span class="track-change-item" :class="(record.sellChange || 0) >= 0 ? 'up' : 'down'">
                  卖 <span class="track-today-tag" :class="record.sellToday >= 0 ? 'up' : 'down'">估{{ fmtPct(record.sellToday) }}</span>累{{ fmtPct(record.sellChange || 0) }}
                </span>
                <span class="track-change-item" :class="(record.buyChange || 0) >= 0 ? 'up' : 'down'">
                  买 <span class="track-today-tag" :class="record.buyToday >= 0 ? 'up' : 'down'">估{{ fmtPct(record.buyToday) }}</span>累{{ fmtPct(record.buyChange || 0) }}
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

    <!-- 长按快捷操作条 -->
    <div
      v-if="showFundActionBar"
      class="fund-action-bar"
      :style="{
        top: actionBarPosition.top + 'px',
        left: actionBarPosition.left + 'px',
        width: actionBarPosition.width + 'px'
      }"
      @click.stop
    >
      <button class="action-bar-btn" @click="handleActionTrade">交易</button>
      <button class="action-bar-btn" @click="handleActionConvert">转换</button>
      <button class="action-bar-btn" @click="handleActionAdjust">调成本</button>
      <button class="action-bar-btn" @click="handleActionSource">来源</button>
      <button class="action-bar-btn delete" @click="handleActionDelete">删除</button>
    </div>

    <!-- 点击其他区域关闭 -->
    <div
      v-if="showFundActionBar"
      class="action-bar-overlay"
      @click="closeActionBar"
    ></div>

    <!-- 交易弹窗 -->
    <van-dialog
      v-model:show="showTradeDialog"
      :close-on-click-overlay="false"
      show-cancel-button
      class="pa-dialog"
    >
      <template #header>
        <div class="pa-dialog-header">
          <span>{{ selectedFundForAction?.name }} ({{ selectedFundForAction?.code }})</span>
          <span class="pa-dialog-close" @click="showTradeDialog = false">✕</span>
        </div>
      </template>
      <div class="pa-dialog-body">
        <div class="pa-type-switch">
          <div
            :class="['pa-type-btn', 'buy', { active: tradeFormData.type === 'buy' }]"
            @click="tradeFormData.type = 'buy'"
          >加仓</div>
          <div
            :class="['pa-type-btn', 'sell', { active: tradeFormData.type === 'sell' }]"
            @click="tradeFormData.type = 'sell'"
          >减仓</div>
        </div>
        <div class="pa-field">
          <label>交易金额 (元)</label>
          <input v-model="tradeFormData.amount" type="number" placeholder="请输入金额" />
        </div>
        <div class="pa-field">
          <label>
            净值
            <span v-if="tradeFormData.isEstimate" class="pa-tag estimate">估值</span>
            <span v-else class="pa-tag nav">净值</span>
          </label>
          <input v-model="tradeFormData.netValue" type="number" step="0.0001" />
        </div>
        <div class="pa-field">
          <label>日期</label>
          <input v-model="tradeFormData.date" type="date" />
        </div>
        <div class="pa-info" v-if="tradeFormData.amount && tradeFormData.netValue">
          预计份额：{{ (parseFloat(tradeFormData.amount) / parseFloat(tradeFormData.netValue)).toFixed(2) }} 份
        </div>
      </div>
      <div class="pa-dialog-footer">
        <button class="pa-btn cancel" @click="showTradeDialog = false">取消</button>
        <button class="pa-btn confirm" @click="submitTrade">确认{{ tradeFormData.type === 'buy' ? '加仓' : '减仓' }}</button>
      </div>
    </van-dialog>

    <!-- 调成本弹窗 -->
    <van-dialog
      v-model:show="showCostDialog"
      :close-on-click-overlay="false"
      show-cancel-button
      class="pa-dialog"
    >
      <template #header>
        <div class="pa-dialog-header">
          <span>调整成本</span>
          <span class="pa-dialog-close" @click="showCostDialog = false">✕</span>
        </div>
      </template>
      <div class="pa-dialog-body">
        <div class="pa-fund-info">{{ selectedFundForAction?.name }} ({{ selectedFundForAction?.code }})</div>
        <div class="pa-field">
          <label>当前持仓市值 (元)</label>
          <input v-model="costFormData.amount" type="number" step="0.01" />
        </div>
        <div class="pa-field">
          <label>累计收益 (元)</label>
          <input v-model="costFormData.profit" type="number" step="0.01" />
        </div>
        <div class="pa-hint">
          系统将自动获取最新净值，重新计算份额和成本净值。
        </div>
      </div>
      <div class="pa-dialog-footer">
        <button class="pa-btn cancel" @click="showCostDialog = false">取消</button>
        <button class="pa-btn confirm" @click="submitCostAdjust">确认调整</button>
      </div>
    </van-dialog>

    <!-- 来源弹窗 -->
    <van-dialog
      v-model:show="showSourceDialog"
      :close-on-click-overlay="false"
      show-cancel-button
      class="pa-dialog"
    >
      <template #header>
        <div class="pa-dialog-header">
          <span>修改来源</span>
          <span class="pa-dialog-close" @click="showSourceDialog = false">✕</span>
        </div>
      </template>
      <div class="pa-dialog-body">
        <div class="pa-fund-info">{{ selectedFundForAction?.name }} ({{ selectedFundForAction?.code }})</div>
        <div class="pa-field">
          <label>账户来源</label>
          <div class="pa-radio-group">
            <label class="pa-radio">
              <input type="radio" v-model="sourceFormData.source" value="ali" /> 支付宝
            </label>
            <label class="pa-radio">
              <input type="radio" v-model="sourceFormData.source" value="TX" /> 腾讯
            </label>
            <label class="pa-radio">
              <input type="radio" v-model="sourceFormData.source" value="JD" /> 京东
            </label>
            <label class="pa-radio">
              <input type="radio" v-model="sourceFormData.source" value="observe" /> 量化观察
            </label>
            <label class="pa-radio">
              <input type="radio" v-model="sourceFormData.source" value="" /> 其他
            </label>
          </div>
        </div>
        <div class="pa-field pa-switch-field">
          <label>QDII 海外基金</label>
          <input type="checkbox" v-model="sourceFormData.isQDII" class="pa-switch" />
        </div>
      </div>
      <div class="pa-dialog-footer">
        <button class="pa-btn cancel" @click="showSourceDialog = false">取消</button>
        <button class="pa-btn confirm" @click="submitSourceChange">保存</button>
      </div>
    </van-dialog>

    <!-- AI追踪转换弹窗 -->
    <van-dialog
      v-model:show="showAddModal"
      :close-on-click-overlay="false"
      show-cancel-button
      class="pa-dialog"
    >
      <template #header>
        <div class="pa-dialog-header">
          <span>添加调仓记录</span>
          <span class="pa-dialog-close" @click="showAddModal = false">✕</span>
        </div>
      </template>
      <div class="pa-dialog-body">
        <div class="pa-field">
          <label>调仓日期（可选）</label>
          <input v-model="newRecord.date" type="date" />
        </div>
        <div class="pa-field">
          <label>卖出基金代码</label>
          <input v-model="newRecord.sellCode" placeholder="请输入基金代码" @blur="fetchFundInfoForAIT('sell')" />
          <div class="pa-fund-name-preview" v-if="newRecord.sellName">{{ newRecord.sellName }}</div>
        </div>
        <div class="pa-field">
          <label>买入基金代码</label>
          <input v-model="newRecord.buyCode" placeholder="请输入基金代码" @blur="fetchFundInfoForAIT('buy')" />
          <div class="pa-fund-name-preview" v-if="newRecord.buyName">{{ newRecord.buyName }}</div>
        </div>
      </div>
      <div class="pa-dialog-footer">
        <button class="pa-btn cancel" @click="showAddModal = false">取消</button>
        <button class="pa-btn confirm" @click="confirmAddRecord">添加</button>
      </div>
    </van-dialog>

    <!-- 前10大重仓股弹窗 -->
    <van-popup
      v-model:show="topHoldingsModal.open"
      position="center"
      round
      :style="{ width: '88%', maxWidth: '420px', background: 'var(--bg-secondary)' }"
    >
      <div class="pa-top-holdings">
        <div class="pa-th-header">
          <span>📈 前10重仓股票</span>
        </div>
        <div class="pa-th-fund-info">
          <span class="pa-th-fund-name">{{ topHoldingsModal.fund?.name }}</span>
          <span class="pa-th-fund-code">#{{ topHoldingsModal.fund?.code }}</span>
        </div>
        <div class="pa-th-grid" v-if="!topHoldingsModal.loading">
          <div
            v-for="(stock, idx) in topHoldingsModal.stocks"
            :key="stock.code || idx"
            class="pa-th-card"
          >
            <span class="pa-thc-name">{{ stock.name }}</span>
            <div class="pa-thc-bottom">
              <span
                v-if="stock.change !== null"
                class="pa-thc-change"
                :class="stock.change > 0 ? 'up' : stock.change < 0 ? 'down' : ''"
              >{{ stock.change > 0 ? '+' : '' }}{{ stock.change.toFixed(2) }}%</span>
              <span v-else class="pa-thc-change">--</span>
              <span class="pa-thc-weight">{{ stock.weight }}</span>
            </div>
          </div>
          <div v-if="topHoldingsModal.stocks.length === 0" class="pa-th-empty">
            暂无重仓股数据
          </div>
        </div>
        <div class="pa-th-loading" v-else>
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <button class="pa-th-close" @click="topHoldingsModal.open = false">关闭</button>
      </div>
    </van-popup>
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
.account-profit.up,
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
.account-profit.down,
.observe-today.down,
.observe-added.down,
.track-change-item.down,
.track-diff.down,
.ai-stat-value.down,
.signal-score.down,
.trade-return.down,
.fm-added.down,
.fm-today.down {
  color: var(--color-down) !important;
}

.stat-block.closed .stat-value,
.account-pct.closed,
.account-profit.closed {
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

/* 交易中：简化容器，呼吸绿点 */
.update-progress.in-trading {
  padding: 3px 10px;
  background: rgba(76,175,80,0.12);
  color: #4caf50;
  border-radius: 12px;
}
.up-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4caf50;
  box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
  animation: breath-dot 1.8s ease-in-out infinite;
}
@keyframes breath-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.6); opacity: 1; }
  50% { box-shadow: 0 0 0 6px rgba(76, 175, 80, 0); opacity: 0.7; }
}

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

.account-profit {
  font-size: 12px;
  font-weight: 600;
  font-family: 'SF Mono', Consolas, monospace;
  margin-left: 6px;
}

.account-pct {
  font-size: 13px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  min-width: 60px;
  text-align: right;
}

.fund-mini-grid {
  padding: 0;
}

.fund-grid-scroll {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 3px;
}
.fund-grid-scroll::-webkit-scrollbar { width: 4px; }
.fund-grid-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
}
.fund-grid-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

/* 各账户区块分配不同空间 */
.block-ali .fund-grid-scroll { max-height: 220px; }
.block-tx .fund-grid-scroll  { max-height: 300px; }
.block-jd .fund-grid-scroll  { max-height: 130px; }

.fund-mini-card {
  padding: 8px 8px 6px;
  background: var(--bg-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  overflow: hidden;
}

.fund-mini-card:hover {
  border-color: var(--color-primary, #3b82f6);
  transform: translateY(-1px);
  background: var(--bg-secondary);
}

.fund-mini-card:active {
  background: rgba(59, 130, 246, 0.25);
  border-color: var(--color-primary, #3b82f6);
  transform: scale(0.97);
}

.fm-row {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
}

.fm-row-top {
  min-height: 14px;
  padding-right: 62px;
}

.fm-row-bottom {
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.fm-row-bottom-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.fm-row-bottom-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
  transition: color 0.3s;
}

/* 交易时间内：已更新=橙色，未更新=绿色 */
.fm-name.fm-updated { color: #ff9800; }
.fm-name.fm-pending { color: #4caf50; }
.fm-name.fm-in-trading { color: rgba(255, 255, 255, 0.55); }

.fm-score {
  font-size: 11px;
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

/* AI 交易信号图标 */
.fm-ai-signal {
  font-size: 10px;
  line-height: 1;
  margin-left: 1px;
  flex-shrink: 0;
  cursor: help;
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.4));
}

.fm-code {
  font-size: 8px;
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
  font-size: 9px;
  font-weight: 500;
  font-family: 'SF Mono', Consolas, monospace;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* 今日涨幅 - 绝对定位右上角徽章 */
.fm-today {
  position: absolute;
  top: 5px;
  right: 5px;
  font-size: 15px;
  font-weight: 800;
  font-family: 'SF Mono', Consolas, monospace;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  line-height: 1;
  z-index: 1;
}
.fm-today-arrow {
  font-size: 10px;
  opacity: 0.85;
}
.fm-today.up {
  background: rgba(255,107,107,0.15);
}
.fm-today.down {
  background: rgba(81,207,102,0.15);
}
.fm-today.no-data {
  color: var(--text-muted);
  background: rgba(158, 158, 158, 0.15);
}

/* 刷新时闪动 */
.fm-today.flash {
  animation: fm-flash 0.8s ease-out;
}
@keyframes fm-flash {
  0% { transform: scale(1); }
  30% { transform: scale(1.15); filter: brightness(1.5); }
  100% { transform: scale(1); filter: brightness(1); }
}

.fm-market {
  font-size: 8px;
  color: var(--text-secondary);
  font-family: 'SF Mono', Consolas, monospace;
}

.fm-added {
  font-size: 10px;
  font-weight: 700;
  font-family: 'SF Mono', Consolas, monospace;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}
.fm-added.up { background: rgba(255,107,107,0.15); color: var(--color-up); }
.fm-added.down { background: rgba(81,207,102,0.15); color: var(--color-down); }

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
.track-funds .track-fund-name:last-of-type { flex: 1; }

.track-funds .track-diff {
  flex-shrink: 0;
}

.track-arrow { color: var(--text-muted); font-size: 11px; }

.track-today-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  margin: 0 3px;
  line-height: 1.2;
}
.track-today-tag.up { background: rgba(245, 34, 45, 0.2); color: #ff7875; }
.track-today-tag.down { background: rgba(82, 196, 26, 0.2); color: #73d13d; }

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

/* ============ 长按快捷操作条 ============ */
.fund-action-bar {
  position: fixed;
  z-index: 9999;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #1e2a3a;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  backdrop-filter: blur(8px);
  animation: ab-slide-up 0.15s ease-out;
}

@keyframes ab-slide-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.action-bar-btn {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: none;
  background: rgba(255,255,255,0.08);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 600;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  white-space: nowrap;
  padding: 0 8px;
}
.action-bar-btn:hover { background: rgba(255,255,255,0.18); }
.action-bar-btn:active { transform: scale(0.95); }
.action-bar-btn.delete { background: rgba(239,68,68,0.25); color: #fca5a5; }
.action-bar-btn.delete:hover { background: rgba(239,68,68,0.4); }

.action-bar-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
}

/* ============ 弹窗深色主题 ============ */
:deep(.van-dialog) {
  background: #1e2a3a !important;
  color: #e2e8f0;
  border-radius: 12px !important;
  max-width: 420px;
}
:deep(.van-dialog__header) { display: none; }
:deep(.van-dialog__content) { background: #1e2a3a !important; }
:deep(.van-dialog__message) { color: #cbd5e1 !important; }
:deep(.van-dialog__footer) { display: none; }

/* 基金名称可点击 */
.fm-name { cursor: pointer; }
.fm-name:hover { opacity: 0.8; }
.observe-name { cursor: pointer; }
.observe-name:hover { opacity: 0.8; }

/* ========== 前10大重仓股弹窗（深色主题） ========== */
.pa-top-holdings { padding: 20px; }

.pa-th-header {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 12px;
}

.pa-th-fund-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.pa-th-fund-name {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.pa-th-fund-code {
  font-size: 12px;
  color: #94a3b8;
}

.pa-th-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  max-height: 50vh;
  overflow-y: auto;
}

.pa-th-card {
  background: rgba(255,255,255,0.05);
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(255,255,255,0.08);
}

.pa-thc-name {
  font-size: 12px;
  font-weight: 500;
  color: #e2e8f0;
  display: block;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-thc-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pa-thc-change {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  color: #94a3b8;
}

.pa-thc-change.up {
  color: #ef4444;
  background: rgba(239,68,68,0.12);
}

.pa-thc-change.down {
  color: #22c55e;
  background: rgba(34,197,94,0.12);
}

.pa-thc-weight {
  font-size: 11px;
  color: #94a3b8;
}

.pa-th-empty {
  text-align: center;
  padding: 30px 0;
  color: #64748b;
  font-size: 14px;
}

.pa-th-loading {
  display: flex;
  justify-content: center;
  padding: 30px 0;
}

.pa-th-close {
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
}

.pa-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  color: #f1f5f9;
}
.pa-dialog-close { cursor: pointer; font-size: 16px; color: #94a3b8; }
.pa-dialog-close:hover { color: #e2e8f0; }

.pa-dialog-body { padding: 16px; }
.pa-fund-info {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
}

.pa-type-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.pa-type-btn {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  background: rgba(255,255,255,0.05);
  color: #94a3b8;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.pa-type-btn.active.buy {
  background: rgba(81,207,102,0.15);
  color: #51cf66;
  border-color: rgba(81,207,102,0.3);
}
.pa-type-btn.active.sell {
  background: rgba(255,107,107,0.15);
  color: #ff6b6b;
  border-color: rgba(255,107,107,0.3);
}

.pa-field {
  margin-bottom: 12px;
}
.pa-field label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.pa-field input[type="number"],
.pa-field input[type="date"] {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.pa-field input:focus { border-color: #3b82f6; }

.pa-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}
.pa-tag.estimate { background: rgba(81,207,102,0.2); color: #73d13d; }
.pa-tag.nav { background: rgba(137,180,250,0.2); color: #89b4fa; }

.pa-info {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 10px;
  background: rgba(59,130,246,0.1);
  border-radius: 6px;
  margin-bottom: 4px;
}
.pa-hint {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.pa-fund-name-preview {
  font-size: 12px;
  color: #51cf66;
  margin-top: 4px;
  padding-left: 2px;
}

.pa-radio-group { display: flex; flex-wrap: wrap; gap: 8px; }
.pa-radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #cbd5e1;
  cursor: pointer;
  padding: 4px 10px;
  background: rgba(255,255,255,0.05);
  border-radius: 5px;
}
.pa-radio input[type="radio"] { accent-color: #3b82f6; }

.pa-switch-field {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pa-switch { accent-color: #3b82f6; width: 18px; height: 18px; }

.pa-dialog-footer {
  display: flex;
  gap: 10px;
  padding: 0 16px 16px;
}
.pa-btn {
  flex: 1;
  height: 36px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.pa-btn.cancel {
  background: rgba(255,255,255,0.08);
  color: #cbd5e1;
}
.pa-btn.cancel:hover { background: rgba(255,255,255,0.15); }
.pa-btn.confirm {
  background: #3b82f6;
  color: #fff;
}
.pa-btn.confirm:hover { background: #2563eb; }
</style>
