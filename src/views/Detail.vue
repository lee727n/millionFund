<script setup lang="ts">
// [WHY] 基金详情页 - 专业基金APP风格
// [WHAT] 蓝色顶部、持仓数据、分时图、关联板块、底部操作栏
// [REF] 参考蚂蚁基金/天天基金的专业设计

import { ref, onMounted, onUnmounted, computed, watch, onActivated, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useHoldingStore } from '@/stores/holding'
import { 
  fetchFundEstimateFast, fetchLatestNetValue,
  fetchFundAccurateData,
} from '@/api/fundFast'
import { 
  type PeriodReturnExt
} from '@/api/tiantianApi'
import type { FundEstimate } from '@/types/fund'
import { showToast, showConfirmDialog, showLoadingToast, closeToast } from 'vant'
import ProChart from '@/components/OKXChart.vue'
import { 
  predictTrend, calculateReturnAnalysis, calculateFundScore,
  type TrendPrediction, type ReturnAnalysis, type FundScore
} from '@/utils/statistics'
import { getFundNetValue, getTradesByCode, updateTradesByCode, removeTrade, addTrade, getTrades, saveTrades } from '@/utils/storage'
import { fetchNetValueHistoryFast, fetchSimpleKLineData } from '@/api/fundFast'
import type { TradeRecord, TradeType } from '@/types/fund'

const route = useRoute()
const router = useRouter()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()

// [WHAT] 基金代码
const fundCode = computed(() => route.params.code as string)

// [WHAT] 交易记录
const trades = ref<TradeRecord[]>([])

// [WHAT] 带涨跌幅的交易记录（按日期排序）
// [FIX] 简单逻辑：
// 1. 最新值：今天净值更新了用净值，没更新用估值
// 2. 交易成本：trade.netValue（已经保存了交易时的估值或净值）
// 3. 涨跌幅 = (最新值 - 交易成本) / 交易成本
const tradesWithReturn = computed(() => {
  const currentNav = parseFloat(fundInfo.value?.dwjz || '0')
  const currentEstimate = parseFloat(fundInfo.value?.gsz || '0')
  const dataSource = fundInfo.value?.dataSource
  
  // 选择最新值：今天净值更新了用净值，没更新用估值
  let currentValue = 0
  if (dataSource === 'nav' && currentNav > 0) {
    currentValue = currentNav
  } else if (currentEstimate > 0) {
    currentValue = currentEstimate
  } else {
    currentValue = currentNav
  }
  
  return [...trades.value]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(trade => {
      let postReturn = 0
      
      if (currentValue > 0 && trade.netValue > 0) {
        postReturn = ((currentValue - trade.netValue) / trade.netValue) * 100
      }
      
      return { ...trade, postReturn }
    })
})

async function loadTrades() {
  if (!fundCode.value) return
  
  // 第一步：立即显示本地存储的交易记录
  trades.value = getTradesByCode(fundCode.value)
  
  const today = new Date().toLocaleDateString('en-CA')
  const allTrades = trades.value
  const estimatedTrades = allTrades.filter(t => t.estimated)
  const todayTradesNotEstimated = allTrades.filter(t => t.date === today && !t.estimated)
  console.log('[Detail.loadTrades] 交易记录:', allTrades.length, '估值交易:', estimatedTrades.length, '今天待修复:', todayTradesNotEstimated.length)

  // 第二步：异步检查是否需要更新估值状态（不阻塞显示）
  if (estimatedTrades.length > 0 || todayTradesNotEstimated.length > 0) {
    checkAndUpdateTradeCalculations(today)
  }
}

// [FIX] 异步检查并更新交易记录的计算数据
async function checkAndUpdateTradeCalculations(today: string) {
  try {
    const data = await fetchFundAccurateData(fundCode.value, false, true)
    console.log('[Detail.loadTrades] 获取到的数据:', {
      nav: data.nav,
      navDate: data.navDate,
      estimate: data.estimate,
      dataSource: data.dataSource,
      today
    })
    
    // [FIX] 关键逻辑：
    // 1. data.nav 是最新的净值（可能是昨天或更早的）
    // 2. data.navDate 是这个净值的日期
    // 3. 如果有估值交易的日期 <= data.navDate，说明这些交易应该用净值而不是估值
    if (data.nav > 0 && data.navDate) {
      const allTrades = getTrades()
      let needUpdate = false
      
      allTrades.forEach(t => {
        if (t.code === fundCode.value && t.estimated && t.date <= data.navDate) {
          console.log('[Detail.loadTrades] 发现需要更新的交易:', {
            id: t.id,
            tradeDate: t.date,
            navDate: data.navDate,
            oldNetValue: t.netValue,
            newNetValue: data.nav
          })
          needUpdate = true
        }
      })
      
      if (needUpdate) {
        updateTradesByCode(fundCode.value, data.nav, data.navDate)
      }
    }
    
    // 如果今天净值还没更新，恢复今天添加的记录为 estimated: true
    if (data.dataSource !== 'nav') {
      const allTrades = getTrades()
      let needSave = false
      allTrades.forEach(t => {
        if (t.code === fundCode.value && t.date === today && !t.estimated) {
          console.log('[Detail.loadTrades] 修复交易记录:', t.id, '恢复为 estimated: true')
          t.estimated = true
          needSave = true
        }
      })
      if (needSave) {
        saveTrades(allTrades)
      }
    }
    
    // 刷新交易记录显示
    trades.value = getTradesByCode(fundCode.value)
  } catch (e) {
    console.error('检查交易估值更新失败:', e)
  }
}
watch(fundCode, () => {
  loadTrades()
}, { immediate: true })

// [WHAT] 删除交易记录（同时回滚持仓）
function handleDeleteTrade(tradeId: string) {
  const trade = trades.value.find(t => t.id === tradeId)
  if (!trade) return

  showConfirmDialog({
    title: '确认删除',
    message: `删除此${trade.type === 'buy' ? '加仓' : '减仓'}记录将同时回滚持仓变化，确认吗？`,
  })
    .then(() => {
      // 回滚持仓
      const holding = holdingStore.holdings.find(h => h.code === trade.code)
      if (holding) {
        if (trade.type === 'buy') {
          // 加仓回滚 = 减份额
          holding.shares = (holding.shares || 0) - trade.shares
        } else if (trade.type === 'sell') {
          // 减仓回滚 = 加份额
          holding.shares = (holding.shares || 0) + trade.shares
        }
        holdingStore.addOrUpdateHolding(holding)
      }

      removeTrade(tradeId)
      loadTrades()
      showToast('已删除')
    })
    .catch(() => {})
}

// [WHAT] 交易弹窗
const showTradeDialog = ref(false)
const tradeFormData = ref({
  type: 'buy' as TradeType,
  amount: '',
  netValue: '',
  date: '',
  isEstimate: false
})
const tradeNetValueHistory = ref<{ time: string; value: number }[]>([])
let tradeHistoryFund = ''
let tradeRealTimeValue = 0
let tradeRealTimeIsEstimate = true

async function openTradeDialog() {
  if (!fundCode.value) return

  // 先弹窗（用现有数据快速填充）
  tradeFormData.value = {
    type: 'buy',
    amount: '',
    netValue: fundInfo.value?.gsz || fundInfo.value?.dwjz || '',
    date: new Date().toLocaleDateString('en-CA'), // 本地时间 YYYY-MM-DD
    isEstimate: true
  }
  showTradeDialog.value = true

  // 等待弹窗DOM渲染
  await nextTick()

  // 并行加载：净值历史 + 最新估值
  const tasks: Promise<void>[] = []

  if (tradeHistoryFund !== fundCode.value) {
    tasks.push(
      fetchSimpleKLineData(fundCode.value, 400).then(data => {
        tradeNetValueHistory.value = data.map(d => ({ time: d.time, value: d.value }))
        tradeHistoryFund = fundCode.value!
        lookupNetValue(tradeFormData.value.date)
      }).catch(() => {})
    )
  } else {
    lookupNetValue(tradeFormData.value.date)
  }

  tasks.push(
    // [FIX] 使用 forceRefresh 强制获取最新数据
    fetchFundAccurateData(fundCode.value, false, true).then(data => {
      const today = new Date().toLocaleDateString('en-CA') // 本地时间 YYYY-MM-DD
      const estimateVal = data.estimate || 0
      const navVal = data.nav || 0
      const navDate = data.navDate || ''
      
      // [FIX] 使用 dataSource 判断，不要再加多余条件
      // dataSource === 'nav' 表示净值已更新，应该用净值
      // dataSource === 'estimate' 表示应该用估值（即使 estimateVal 为0，因为非交易时间）
      const shouldUseNav = data.dataSource === 'nav' && navVal > 0
      const shouldUseEstimate = data.dataSource === 'estimate'
      
      // [DEBUG] 打印交易弹窗数据
      console.log('[openTradeDialog] 实时数据:', {
        estimateVal,
        navVal,
        navDate,
        dataSource: data.dataSource,
        currentValue: data.currentValue,
        today,
        shouldUseNav,
        shouldUseEstimate
      })
      
      if (shouldUseNav) {
        tradeRealTimeValue = navVal
        tradeRealTimeIsEstimate = false
      } else if (shouldUseEstimate) {
        // [FIX] 即使 estimateVal 为0，也使用 data.currentValue（可能是上一个净值）
        tradeRealTimeValue = estimateVal > 0 ? estimateVal : data.currentValue
        tradeRealTimeIsEstimate = true  // 关键：标记为估值
      } else {
        // Fallback: 如果 dataSource 逻辑有问题，使用日期比较
        const isNavUpdated = navDate === today
        if (isNavUpdated && navVal > 0) {
          tradeRealTimeValue = navVal
          tradeRealTimeIsEstimate = false
        } else {
          tradeRealTimeValue = estimateVal > 0 ? estimateVal : navVal
          tradeRealTimeIsEstimate = true  // 关键：标记为估值
        }
      }
      
      // [DEBUG] 打印最终结果
      console.log('[openTradeDialog] 最终选择:', {
        tradeRealTimeValue,
        tradeRealTimeIsEstimate,
        shouldUseNav,
        shouldUseEstimate
      })
      
      if (tradeHistoryFund !== fundCode.value) {
        tradeFormData.value.netValue = tradeRealTimeValue.toFixed(4)
        tradeFormData.value.isEstimate = tradeRealTimeIsEstimate
      }
      if (tradeFormData.value.date >= today) {
        tradeFormData.value.netValue = tradeRealTimeValue.toFixed(4)
        tradeFormData.value.isEstimate = tradeRealTimeIsEstimate
      }
    }).catch(() => {})
  )

  await Promise.all(tasks)
}

