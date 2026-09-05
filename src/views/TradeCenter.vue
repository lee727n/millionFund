<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getTrades, removeTrade, getHoldings, updateTradesByCode, saveTrades, getTTrades, removeTTrade } from '@/utils/storage'
import { fetchFundAccurateData, clearFundCache } from '@/api/fundFast'
import { analyzeTrades, type TradeAnalysisResult } from '@/utils/aiAnalyzer'
import type { TradeRecord, TTradeRecord } from '@/types/fund'
// 账户图标 - 通过 import 让 Vite 正确处理资源路径
// @ts-ignore
import aliIcon from '@/assets/ali.jpg'
// @ts-ignore
import txIcon from '@/assets/TX.jpg'
// @ts-ignore
import jdIcon from '@/assets/JD.jpg'
// @ts-ignore
import eyeIcon from '@/assets/eye.png'

const router = useRouter()

const loading = ref(true)
const refreshing = ref(false)
const fundNavMap = ref<Map<string, number>>(new Map())
const calculatingReturns = ref(true) // 涨跌幅计算中

// [FIX] 保存每个基金的完整数据（估值、净值、数据源）
// 用于根据交易记录的类型选择合适的当前值进行涨跌幅计算
const fundDataMap = ref<Map<string, { estimate: number; nav: number; currentValue: number; dataSource: string }>>(new Map())

// 账户图标映射
const accountIcons: Record<string, string> = {
  ali: aliIcon,
  TX: txIcon,
  JD: jdIcon,
  observe: eyeIcon
}

// 当前账户筛选 (''=全部, 'ali', 'TX', 'JD')
const accountFilter = ref<string>('')

// 所有交易记录
const allTrades = ref<TradeRecord[]>([])

// 加载交易记录
// [FIX] 分两步加载：先显示基础数据，再异步加载涨跌幅
async function loadTrades() {
  // 第一步：立即显示本地存储的交易记录（不需要等待网络请求）
  const trades = getTrades()
  
  // 如果没有交易记录，不需要计算
  if (trades.length === 0) {
    calculatingReturns.value = false
    loading.value = false
    return
  }
  
  calculatingReturns.value = true  // 开始计算
  
  // 获取持仓中的基金来源信息，用于自动匹配
  const holdings = getHoldings()
  const fundSourceMap = new Map<string, string>()
  holdings.forEach(h => {
    if (h.source) {
      fundSourceMap.set(h.code, h.source)
    }
  })
  
  // 自动补全交易记录中的 source 字段
  const enrichedTrades = trades.map(t => {
    if (!t.source && fundSourceMap.has(t.code)) {
      return { ...t, source: fundSourceMap.get(t.code) as string }
    }
    return t
  })
  
  // 按基金分组排序
  allTrades.value = enrichedTrades.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code)
    return b.createdAt - a.createdAt
  })
  
  // 立即显示，不再等待网络请求
  loading.value = false
  
  // 第二步：异步加载需要计算的数据（估值检查、涨跌幅等）
  // 使用 Promise.allSettled 确保所有请求都完成
  loadTradeCalculations(enrichedTrades)
}

