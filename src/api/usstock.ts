// [WHY] 美股实时行情 API，使用 Yahoo Finance 免费接口
// [WHAT] 获取美股市场股票实时行情数据
// [DEPS] Yahoo Finance query1.finance.yahoo.com

import { cache, CACHE_TTL } from './cache'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import type { USStockQuote } from '@/types/usstock'

// ========== 并发控制（复用 astock.ts 模式） ==========
const MAX_CONCURRENT = 5
let activeRequests = 0
const requestQueue: (() => void)[] = []

function executeNext() {
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift()
    if (next) next()
  }
}

function withConcurrencyControl<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeRequests++
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      } finally {
        activeRequests--
        executeNext()
      }
    }

    if (activeRequests < MAX_CONCURRENT) {
      execute()
    } else {
      requestQueue.push(execute)
    }
  })
}

// ========== Yahoo Finance API 响应解析 ==========

/**
 * 解析 Yahoo Finance API 响应
 * [WHAT] 响应格式：JSON
 * URL: https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d
 */
function parseYahooFinanceResponse(data: any, symbol: string): USStockQuote | null {
  try {
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta
    if (!meta) return null

    const currentPrice = meta.regularMarketPrice || 0
    const prevClose = meta.previousClose || meta.chartPreviousClose || 0
    const change = currentPrice - prevClose
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

    const quote = result.indicators?.quote?.[0]
    const volume = quote?.volume?.[quote.volume.length - 1] || meta.regularMarketVolume || 0

    return {
      symbol: meta.symbol || symbol.toUpperCase(),
      name: meta.shortName || meta.longName || symbol.toUpperCase(),
      currentPrice,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      open: meta.regularMarketOpen || quote?.open?.[quote.open.length - 1] || 0,
      high: meta.regularMarketDayHigh || quote?.high?.[quote.high.length - 1] || 0,
      low: meta.regularMarketDayLow || quote?.low?.[quote.low.length - 1] || 0,
      prevClose,
      volume: volume,
      amount: volume * currentPrice, // 估算成交额
      bidPrice: meta.regularMarketPrice || 0,
      askPrice: meta.regularMarketPrice || 0,
      marketState: meta.marketState || 'REGULAR',
      currency: meta.currency || 'USD',
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()
    }
  } catch (err) {
    logger.error('[usstock] 解析 Yahoo Finance 响应失败', { symbol, error: err })
    return null
  }
}

// ========== 主要 API 函数 ==========

/**
 * 获取美股实时行情（批量查询）
 * [WHAT] 支持同时查询多只股票，每个股票单独请求（Yahoo Finance 限制）
 * @param symbols 股票代码数组（如：['AAPL', 'TSLA']）
 * @returns 美股行情数据数组
 */
export async function fetchUSStockQuote(symbols: string[]): Promise<USStockQuote[]> {
  if (!symbols || symbols.length === 0) {
    return []
  }

  // 格式化股票代码（确保大写）
  const formattedSymbols = symbols.map(s => formatUSSymbol(s))
  
  // 检查缓存（使用股票代码作为缓存 key 的一部分）
  const cacheKey = `usstock_${formattedSymbols.join(',')}`
  const cached = cache.get<USStockQuote[]>(cacheKey)
  if (cached) return cached

  // 批量查询：为每个股票发起请求
  const results: USStockQuote[] = []
  const errors: Error[] = []

  for (const symbol of formattedSymbols) {
    try {
      const quote = await fetchSingleUSStockInternal(symbol)
      if (quote) {
        results.push(quote)
      }
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)))
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw errors[0]
  }

  // 缓存 3 秒（股票行情变化快）
  cache.set(cacheKey, results, 3)

  return results
}

/**
 * 内部函数：获取单只美股实时行情
 */
async function fetchSingleUSStockInternal(symbol: string): Promise<USStockQuote | null> {
  return withConcurrencyControl(async () => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`

      const data = await http.json(url)

      if (!data) {
        throw new Error('Yahoo Finance API 返回为空')
      }

      const quote = parseYahooFinanceResponse(data, symbol)
      return quote
    } catch (err) {
      logger.error('[usstock] 获取美股行情失败', { symbol, error: err })
      throw err
    }
  })
}

/**
 * 获取单只美股实时行情
 * [WHAT] 封装单只股票查询
 */
export async function fetchSingleUSStock(symbol: string): Promise<USStockQuote | null> {
  try {
    const formattedSymbol = formatUSSymbol(symbol)
    return await fetchSingleUSStockInternal(formattedSymbol)
  } catch (err) {
    logger.error('[usstock] 获取单只美股行情失败', { symbol, error: err })
    return null
  }
}

/**
 * 格式化美股代码
 * [WHAT] 将股票代码转换为标准格式（大写）
 * @param code 股票代码（如：aapl、tsla、AAPL）
 * @returns 标准格式代码（如：AAPL）
 */
export function formatUSSymbol(code: string): string {
  const trimmed = code.trim()
  if (trimmed.length === 0) return ''

  // 美股代码通常是 1-5 位字母，转换为大写
  return trimmed.toUpperCase()
}

/**
 * 批量格式化美股代码
 */
export function formatUSSymbols(codes: string[]): string[] {
  return codes.map(code => formatUSSymbol(code)).filter(Boolean)
}

// ========== 默认导出 ==========

export default {
  fetchUSStockQuote,
  fetchSingleUSStock,
  formatUSSymbol,
  formatUSSymbols
}
