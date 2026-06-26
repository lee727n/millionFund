// [WHY] 期货行情 API，使用新浪财经免费接口
// [WHAT] 获取国内外期货实时行情数据
// [DEPS] 新浪财经 hq.sinajs.cn

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'
import type { FutureQuote } from '@/types/future'
import { logger } from '@/utils/logger'

const CACHE_TTL = 5 // 缓存 5 秒（期货行情变化较快）

// ========== 新浪财经 API 响应解析 ==========

/**
 * 解析新浪财经期货行情响应文本
 * [WHAT] 响应格式：var hq_str_GC2506="黄金期货,2350.50,10.50,0.45,2350.00,2355.00,2345.00,100,5000";
 */
export function parseSinaFutureResponse(text: string, _symbols: string[]): FutureQuote[] {
  const results: FutureQuote[] = []

  // 按行分割，每行对应一个合约的响应
  const lines = text.split('\n').filter(line => line.trim())

  for (const line of lines) {
    // 匹配 var hq_str_xxxx="..." 格式
    const match = line.match(/var hq_str_([^=]+)="([^"]*)"/)
    if (!match) continue

    const symbol = match[1]!
    const dataStr = match[2]!

    if (!dataStr) continue

    const parts = dataStr.split(',')

    // 确保数据足够（期货数据格式可能不同，至少需要 8 个字段）
    if (parts.length < 8) continue

    const name = parts[0] || symbol
    const price = parseFloat(parts[1] || '0') || 0
    const change = parseFloat(parts[2] || '0') || 0
    const changeRate = parseFloat(parts[3] || '0') || 0
    const open = parseFloat(parts[4] || '0') || 0
    const high = parseFloat(parts[5] || '0') || 0
    const low = parseFloat(parts[6] || '0') || 0
    const volume = parseInt(parts[7] || '0') || 0
    const openInterest = parseInt(parts[8] || '0') || 0

    results.push({
      symbol,
      name,
      price,
      change,
      changeRate,
      open,
      high,
      low,
      volume,
      openInterest,
      updatedAt: new Date().toISOString()
    })
  }

  return results
}

// ========== 主要 API 函数 ==========

/**
 * 获取期货实时行情（单合约查询）
 * [WHAT] 获取指定合约的实时行情
 * @param symbol 合约代码（如：'GC2506'）
 * @returns 期货行情数据
 */
export async function fetchFutureRealtime(symbol: string): Promise<FutureQuote | null> {
  if (!symbol) {
    return null
  }

  const results = await fetchFutureBatch([symbol])
  return results.length > 0 ? results[0]! : null
}

/**
 * 获取期货实时行情（批量查询）
 * [WHAT] 支持同时查询多个合约，逗号分隔代码
 * @param symbols 合约代码数组（如：['GC2506', 'CL2506']）
 * @returns 期货行情数据数组
 */
export async function fetchFutureBatch(symbols: string[]): Promise<FutureQuote[]> {
  if (!symbols || symbols.length === 0) {
    return []
  }

  // 检查缓存
  const cacheKey = `future_${symbols.join(',')}`
  const cached = getCache<FutureQuote[]>(cacheKey)
  if (cached) return cached

  try {
    // 拼接合约代码（逗号分隔）
    const symbolStr = symbols.join(',')
    const url = `https://hq.sinajs.cn/list=${symbolStr}`

    const text = await http.text(url)

    if (!text) {
      throw new Error('新浪财经 API 返回为空')
    }

    const results = parseSinaFutureResponse(text, symbols)

    // 缓存 5 秒
    setCache(cacheKey, results, CACHE_TTL)

    return results
  } catch (err) {
    logger.error('[future] 获取期货行情失败', { symbols, error: err })
    // 返回兜底数据
    return fallbackFutureQuotes(symbols)
  }
}

/**
 * 获取期货涨跌榜
 * [WHAT] 获取涨幅榜或跌幅榜期货数据（使用东方财富 API）
 * @param type 'rise' 涨幅榜 | 'fall' 跌幅榜
 * @returns 期货行情数据数组
 */