// [WHAT] 根据日期查找净值；今天/未来用实时数据，过去用历史
function lookupNetValue(date: string) {
  if (!date) return
  const today = new Date().toLocaleDateString('en-CA') // 本地时间 YYYY-MM-DD

  // 今天或未来日期 → 使用实时数据（可能是估值或净值）
  if (date >= today) {
    if (tradeRealTimeValue > 0) {
      tradeFormData.value.netValue = tradeRealTimeValue.toFixed(4)
      tradeFormData.value.isEstimate = tradeRealTimeIsEstimate
    }
    return
  }

  // 过去日期 → 查历史
  if (tradeNetValueHistory.value.length === 0) return
  const record = tradeNetValueHistory.value.find(d => d.time === date)
  if (record) {
    tradeFormData.value.netValue = record.value.toFixed(4)
    tradeFormData.value.isEstimate = false
  } else {
    const nearby = findNearestNetValue(date)
    if (nearby) {
      tradeFormData.value.netValue = nearby.value.toFixed(4)
      tradeFormData.value.isEstimate = true
    }
  }
}

// [WHAT] 查找最近的交易日净值
function findNearestNetValue(date: string) {
  const history = tradeNetValueHistory.value
  if (history.length === 0) return null
  // 找<=date的最近记录
  const dateTs = new Date(date).getTime()
  let nearest = history[0]
  let minDiff = Math.abs(dateTs - new Date(history[0].time).getTime())
  for (const item of history) {
    const diff = Math.abs(dateTs - new Date(item.time).getTime())
    if (diff < minDiff) {
      minDiff = diff
      nearest = item
    }
  }
  return nearest
}

// [WHAT] 交易日期变化时自动查找历史净值
function onTradeDateChange(newDate: string) {
  if (newDate && tradeNetValueHistory.value.length > 0) {
    lookupNetValue(newDate)
  }
  const today = new Date().toLocaleDateString('en-CA') // 本地时间
  if (newDate >= today && tradeRealTimeValue > 0) {
    tradeFormData.value.netValue = tradeRealTimeValue.toFixed(4)
    tradeFormData.value.isEstimate = tradeRealTimeIsEstimate
  }
}

watch(() => tradeFormData.value.date, (newDate) => {
  if (showTradeDialog.value && newDate && tradeNetValueHistory.value.length > 0) {
    lookupNetValue(newDate)
  }
})

async function submitTrade() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast('暂未持有该基金')
    return
  }

  const amount = parseFloat(tradeFormData.value.amount)
  const netValue = parseFloat(tradeFormData.value.netValue)
  const date = tradeFormData.value.date || new Date().toLocaleDateString('en-CA') // 本地时间
  const type = tradeFormData.value.type
  const isEstimate = tradeFormData.value.isEstimate
  
  // [DEBUG] 打印提交交易时的状态
  console.log('[submitTrade] 提交交易:', {
    type,
    date,
    netValue,
    isEstimate,
    tradeFormData: tradeFormData.value
  })

  if (!amount || amount <= 0) {
    showToast('请输入有效的交易金额')
    return
  }
  if (!netValue || netValue <= 0) {
    showToast('请输入有效的净值')
    return
  }

  const shares = amount / netValue

  const loadingToast = showLoadingToast('提交中...')
  try {
    addTrade({
      id: '',
      code: holding.code,
      name: holding.name,
      type,
      date,
      amount,
      netValue,
      shares,
      fee: 0,
      estimated: isEstimate,
      // [FIX] 保存交易时的估值快照，用于后续涨跌幅计算
      estimateAtTrade: isEstimate ? netValue : undefined,
      source: holding.source,
      createdAt: Date.now()
    })

    const currentHolding = holdingStore.holdings.find(h => h.code === holding.code)
    if (currentHolding) {
      if (type === 'buy') {
        currentHolding.shares = (currentHolding.shares || 0) + shares
      } else {
        const currentShares = currentHolding.shares || 0
        if (shares > currentShares) {
          closeToast()
          showToast(`减仓份额超过持仓(${currentShares.toFixed(2)}份)`)
          return
        }
        currentHolding.shares = currentShares - shares
      }
      currentHolding.currentValue = netValue
      holdingStore.addOrUpdateHolding(currentHolding)
    }

    closeToast()
    showTradeDialog.value = false
    loadTrades()
    showToast({
      message: `${type === 'buy' ? '加仓' : '减仓'}成功`,
      duration: 2000
    })
  } catch (error) {
    console.error('交易提交失败:', error)
    closeToast()
    showToast('交易提交失败')
  }
}

// 数据状态
const fundInfo = ref<(FundEstimate & { dataSource?: string; navDate?: string }) | null>(null)
const isLoading = ref(true)

// [WHAT] 趋势预测
const trendPrediction = ref<TrendPrediction | null>(null)
const fundScore = ref<FundScore | null>(null)
const returnAnalysis = ref<ReturnAnalysis | null>(null)
const isTrendLoading = ref(false)



// [WHAT] Tab切换
const activeTab = ref<'chart' | 'performance' | 'profit' | 'trend'>('chart')

// [WHAT] 持仓面板展开状态
const holdingExpanded = ref(true)

// ========== 调整成本弹窗 ==========
const showCostDialog = ref(false)
const costFormData = ref({
  code: '',
  name: '',
  amount: '',
  profit: ''
})

// [WHAT] 行业板块弹窗
const showSectorDialog = ref(false)
const sectorFormData = ref({
  sectors: ''
})

// [WHAT] 来源管理弹窗
const showSourceDialog = ref(false)
const sourceFormData = ref({
  source: '',
  isQDII: false
})

// [WHAT] 来源选项配置
const sourceOptions = [
  { text: '支付宝', value: 'ali' },
  { text: '腾讯', value: 'TX' },
  { text: '京东', value: 'JD' },
  { text: '观察', value: 'observe' }
]

// [WHAT] 持仓信息（如果已持有）
const holdingInfo = computed(() => {
  return holdingStore.holdings.find(h => h.code === fundCode.value) || null
})

// [WHAT] 获取来源显示文本
const getSourceLabel = (value: string) => {
  const option = sourceOptions.find(opt => opt.value === value)
  return option ? option.text : value
}

// [WHAT] 持仓详细计算
const holdingDetails = computed(() => {
  const holding = holdingInfo.value
  if (!holding) return null
  
  const currentPrice = parseFloat(fundInfo.value?.gsz || fundInfo.value?.dwjz || '0')
  const shares = holding.shares || 0
  const buyNetValue = holding.buyNetValue || 0
  const amount = holding.marketValue || 0
  
  // 当前市值
  const currentValue = shares * currentPrice
  // 持有收益 = (当前净值 - 成本净值) × 持有份额
  const profit = (currentPrice - buyNetValue) * shares
  // 收益率 = (当前净值 - 成本净值) / 成本净值，与交易记录涨跌幅计算一致
  const profitRate = buyNetValue > 0 && currentPrice > 0
    ? ((currentPrice - buyNetValue) / buyNetValue) * 100
    : 0
  // 持仓占比（相对于总市值）
  const totalValue = holdingStore.summary.totalValue || 1
  const ratio = (currentValue / totalValue) * 100
  // 持有天数
  const buyDate = new Date(holding.buyDate || Date.now())
  const today = new Date()
  const holdDays = Math.floor((today.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24))
  // 当日收益
  const changePercent = parseFloat(fundInfo.value?.gszzl || '0')
  const todayProfit = currentValue * (changePercent / 100)
  // 昨日收益（模拟）
  const yesterdayProfit = profit - todayProfit
  
  return {
    amount: currentValue,
    shares,
    ratio,
    profit,
    profitRate,
    cost: buyNetValue,
    todayProfit,
    yesterdayProfit,
    holdDays
  }
})

