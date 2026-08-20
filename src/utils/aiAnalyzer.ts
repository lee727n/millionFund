// [WHY] AI交易记录分析引擎：基于每笔买入/卖出记录，计算盈亏并生成止盈/回补提醒
// [WHAT] 只分析Trader页面的交易记录，不依赖持仓数据

import type { TradeRecord } from '@/types/fund'

export type SignalType = 'take_profit' | 'buy_back' | 'cut_loss' | 'add_on_dip' | 'observe'

export interface TradeSignal {
  id: string
  fundCode: string
  fundName: string
  signal: SignalType
  tradeId: string
  tradeType: 'buy' | 'sell'
  tradeDate: string
  tradeAmount: number
  tradeNetValue: number
  currentValue: number
  returnRate: number
  holdingDays: number
  score: number
  reason: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
}

export interface TradeAnalysisResult {
  signals: TradeSignal[]
  summary: {
    totalTrades: number
    buyCount: number
    sellCount: number
    takeProfitCount: number
    buyBackCount: number
    cutLossCount: number
    addOnDipCount: number
    observeCount: number
    totalPnL: number
    bestTrade: { name: string; return: number } | null
    worstTrade: { name: string; return: number } | null
  }
  fundSummaries: FundTradeSummary[]
}

export interface FundTradeSummary {
  code: string
  name: string
  totalBuyAmount: number
  totalSellAmount: number
  netFlow: number
  bestBuyReturn: number
  worstBuyReturn: number
  tradeCount: number
  buyCount: number
  sellCount: number
}

interface FundDataPoint {
  estimate: number
  nav: number
  currentValue: number
  dataSource: string
}

// ============ 主入口 ============

export function analyzeTrades(
  trades: TradeRecord[],
  fundDataMap: Map<string, FundDataPoint>
): TradeAnalysisResult {
  if (trades.length === 0) {
    return createEmptyResult()
  }

  const allSignals: TradeSignal[] = []

  // 按基金分组
  const byFund = new Map<string, TradeRecord[]>()
  trades.forEach(t => {
    if (!byFund.has(t.code)) byFund.set(t.code, [])
    byFund.get(t.code)!.push(t)
  })

  // 分析每笔交易
  const fundSummaries: FundTradeSummary[] = []

  byFund.forEach((fundTrades, code) => {
    const fundData = fundDataMap.get(code)
    if (!fundData) return

    const currentValue = getCurrentValue(fundData)
    if (currentValue <= 0) return

    const name = fundTrades[0].name
    let totalBuy = 0
    let totalSell = 0
    let bestBuyReturn = -Infinity
    let worstBuyReturn = Infinity

    fundTrades.forEach(trade => {
      if (trade.netValue <= 0) return

      const returnRate = ((currentValue - trade.netValue) / trade.netValue) * 100
      const holdingDays = daysBetween(trade.date, new Date().toISOString().slice(0, 10))

      if (trade.type === 'buy') {
        totalBuy += trade.amount
        if (returnRate > bestBuyReturn) bestBuyReturn = returnRate
        if (returnRate < worstBuyReturn) worstBuyReturn = returnRate

        const signal = analyzeBuyTrade(trade, returnRate, holdingDays, currentValue, name)
        if (signal) allSignals.push(signal)
      } else if (trade.type === 'sell') {
        totalSell += trade.amount

        const signal = analyzeSellTrade(trade, returnRate, holdingDays, currentValue, name)
        if (signal) allSignals.push(signal)
      }
    })

    const buyCount = fundTrades.filter(t => t.type === 'buy').length
    const sellCount = fundTrades.filter(t => t.type === 'sell').length

    fundSummaries.push({
      code,
      name,
      totalBuyAmount: totalBuy,
      totalSellAmount: totalSell,
      netFlow: totalBuy - totalSell,
      bestBuyReturn: isFinite(bestBuyReturn) ? bestBuyReturn : 0,
      worstBuyReturn: isFinite(worstBuyReturn) ? worstBuyReturn : 0,
      tradeCount: fundTrades.length,
      buyCount,
      sellCount
    })
  })

  // 排序：按优先级+分数
  const sortedSignals = allSignals.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    return b.score - a.score
  })

  // 汇总
  const allBuyTrades = trades.filter(t => t.type === 'buy')
  const allSellTrades = trades.filter(t => t.type === 'sell')

  const takeProfitCount = allSignals.filter(s => s.signal === 'take_profit').length
  const buyBackCount = allSignals.filter(s => s.signal === 'buy_back').length
  const cutLossCount = allSignals.filter(s => s.signal === 'cut_loss').length
  const addOnDipCount = allSignals.filter(s => s.signal === 'add_on_dip').length
  const observeCount = allSignals.filter(s => s.signal === 'observe').length

  // 计算总盈亏
  let totalPnL = 0
  trades.forEach(t => {
    const fd = fundDataMap.get(t.code)
    if (!fd || fd.dataSource === '') return
    const cv = getCurrentValue(fd)
    if (cv <= 0 || t.netValue <= 0) return
    const pnl = (cv - t.netValue) / t.netValue * t.amount / 100
    if (t.type === 'buy') totalPnL += pnl
    else totalPnL -= pnl
  })

  let bestTrade: { name: string; return: number } | null = null
  let worstTrade: { name: string; return: number } | null = null
  const validBuyTrades = allBuyTrades.filter(t => {
    const fd = fundDataMap.get(t.code)
    return fd && getCurrentValue(fd) > 0 && t.netValue > 0
  })
  if (validBuyTrades.length > 0) {
    bestTrade = { name: validBuyTrades[0].name, return: -Infinity }
    worstTrade = { name: validBuyTrades[0].name, return: Infinity }
    validBuyTrades.forEach(t => {
      const fd = fundDataMap.get(t.code)!
      const cv = getCurrentValue(fd)
      const ret = ((cv - t.netValue) / t.netValue) * 100
      if (ret > bestTrade!.return) bestTrade = { name: t.name, return: ret }
      if (ret < worstTrade!.return) worstTrade = { name: t.name, return: ret }
    })
  }

  return {
    signals: sortedSignals,
    summary: {
      totalTrades: trades.length,
      buyCount: allBuyTrades.length,
      sellCount: allSellTrades.length,
      takeProfitCount,
      buyBackCount,
      cutLossCount,
      addOnDipCount,
      observeCount,
      totalPnL,
      bestTrade,
      worstTrade
    },
    fundSummaries: fundSummaries.sort((a, b) => b.netFlow - a.netFlow)
  }
}