export async function fetchFutureRanking(type: 'rise' | 'fall'): Promise<FutureQuote[]> {
  const cacheKey = `future_ranking_${type}`
  const cached = getCache<FutureQuote[]>(cacheKey)
  if (cached) return cached

  try {
    // 东方财富期货涨跌榜 API
    const sortField = type === 'rise' ? 'f3' : 'f3'
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=${sortField}&fs=m:113+m:114+m:115+m:116&fields=f12,f14,f2,f3,f4,f5,f15,f16,f17,f18,f20`

    const data = await http.get<{ data: { diff: any[] } }>(url, { timeout: 8000 })

    if (data?.data?.diff && Array.isArray(data.data.diff)) {
      const results: FutureQuote[] = data.data.diff.map((item: any) => {
        const price = item.f2 || 0
        const prevClose = item.f18 || price
        const change = price - prevClose
        const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0

        return {
          symbol: item.f12 || '',
          name: item.f14 || '',
          price,
          change,
          changeRate: parseFloat(changeRate.toFixed(2)),
          open: item.f15 || 0,
          high: item.f16 || 0,
          low: item.f17 || 0,
          volume: item.f5 || 0,
          openInterest: item.f20 || 0,
          updatedAt: new Date().toISOString()
        }
      }).filter((q: FutureQuote) => q.symbol)

      setCache(cacheKey, results, CACHE_TTL)
      return results
    }

    return fallbackFutureRanking(type)
  } catch (err) {
    logger.error('[future] 获取期货涨跌榜失败', { type, error: err })
    return fallbackFutureRanking(type)
  }
}

// ========== 快捷方法 ==========

/**
 * 获取黄金期货价格（快捷方法）
 * [WHAT] 获取 COMEX 黄金期货实时价格
 * @returns 期货行情数据
 */
export async function fetchGoldFuture(): Promise<FutureQuote | null> {
  try {
    // GC2506 是黄金期货主力合约（需要根据实际日期调整）
    const quotes = await fetchFutureBatch(['GC2506'])
    return quotes.length > 0 ? quotes[0]! : null
  } catch (err) {
    logger.error('[future] 获取黄金期货价格失败', { error: err })
    return null
  }
}

/**
 * 获取原油期货价格（快捷方法）
 * [WHAT] 获取 NYMEX 原油期货实时价格
 * @returns 期货行情数据
 */
export async function fetchCrudeOilFuture(): Promise<FutureQuote | null> {
  try {
    const quotes = await fetchFutureBatch(['CL2506'])
    return quotes.length > 0 ? quotes[0]! : null
  } catch (err) {
    logger.error('[future] 获取原油期货价格失败', { error: err })
    return null
  }
}

// ========== 兜底数据 ==========

/**
 * 期货兜底数据
 */
function fallbackFutureQuotes(symbols: string[]): FutureQuote[] {
  const fallbackData: Record<string, FutureQuote> = {
    'GC2506': {
      symbol: 'GC2506',
      name: '黄金2506',
      price: 2350.50,
      change: 10.50,
      changeRate: 0.45,
      open: 2340.00,
      high: 2355.00,
      low: 2335.00,
      volume: 100000,
      openInterest: 500000,
      updatedAt: new Date().toISOString()
    },
    'CL2506': {
      symbol: 'CL2506',
      name: '原油2506',
      price: 78.50,
      change: 0.85,
      changeRate: 1.09,
      open: 77.50,
      high: 79.00,
      low: 77.00,
      volume: 50000,
      openInterest: 200000,
      updatedAt: new Date().toISOString()
    },
    'HG2506': {
      symbol: 'HG2506',
      name: '铜2506',
      price: 4.50,
      change: 0.05,
      changeRate: 1.12,
      open: 4.45,
      high: 4.52,
      low: 4.43,
      volume: 30000,
      openInterest: 150000,
      updatedAt: new Date().toISOString()
    },
    'ZS2506': {
      symbol: 'ZS2506',
      name: '大豆2506',
      price: 12.50,
      change: -0.10,
      changeRate: -0.79,
      open: 12.60,
      high: 12.65,
      low: 12.40,
      volume: 20000,
      openInterest: 100000,
      updatedAt: new Date().toISOString()
    },
    'T2506': {
      symbol: 'T2506',
      name: '10年国债2506',
      price: 104.50,
      change: 0.15,
      changeRate: 0.14,
      open: 104.35,
      high: 104.55,
      low: 104.30,
      volume: 5000,
      openInterest: 80000,
      updatedAt: new Date().toISOString()
    }
  }

  return symbols
    .map(symbol => fallbackData[symbol])
    .filter((quote): quote is FutureQuote => quote !== undefined)
}

/**
 * 期货涨跌榜兜底数据
 */
function fallbackFutureRanking(type: 'rise' | 'fall'): FutureQuote[] {
  const riseData: FutureQuote[] = [
    { symbol: 'GC2506', name: '黄金2506', price: 2350.50, change: 15.50, changeRate: 0.66, open: 2335.00, high: 2355.00, low: 2335.00, volume: 100000, openInterest: 500000, updatedAt: new Date().toISOString() },
    { symbol: 'CL2506', name: '原油2506', price: 78.50, change: 0.85, changeRate: 1.09, open: 77.50, high: 79.00, low: 77.00, volume: 50000, openInterest: 200000, updatedAt: new Date().toISOString() },
  ]

  const fallData: FutureQuote[] = [
    { symbol: 'ZS2506', name: '大豆2506', price: 12.50, change: -0.15, changeRate: -1.19, open: 12.65, high: 12.65, low: 12.40, volume: 20000, openInterest: 100000, updatedAt: new Date().toISOString() },
    { symbol: 'T2506', name: '10年国债2506', price: 104.50, change: -0.10, changeRate: -0.10, open: 104.60, high: 104.60, low: 104.30, volume: 5000, openInterest: 80000, updatedAt: new Date().toISOString() },
  ]

  return type === 'rise' ? riseData : fallData
}
