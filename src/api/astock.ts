// [WHY] A 股实时行情 API，使用新浪财经免费接口
// [WHAT] 获取沪深两市股票实时行情数据
// [DEPS] 新浪财经 hq.sinajs.cn

import { cache } from './cache'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { ConcurrencyController } from '@/api/fund/request'
import type { AStockQuote } from '@/types/astock'

// ========== 并发控制 ==========
const requestConcurrency = new ConcurrencyController(5)

// ========== 新浪财经 API 响应解析 ==========

/**
 * 解析新浪财经行情响应文本
 * [WHAT] 响应格式：var hq_str_sh600519="贵州茅台,1234.56,1.23,0.10,100,1234567,...";
 */
export function parseSinaResponse(text: string, _symbols: string[]): AStockQuote[] {
  const results: AStockQuote[] = []

  // 按行分割，每行对应一个股票的响应
  const lines = text.split('\n').filter(line => line.trim())

  for (const line of lines) {
    // 匹配 var hq_str_xxxx="..." 格式
    const match = line.match(/var hq_str_([^=]+)="([^"]*)"/)
    if (!match) continue

    const symbol = match[1]!
    const dataStr = match[2]!

    if (!dataStr) continue

    const parts = dataStr.split(',')

    // 确保数据足够
    if (parts.length < 10) continue

    const name = parts[0] || ''
    const prevClose = parseFloat(parts[2] || '0') || 0
    const currentPrice = parseFloat(parts[3] || '0') || 0
    const open = parseFloat(parts[1] || '0') || 0
    const high = parseFloat(parts[4] || '0') || 0
    const low = parseFloat(parts[5] || '0') || 0
    const volume = parseInt(parts[8] || '0') || 0
    const amount = parseFloat(parts[9] || '0') || 0
    const bidPrice = parseFloat(parts[6] || '0') || 0
    const askPrice = parseFloat(parts[7] || '0') || 0

    const change = currentPrice - prevClose
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

    results.push({
      symbol,
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
      askPrice
    })
  }

  return results
}

// ========== 主要 API 函数 ==========

/**
 * 获取 A 股实时行情（批量查询）
 * [WHAT] 支持同时查询多只股票，逗号分隔股票代码
 * @param symbols 股票代码数组（如：['sh600519', 'sz000001']）
 * @returns A 股行情数据数组
 */
export async function fetchAStockQuote(symbols: string[]): Promise<AStockQuote[]> {
  if (!symbols || symbols.length === 0) {
    return []
  }

  // 检查缓存（使用第一个股票代码作为缓存 key 的一部分）
  const cacheKey = `astock_${symbols.join(',')}`
  const cached = cache.get<AStockQuote[]>(cacheKey)
  if (cached) return cached

  return requestConcurrency.execute(async () => {
    try {
      // 拼接股票代码（逗号分隔）
      const symbolStr = symbols.join(',')
      const url = `https://hq.sinajs.cn/list=${symbolStr}`

      const text = await http.text(url)

      if (!text) {
        throw new Error('新浪财经 API 返回为空')
      }

      const results = parseSinaResponse(text, symbols)

      // 缓存 3 秒（股票行情变化快）
      cache.set(cacheKey, results, 3)

      return results
    } catch (err) {
      logger.error('[astock] 获取 A 股行情失败', { symbols, error: err })
      throw err
    }
  })
}

/**
 * 获取单只 A 股实时行情
 * [WHAT] 封装单只股票查询
 */
export async function fetchSingleAStock(symbol: string): Promise<AStockQuote | null> {
  try {
    const results = await fetchAStockQuote([symbol])
    return results.length > 0 ? results[0]! : null
  } catch (err) {
    logger.error('[astock] 获取单只股票行情失败', { symbol, error: err })
    return null
  }
}

/**
 * 格式化股票代码为新浪格式
 * [WHAT] 将普通股票代码转换为新浪 API 所需格式
 * @param code 股票代码（如：600519、000001）
 * @returns 新浪格式代码（如：sh600519、sz000001）
 */
export function formatSymbol(code: string): string {
  const trimmed = code.trim()
  if (trimmed.length === 0) return ''

  // 如果已经包含前缀，直接返回
  if (/^(sh|sz|bj)/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  // 根据代码判断市场
  // 6 开头：上海主板、科创板
  // 9 开头：上海主板（B 股等）
  // 4/8 开头：北京证券交易所
  // 0/3 开头：深圳主板、创业板
  // 3 开头：创业板
  const firstChar = trimmed[0]
  if (firstChar === '6' || firstChar === '9') {
    return `sh${trimmed}`
  } else if (firstChar === '4' || firstChar === '8') {
    return `bj${trimmed}`
  } else {
    return `sz${trimmed}`
  }
}

/**
 * 批量格式化股票代码
 */
export function formatSymbols(codes: string[]): string[] {
  return codes.map(code => formatSymbol(code)).filter(Boolean)
}
