// [WHY] 封装 localStorage 操作，提供类型安全的数据持久化
// [WHAT] 自选列表、持仓数据等需要在 APP 重启后保留

import { APP_VERSION } from '@/config/version'
import { cache } from '@/api/cache'

const STORAGE_KEYS = {
  WATCHLIST: 'fund_watchlist',
  HOLDINGS: 'fund_holdings',
  APP_VERSION: 'app_version',
  FUND_NET_VALUES: 'fund_net_values',
  SOURCE_FILTER: 'source_filter',
  TRADES: 'fund_trades',
  T_TRADES: 'fund_t_trades',
  STARRED_FUNDS: 'fund_starred_funds',
  // [WHAT] 需要在版本更新时清除的缓存 key 前缀
  CACHE_PREFIXES: ['fund_', 'api_', 'market_', 'estimate_']
} as const

/**
 * 检查版本并清除旧缓存
 * [WHY] APP 更新后需要清除旧缓存，确保使用最新数据
 * [WHAT] 比较存储的版本与当前版本，不同则清除 API 缓存
 */
export function checkVersionAndClearCache(): void {
  const storedVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION)

  if (storedVersion !== APP_VERSION) {
    console.log(`[版本更新] ${storedVersion || '首次安装'} -> ${APP_VERSION}，清除缓存`)

    // [WHAT] 清除内存缓存
    cache.clear()

    // [WHAT] 清除 localStorage 中的 API 缓存（保留用户数据）
    const keysToRemove: string[] = []
    // [FIX] 用户数据 key 白名单，版本更新时绝不能删除
    const preservedKeys: string[] = [
      STORAGE_KEYS.WATCHLIST,
      STORAGE_KEYS.HOLDINGS,
      STORAGE_KEYS.TRADES,
      STORAGE_KEYS.FUND_NET_VALUES,
      STORAGE_KEYS.SOURCE_FILTER,
      STORAGE_KEYS.APP_VERSION,
      STORAGE_KEYS.STARRED_FUNDS
    ]
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && STORAGE_KEYS.CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) {
        // [WHAT] 不清除用户数据
        if (!preservedKeys.includes(key)) {
          keysToRemove.push(key)
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))

    // [WHAT] 更新版本号
    localStorage.setItem(STORAGE_KEYS.APP_VERSION, APP_VERSION)
  }
}

/**
 * 通用存储读取函数
 * [WHY] 统一处理 JSON 解析和错误处理
 * [EDGE] 数据不存在或解析失败时返回默认值
 */
function getItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

/**
 * 通用存储写入函数
 */
function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// ========== 自选列表 ==========

/**
 * 获取自选基金代码列表
 */
export function getWatchlist(): string[] {
  return getItem<string[]>(STORAGE_KEYS.WATCHLIST, [])
}

/**
 * 保存自选基金代码列表
 */
export function saveWatchlist(codes: string[]): void {
  setItem(STORAGE_KEYS.WATCHLIST, codes)
}

/**
 * 添加基金到自选
 * [EDGE] 已存在则不重复添加
 */
export function addToWatchlist(code: string): void {
  const list = getWatchlist()
  if (!list.includes(code)) {
    list.unshift(code) // 新添加的排在前面
    saveWatchlist(list)
  }
}

/**
 * 从自选中移除基金
 */
export function removeFromWatchlist(code: string): void {
  const list = getWatchlist()
  const index = list.indexOf(code)
  if (index > -1) {
    list.splice(index, 1)
    saveWatchlist(list)
  }
}

/**
 * 检查基金是否在自选中
 */
export function isInWatchlist(code: string): boolean {
  return getWatchlist().includes(code)
}

// ========== 持仓数据 ==========

import type { HoldingRecord } from '@/types/fund'

/**
 * 获取持仓列表
 */
export function getHoldings(): HoldingRecord[] {
  return getItem<HoldingRecord[]>(STORAGE_KEYS.HOLDINGS, [])
}

/**
 * 保存持仓列表
 */
export function saveHoldings(holdings: HoldingRecord[]): void {
  setItem(STORAGE_KEYS.HOLDINGS, holdings)
}

/**
 * 添加或更新持仓
 * [WHAT] 如果已存在同代码持仓，则更新；否则新增
 */
export function upsertHolding(holding: HoldingRecord): void {
  const list = getHoldings()
  const index = list.findIndex((h) => h.code === holding.code)
  if (index > -1) {
    list[index] = holding
  } else {
    list.push(holding)
  }
  saveHoldings(list)
}

/**
 * 删除持仓
 */
export function removeHolding(code: string): void {
  const list = getHoldings()
  const filtered = list.filter((h) => h.code !== code)
  saveHoldings(filtered)
}

/**
 * 获取单个持仓
 */
export function getHolding(code: string): HoldingRecord | undefined {
  return getHoldings().find((h) => h.code === code)
}

// ========== 基金净值存储 ==========

/**
 * 获取基金净值映射
 */
export function getFundNetValues(): Record<string, number> {
  return getItem<Record<string, number>>(STORAGE_KEYS.FUND_NET_VALUES, {})
}