// [FIX] 异步加载交易记录的计算数据（估值检查、涨跌幅等）
async function loadTradeCalculations(trades: TradeRecord[]) {
  const today = new Date().toLocaleDateString('en-CA')
  
  // 检查是否有估值交易记录（estimated: true），自动更新为净值
  const estimatedTrades = trades.filter(t => t.estimated)
  console.log('[TradeCenter.loadCalculations] 估值交易数量:', estimatedTrades.length)
  
  // 收集所有需要处理的基金代码
  const codesToUpdate = new Set<string>()
  
  if (estimatedTrades.length > 0) {
    estimatedTrades.forEach(t => codesToUpdate.add(t.code))
  }
  
  // 检查今天添加的、但被错误标记为 estimated: false 的交易记录
  const todayTradesNotEstimated = trades.filter(t => t.date === today && !t.estimated)
  if (todayTradesNotEstimated.length > 0) {
    todayTradesNotEstimated.forEach(t => codesToUpdate.add(t.code))
  }
  
  // 并发处理所有需要更新的基金
  const holdingsList = getHoldings()
  const updateRequests = Array.from(codesToUpdate).map(async (code) => {
    try {
      const isQDII = holdingsList.some((h: any) => h.code === code && h.isQDII)
      const data = await fetchFundAccurateData(code, isQDII, true)
      console.log('[TradeCenter.loadCalculations] 基金', code, 'nav:', data.nav, 'navDate:', data.navDate, 'dataSource:', data.dataSource)
      
      // [FIX] 关键逻辑：有正式净值就直接更新该基金所有 estimated 交易记录
      if (data.nav > 0 && data.navDate) {
        updateTradesByCode(code, data.nav, data.navDate)
      }
      
      // 如果今天净值还没更新，恢复今天添加的记录为 estimated: true
      // [FIX] 增加 holding.isUpdated 前置判断：如果 holding 已确认净值更新，不恢复 estimated
      const holdingConfirmedUpdated = holdingsList.some((h: any) => h.code === code && h.isUpdated)
      if (data.dataSource !== 'nav' && !holdingConfirmedUpdated) {
        const allTrades = getTrades()
        let needSave = false
        allTrades.forEach(t => {
          if (t.code === code && t.date === today && !t.estimated) {
            console.log('[TradeCenter.loadCalculations] 修复交易记录:', t.id, '恢复为 estimated: true')
            t.estimated = true
            needSave = true
          }
        })
        if (needSave) {
          saveTrades(allTrades)
        }
      }
    } catch (e) {
      console.error('[TradeCenter.loadCalculations] 获取失败:', code, e)
    }
  })
  
  // 并发获取所有基金的涨跌幅数据
  const fundCodes = [...new Set(trades.map(t => t.code))] as string[]
  const navRequests = fundCodes.map(async (code) => {
    try {
      const isQDII = holdingsList.some((h: any) => h.code === code && h.isQDII)
      const data = await fetchFundAccurateData(code, isQDII, true)
      fundDataMap.value.set(code, {
        estimate: data.estimate || 0,
        nav: data.nav || 0,
        currentValue: data.currentValue || 0,
        dataSource: data.dataSource
      })
    } catch (e) {
      // 静默失败
    }
  })

  // 等待所有请求完成
  await Promise.allSettled([...updateRequests, ...navRequests])
  
  // 重新获取更新后的交易记录并刷新显示
  const updatedTrades = getTrades()
  const holdings = getHoldings()
  const fundSourceMap = new Map<string, string>()
  holdings.forEach(h => {
    if (h.source) {
      fundSourceMap.set(h.code, h.source)
    }
  })
  
  const enrichedTrades = updatedTrades.map(t => {
    if (!t.source && fundSourceMap.has(t.code)) {
      return { ...t, source: fundSourceMap.get(t.code) as string }
    }
    return t
  })
  
  allTrades.value = enrichedTrades.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code)
    return b.createdAt - a.createdAt
  })
  
  // 计算完成
  calculatingReturns.value = false
}

// 刷新数据：清除缓存后重新获取最新估值
async function refreshData() {
  if (refreshing.value) return
  
  refreshing.value = true
  try {
    // 获取所有基金代码并清除缓存
    const trades = getTrades()
    const fundCodes = [...new Set(trades.map(t => t.code))] as string[]
    fundCodes.forEach(code => clearFundCache(code))
    
    // 重新加载数据
    await loadTrades()
    showToast('刷新成功')
  } catch (e) {
    showToast('刷新失败')
  } finally {
    refreshing.value = false
  }
}

// 筛选后的交易记录
const filteredTrades = computed(() => {
  if (!accountFilter.value) return allTrades.value
  return allTrades.value.filter(t => t.source === accountFilter.value)
})