// ============ 买入交易分析 ============

function analyzeBuyTrade(
  trade: TradeRecord,
  returnRate: number,
  holdingDays: number,
  currentValue: number,
  name: string
): TradeSignal | null {
  const amountText = formatAmount(trade.amount)
  const daysText = formatDays(holdingDays)

  // 止盈信号
  if (returnRate >= 20) {
    return {
      id: `${trade.id}-tp`,
      fundCode: trade.code,
      fundName: name,
      signal: 'take_profit',
      tradeId: trade.id,
      tradeType: 'buy',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: Math.min(100, returnRate * 2),
      reason: `${trade.date} 买入 ${amountText}，${daysText}累计盈利 ${returnRate.toFixed(1)}%，可考虑分批止盈做T`,
      suggestion: `建议卖出部分锁定利润（减仓 30-50%），剩余部分设置移动止盈`,
      priority: returnRate >= 30 ? 'high' : 'medium'
    }
  }

  // 温和盈利 - 提示关注
  if (returnRate >= 10 && returnRate < 20) {
    return {
      id: `${trade.id}-tp-mild`,
      fundCode: trade.code,
      fundName: name,
      signal: 'take_profit',
      tradeId: trade.id,
      tradeType: 'buy',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: returnRate,
      reason: `${trade.date} 买入 ${amountText}，${daysText}盈利 ${returnRate.toFixed(1)}%，趋势向好`,
      suggestion: `可考虑部分止盈（减仓 20-30%），或继续持有看更高目标`,
      priority: 'low'
    }
  }

  // 止损信号
  if (returnRate <= -15 && holdingDays >= 7) {
    return {
      id: `${trade.id}-sl`,
      fundCode: trade.code,
      fundName: name,
      signal: 'cut_loss',
      tradeId: trade.id,
      tradeType: 'buy',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: Math.max(-100, returnRate * 2),
      reason: `${trade.date} 买入 ${amountText}，${daysText}亏损 ${Math.abs(returnRate).toFixed(1)}%，超出正常波动`,
      suggestion: `建议止损减仓 50% 以上，或设置严格止损位`,
      priority: returnRate <= -25 ? 'high' : 'medium'
    }
  }

  // 回调补仓信号
  if (returnRate <= -5 && returnRate > -15 && holdingDays >= 14) {
    return {
      id: `${trade.id}-dip`,
      fundCode: trade.code,
      fundName: name,
      signal: 'add_on_dip',
      tradeId: trade.id,
      tradeType: 'buy',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: returnRate,
      reason: `${trade.date} 买入 ${amountText}，${daysText}回调 ${Math.abs(returnRate).toFixed(1)}%，进入可补仓区间`,
      suggestion: `可考虑分批补仓摊低成本，但需确认基本面未恶化`,
      priority: 'medium'
    }
  }

  return null
}