/**
 * 保存基金净值映射
 */
export function saveFundNetValues(netValues: Record<string, number>): void {
  setItem(STORAGE_KEYS.FUND_NET_VALUES, netValues)
}

/**
 * 保存来源筛选状态
 */
export function saveSourceFilter(filter: string): void {
  setItem(STORAGE_KEYS.SOURCE_FILTER, filter)
}

/**
 * 获取来源筛选状态
 */
export function getSourceFilter(): string {
  return getItem<string>(STORAGE_KEYS.SOURCE_FILTER, '')
}

/**
 * 更新单个基金净值
 */
export function updateFundNetValue(code: string, netValue: number): void {
  const netValues = getFundNetValues()
  netValues[code] = netValue
  saveFundNetValues(netValues)
  // console.log('保存基金净值到本地存储:', { code, netValue, netValues })
}

/**
 * 获取单个基金净值
 */
export function getFundNetValue(code: string): number | undefined {
  return getFundNetValues()[code]
}

// ========== 交易记录 ==========

import type { TradeRecord, TTradeRecord } from '@/types/fund'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

/**
 * 获取所有交易记录
 */
export function getTrades(): TradeRecord[] {
  return getItem<TradeRecord[]>(STORAGE_KEYS.TRADES, [])
}

/**
 * 保存交易记录列表
 */
export function saveTrades(trades: TradeRecord[]): void {
  setItem(STORAGE_KEYS.TRADES, trades)
}

/**
 * 按基金代码获取交易记录
 */
export function getTradesByCode(code: string): TradeRecord[] {
  return getTrades().filter(t => t.code === code)
}

/**
 * 添加交易记录
 */
export function addTrade(trade: TradeRecord): void {
  // [DEBUG] 打印添加的交易记录
  console.log('[addTrade] 添加交易:', {
    type: trade.type,
    date: trade.date,
    netValue: trade.netValue,
    estimated: trade.estimated,
    code: trade.code
  })
  const trades = getTrades()
  trades.push({ ...trade, id: generateId(), createdAt: Date.now() })
  saveTrades(trades)
}

/**
 * 删除交易记录
 */
export function removeTrade(id: string): void {
  const trades = getTrades().filter(t => t.id !== id)
  saveTrades(trades)
}

/**
 * 更新交易记录的净值（估值转正式净值）
 */
export function updateTradeNetValue(id: string, netValue: number): void {
  const trades = getTrades()
  const trade = trades.find(t => t.id === id)
  if (trade) {
    trade.netValue = netValue
    trade.shares = trade.amount / netValue
    trade.estimated = false
    saveTrades(trades)
  }
}

/**
 * 更新某基金所有交易记录的净值（估值转正式净值）
 * [WHY] 只要获取到了最新净值（nav > 0），就可以更新估值交易记录
 * [FIX] 更新条件（简化为两种场景，解决 QDII 基金净值日期滞后问题）：
 *   1. t.estimated === true：创建时用的估值，还没被正式净值覆盖 —— 只要有正式净值就更新，不再受日期限制
 *      （原来的 t.date <= navDate 条件对 QDII 基金失效，因为 navDate 是前一个工作日，
 *       而今天的交易记录日期 > navDate，但依然需要用最新净值更新）
 *   2. t.date === navDate：今天的交易，净值刚更新，可能之前用了错误的值（修复 bug 遗留）
 */
export function updateTradesByCode(code: string, netValue: number, navDate?: string): void {
  const trades = getTrades()
  let changed = false
  trades.forEach(t => {
    if (t.code === code && netValue > 0) {
      const shouldUpdate = t.estimated || (navDate && t.date === navDate)

      if (shouldUpdate) {
        // 避免重复更新相同的值
        if (Math.abs(t.netValue - netValue) < 0.0001 && !t.estimated) {
          return
        }
        console.log('[updateTradesByCode] 更新交易:', {
          id: t.id,
          tradeDate: t.date,
          navDate: navDate,
          oldNetValue: t.netValue,
          newNetValue: netValue,
          wasEstimated: t.estimated
        })
        t.netValue = netValue
        t.shares = t.amount / netValue
        t.estimated = false
        changed = true
      }
    }
  })
  if (changed) {
    saveTrades(trades)
    console.log('[updateTradesByCode] 保存成功')
  }
}

// ========== T交易归档 ==========

/**
 * 获取所有T交易归档记录
 */
export function getTTrades(): TTradeRecord[] {
  return getItem<TTradeRecord[]>(STORAGE_KEYS.T_TRADES, [])
}

/**
 * 保存T交易归档记录列表
 */
export function saveTTrades(tTrades: TTradeRecord[]): void {
  setItem(STORAGE_KEYS.T_TRADES, tTrades)
}

/**
 * 按基金代码获取T交易归档
 */
export function getTTradesByCode(code: string): TTradeRecord[] {
  return getTTrades().filter(t => t.fundCode === code)
}

/**
 * 归档T交易
 * [WHY] 将配对的买入+卖出记录从交易列表移除，移入T交易归档
 */