// 按基金分组的交易记录
const groupedTrades = computed(() => {
  // 获取当前持仓中的基金代码列表
  const holdings = getHoldings()
  const holdingCodes = new Set(holdings.map(h => h.code))
  
  const groups = new Map<string, {
    code: string
    name: string
    source?: string
    isCleared: boolean  // 是否已清仓
    trades: (TradeRecord & { postReturn: number })[]
  }>()

  filteredTrades.value.forEach(trade => {
    if (!groups.has(trade.code)) {
      // 判断是否已清仓：不在持仓列表中即为已清仓
      const isCleared = !holdingCodes.has(trade.code)
      groups.set(trade.code, {
        code: trade.code,
        name: trade.name,
        source: trade.source,
        isCleared,
        trades: []
      })
    }
    const group = groups.get(trade.code)!
    
    const fundData = fundDataMap.value.get(trade.code)
    let postReturn = 0
    
    if (fundData && trade.netValue > 0) {
      // [FIX] 简单逻辑：
      // 1. 最新值：今天净值更新了用净值，没更新用估值
      // 2. 交易成本：trade.netValue（已经保存了交易时的估值或净值）
      // 3. 涨跌幅 = (最新值 - 交易成本) / 交易成本
      
      let currentValue = 0
      if (fundData.dataSource === 'nav' && fundData.nav > 0) {
        // 今天净值已更新，用净值
        currentValue = fundData.nav
      } else if (fundData.estimate > 0) {
        // 今天净值没更新，用估值
        currentValue = fundData.estimate
      } else {
        // Fallback
        currentValue = fundData.currentValue
      }
      
      if (currentValue > 0) {
        postReturn = ((currentValue - trade.netValue) / trade.netValue) * 100
      }
    }
    
    group.trades.push({ ...trade, postReturn })
  })

  // [FIX] 排序：已清仓的放在后面
  return Array.from(groups.values()).sort((a, b) => {
    // 先按是否清仓排序（未清仓在前，已清仓在后）
    if (a.isCleared !== b.isCleared) {
      return a.isCleared ? 1 : -1
    }
    // 同状态下按基金代码排序
    return a.code.localeCompare(b.code)
  })
})

// 获取账户图标图片
function getSourceIconSrc(source?: string): string {
  if (!source) return ''
  return accountIcons[source] || ''
}

function getSourceName(source?: string): string {
  switch (source) {
    case 'ali': return '支付宝'
    case 'TX': return '腾讯'
    case 'JD': return '京东'
    case 'observe': return '观察'
    default: return ''
  }
}

// [FIX] 获取基金logo URL（东方财富）
function getFundLogoUrl(code: string): string {
  return `https://logo.eastmoney.com/${code}.png`
}

// [FIX] logo加载失败时隐藏
function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img) {
    img.style.display = 'none'
  }
}

// 跳转详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