onMounted(async () => {
  await loadFundData()
})

onActivated(() => {
  loadTrades()
})

// [WHY] 监听路由参数变化
watch(fundCode, async (newCode, oldCode) => {
  if (newCode && newCode !== oldCode) {
    fundInfo.value = null
    isLoading.value = true
    await loadFundData()
    loadTrades()
  }
})

onUnmounted(() => {
  // 清理工作
})

async function loadFundData() {
  isLoading.value = true
  
  try {
    // [WHAT] 获取QDII标识，从持仓信息或默认false
    const isQDII = holdingInfo.value?.isQDII || false
    // [FIX] 使用 forceRefresh 强制获取最新数据
    const accurateData = await fetchFundAccurateData(fundCode.value, isQDII, true).catch(() => null)
    
    if (accurateData) {
      // 将 FundAccurateData 转换为 FundEstimate 格式
      fundInfo.value = {
        fundcode: accurateData.code,
        name: accurateData.name,
        dwjz: accurateData.nav.toString(),
        gsz: accurateData.currentValue.toString(),
        gszzl: accurateData.dayChange.toString(),
        gztime: accurateData.estimateTime || accurateData.navDate,
        dataSource: accurateData.dataSource,
        navDate: accurateData.navDate
      }
    } else {
      const { searchFund } = await import('@/api/fund')
      const funds = await searchFund(fundCode.value, 1)
      if (funds.length > 0) {
        fundInfo.value = {
          fundcode: fundCode.value,
          name: funds[0]!.name,
          dwjz: '0',
          gsz: '0',
          gszzl: '0',
          gztime: '--'
        }
      } else {
        fundInfo.value = {
          fundcode: fundCode.value,
          name: `基金 ${fundCode.value}`,
          dwjz: '0',
          gsz: '0',
          gszzl: '0',
          gztime: '--'
        }
      }
    }
      
  } catch {
    showToast('加载失败')
  } finally {
    isLoading.value = false
  }
}

// [WHAT] 计算涨跌 - 使用准确的涨跌幅数据
const priceChangePercent = computed(() => {
  return parseFloat(fundInfo.value?.gszzl || '0') || 0
})

const isUp = computed(() => priceChangePercent.value >= 0)

// [WHAT] 加载趋势预测
async function loadTrendPrediction() {
  if (trendPrediction.value || isTrendLoading.value) return
  
  isTrendLoading.value = true
  try {
    const historyResult = await fetchNetValueHistoryFast(fundCode.value, 90)
    const history = historyResult.records || []
    if (history.length > 0) {
      const data = history.map(item => ({
        date: item.date,
        value: item.netValue,
        change: item.changeRate
      }))
      
      trendPrediction.value = predictTrend(data)
      returnAnalysis.value = calculateReturnAnalysis(data)
      if (returnAnalysis.value) {
        fundScore.value = calculateFundScore(returnAnalysis.value)
      }
    }
  } catch {
    // 静默失败
  } finally {
    isTrendLoading.value = false
  }
}

// [WHAT] 页面加载时自动加载趋势预测
onMounted(() => {
  loadTrendPrediction()
})

function goBack() {
  router.back()
}

// [WHAT] 切换到上一只/下一只基金
function goPrevFund() {
  const watchlist = fundStore.watchlist
  const idx = watchlist.findIndex(f => f.code === fundCode.value)
  if (idx > 0) {
    router.replace(`/detail/${watchlist[idx - 1]!.code}`)
  } else {
    showToast('已是第一只')
  }
}

function goNextFund() {
  const watchlist = fundStore.watchlist
  const idx = watchlist.findIndex(f => f.code === fundCode.value)
  if (idx >= 0 && idx < watchlist.length - 1) {
    router.replace(`/detail/${watchlist[idx + 1]!.code}`)
  } else {
    showToast('已是最后一只')
  }
}

function goToSearch() {
  router.push('/search')
}

// [WHAT] 底部操作 - 修改持仓（直接弹窗）
function editHolding() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast('暂未持有该基金')
    return
  }
  
  // [WHAT] 填充当前持仓数据（优先使用保存的市值和收益）
  costFormData.value = {
    code: holding.code,
    name: holding.name,
    amount: (holding.marketValue || holding.shares * holding.currentValue || 0).toString(),
    profit: (holding.profit !== undefined ? holding.profit : (holding.currentValue && holding.buyNetValue ? (holding.currentValue - holding.buyNetValue) * holding.shares : 0)).toString()
  }
  showCostDialog.value = true
}

// [WHAT] 提交调整成本
async function submitCostAdjust() {
  const marketValue = parseFloat(costFormData.value.amount)
  const profit = parseFloat(costFormData.value.profit)
  
  console.log('[调整成本] 开始处理', { marketValue, profit })
  
  if (!marketValue || marketValue <= 0) {
    showToast('请输入有效的持仓市值')
    return
  }
  if (isNaN(profit)) {
    showToast('请输入有效的持仓收益')
    return
  }
  
  const holding = holdingInfo.value
  if (!holding) {
    console.log('[调整成本] 未找到持仓记录')
    return
  }
  
  console.log('[调整成本] 当前持仓', holding)
  showLoadingToast('正在获取最新净值...')
  
  try {
    // 从网络获取最新净值
    console.log('[调整成本] 开始获取最新净值，基金代码:', holding.code)
    const latestNetValue = await fetchLatestNetValue(holding.code)
    console.log('[调整成本] 获取到的最新净值:', latestNetValue ? `净值: ${latestNetValue.netValue}, 日期: ${latestNetValue.date}, 涨跌幅: ${latestNetValue.changeRate}%` : 'null')
    
    if (!latestNetValue || latestNetValue.netValue <= 0) {
      console.log('[调整成本] 获取净值失败', latestNetValue)
      showToast('获取最新净值失败，请稍后重试')
      return
    }
    
    const currentNetValue = latestNetValue.netValue
    
    // 计算份额
    const newShares = marketValue / currentNetValue
    
    // 根据持仓市值和持仓收益反推成本净值
    // 成本市值 = 持仓市值 - 持仓收益
    // 成本净值 = 成本市值 / 份额 = (持仓市值 - 持仓收益) / (持仓市值 / 当前净值) = 当前净值 - 持仓收益 / 份额
    const costMarketValue = marketValue - profit
    const costNetValue = newShares > 0 ? costMarketValue / newShares : currentNetValue
    
    // 累计涨幅 = (当前净值 - 成本净值) / 成本净值 * 100%
    const addedGain = ((currentNetValue - costNetValue) / costNetValue) * 100

    console.log('[调整成本] 计算结果:', {
      用户输入市值: marketValue,
      用户输入收益: profit,
      当前净值: currentNetValue,
      计算份额: newShares.toFixed(2),
      成本市值: costMarketValue.toFixed(2),
      成本净值: costNetValue.toFixed(4),
      累计涨幅: addedGain.toFixed(2) + '%'
    })
    
    const record = {
      code: holding.code,
      name: holding.name,
      buyNetValue: costNetValue,
      shares: newShares,
      buyDate: holding.buyDate,
      holdingDays: holding.holdingDays,
      industrySectors: holding.industrySectors,
      source: holding.source,
      isQDII: holding.isQDII,
      createdAt: holding.createdAt,
      currentValue: currentNetValue,
      addedGain: addedGain,
      marketValue: marketValue,
      profit: profit
    }
    
    console.log('[调整成本] 更新持仓记录', {
      code: record.code,
      name: record.name,
      buyNetValue: record.buyNetValue,
      shares: record.shares,
      currentValue: record.currentValue,
      addedGain: record.addedGain.toFixed(2) + '%'
    })
    holdingStore.addOrUpdateHolding(record)
    showToast('成本调整成功')
    router.back()
  } catch (error) {
    console.error('[调整成本] 成本调整失败:', error)
    showToast('成本调整失败')
  } finally {
    closeToast()
    showCostDialog.value = false
  }
}

// [WHAT] 删除持仓
async function handleDelete() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast('暂未持有该基金')
    return
  }
  
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: '确定要删除该持仓记录吗？'
    })
    await holdingStore.removeHolding(fundCode.value)
    showToast('已删除')
    router.back()
  } catch {
    // 用户取消
  }
}

function setReminder() {
  router.push('/alerts')
}

function showTransactions() {
  router.push(`/trades/${fundCode.value}`)
}

async function removeFromWatchlist() {
  if (!fundStore.isFundInWatchlist(fundCode.value)) {
    showToast('不在自选中')
    return
  }
  
  try {
    await showConfirmDialog({
      title: '删除自选',
      message: `确定将 ${fundInfo.value?.name || '该基金'} 从自选中删除？`
    })
    await fundStore.removeFund(fundCode.value)
    showToast('已删除')
  } catch {
    // 取消
  }
}

async function addToWatchlist() {
  if (fundStore.isFundInWatchlist(fundCode.value)) {
    showToast('已在自选中')
    return
  }
  await fundStore.addFund(fundCode.value, fundInfo.value?.name || '')
  showToast('添加成功')
}

function showMore() {
  showToast('更多功能开发中')
}

// [WHAT] 打开行业板块管理弹窗
function manageSectors() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast('暂未持有该基金')
    return
  }
  
  // 填充当前行业板块数据
  sectorFormData.value.sectors = holding.industrySectors || ''
  showSectorDialog.value = true
}