// ============ 卖出交易分析 ============

function analyzeSellTrade(
  trade: TradeRecord,
  returnRate: number,
  holdingDays: number,
  currentValue: number,
  name: string
): TradeSignal | null {
  const amountText = formatAmount(trade.amount)
  const daysText = formatDays(holdingDays)

  // 卖出后下跌 → 回补机会
  if (returnRate <= -10) {
    return {
      id: `${trade.id}-bb`,
      fundCode: trade.code,
      fundName: name,
      signal: 'buy_back',
      tradeId: trade.id,
      tradeType: 'sell',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: Math.min(100, Math.abs(returnRate) * 2),
      reason: `${trade.date} 卖出 ${amountText}后，${daysText}下跌 ${Math.abs(returnRate).toFixed(1)}%，出现回补机会`,
      suggestion: `建议考虑回补部分仓位（买回 30-50%），锁定波段利润`,
      priority: returnRate <= -20 ? 'high' : 'medium'
    }
  }

  // 卖出后温和下跌
  if (returnRate <= -5 && returnRate > -10) {
    return {
      id: `${trade.id}-bb-mild`,
      fundCode: trade.code,
      fundName: name,
      signal: 'buy_back',
      tradeId: trade.id,
      tradeType: 'sell',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: Math.abs(returnRate),
      reason: `${trade.date} 卖出 ${amountText}后，${daysText}回调 ${Math.abs(returnRate).toFixed(1)}%`,
      suggestion: `可关注，若继续回调至支撑位可考虑回补`,
      priority: 'low'
    }
  }

  // 卖出后上涨 → 提示踏空
  if (returnRate >= 15) {
    return {
      id: `${trade.id}-regret`,
      fundCode: trade.code,
      fundName: name,
      signal: 'observe',
      tradeId: trade.id,
      tradeType: 'sell',
      tradeDate: trade.date,
      tradeAmount: trade.amount,
      tradeNetValue: trade.netValue,
      currentValue,
      returnRate,
      holdingDays,
      score: -returnRate,
      reason: `${trade.date} 卖出 ${amountText}后，${daysText}上涨 ${returnRate.toFixed(1)}%，注意踏空风险`,
      suggestion: `若长期看好，可考虑在回调时重新建仓`,
      priority: 'low'
    }
  }

  return null
}

// ============ 工具函数 ============

function getCurrentValue(fd: FundDataPoint): number {
  if (fd.dataSource === 'nav' && fd.nav > 0) return fd.nav
  if (fd.estimate > 0) return fd.estimate
  return fd.currentValue || 0
}

function daysBetween(dateStr: string, today: string): number {
  const d1 = new Date(dateStr)
  const d2 = new Date(today)
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function formatAmount(amount: number): string {
  if (amount >= 10000) return (amount / 10000).toFixed(1) + '万'
  if (amount >= 1000) return (amount / 1000).toFixed(1) + 'k'
  return amount.toFixed(0) + '元'
}

function formatDays(days: number): string {
  if (days <= 0) return '今日'
  if (days === 1) return '昨日'
  if (days < 30) return `${days}天前`
  if (days < 365) return `${Math.floor(days / 30)}个月前`
  return `${Math.floor(days / 365)}年前`
}

function createEmptyResult(): TradeAnalysisResult {
  return {
    signals: [],
    summary: {
      totalTrades: 0, buyCount: 0, sellCount: 0,
      takeProfitCount: 0, buyBackCount: 0, cutLossCount: 0,
      addOnDipCount: 0, observeCount: 0,
      totalPnL: 0, bestTrade: null, worstTrade: null
    },
    fundSummaries: []
  }
}