// 删除交易记录
async function deleteTrade(trade: TradeRecord) {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定删除这笔${trade.type === 'buy' ? '加仓' : '减仓'}记录吗？\n${trade.name} ${trade.amount}元`,
    })
    
    removeTrade(trade.id)
    loadTrades()
    showToast('已删除')
  } catch {
    // 用户取消
  }
}

// 切换账户筛选（再次点击取消筛选）
function toggleAccountFilter(account: string) {
  accountFilter.value = accountFilter.value === account ? '' : account
}

// ========== T交易归档展示 ==========

// 已归档的T交易
const allTTrades = ref<TTradeRecord[]>([])

// 恢复T交易（放回交易列表）
function restoreTTrade(tTrade: TTradeRecord) {
  showConfirmDialog({
    title: '恢复交易记录',
    message: `将T交易恢复为普通交易记录？\n${tTrade.fundName}\n买${tTrade.buyDate} 卖${tTrade.sellDate}`,
  }).then(() => {
    removeTTrade(tTrade.id)
    loadTrades()
    loadTTrades()
    showToast('已恢复为交易记录')
  }).catch(() => {})
}

// 加载T交易归档
function loadTTrades() {
  allTTrades.value = getTTrades()
}

// 格式化金额
function formatTAmount(amount: number): string {
  if (amount >= 10000) return (amount / 10000).toFixed(1) + '万'
  return amount.toFixed(0) + '元'
}

// 点击信号卡片跳转到K线图，并高亮对应交易节点
function goToSignalChart(signal: any) {
  router.push({
    path: `/detail/${signal.fundCode}`,
    query: {
      hlDate: signal.tradeDate,
      hlType: signal.tradeType
    }
  })
}

// AI 分析结果 - 基于交易记录 + 实时行情
const aiAnalysis = computed<TradeAnalysisResult>(() => {
  const trades = getTrades()
  return analyzeTrades(trades, fundDataMap.value)
})

// 展开/收起 AI 面板
const aiPanelExpanded = ref(false)

function getSignalIcon(signal: string) {
  switch (signal) {
    case 'take_profit': return '🎯'
    case 'buy_back': return '🔄'
    case 'cut_loss': return '🛑'
    case 'add_on_dip': return '📉'
    case 'observe': return '👀'
    default: return '⚪'
  }
}

function getSignalLabel(signal: string) {
  switch (signal) {
    case 'take_profit': return '止盈'
    case 'buy_back': return '回补'
    case 'cut_loss': return '止损'
    case 'add_on_dip': return '补仓'
    case 'observe': return '观察'
    default: return '观望'
  }
}

function getSignalClass(signal: string) {
  switch (signal) {
    case 'take_profit': return 'signal-take-profit'
    case 'buy_back': return 'signal-buy-back'
    case 'cut_loss': return 'signal-cut-loss'
    case 'add_on_dip': return 'signal-add-on-dip'
    default: return 'signal-observe'
  }
}

function getScoreClass(score: number) {
  if (score <= -30) return 'score-danger'
  if (score <= -10) return 'score-warning'
  if (score >= 30) return 'score-positive'
  if (score >= 10) return 'score-mild-positive'
  return 'score-neutral'
}

function getHealthColor(score: number) {
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#0ea5e9'
  if (score >= 25) return '#f59e0b'
  return '#ef4444'
}

onMounted(() => {
  loadTrades()
  loadTTrades()
})
</script>

<template>
  <div class="trade-center">
    <!-- 顶部标题 + 筛选按钮 -->
    <div class="header">
      <div class="header-left">
        <span class="title-icon">📊</span>
        <span>交易记录</span>
        <span class="trade-count">{{ filteredTrades.length }}条</span>
        <!-- 账户筛选按钮 - 可切换 -->
        <button 
          class="filter-btn source-btn" 
          :class="{ active: accountFilter === 'ali' }"
          @click="toggleAccountFilter('ali')"
          title="支付宝"
        >
          <img src="@/assets/ali.jpg" class="source-icon" alt="支付宝" />
        </button>
        <button 
          class="filter-btn source-btn" 
          :class="{ active: accountFilter === 'TX' }"
          @click="toggleAccountFilter('TX')"
          title="腾讯"
        >
          <img src="@/assets/TX.jpg" class="source-icon" alt="腾讯" />
        </button>
        <button 
          class="filter-btn source-btn" 
          :class="{ active: accountFilter === 'JD' }"
          @click="toggleAccountFilter('JD')"
          title="京东"
        >
          <img src="@/assets/JD.jpg" class="source-icon" alt="京东" />
        </button>
      </div>
      <div class="header-right">
        <button 
          class="refresh-btn" 
          :class="{ 'is-refreshing': refreshing }"
          @click="refreshData"
          title="刷新估值"
          :disabled="refreshing"
        >
          <span class="refresh-icon">↻</span>
        </button>
      </div>
    </div>

    <!-- 可滚动内容区 -->
    <div class="content-scroll">

    <!-- AI 智能分析面板 -->
    <div class="ai-panel">
      <div class="ai-panel-header" @click="aiPanelExpanded = !aiPanelExpanded">
        <div class="ai-panel-title">
          <span class="ai-icon">🤖</span>
          <span>AI 交易分析</span>
          <span class="ai-summary">
            <span class="ai-chip chip-tp" v-if="aiAnalysis.summary.takeProfitCount > 0">止盈 {{ aiAnalysis.summary.takeProfitCount }}</span>
            <span class="ai-chip chip-bb" v-if="aiAnalysis.summary.buyBackCount > 0">回补 {{ aiAnalysis.summary.buyBackCount }}</span>
            <span class="ai-chip chip-sl" v-if="aiAnalysis.summary.cutLossCount > 0">止损 {{ aiAnalysis.summary.cutLossCount }}</span>
            <span class="ai-chip chip-dip" v-if="aiAnalysis.summary.addOnDipCount > 0">补仓 {{ aiAnalysis.summary.addOnDipCount }}</span>
          </span>
        </div>
        <span class="ai-panel-toggle">{{ aiPanelExpanded ? '收起 ▲' : '展开 ▼' }}</span>
      </div>

      <div v-if="aiPanelExpanded" class="ai-panel-body">
        <!-- 交易汇总 -->
        <div class="ai-trade-summary">
          <div class="summary-stat">
            <div class="stat-value" :class="aiAnalysis.summary.totalPnL >= 0 ? 'up' : 'down'">
              {{ aiAnalysis.summary.totalPnL >= 0 ? '+' : '' }}{{ aiAnalysis.summary.totalPnL.toFixed(0) }}
            </div>
            <div class="stat-label">累计盈亏(元)</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">{{ aiAnalysis.summary.totalTrades }}</div>
            <div class="stat-label">交易笔数</div>
          </div>
          <div class="summary-stat" v-if="aiAnalysis.summary.bestTrade">
            <div class="stat-value up">{{ aiAnalysis.summary.bestTrade.return.toFixed(1) }}%</div>
            <div class="stat-label">最佳: {{ aiAnalysis.summary.bestTrade.name.slice(0, 6) }}</div>
          </div>
          <div class="summary-stat" v-if="aiAnalysis.summary.worstTrade">
            <div class="stat-value down">{{ aiAnalysis.summary.worstTrade.return.toFixed(1) }}%</div>
            <div class="stat-label">最差: {{ aiAnalysis.summary.worstTrade.name.slice(0, 6) }}</div>
          </div>
        </div>

        <!-- 交易建议列表 -->
        <div v-if="aiAnalysis.signals.length > 0" class="ai-section">
          <div class="ai-section-title">📋 交易提醒（{{ aiAnalysis.signals.length }}条）</div>
          <div class="ai-signal-list">
            <div v-for="signal in aiAnalysis.signals" :key="signal.id" class="ai-signal-card" :class="getSignalClass(signal.signal)" @click="goToSignalChart(signal)">
              <div class="signal-header">
                <span class="signal-icon">{{ getSignalIcon(signal.signal) }}</span>
                <span class="signal-title">{{ getSignalLabel(signal.signal) }}：{{ signal.fundName }}</span>
                <span class="signal-score" :class="getScoreClass(signal.score)">
                  {{ signal.returnRate >= 0 ? '+' : '' }}{{ signal.returnRate.toFixed(1) }}%
                </span>
              </div>
              <div class="signal-detail">
                <span class="signal-trade-date">{{ signal.tradeDate }}</span>
                <span class="signal-trade-type" :class="signal.tradeType">{{ signal.tradeType === 'buy' ? '买入' : '卖出' }}</span>
                <span class="signal-trade-amount">{{ signal.tradeAmount >= 10000 ? (signal.tradeAmount / 10000).toFixed(1) + '万' : signal.tradeAmount.toFixed(0) + '元' }}</span>
                <span class="signal-separator">→</span>
                <span class="signal-current">现价 {{ signal.currentValue.toFixed(4) }}</span>
              </div>
              <div class="signal-reasons">
                <div class="signal-reason">💭 {{ signal.reason }}</div>
              </div>
              <div class="signal-suggestions">
                <div class="signal-suggestion">💡 {{ signal.suggestion }}</div>
              </div>
              <div class="signal-jump-hint">点击查看K线图 →</div>
            </div>
          </div>
        </div>
        <div v-else class="ai-no-signal">
          ✅ 暂无交易信号，所有交易记录表现正常
        </div>

        <!-- 基金汇总 -->
        <div v-if="aiAnalysis.fundSummaries.length > 0" class="ai-section">
          <div class="ai-section-title">📊 基金汇总</div>
          <div class="ai-fund-table">
            <div class="ai-fund-row ai-fund-header">
              <span class="col-name">基金</span>
              <span class="col-stat">买入</span>
              <span class="col-stat">卖出</span>
              <span class="col-stat">净流入</span>
              <span class="col-stat">最佳</span>
              <span class="col-stat">最差</span>
            </div>
            <div v-for="fs in aiAnalysis.fundSummaries" :key="fs.code" class="ai-fund-row">
              <span class="col-name" :title="fs.name">{{ fs.name.length > 8 ? fs.name.slice(0, 8) + '..' : fs.name }}</span>
              <span class="col-stat">{{ fs.totalBuyAmount >= 10000 ? (fs.totalBuyAmount / 10000).toFixed(1) + '万' : fs.totalBuyAmount.toFixed(0) }}</span>
              <span class="col-stat">{{ fs.totalSellAmount >= 10000 ? (fs.totalSellAmount / 10000).toFixed(1) + '万' : fs.totalSellAmount.toFixed(0) }}</span>
              <span class="col-stat" :class="fs.netFlow >= 0 ? 'up' : 'down'">{{ fs.netFlow >= 10000 ? (fs.netFlow / 10000).toFixed(1) + '万' : fs.netFlow.toFixed(0) }}</span>
              <span class="col-stat up" v-if="fs.bestBuyReturn !== -Infinity">{{ fs.bestBuyReturn.toFixed(1) }}%</span>
              <span class="col-stat" v-else>--</span>
              <span class="col-stat down" v-if="fs.worstBuyReturn !== Infinity">{{ fs.worstBuyReturn.toFixed(1) }}%</span>
              <span class="col-stat" v-else>--</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading && allTrades.length === 0" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="groupedTrades.length === 0" class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-text">暂无交易记录</div>
      <div class="empty-hint">在首页或详情页点击「交易」按钮开始记录</div>
    </div>

    <!-- 基金分组卡片 -->
    <div v-else class="fund-list">
      <!-- 涨跌幅计算中提示 -->
      <div v-if="calculatingReturns" class="calculating-hint">
        <span class="calculating-spinner"></span>
        <span>正在计算涨跌幅...</span>
      </div>
      
      <div 
        v-for="group in groupedTrades" 
        :key="group.code" 
        class="fund-card"
        :class="{ 'is-cleared': group.isCleared }"
      >
        <!-- 第一行：基金logo + 账户图标 + 基金名称 + code + 已清仓标签 -->
        <div class="fund-header" @click="goToDetail(group.code)">
          <!-- [FIX] 基金logo -->
          <img 
            :src="getFundLogoUrl(group.code)" 
            class="fund-logo"
            @error="onLogoError"
          />
          <!-- 账户图标 -->
          <img 
            v-if="group.source" 
            :src="getSourceIconSrc(group.source)" 
            class="fund-source-icon" 
            :title="getSourceName(group.source)"
          />
          <span class="fund-name">{{ group.name }}</span>
          <span class="fund-code">{{ group.code }}</span>
          <!-- [FIX] 已清仓的基金显示绿色标签 -->
          <span v-if="group.isCleared" class="cleared-tag">已清仓</span>
        </div>

        <!-- 第二行：交易记录 -->
        <div class="trade-records">
          <div
            v-for="trade in group.trades"
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
              <!-- [FIX] 涨跌幅数据加载完成后显示，未完成时显示 "--" -->
              <span 
                class="trade-return" 
                :class="trade.postReturn >= 0 ? 'up' : 'down'"
              >
                <template v-if="calculatingReturns">
                  <span class="return-placeholder">--</span>
                </template>
                <template v-else>
                  {{ trade.postReturn >= 0 ? '+' : '' }}{{ trade.postReturn.toFixed(2) }}%
                </template>
              </span>
            </div>
            <div class="trade-actions">
              <button class="trade-delete-btn" @click.stop="deleteTrade(trade)">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- T交易归档区 -->
    <div v-if="allTTrades.length > 0" class="t-trade-section">
      <div class="t-trade-header">
        <span class="t-trade-title">📋 T交易记录 ({{ allTTrades.length }})</span>
        <span class="t-trade-summary">
          累计盈亏:
          <span :class="allTTrades.reduce((s, t) => s + t.profit, 0) >= 0 ? 'up' : 'down'">
            {{ allTTrades.reduce((s, t) => s + t.profit, 0) >= 0 ? '+' : '' }}{{ allTTrades.reduce((s, t) => s + t.profit, 0).toFixed(2) }}元
          </span>
        </span>
      </div>
      <div v-for="t in allTTrades" :key="t.id" class="t-trade-card" :class="t.profit >= 0 ? 'profit' : 'loss'">
        <div class="t-trade-info">
          <span class="t-trade-name" @click="goToDetail(t.fundCode)">{{ t.fundName }}</span>
          <span class="t-trade-dates">{{ t.buyDate }} → {{ t.sellDate }} ({{ t.holdingDays }}天)</span>
        </div>
        <div class="t-trade-detail">
          <span class="t-trade-buy">买 {{ formatTAmount(t.buyAmount) }} @{{ t.buyNetValue.toFixed(4) }}</span>
          <span class="t-trade-sell">卖 {{ formatTAmount(t.sellAmount) }} @{{ t.sellNetValue.toFixed(4) }}</span>
        </div>
        <div class="t-trade-result">
          <span class="t-trade-profit" :class="t.profit >= 0 ? 'up' : 'down'">
            {{ t.profit >= 0 ? '+' : '' }}{{ t.profit.toFixed(2) }}元
          </span>
          <span class="t-trade-rate" :class="t.returnRate >= 0 ? 'up' : 'down'">
            ({{ t.returnRate >= 0 ? '+' : '' }}{{ t.returnRate.toFixed(2) }}%)
          </span>
        </div>
        <button class="t-trade-restore" @click="restoreTTrade(t)">恢复</button>
      </div>
    </div>
    </div><!-- /.content-scroll -->

  </div>
</template>

<style scoped>
.trade-center {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* 内容滚动区 */
.content-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* 顶部标题 */
.header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  flex-wrap: wrap;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 刷新按钮 */
.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.3s;
  color: var(--text-primary);
}

.refresh-btn:active {
  transform: scale(0.95);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-icon {
  font-size: 18px;
  font-weight: bold;
  transition: transform 0.5s;
}

.refresh-btn.is-refreshing .refresh-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.title-icon {
  font-size: 20px;
}

.trade-count {
  font-size: 13px;
  font-weight: normal;
  color: var(--text-secondary);
}

/* 筛选按钮 */
.filter-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn.source-btn {
  padding: 4px;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary);
}

.filter-btn.source-btn.active {
  border-color: var(--accent-color, #1890ff);
  box-shadow: 0 0 0 2px var(--accent-color, #1890ff);
}

.source-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
}

/* 加载和空状态 */
.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  margin-bottom: 6px;
}

.empty-hint {
  font-size: 12px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--bg-secondary);
  border-top-color: var(--accent-color, #1890ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 基金列表 */
.fund-list {
  padding: 8px 12px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}

/* 基金卡片 */
.fund-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}

/* 已清仓的基金卡片 - 视觉区分 */
.fund-card.is-cleared {
  opacity: 0.7;
  border: 1px dashed rgba(14, 203, 129, 0.3);
}

.fund-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
}

/* [FIX] 基金logo样式 */
.fund-logo {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.fund-header:active {
  opacity: 0.7;
}

.fund-source-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
}

.fund-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 已清仓标签 - 绿色 */
.cleared-tag {
  font-size: 10px;
  color: #0ecb81;
  background: rgba(14, 203, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
  font-weight: 500;
  border: 1px solid rgba(14, 203, 129, 0.3);
}

/* 交易记录 - 复用 Detail 样式 */
.trade-records {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.trade-record-item {
  display: flex;
  align-items: center;
  gap: 4px;
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

/* 涨跌幅占位符 */
.return-placeholder {
  color: var(--text-tertiary, #999);
  font-weight: 400;
}

/* 涨跌幅计算中提示 */
.calculating-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-tertiary, #999);
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 12px;
}

.calculating-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: var(--primary-color, #1890ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.trade-delete-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
}

.trade-delete-btn:hover {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

/* ============ AI 分析面板 ============ */
.ai-panel {
  margin: 8px 12px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.ai-panel-header:active {
  background: var(--bg-tertiary);
}

.ai-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-icon {
  font-size: 16px;
}

.ai-summary {
  display: flex;
  gap: 4px;
  margin-left: 8px;
}

.ai-chip {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.chip-tp { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.chip-bb { background: rgba(14, 165, 233, 0.15); color: #0ea5e9; }
.chip-sl { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.chip-dip { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }

.ai-panel-toggle {
  font-size: 11px;
  color: var(--text-secondary);
}

.ai-panel-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border-color);
}

/* 交易汇总 */
.ai-trade-summary {
  display: flex;
  gap: 12px;
  padding: 14px 0 10px;
  border-bottom: 1px solid var(--border-color);
}

.summary-stat {
  flex: 1;
  text-align: center;
}

.summary-stat .stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.summary-stat .stat-value.up { color: #22c55e; }
.summary-stat .stat-value.down { color: #ef4444; }

.summary-stat .stat-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 亮点/风险标签 */
.ai-section {
  margin-top: 10px;
}

.ai-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.ai-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ai-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
}

.tag-strength {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.tag-issue {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

/* 交易建议卡片 */
.ai-signal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-signal-card {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-primary);
  border-left: 3px solid var(--border-color);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.ai-signal-card:active {
  transform: scale(0.98);
}

.ai-signal-card.signal-take-profit {
  border-left-color: #22c55e;
  background: rgba(34, 197, 94, 0.06);
}

.ai-signal-card.signal-buy-back {
  border-left-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.06);
}

.ai-signal-card.signal-cut-loss {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.06);
}

.ai-signal-card.signal-add-on-dip {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.06);
}

.ai-signal-card.signal-observe {
  border-left-color: #6b7280;
  background: rgba(107, 114, 128, 0.06);
}

.signal-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.signal-icon {
  font-size: 14px;
}

.signal-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.signal-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.signal-trade-date {
  color: var(--text-secondary);
}

.signal-trade-type {
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10px;
}

.signal-trade-type.buy {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.signal-trade-type.sell {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.signal-trade-amount {
  font-weight: 600;
  color: var(--text-primary);
}

.signal-separator {
  color: var(--text-tertiary);
}

.signal-current {
  font-variant-numeric: tabular-nums;
}

.signal-score {
  font-size: 12px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.score-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.score-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.score-positive {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.score-mild-positive {
  background: rgba(14, 165, 233, 0.15);
  color: #0ea5e9;
}

.score-neutral {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.signal-reasons {
  margin-bottom: 4px;
}

.signal-reason {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.signal-suggestions {
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
}

.signal-suggestion {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  line-height: 1.5;
}

.signal-jump-hint {
  margin-top: 6px;
  text-align: right;
  font-size: 10px;
  color: #8b5cf6;
  opacity: 0.7;
}

.ai-no-signal {
  padding: 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 基金汇总表格 */
.ai-fund-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}

.ai-fund-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  font-size: 11px;
  border-radius: 4px;
}

.ai-fund-row.ai-fund-header {
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.ai-fund-row:not(.ai-fund-header) {
  background: var(--bg-primary);
}

.col-name {
  flex: 2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.col-stat {
  flex: 1;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-stat.up { color: #22c55e; font-weight: 600; }
.col-stat.down { color: #ef4444; font-weight: 600; }

/* ========== T交易标记按钮 ========== */
.trade-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ========== T交易归档区 ========== */
.t-trade-section {
  margin: 8px 12px 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

.t-trade-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.t-trade-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.t-trade-summary {
  font-size: 12px;
  color: var(--text-secondary);
}

.t-trade-summary .up { color: #22c55e; font-weight: 700; }
.t-trade-summary .down { color: #ef4444; font-weight: 700; }

.t-trade-card {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto auto;
  gap: 2px 8px;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 6px;
  position: relative;
  border-left: 3px solid var(--border-color);
}

.t-trade-card.profit {
  border-left-color: #22c55e;
  background: rgba(34, 197, 94, 0.04);
}

.t-trade-card.loss {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.04);
}

.t-trade-info {
  grid-column: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.t-trade-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.t-trade-dates {
  font-size: 10px;
  color: var(--text-tertiary);
}

.t-trade-detail {
  grid-column: 1;
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-secondary);
}

.t-trade-buy { color: #ef4444; }
.t-trade-sell { color: #22c55e; }

.t-trade-result {
  grid-column: 1;
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.t-trade-profit {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.t-trade-rate {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.t-trade-profit.up, .t-trade-rate.up { color: #22c55e; }
.t-trade-profit.down, .t-trade-rate.down { color: #ef4444; }

.t-trade-restore {
  grid-column: 2;
  grid-row: 1 / 4;
  align-self: center;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(107, 114, 128, 0.12);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  white-space: nowrap;
}
</style>