async function submitSectorAdjust() {
  const sectors = sectorFormData.value.sectors.trim() || undefined
  
  const holding = holdingInfo.value
  if (!holding) return
  
  const record = {
    ...holding,
    industrySectors: sectors
  }
  
  await holdingStore.addOrUpdateHolding(record)
  showToast('行业板块更新成功')
  showSectorDialog.value = false
}

// [WHAT] 打开来源管理弹窗
function manageSource() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast('暂未持有该基金')
    return
  }
  
  // 填充当前来源数据
  sourceFormData.value.source = holding.source || ''
  sourceFormData.value.isQDII = holding.isQDII || false
  showSourceDialog.value = true
}

// [WHAT] 提交来源修改
async function submitSourceAdjust() {
  const source = sourceFormData.value.source.trim()
  const isQDII = sourceFormData.value.isQDII
  
  const holding = holdingInfo.value
  if (!holding) return
  
  // 更新持仓记录
  const record = {
    ...holding,
    source: source,
    isQDII: isQDII
  }
  
  await holdingStore.addOrUpdateHolding(record)
  showToast('来源更新成功')
  showSourceDialog.value = false
}

// [WHAT] 跳转同类基金
function goToSimilarFund(code: string) {
  if (code === fundCode.value) {
    showToast('已在当前基金')
    return
  }
  router.push(`/detail/${code}`)
}

// [WHAT] 搜索同类基金
function searchSimilarFunds() {
  // 已移除，不再使用
}

// [WHAT] 打开公告链接
function openAnnouncement(url: string) {
  if (url) {
    window.open(url, '_blank')
  } else {
    showToast('暂无详情链接')
  }
}

// [WHAT] 格式化数字
function formatNum(num: number, decimals = 2): string {
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toFixed(decimals)
}

function formatMoney(num: number): string {
  const prefix = num >= 0 ? '' : '-'
  const absNum = Math.abs(num)
  if (absNum >= 10000) {
    return prefix + (absNum / 10000).toFixed(2) + '万'
  }
  return prefix + absNum.toFixed(2)
}