export function archiveTTrade(buyTrade: TradeRecord, sellTrade: TradeRecord): TTradeRecord {
  const buyShares = buyTrade.amount / buyTrade.netValue
  const sellShares = sellTrade.amount / sellTrade.netValue
  // [WHAT] 用较小份额计算实际做T的配对份额
  const tShares = Math.min(buyShares, sellShares)
  const profit = (sellTrade.netValue - buyTrade.netValue) * tShares - (buyTrade.fee + sellTrade.fee)
  const returnRate = ((sellTrade.netValue - buyTrade.netValue) / buyTrade.netValue) * 100

  const buyDate = new Date(buyTrade.date)
  const sellDate = new Date(sellTrade.date)
  const holdingDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24))

  // [WHAT] 配对金额 = 较小份额 × 对应净值
  const pairedBuyAmount = tShares * buyTrade.netValue
  const pairedSellAmount = tShares * sellTrade.netValue

  const tTrade: TTradeRecord = {
    id: generateId(),
    fundCode: buyTrade.code,
    fundName: buyTrade.name,
    buyTrade: { ...buyTrade },
    sellTrade: { ...sellTrade },
    buyDate: buyTrade.date,
    sellDate: sellTrade.date,
    buyAmount: pairedBuyAmount,
    sellAmount: pairedSellAmount,
    buyNetValue: buyTrade.netValue,
    sellNetValue: sellTrade.netValue,
    profit,
    returnRate,
    holdingDays,
    archivedAt: Date.now()
  }

  const trades = getTrades()

  if (tShares >= buyShares - 0.001) {
    // [WHAT] 买入全部配对，移除买入记录
    const buyIdx = trades.findIndex(t => t.id === buyTrade.id)
    if (buyIdx !== -1) trades.splice(buyIdx, 1)
  } else {
    // [WHAT] 买入部分配对，保留剩余
    const buyIdx = trades.findIndex(t => t.id === buyTrade.id)
    if (buyIdx !== -1) {
      const remainingShares = buyShares - tShares
      trades[buyIdx] = {
        ...trades[buyIdx],
        shares: remainingShares,
        amount: remainingShares * buyTrade.netValue
      }
    }
  }

  if (tShares >= sellShares - 0.001) {
    // [WHAT] 卖出全部配对，移除卖出记录
    const sellIdx = trades.findIndex(t => t.id === sellTrade.id)
    if (sellIdx !== -1) trades.splice(sellIdx, 1)
  } else {
    // [WHAT] 卖出部分配对，保留剩余（如卖出7万只配对2万，保留5万）
    const sellIdx = trades.findIndex(t => t.id === sellTrade.id)
    if (sellIdx !== -1) {
      const remainingShares = sellShares - tShares
      trades[sellIdx] = {
        ...trades[sellIdx],
        shares: remainingShares,
        amount: remainingShares * sellTrade.netValue
      }
    }
  }

  saveTrades(trades)

  // 添加到T交易归档
  const tTrades = getTTrades()
  tTrades.push(tTrade)
  saveTTrades(tTrades)

  return tTrade
}

/**
 * 删除T交易归档记录（恢复交易记录）
 * [WHY] 恢复时只将配对部分的买卖记录放回交易列表
 * 如果原记录还有剩余部分（部分配对），不会重复恢复
 */
export function removeTTrade(tTradeId: string): void {
  const tTrades = getTTrades()
  const tTrade = tTrades.find(t => t.id === tTradeId)
  if (!tTrade) return

  // [WHAT] 恢复配对部分的交易记录（使用归档时保存的配对金额）
  const buyShares = tTrade.buyAmount / tTrade.buyNetValue
  const sellShares = tTrade.sellAmount / tTrade.sellNetValue

  const trades = getTrades()
  trades.push(
    {
      ...tTrade.buyTrade,
      id: generateId(),
      shares: buyShares,
      amount: tTrade.buyAmount
    },
    {
      ...tTrade.sellTrade,
      id: generateId(),
      shares: sellShares,
      amount: tTrade.sellAmount
    }
  )
  saveTrades(trades)

  // 从T交易归档中移除
  saveTTrades(tTrades.filter(t => t.id !== tTradeId))
}

// ========== 星标K线列表 ==========

/**
 * 获取星标K线的基金代码列表
 */
export function getStarredFunds(): string[] {
  return getItem<string[]>(STORAGE_KEYS.STARRED_FUNDS, [])
}

/**
 * 保存星标K线列表
 */
export function saveStarredFunds(codes: string[]): void {
  setItem(STORAGE_KEYS.STARRED_FUNDS, codes)
}

/**
 * 添加基金到星标K线列表
 */
export function addStarredFund(code: string): void {
  const list = getStarredFunds()
  if (!list.includes(code)) {
    list.unshift(code)
    saveStarredFunds(list)
  }
}

/**
 * 从星标K线列表移除基金
 */
export function removeStarredFund(code: string): void {
  const list = getStarredFunds()
  const index = list.indexOf(code)
  if (index > -1) {
    list.splice(index, 1)
    saveStarredFunds(list)
  }
}

/**
 * 检查基金是否在星标K线列表中
 */
export function isStarredFund(code: string): boolean {
  return getStarredFunds().includes(code)
}
