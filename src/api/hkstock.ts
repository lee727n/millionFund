// [WHY] 港股实时行情 API，使用新浪财经免费接口
// [WHAT] 获取港股市场股票实时行情数据
// [DEPS] 新浪财经 hq.sinajs.cn

import { cache, CACHE_TTL } from './cache'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import type { HKStockQuote } from '@/types/hkstock'

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

// ========== 新浪财经港股 API 响应解析 ==========

/**
 * 解析新浪财经港股行情响应文本
 * [WHAT] 响应格式：var hq_str_hk00700="腾讯控股,345.00,1.23,0.10,100,1234567,...";
 * 
 * 字段说明（逗号分隔）：
 * 0: 股票名称
 * 1: 当前价格
 * 2: 涨跌额
 * 3: 涨跌幅（%）
 * 4: 成交量（手）
 * 5: 成交额（港元）
 * 6: 买一价
 * 7: 卖一价
 * 8: 今日开盘价
 * 9: 今日最高价
 * 10: 今日最低价
 * 11: 昨日收盘价
 */
function parseSinaHKResponse(text: string, symbols: string[]): HKStockQuote[] {
  const results: HKStockQuote[] = []
  const now = Date.now()

  // 按行分割，每行对应一个股票的响应
  const lines = text.split('\n').filter(line => line.trim())

  for (const line of lines) {
    // 匹配 var hq_str_hkxxxx="..." 格式
    const match = line.match(/var hq_str_([^=]+)="([^"]*)"/)
    if (!match) continue

    const symbol = match[1]!
    const dataStr = match[2]!

    if (!dataStr) continue

    const parts = dataStr.split(',')

    // 确保数据足够（至少需要 12 个字段）
    if (parts.length < 12) continue

    const name = parts[0] || ''
    const currentPrice = parseFloat(parts[1] || '0') || 0
    const change = parseFloat(parts[2] || '0') || 0
    const changePercent = parseFloat(parts[3] || '0') || 0
    const volume = parseInt(parts[4] || '0') || 0
    const amount = parseFloat(parts[5] || '0') || 0
    const bidPrice = parseFloat(parts[6] || '0') || 0
    const askPrice = parseFloat(parts[7] || '0') || 0
    const open = parseFloat(parts[8] || '0') || 0
    const high = parseFloat(parts[9] || '0') || 0
    const low = parseFloat(parts[10] || '0') || 0
    const prevClose = parseFloat(parts[11] || '0') || 0

    results.push({
      symbol: `hk${symbol.replace(/^hk/i, '')}`,
      name,
      currentPrice,
      change,
      changePercent: parseFloat(changePercent.toFixed(2)),
      open,
      high,
      low,
      prevClose,
      volume,
      amount,
      bidPrice,
      askPrice,
      timestamp: now
    })
  }

  return results
}

// ========== 主要 API 函数 ==========

/**
 * 获取港股实时行情（批量查询）
 * [WHAT] 支持同时查询多只港股，逗号分隔股票代码
 * @param symbols 股票代码数组（如：['hk00700', 'hk09988']）
 * @returns 港股行情数据数组
 */
export async function fetchHKStockQuote(symbols: string[]): Promise<HKStockQuote[]> {
  if (!symbols || symbols.length === 0) {
    return []
  }

  // 格式化股票代码（确保有 hk 前缀）
  const formattedSymbols = symbols.map(s => formatHKSymbol(s))
  
  // 检查缓存（使用股票代码作为缓存 key 的一部分）
  const cacheKey = `hkstock_${formattedSymbols.join(',')}`
  const cached = cache.get<HKStockQuote[]>(cacheKey)
  if (cached) return cached

  return withConcurrencyControl(async () => {
    try {
      // 拼接股票代码（逗号分隔）
      const symbolStr = formattedSymbols.join(',')
      const url = `https://hq.sinajs.cn/list=${symbolStr}`

      const text = await http.text(url)

      if (!text) {
        throw new Error('新浪财经港股 API 返回为空')
      }

      const results = parseSinaHKResponse(text, formattedSymbols)

      // 缓存 3 秒（股票行情变化快）
      cache.set(cacheKey, results, 3)

      return results
    } catch (err) {
      logger.error('[hkstock] 获取港股行情失败', { symbols, error: err })
      throw err
    }
  })
}

/**
 * 获取单只港股实时行情
 * [WHAT] 封装单只股票查询
 */
export async function fetchSingleHKStock(symbol: string): Promise<HKStockQuote | null> {
  try {
    const results = await fetchHKStockQuote([symbol])
    return results.length > 0 ? results[0]! : null
  } catch (err) {
    logger.error('[hkstock] 获取单只港股行情失败', { symbol, error: err })
    return null
  }
}

/**
 * 格式化港股代码为新浪格式
 * [WHAT] 将普通港股代码转换为新浪 API 所需格式
 * @param code 港股代码（如：00700、09988、700、9988）
 * @returns 新浪格式代码（如：hk00700、hk09988）
 */
export function formatHKSymbol(code: string): string {
  const trimmed = code.trim()
  if (trimmed.length === 0) return ''

  // 如果已经包含 hk 前缀，直接返回（统一小写）
  if (/^hk/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  // 补全为 5 位数（新浪格式）
  // 港股代码通常是 4-5 位数字，需要补零到 5 位
  const numericPart = trimmed.replace(/[^0-9]/g, '')
  const paddedCode = numericPart.padStart(5, '0')
  
  return `hk${paddedCode}`
}

/**
 * 批量格式化港股代码
 */
export function formatHKSymbols(codes: string[]): string[] {
  return codes.map(code => formatHKSymbol(code)).filter(Boolean)
}

// ========== 默认导出 ==========

export default {
  fetchHKStockQuote,
  fetchSingleHKStock,
  formatHKSymbol,
  formatHKSymbols
}