function formatPercent(num: number): string {
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}${num.toFixed(2)}%`
}
</script>

<template>
  <div class="detail-page">
    <!-- 顶部区域 -->
    <div class="top-header">
      <!-- 导航栏 -->
      <div class="nav-bar">
        <van-icon name="arrow-left" size="22" color="var(--text-primary)" @click="goBack" />
        <div class="nav-title">
          <div class="fund-name">{{ fundInfo?.name || '加载中...' }}</div>
          <div class="fund-info-row">
            <span class="fund-code">{{ fundInfo?.navDate || '--' }}</span>
            <span class="info-divider">|</span>
            <span class="estimate-tag" :class="isUp ? 'up' : 'down'">
              {{ fundInfo?.dataSource === 'nav' ? '净值' : '估值' }}涨幅 {{ formatPercent(priceChangePercent) }}
            </span>
            <span class="info-divider">|</span>
            <span class="estimate-tag">
              {{ fundInfo?.dataSource === 'nav' ? '净值' : '估值' }} {{ fundInfo?.gsz ? parseFloat(fundInfo.gsz).toFixed(4) : '--' }}
            </span>
          </div>
          <div v-if="holdingDetails" class="fund-info-row holding-info-row">
            <span class="fund-code">市值 {{ formatMoney(holdingDetails.amount) }}</span>
            <span class="info-divider">|</span>
            <span class="estimate-tag">收益 {{ formatMoney(holdingDetails.profit) }}</span>
            <span class="info-divider">|</span>
            <span class="estimate-tag" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
              收益率 {{ holdingDetails.profitRate >= 0 ? '+' : '' }}{{ holdingDetails.profitRate.toFixed(2) }}%
            </span>
          </div>
        </div>
      </div>
      
      <!-- 核心指标 -->
      <!-- <div class="core-metrics" v-if="!isLoading">
        <div class="main-change">
          <div class="change-label">当日涨幅 {{ fundInfo?.gztime?.slice(5, 10) || '--' }}</div>
          <div class="change-value" :class="isUp ? 'up' : 'down'">
            {{ formatPercent(priceChangePercent) }}
          </div>
        </div>
        <div class="sub-metrics">
          <div class="metric-item">
            <div class="metric-label">估算净值</div>
            <div class="metric-value">{{ fundInfo?.gsz || '--' }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">昨日净值</div>
            <div class="metric-value">{{ fundInfo?.dwjz || '--' }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">{{ bestPeriodReturn.label }}</div>
            <div class="metric-value" :class="bestPeriodReturn.value >= 0 ? 'up' : 'down'">
              {{ bestPeriodReturn.value !== 0 ? formatPercent(bestPeriodReturn.value) : '--' }}
            </div>
          </div>
        </div>
      </div> -->
      <!-- <div v-else class="core-metrics loading">
        <van-loading color="var(--text-secondary)" />
      </div> -->
    </div>

    <!-- 持仓数据区（已隐藏） -->
    <!-- <div v-if="holdingDetails" class="holding-panel" :class="{ collapsed: !holdingExpanded }">
      <div class="holding-summary" @click="holdingExpanded = !holdingExpanded">
        <div class="summary-item">
          <span class="summary-label">持有金额</span>
          <span class="summary-value">{{ formatNum(holdingDetails.amount) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">持有收益</span>
          <span class="summary-value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
            {{ formatNum(holdingDetails.profit) }}
          </span>
        </div>
        <div class="summary-item">
          <span class="summary-label">收益率</span>
          <span class="summary-value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
            {{ formatPercent(holdingDetails.profitRate) }}
          </span>
        </div>
        <van-icon 
          :name="holdingExpanded ? 'arrow-up' : 'arrow-down'" 
          class="expand-icon"
        />
      </div>
      
      <transition name="slide">
        <div v-show="holdingExpanded" class="holding-grid">
          <div class="holding-item">
            <div class="item-label">持有金额</div>
            <div class="item-value">{{ formatNum(holdingDetails.amount) }}</div>
          </div>
          <div class="holding-item">
            <div class="item-label">持有份额</div>
            <div class="item-value">{{ formatNum(holdingDetails.shares) }}</div>
          </div>
          <div class="holding-item">
            <div class="item-label">持仓占比</div>
            <div class="item-value">{{ holdingDetails.ratio.toFixed(2) }}%</div>
          </div>
          <div class="holding-item">
            <div class="item-label">持有收益</div>
            <div class="item-value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.profit) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">持有收益率</div>
            <div class="item-value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
              {{ formatPercent(holdingDetails.profitRate) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">持仓成本</div>
            <div class="item-value">{{ holdingDetails.cost.toFixed(4) }}</div>
          </div>
          <div class="holding-item">
            <div class="item-label">当日收益</div>
            <div class="item-value" :class="holdingDetails.todayProfit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.todayProfit) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">昨日收益</div>
            <div class="item-value" :class="holdingDetails.yesterdayProfit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.yesterdayProfit) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">持有天数</div>
            <div class="item-value">{{ holdingDetails.holdDays }}</div>
          </div>
        </div>
      </transition>
    </div> -->

    <!-- 图表区域 -->
    <div class="chart-section">
      <ProChart
        :fund-code="fundCode"
        :realtime-value="fundInfo?.gsz ? parseFloat(fundInfo.gsz) : 0"
        :realtime-change="priceChangePercent"
        :last-close="fundInfo?.dwjz ? parseFloat(fundInfo.dwjz) : 0"
        :trades="trades"
        :cost-nav-value="holdingInfo?.buyNetValue || 0"
      />
    </div>

    <!-- 交易记录 -->
    <div v-if="tradesWithReturn.length > 0" class="trade-records-section">
      <div class="trade-records-header">
        <span class="trade-records-title">交易记录</span>
        <span class="trade-records-count">{{ tradesWithReturn.length }}条</span>
      </div>
      <div class="trade-records-scroll">
        <div
          v-for="trade in tradesWithReturn"
          :key="trade.id"
          class="trade-record-item"
          :class="trade.type"
        >
          <div class="trade-record-main">
            <span class="trade-type-badge" :class="trade.type">
              {{ trade.type === 'buy' ? '加仓' : '减仓' }}
            </span>
            <span class="trade-date">{{ trade.date }}</span>
            <span class="trade-amount">{{ trade.amount.toFixed(0) }}元</span>
            <span class="trade-nav" :class="{ 'is-estimate': trade.estimated }">
              {{ trade.netValue.toFixed(4) }}
              <span class="nav-tag">{{ trade.estimated ? '估' : '净' }}</span>
            </span>
            <span class="trade-return" :class="trade.postReturn >= 0 ? 'up' : 'down'">
              {{ trade.postReturn >= 0 ? '+' : '' }}{{ trade.postReturn.toFixed(2) }}%
            </span>
          </div>
          <button class="trade-delete-btn" @click.stop="handleDeleteTrade(trade.id)">×</button>
        </div>
      </div>
    </div>

    <!-- 业绩走势（Tab2） -->
    <!-- <div class="performance-section" v-show="activeTab === 'performance'">
      <div v-if="periodReturns.length > 0" class="period-grid">
        <div 
          v-for="item in periodReturns.slice(0, 6)" 
          :key="item.period"
          class="period-item"
        >
          <div class="period-label">{{ item.label }}</div>
          <div class="period-return" :class="item.fundReturn >= 0 ? 'up' : 'down'">
            {{ formatPercent(item.fundReturn) }}
          </div>
          <div class="period-rank" v-if="item.rank > 0">
            <span class="rank-num">{{ item.rank }}</span>/{{ item.totalCount }}
          </div>
        </div>
      </div>
      <van-empty v-else description="暂无业绩数据" />
    </div> -->

    <!-- 我的收益（Tab3） -->
    <!-- <div class="profit-section" v-show="activeTab === 'profit'">
      <div v-if="holdingDetails" class="profit-chart">
        <div class="profit-summary">
          <div class="profit-total">
            <span class="label">累计收益</span>
            <span class="value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.profit) }}
            </span>
          </div>
          <div class="profit-rate">
            <span class="label">收益率</span>
            <span class="value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
              {{ formatPercent(holdingDetails.profitRate) }}
            </span>
          </div>
        </div>
      </div>
      <van-empty v-else description="暂未持有该基金" />
    </div> -->

    <!-- 趋势预测 -->
    <div class="trend-section">
      <van-loading v-if="isTrendLoading" size="24" vertical>加载中...</van-loading>
      
      <template v-else-if="trendPrediction">
        <!-- 趋势方向 -->
        <div class="trend-header">
          <div class="trend-direction" :class="trendPrediction.trend">
            <span class="trend-icon">
              {{ trendPrediction.trend === 'up' ? '📈' : trendPrediction.trend === 'down' ? '📉' : '📊' }}
            </span>
            <span class="trend-text">
              {{ trendPrediction.trend === 'up' ? '看涨' : trendPrediction.trend === 'down' ? '看跌' : '震荡' }}
            </span>
          </div>
          <div class="trend-confidence">
            <span class="label">置信度</span>
            <span class="value">{{ trendPrediction.confidence }}%</span>
          </div>
        </div>

        <!-- 技术指标 -->
        <div class="trend-levels">
          <div class="level-item">
            <span class="level-label">支撑位</span>
            <span class="level-value down">{{ trendPrediction.supportLevel }}</span>
          </div>
          <div class="level-item">
            <span class="level-label">阻力位</span>
            <span class="level-value up">{{ trendPrediction.resistanceLevel }}</span>
          </div>
        </div>

        <!-- 信号列表 -->
        <div class="signal-list">
          <div v-for="signal in trendPrediction.signals" :key="signal.name" class="signal-item">
            <span class="signal-type" :class="signal.type">
              {{ signal.type === 'buy' ? '买' : signal.type === 'sell' ? '卖' : '持' }}
            </span>
            <div class="signal-info">
              <span class="signal-name">{{ signal.name }}</span>
              <span class="signal-desc">{{ signal.description }}</span>
            </div>
          </div>
        </div>

        <!-- 基金评分 -->
        <div v-if="fundScore" class="fund-score-card">
          <div class="score-header">
            <span class="score-title">综合评分</span>
            <span class="score-level" :class="'level-' + fundScore.level">{{ fundScore.level }}级</span>
          </div>
          <div class="score-value">{{ fundScore.totalScore }}</div>
          <div class="score-desc">{{ fundScore.recommendation }}</div>
        </div>
      </template>
      
      <van-empty v-else description="暂无趋势数据" />
    </div>

    <!-- 关联板块 -->
    <!-- <div v-if="sectorInfo" class="sector-section" @click="searchSimilarFunds">
      <div class="sector-info">
        <span class="sector-label">关联板块：</span>
        <span class="sector-name">{{ sectorInfo.name }}</span>
        <span class="sector-change" :class="sectorInfo.dayReturn >= 0 ? 'up' : 'down'">
          {{ formatPercent(sectorInfo.dayReturn) }}
        </span>
      </div>
      <div class="sector-link">
        {{ similarFunds.length }}只同类基金
        <van-icon name="arrow" />
      </div>
    </div> -->

    <!-- 自定义行业板块 -->
    <!-- <div v-if="holdingInfo?.industrySectors?.length" class="info-section">
      <div class="section-header">
        <span>自定义行业板块</span>
      </div>
      <div class="sector-tags">
        <span class="sector-tag">
          {{ holdingInfo.industrySectors || '未设置' }}
        </span>
      </div>
    </div> -->

    <!-- 来源信息 -->
    <div v-if="holdingInfo?.source || holdingInfo?.isQDII" class="info-section">
      <div class="section-header">
        <span>基金来源</span>
      </div>
      <div class="source-info">
        <van-icon name="shop-o" size="16" />
        <span>{{ getSourceLabel(holdingInfo.source || '') }}</span>
        <span v-if="holdingInfo.isQDII" class="qdii-badge">QDII</span>
      </div>
    </div>

    <!-- 同类基金 -->
    <!-- <div v-if="similarFunds.length > 0" class="similar-section">
      <div class="section-header">
        <span>同类基金</span>
        <span class="section-tip">年涨幅TOP5</span>
      </div>
      <div class="similar-list">
        <div 
          v-for="fund in similarFunds.slice(0, 5)" 
          :key="fund.code"
          class="similar-item"
          @click="goToSimilarFund(fund.code)"
        >
          <div class="similar-info">
            <div class="similar-name">{{ fund.name }}</div>
            <div class="similar-code">{{ fund.code }}</div>
          </div>
          <div class="similar-return" :class="fund.yearReturn >= 0 ? 'up' : 'down'">
            {{ formatPercent(fund.yearReturn) }}
          </div>
        </div>
      </div>
    </div> -->

    <!-- ========== 基金规模 ========== -->
    <!-- <div v-if="fundScale && fundScale.scale > 0" class="info-section">
      <div class="section-header">
        <span>基金规模</span>
        <span class="section-tip">{{ fundScale.scaleDate }}</span>
      </div>
      <div class="scale-grid">
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.scale.toFixed(2) }}亿</div>
          <div class="scale-label">资产规模</div>
        </div>
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.shareTotal.toFixed(2) }}亿份</div>
          <div class="scale-label">总份额</div>
        </div>
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.institutionRatio.toFixed(1) }}%</div>
          <div class="scale-label">机构持有</div>
        </div>
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.personalRatio.toFixed(1) }}%</div>
          <div class="scale-label">个人持有</div>
        </div>
      </div>
    </div> -->

    <!-- ========== 费率信息 ========== -->
    <!-- <div v-if="fundFees" class="info-section">
      <div class="section-header">
        <span>费率信息</span>
      </div>
      <div class="fee-grid">
        <div class="fee-item">
          <div class="fee-label">管理费</div>
          <div class="fee-value">{{ fundFees.managementFee.toFixed(2) }}%/年</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">托管费</div>
          <div class="fee-value">{{ fundFees.custodianFee.toFixed(2) }}%/年</div>
        </div>
        <div class="fee-item" v-if="fundFees.salesServiceFee > 0">
          <div class="fee-label">销售服务费</div>
          <div class="fee-value">{{ fundFees.salesServiceFee.toFixed(2) }}%/年</div>
        </div>
      </div>
      
     
      <div class="fee-table">
        <div class="table-title">申购费率</div>
        <div class="table-row header">
          <span>金额</span>
          <span>原费率</span>
          <span>优惠费率</span>
        </div>
        <div 
          v-for="(fee, idx) in fundFees.purchaseFees.slice(0, 4)" 
          :key="'p' + idx"
          class="table-row"
        >
          <span>
            {{ fee.minAmount === 0 && fee.maxAmount === Infinity 
              ? '全部金额'
              : fee.maxAmount === Infinity 
                ? `≥${fee.minAmount}万` 
                : fee.minAmount === 0
                  ? `<${fee.maxAmount}万`
                  : `${fee.minAmount}-${fee.maxAmount}万` }}
          </span>
          <span>{{ fee.rate >= 1000 ? `${fee.rate}元` : fee.rate === 0 ? '免费' : `${fee.rate}%` }}</span>
          <span class="discount">{{ fee.discountRate >= 1000 ? `${fee.discountRate}元` : fee.discountRate === 0 ? '免费' : `${fee.discountRate}%` }}</span>
        </div>
      </div>
      
   
      <div class="fee-table">
        <div class="table-title">赎回费率</div>
        <div class="table-row header">
          <span>持有期限</span>
          <span>费率</span>
        </div>
        <div 
          v-for="(fee, idx) in fundFees.redemptionFees" 
          :key="'r' + idx"
          class="table-row"
        >
          <span>
            {{ fee.maxDays === Infinity 
              ? `≥${fee.minDays}天` 
              : fee.minDays === 0 
                ? `<${fee.maxDays}天`
                : `${fee.minDays}-${fee.maxDays}天` }}
          </span>
          <span :class="{ free: fee.rate === 0 }">{{ fee.rate === 0 ? '免费' : `${fee.rate}%` }}</span>
        </div>
      </div>
      
     
      <div v-if="estimatedRedemptionFee && holdingDetails" class="redemption-estimate">
        <div class="estimate-info">
          <span>当前持有 {{ holdingDetails.holdDays }} 天，赎回费率 {{ estimatedRedemptionFee.rate }}%</span>
        </div>
        <div class="estimate-fee">
          预估赎回费: <span class="fee-amount">¥{{ estimatedRedemptionFee.fee.toFixed(2) }}</span>
        </div>
      </div>
    </div> -->

    <!-- ========== 重仓股票 ========== -->
    <!-- <div class="info-section">
      <div class="section-header">
        <span>重仓股票</span>
        <span class="section-tip" v-if="stockHoldings.length > 0">
          TOP{{ stockHoldings.length }}
        </span>
      </div>
      <div v-if="stockHoldings.length > 0" class="holdings-list">
        <div 
          v-for="(stock, idx) in stockHoldings" 
          :key="idx"
          class="holding-item"
        >
          <div class="holding-rank">{{ idx + 1 }}</div>
          <div class="holding-info">
            <div class="holding-name">{{ stock.stockName }}</div>
            <div class="holding-code">{{ stock.stockCode }}</div>
          </div>
          <div class="holding-ratio">
            <div class="ratio-value">{{ stock.holdingRatio.toFixed(2) }}%</div>
            <div class="ratio-label">持仓占比</div>
          </div>
        </div>
      </div>
      <div v-else class="empty-hint">暂无持仓数据</div>
    </div> -->

    <!-- ========== 行业配置 ========== -->
    <!-- <div class="info-section" v-if="industryAllocation.length > 0">
      <div class="section-header">
        <span>行业配置</span>
      </div>
      <div class="industry-chart">
     
        <div class="pie-container">
          <svg viewBox="0 0 100 100" class="pie-svg">
            <circle 
              v-for="(item, idx) in industryPieData" 
              :key="idx"
              cx="50" cy="50" r="40"
              fill="transparent"
              :stroke="item.color"
              stroke-width="20"
              :stroke-dasharray="item.dashArray"
              :stroke-dashoffset="item.offset"
              :style="{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }"
            />
          </svg>
        </div>
        <div class="industry-legend">
          <div 
            v-for="item in industryAllocation.slice(0, 6)" 
            :key="item.name"
            class="legend-item"
          >
            <span class="legend-color" :style="{ background: item.color }"></span>
            <span class="legend-name">{{ item.name }}</span>
            <span class="legend-value">{{ item.ratio }}%</span>
          </div>
        </div>
      </div>
    </div> -->

   
    <!-- <div class="info-section" v-if="assetAllocation">
      <div class="section-header">
        <span>资产配置</span>
      </div>
      <div class="asset-bars">
        <div class="asset-item" v-if="assetAllocation.stock > 0">
          <span class="asset-label">股票</span>
          <div class="asset-bar">
            <div class="bar-fill stock" :style="{ width: assetAllocation.stock + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.stock }}%</span>
        </div>
        <div class="asset-item" v-if="assetAllocation.bond > 0">
          <span class="asset-label">债券</span>
          <div class="asset-bar">
            <div class="bar-fill bond" :style="{ width: assetAllocation.bond + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.bond }}%</span>
        </div>
        <div class="asset-item" v-if="assetAllocation.cash > 0">
          <span class="asset-label">现金</span>
          <div class="asset-bar">
            <div class="bar-fill cash" :style="{ width: assetAllocation.cash + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.cash }}%</span>
        </div>
        <div class="asset-item" v-if="assetAllocation.other > 0">
          <span class="asset-label">其他</span>
          <div class="asset-bar">
            <div class="bar-fill other" :style="{ width: assetAllocation.other + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.other }}%</span>
        </div>
      </div>
    </div> -->

    <!-- <div class="info-section" v-if="fundRating">
      <div class="section-header">
        <span>基金评级</span>
        <span class="section-tip">{{ fundRating.riskLevel }}</span>
      </div>
      <div class="rating-content">
        <div class="rating-stars">
          <van-icon 
            v-for="i in 5" 
            :key="i" 
            :name="i <= fundRating.rating ? 'star' : 'star-o'" 
            :color="i <= fundRating.rating ? '#f59e0b' : '#d1d5db'"
            size="20"
          />
          <span class="rating-text">{{ fundRating.rating }}星</span>
        </div>
        <div class="rating-metrics">
          <div class="metric-item">
            <div class="metric-value">{{ fundRating.sharpeRatio || '--' }}</div>
            <div class="metric-label">夏普比率</div>
          </div>
          <div class="metric-item">
            <div class="metric-value danger">{{ fundRating.maxDrawdown ? fundRating.maxDrawdown + '%' : '--' }}</div>
            <div class="metric-label">最大回撤</div>
          </div>
          <div class="metric-item">
            <div class="metric-value">{{ fundRating.volatility ? fundRating.volatility + '%' : '--' }}</div>
            <div class="metric-label">波动率</div>
          </div>
          <div class="metric-item">
            <div class="metric-value primary">{{ fundRating.rankInSimilar }}</div>
            <div class="metric-label">同类排名</div>
          </div>
        </div>
      </div>
    </div> -->

   
    <!-- <div class="info-section">
      <div class="section-header">
        <span>分红记录</span>
        <span class="section-tip" v-if="dividendRecords.length > 0">
          累计{{ dividendRecords.length }}次，共{{ totalDividend.toFixed(4) }}元/份
        </span>
      </div>
      <div v-if="dividendRecords.length > 0" class="dividend-list">
        <div 
          v-for="(record, idx) in dividendRecords.slice(0, 5)" 
          :key="idx"
          class="dividend-item"
        >
          <div class="dividend-date">{{ record.date }}</div>
          <div class="dividend-amount">每份派{{ record.amount.toFixed(4) }}元</div>
          <div class="dividend-type">{{ record.type }}</div>
        </div>
        <div v-if="dividendRecords.length > 5" class="more-hint">
          还有{{ dividendRecords.length - 5 }}条记录...
        </div>
      </div>
      <div v-else class="empty-hint">暂无分红记录</div>
    </div> -->

    <!-- ========== 基金公告 ========== -->
    <!-- <div class="info-section">
      <div class="section-header">
        <span>基金公告</span>
      </div>
      <div v-if="announcements.length > 0" class="announcement-list">
        <div 
          v-for="item in announcements.slice(0, 5)" 
          :key="item.id"
          class="announcement-item"
          @click="openAnnouncement(item.url)"
        >
          <div class="announcement-type" :class="item.type">
            {{ item.type === '分红公告' ? '分红' : item.type === '定期报告' ? '报告' : item.type === '人事变动' ? '人事' : '公告' }}
          </div>
          <div class="announcement-content">
            <div class="announcement-title">{{ item.title }}</div>
            <div class="announcement-date">{{ item.date }}</div>
          </div>
          <van-icon name="arrow" class="announcement-arrow" />
        </div>
      </div>
      <div v-else class="empty-hint">暂无公告</div>
    </div> -->

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <div class="bar-item trade-btn" @click="openTradeDialog">
        <van-icon name="balance-list" size="20" />
        <span>交易</span>
      </div>
      <div class="bar-item" @click="editHolding">
        <van-icon name="edit" size="20" />
        <span>修改持仓</span>
      </div>
      <div class="bar-item" v-if="holdingInfo" @click="handleDelete">
        <van-icon name="delete" size="20" />
        <span>删除持仓</span>
      </div>
      <div class="bar-item" @click="manageSource">
        <van-icon name="shop-o" size="20" />
        <span>来源</span>
      </div>
      <div class="bar-item" @click="manageSectors">
        <van-icon name="cluster-o" size="20" />
        <span>行业板块</span>
      </div>
      <div class="bar-item" @click="showMore">
        <van-icon name="ellipsis" size="20" />
        <span>更多</span>
      </div>
    </div>

    <!-- 调整成本弹窗 -->
    <van-popup
      v-model:show="showCostDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '360px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>调整持仓成本</span>
          <van-icon name="cross" @click="showCostDialog = false" />
        </div>

        <div class="dialog-content">
          <van-field
            :model-value="`${costFormData.name} (${costFormData.code})`"
            label="基金"
            readonly
          />
          <van-field
            v-model="costFormData.amount"
            type="number"
            inputmode="decimal"
            label="持仓金额"
            placeholder="调整后的持仓金额（元）"
          />
          <van-field
            v-model="costFormData.profit"
            type="number"
            inputmode="decimal"
            label="持仓收益"
            placeholder="调整后的持仓收益（元）"
          />
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>用于分红再投、补仓摊薄等场景</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showCostDialog = false">取消</van-button>
          <van-button type="primary" @click="submitCostAdjust">确定</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 行业板块管理弹窗 -->
    <van-popup
      v-model:show="showSectorDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '360px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>管理行业板块</span>
          <van-icon name="cross" @click="showSectorDialog = false" />
        </div>

        <div class="dialog-content">
          <van-field
            :model-value="`${holdingInfo?.name} (${holdingInfo?.code})`"
            label="基金"
            readonly
          />
          <van-field
            v-model="sectorFormData.sectors"
            type="textarea"
            label="行业板块"
            placeholder="每行输入一个行业板块，例如：\n新能源\n半导体\n医药"
            :rows="5"
          />
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>为基金关联行业板块，便于趋势分析</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showSectorDialog = false">取消</van-button>
          <van-button type="primary" @click="submitSectorAdjust">确定</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 来源管理弹窗 -->
    <van-popup
      v-model:show="showSourceDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '360px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>管理来源</span>
          <van-icon name="cross" @click="showSourceDialog = false" />
        </div>

        <div class="dialog-content">
          <van-field
            :model-value="`${holdingInfo?.name} (${holdingInfo?.code})`"
            label="基金"
            readonly
          />
          <div class="form-item">
            <label class="form-label">来源</label>
            <van-radio-group v-model="sourceFormData.source" class="source-radio-group">
              <van-radio 
                v-for="option in sourceOptions" 
                :key="option.value" 
                :name="option.value"
                class="source-radio"
              >
                {{ option.text }}
              </van-radio>
            </van-radio-group>
          </div>
          <div class="form-item">
            <div class="qdii-toggle">
              <span class="qdii-label">是否为QDII</span>
              <van-switch v-model="sourceFormData.isQDII" size="24" />
            </div>
          </div>
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>记录基金的购买渠道，便于管理</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showSourceDialog = false">取消</van-button>
          <van-button type="primary" @click="submitSourceAdjust">确定</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 交易弹窗 -->
    <van-popup
      v-model:show="showTradeDialog"
      position="center"
      round
      :style="{ width: '88%', maxWidth: '380px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>交易操作</span>
          <van-icon name="cross" @click="showTradeDialog = false" />
        </div>

        <div class="dialog-content">
          <div class="trade-type-group">
            <span 
              class="trade-type-tab" 
              :class="{ active: tradeFormData.type === 'buy', buy: tradeFormData.type === 'buy' }"
              @click="tradeFormData.type = 'buy'"
            >
              加仓
            </span>
            <span 
              class="trade-type-tab" 
              :class="{ active: tradeFormData.type === 'sell', sell: tradeFormData.type === 'sell' }"
              @click="tradeFormData.type = 'sell'"
            >
              减仓
            </span>
          </div>

          <van-field
            :model-value="`${holdingInfo?.name} (${holdingInfo?.code})`"
            label="基金"
            readonly
          />

          <van-field
            v-model="tradeFormData.amount"
            label="交易金额"
            type="number"
            placeholder="请输入金额"
          />

          <van-field
            v-model="tradeFormData.netValue"
            label="成交净值"
            type="number"
            placeholder="请输入净值"
          >
            <template #left-icon>
              <span v-if="tradeFormData.isEstimate" class="net-value-tag estimate-tag">估值</span>
              <span v-else class="net-value-tag nav-tag">净值</span>
            </template>
          </van-field>

          <div class="net-value-info" v-if="tradeFormData.isEstimate">
            <span>使用实时估值，晚上净值更新后自动重算份额</span>
          </div>

          <van-field
            v-model="tradeFormData.date"
            label="交易日期"
            type="date"
            @update:model-value="onTradeDateChange"
          />

          <div class="trade-preview">
            <span>预计份额: {{ 
              tradeFormData.netValue && tradeFormData.amount 
                ? (parseFloat(tradeFormData.amount) / parseFloat(tradeFormData.netValue)).toFixed(2) 
                : '--' 
            }} 份</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showTradeDialog = false">取消</van-button>
          <van-button type="primary" @click="submitTrade">确认{{ tradeFormData.type === 'buy' ? '加仓' : '减仓' }}</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.detail-page {
  /* [WHY] 使用 100% 高度适配 flex 布局 */
  height: 100%;
  background: var(--bg-primary);
  /* [WHY] 允许页面整体滚动 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  /* [WHY] 底部留白给操作栏 */
  padding-bottom: 70px;
  /* [WHY] 顶部留白给固定导航栏和安全区（导航栏高度 55px + 安全区 + 额外 16px 间距） */
  padding-top: calc(55px + env(safe-area-inset-top, 0px) + 16px);
}

/* ========== 顶部区域 ========== */
.top-header {
  background: var(--bg-primary);
  padding-top: calc(env(safe-area-inset-top, 0px) + 4px);
  border-bottom: 1px solid var(--border-color);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
}

.nav-bar {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 4px);
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  background: var(--bg-primary);
  z-index: 1000;
}

.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
}

.fund-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* 基金信息行 */
.fund-info-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.info-divider {
  font-size: 10px;
  color: var(--border-color);
  opacity: 0.5;
}

.fund-info-row span {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.estimate-tag {
  font-weight: 600;
  font-size: 13px;
}

.holding-info-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.estimate-tag.up {
  color: var(--color-up);
}

.estimate-tag.down {
  color: var(--color-down);
}

.core-metrics {
  padding: 16px 20px 24px;
}

.core-metrics.loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.main-change {
  margin-bottom: 16px;
}

.change-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.change-value {
  font-size: 42px;
  font-weight: 700;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.change-value.up {
  color: #f56c6c;
}

.change-value.down {
  color: #67c23a;
}

.sub-metrics {
  display: flex;
  gap: 40px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.metric-value.up {
  color: #f56c6c;
}

.metric-value.down {
  color: #67c23a;
}

/* ========== 持仓数据区 ========== */
.holding-panel {
  background: var(--bg-secondary);
  margin: 0 12px;
  margin-top: -12px;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
}

/* 简要信息（收起时显示） */
.holding-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.holding-panel.collapsed .holding-summary {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.summary-item {
  flex: 1;
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.summary-value {
  font-size: 15px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.summary-value.up { color: #f56c6c; }
.summary-value.down { color: #67c23a; }

.expand-icon {
  color: var(--text-secondary);
  transition: transform 0.3s;
}

.holding-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.holding-item {
  text-align: center;
}

.item-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.item-value {
  font-size: 16px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.item-value.up { color: #f56c6c; }
.item-value.down { color: #67c23a; }

/* 展开/收起动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  max-height: 300px;
  opacity: 1;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ========== Tab切换 ========== */
.tab-bar {
  display: flex;
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: 8px;
  padding: 4px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 10px;
  font-size: 14px;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-item.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 500;
}

/* ========== 图表区域 ========== */
.chart-section {
  background: var(--bg-secondary);
  margin: 0 4px 8px;
  border-radius: 12px;
  overflow: visible;
  padding-top: 8px;
}

@media (min-width: 768px) {
  .chart-section {
    margin: 0 12px 12px;
    padding-top: 20px;
  }
}

/* ========== 交易记录 ========== */
.trade-records-section {
  margin: 0 12px 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 10px 12px;
}

.trade-records-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.trade-records-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.trade-records-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.trade-records-scroll {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.trade-record-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-primary);
  border-radius: 6px;
  border-left: 3px solid;
}

.trade-record-item.buy {
  border-left-color: #f6465d;
}

.trade-record-item.sell {
  border-left-color: #0ecb81;
}

.trade-record-main {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  white-space: nowrap;
}

.trade-type-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 500;
  flex-shrink: 0;
}

.trade-type-badge.buy {
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
}

.trade-type-badge.sell {
  background: rgba(14, 203, 129, 0.15);
  color: #0ecb81;
}

.trade-date {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.trade-amount {
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}

.trade-nav {
  color: var(--text-primary);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.trade-nav.is-estimate {
  color: var(--text-secondary);
  font-style: italic;
}

.nav-tag {
  font-size: 9px;
  padding: 0 2px;
  border-radius: 2px;
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
  flex-shrink: 0;
}

.trade-nav:not(.is-estimate) .nav-tag {
  background: rgba(14, 203, 129, 0.15);
  color: #0ecb81;
}

.trade-return {
  font-weight: 600;
  flex-shrink: 0;
}

.trade-return.up {
  color: #f6465d;
}

.trade-return.down {
  color: #0ecb81;
}

.trade-delete-btn {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.trade-delete-btn:hover {
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
}

.chart-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  gap: 12px;
}

.estimate-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.estimate-tag.up {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.estimate-tag.down {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.data-source {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ========== 业绩走势 ========== */
.performance-section, .profit-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
  padding: 16px;
  min-height: 200px;
}

.period-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.period-item {
  text-align: center;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.period-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.period-return {
  font-size: 16px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.period-return.up { color: #f56c6c; }
.period-return.down { color: #67c23a; }

.period-rank {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.period-rank .rank-num {
  color: var(--color-primary);
}

/* ========== 我的收益 ========== */
.profit-summary {
  display: flex;
  justify-content: space-around;
  padding: 24px 0;
}

.profit-total, .profit-rate {
  text-align: center;
}

.profit-total .label, .profit-rate .label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: block;
}

.profit-total .value, .profit-rate .value {
  font-size: 24px;
  font-weight: 700;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.profit-total .value.up, .profit-rate .value.up { color: #f56c6c; }
.profit-total .value.down, .profit-rate .value.down { color: #67c23a; }

/* ========== 关联板块 ========== */
.sector-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
}

.sector-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.sector-label {
  color: var(--text-secondary);
}

.sector-name {
  color: var(--text-primary);
  font-weight: 500;
}

.sector-change {
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.sector-change.up { color: #f56c6c; }
.sector-change.down { color: #67c23a; }

.sector-link {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ========== 同类基金 ========== */
.similar-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}

.section-tip {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}

.similar-list {
  padding: 8px 16px;
}

.similar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.similar-item:last-child {
  border-bottom: none;
}

.similar-item:active {
  opacity: 0.7;
}

.similar-info {
  flex: 1;
  overflow: hidden;
}

.similar-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar-code {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.similar-return {
  font-size: 14px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.similar-return.up { color: #f56c6c; }
.similar-return.down { color: #67c23a; }

/* ========== 信息区块通用样式 ========== */
.info-section {
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: 12px;
  overflow: hidden;
}

/* ========== 基金规模 ========== */
.scale-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 12px 8px;
  gap: 8px;
}

.scale-item {
  text-align: center;
}

.scale-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.scale-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* ========== 费率信息 ========== */
.fee-grid {
  display: flex;
  padding: 12px 16px;
  gap: 24px;
  border-bottom: 1px solid var(--border-color);
}

.fee-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fee-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.fee-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.fee-table {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.fee-table:last-of-type {
  border-bottom: none;
}

.table-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.table-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.table-row.header {
  color: var(--text-tertiary);
  font-size: 11px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  margin-bottom: 4px;
}

.table-row span {
  flex: 1;
  text-align: center;
}

.table-row span:first-child {
  text-align: left;
}

.table-row .discount {
  color: #f56c6c;
  font-weight: 500;
}

.table-row .free {
  color: #67c23a;
  font-weight: 500;
}

.redemption-estimate {
  padding: 12px 16px;
  background: var(--bg-tertiary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.estimate-info {
  font-size: 12px;
  color: var(--text-secondary);
}

.estimate-fee {
  font-size: 13px;
  color: var(--text-primary);
}

.fee-amount {
  font-weight: 600;
  color: #f56c6c;
}

/* ========== 重仓股票 ========== */
.holdings-list {
  padding: 8px 16px 12px;
}

.holding-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.holding-item:last-child {
  border-bottom: none;
}

.holding-rank {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
}

.holding-item:nth-child(1) .holding-rank {
  background: #ff6b6b;
  color: white;
}

.holding-item:nth-child(2) .holding-rank {
  background: #ffa726;
  color: white;
}

.holding-item:nth-child(3) .holding-rank {
  background: #ffca28;
  color: white;
}

.holding-info {
  flex: 1;
  min-width: 0;
}

.holding-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.holding-code {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.holding-ratio {
  text-align: right;
}

.ratio-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-primary);
}

.ratio-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ========== 行业配置 ========== */
.industry-chart {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 20px;
}

.pie-container {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.pie-svg {
  width: 100%;
  height: 100%;
}

.industry-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-value {
  font-weight: 500;
  color: var(--text-primary);
}

/* ========== 资产配置 ========== */
.asset-bars {
  padding: 12px 16px;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.asset-item:last-child {
  margin-bottom: 0;
}

.asset-label {
  width: 36px;
  font-size: 12px;
  color: var(--text-secondary);
}

.asset-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.bar-fill.stock { background: #3b82f6; }
.bar-fill.bond { background: #22c55e; }
.bar-fill.cash { background: #f59e0b; }
.bar-fill.other { background: #8b5cf6; }

.asset-value {
  width: 45px;
  text-align: right;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

/* ========== 基金评级 ========== */
.rating-content {
  padding: 16px;
}

.rating-stars {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
}

.rating-text {
  margin-left: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #f59e0b;
}

.rating-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.metric-item {
  text-align: center;
  padding: 12px 4px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.metric-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.metric-value.danger {
  color: var(--color-down);
}

.metric-value.primary {
  color: var(--color-primary);
}

.metric-label {
  font-size: 10px;
  color: var(--text-secondary);
}

/* ========== 分红记录 ========== */
.dividend-list {
  padding: 8px 16px 12px;
}

.dividend-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.dividend-item:last-child {
  border-bottom: none;
}

.dividend-date {
  font-size: 13px;
  color: var(--text-secondary);
  width: 90px;
}

.dividend-amount {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.dividend-type {
  font-size: 11px;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.more-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 8px 0;
}

.empty-hint {
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  padding: 20px;
}

/* ========== 基金公告 ========== */
.announcement-list {
  padding: 8px 16px 12px;
}

.announcement-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.announcement-item:last-child {
  border-bottom: none;
}

.announcement-item:active {
  opacity: 0.7;
}

.announcement-type {
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 4px;
  margin-right: 10px;
  white-space: nowrap;
}

.announcement-type.分红公告 {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.announcement-type.定期报告 {
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}

.announcement-type.人事变动 {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.announcement-type.其他公告 {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* ========== 行业板块标签 ========== */
.sector-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
}

.sector-tag {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  white-space: nowrap;
}

/* ========== 来源信息 ========== */
.source-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.announcement-content {
  flex: 1;
  overflow: hidden;
}

.announcement-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-date {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.announcement-arrow {
  color: var(--text-tertiary);
  margin-left: 8px;
}

/* ========== 底部操作栏 ========== */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  padding: 8px 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  z-index: 100;
}

.bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 0;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.bar-item:active {
  opacity: 0.7;
}

/* ========== 调整成本弹窗 ========== */
.cost-dialog {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.cost-dialog .dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
}

.cost-dialog .dialog-content {
  padding: 8px 0 16px;
}

.cost-dialog .dialog-footer {
  padding: 12px 16px 16px;
  display: flex;
  gap: 12px;
}

.cost-dialog .dialog-footer .van-button {
  flex: 1;
}

/* ========== 交易弹窗 ========== */
.trade-type-group {
  display: flex;
  margin: 8px 16px 12px;
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 3px;
}

.trade-type-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.trade-type-tab.active.buy {
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
}

.trade-type-tab.active.sell {
  background: rgba(14, 203, 129, 0.15);
  color: #0ecb81;
}

.net-value-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  margin-right: 8px;
  font-weight: 500;
}

.estimate-tag {
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
  border: 1px solid rgba(246, 70, 93, 0.3);
}

.nav-tag {
  background: rgba(14, 203, 129, 0.15);
  color: #0ecb81;
  border: 1px solid rgba(14, 203, 129, 0.3);
}

.net-value-info {
  margin: 0 16px 8px;
  padding: 8px 10px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-size: 12px;
  color: #f0b90b;
  font-style: italic;
}

.trade-preview {
  margin: 8px 16px 0;
  padding: 10px 12px;
  background: var(--bg-primary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.trade-preview span {
  font-weight: 600;
  color: var(--text-primary);
}

/* 交易按钮样式 */
.bar-item.trade-btn {
  color: #f6465d;
}

.bar-item.trade-btn .van-icon {
  color: #f6465d;
}

.form-item {
  margin: 12px 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
  font-weight: 500;
}

.source-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.source-radio {
  flex: 1;
  min-width: 80px;
  padding: 8px 0;
  font-size: 14px;
  text-align: center;
}

.qdii-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.qdii-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.qdii-badge {
  display: inline-block;
  background: #1989fa;
  color: white;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 8px;
  font-weight: 500;
}

.cost-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
  margin-top: 8px;
}

/* ========== 趋势预测 ========== */
.trend-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
  padding: 16px;
  min-height: 200px;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.trend-direction {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-icon {
  font-size: 24px;
}

.trend-text {
  font-size: 18px;
  font-weight: 600;
}

.trend-direction.up .trend-text {
  color: var(--color-up);
}

.trend-direction.down .trend-text {
  color: var(--color-down);
}

.trend-direction.sideways .trend-text {
  color: var(--text-secondary);
}

.trend-confidence .label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.trend-confidence .value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-primary);
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.trend-direction {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-icon {
  font-size: 24px;
}

.trend-text {
  font-size: 18px;
  font-weight: 600;
}

.trend-direction.up .trend-text {
  color: var(--color-up);
}

.trend-direction.down .trend-text {
  color: var(--color-down);
}

.trend-direction.sideways .trend-text {
  color: var(--text-secondary);
}

.trend-confidence .label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.trend-confidence .value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-primary);
}

.trend-levels {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.level-item {
  flex: 1;
  text-align: center;
}

.level-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.level-value {
  font-size: 16px;
  font-weight: 600;
}

.level-value.up {
  color: var(--color-up);
}

.level-value.down {
  color: var(--color-down);
}

.signal-list {
  margin-bottom: 16px;
}

.signal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.signal-item:last-child {
  border-bottom: none;
}

.signal-type {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.signal-type.buy {
  background: var(--color-up);
}

.signal-type.sell {
  background: var(--color-down);
}

.signal-type.hold {
  background: var(--text-secondary);
}

.signal-info {
  flex: 1;
}

.signal-name {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.signal-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.fund-score-card {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.score-header {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.score-title {
  font-size: 14px;
  color: var(--text-secondary);
}

.score-level {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.score-level.level-S {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

.score-level.level-A {
  background: rgba(255, 167, 38, 0.1);
  color: #ffa726;
}

.score-level.level-B {
  background: rgba(102, 187, 106, 0.1);
  color: #66bb6a;
}

.score-level.level-C {
  background: rgba(66, 165, 245, 0.1);
  color: #42a5f5;
}

.score-level.level-D {
  background: rgba(120, 144, 156, 0.1);
  color: #78909c;
}

.fund-score-card .score-value {
  font-size: 36px;
  font-weight: bold;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.fund-score-card .score-desc {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
