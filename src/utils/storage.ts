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
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && STORAGE_KEYS.CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) {
        // [WHAT] 不清除自选和持仓数据
        if (key !== STORAGE_KEYS.WATCHLIST && key !== STORAGE_KEYS.HOLDINGS) {
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
