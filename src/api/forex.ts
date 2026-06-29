// [WHY] 外汇行情 API - 支持主要货币对实时汇率
// [WHAT] 提供 USD/CNY、EUR/CNY、GBP/CNY、JPY/CNY 等实时汇率数据，含缓存
// [DEPS] 使用 ExchangeRate-API（免费）或新浪财经

import { http } from '@/utils/http'
import { logger } from '@/utils/logger'
import { getCache, setCache } from '@/api/cache'

const CACHE_TTL = 300 // 缓存 5 分钟（外汇汇率变化较慢）

/**
 * 外汇行情数据
 */
export interface ForexQuote {
  pair: string        // 货币对：USDCNY、EURCNY
  base: string        // 基础货币：USD、EUR
  quote: string      // 报价货币：CNY
  rate: number        // 汇率
  change: number    // 24h 涨跌
  changePercent: number // 24h 涨跌幅 %
  updateTime: string // 更新时间
}

/**
 * 常用货币对
 */
export const FOREX_PAIRS = {
  USDCNY: 'USDCNY',   // 美元/人民币
  EURCNY: 'EURCNY',   // 欧元/人民币
  GBCNY: 'GBCNY',     // 英镑/人民币
  JPYCNY: 'JPYCNY',   // 日元/人民币（100日元）
  AUDCNY: 'AUDCNY',   // 澳元/人民币
  CADCNY: 'CADCNY',   // 加元/人民币
  SGDCNY: 'SGDCNY',     // 新加坡元/人民币
  HKDUSD: 'HKDUSD',   // 港币/美元
}

const CACHE_PREFIX = 'forex:'

/**
 * 获取实时汇率（单货币对）
 * 返回 null 表示获取失败（不返回兜底数据）
 */
export async function fetchForexRate(pair: string): Promise<ForexQuote | null> {
  // 先查缓存
  const cacheKey = `${CACHE_PREFIX}${pair}`
  const cached = getCache<ForexQuote>(cacheKey)
  if (cached) return cached

  try {
    const base = pair.replace(/CNY$/, '')
    const url = `https://open.er-api.com/v6/latest/${base}`

    const response = await http.get<any>(url)

    if (response && response.rates) {
      const quote = 'CNY'
      const rate = response.rates[quote]

      if (rate) {
        const result: ForexQuote = {
          pair,
          base,
          quote,
          rate,
          change: 0,
          changePercent: 0,
          updateTime: response.time_last_update_utc || new Date().toISOString()
        }
        setCache(cacheKey, result, CACHE_TTL)
        return result
      }
    }

    return null
  } catch (error) {
    logger.error('[forex] 获取汇率失败', { pair, error })
    return null
  }
}

/**
 * 获取实时汇率（批量）
 */
export async function fetchForexRates(pairs: string[]): Promise<ForexQuote[]> {
  try {
    const results: ForexQuote[] = []
    const toFetch: string[] = []

    // 先查缓存
    for (const pair of pairs) {
      const cacheKey = `${CACHE_PREFIX}${pair}`
      const cached = getCache<ForexQuote>(cacheKey)
      if (cached) {
        results.push(cached)
      } else {
        toFetch.push(pair)
      }
    }

    if (toFetch.length === 0) return results

    // 按基础货币分组（减少 API 调用）
    const baseGroups: Record<string, string[]> = {}
    toFetch.forEach(pair => {
      const base = pair.replace(/CNY$/, '')
      if (!baseGroups[base]) baseGroups[base] = []
      baseGroups[base].push(pair)
    })

    // 并发请求未缓存的货币对
    for (const [base, pairList] of Object.entries(baseGroups)) {
      const url = `https://open.er-api.com/v6/latest/${base}`

      try {
        const response = await http.get<any>(url)

        if (response && response.rates) {
          pairList.forEach(pair => {
            const rate = response.rates['CNY']
            if (rate) {
              const result: ForexQuote = {
                pair,
                base,
                quote: 'CNY',
                rate,
                change: 0,
                changePercent: 0,
                updateTime: response.time_last_update_utc || new Date().toISOString()
              }
              results.push(result)
              setCache(`${CACHE_PREFIX}${pair}`, result, CACHE_TTL)
            }
          })
        }
      } catch (err) {
        logger.warn('[forex] 获取汇率失败', { base, error: err })
      }
    }

    return results
  } catch (error) {
    logger.error('[forex] 批量获取汇率失败', { pairs, error })
    return []
  }
}

/**
 * 获取人民币中间价（人行数据）
 * [WHAT] 获取中国人民银行公布的汇率中间价
 */
export async function fetchPBOCentralParity(): Promise<Record<string, number>> {
  try {
    const url = 'https://hq.sinajs.cn/rn=https://finance.sina.com.cn/money/forex/hq/USDCNY.js'
    const response = await http.get<string>(url)

    if (response && typeof response === 'string') {
      const result: Record<string, number> = {}
      const lines = response.split('\n')

      lines.forEach(line => {
        const match = line.match(/var (\w+)="([^"]+)"/)
        if (match) {
          const [, code, data] = match
          const parts = data.split(',')
          if (parts.length > 8) {
            result[code] = parseFloat(parts[8]) || 0
          }
        }
      })

      return result
    }

    return getFallbackPBORates()
  } catch (error) {
    logger.warn('[forex] 获取人行中间价失败，使用兜底数据', { error })
    return getFallbackPBORates()
  }
}

/**
 * 人行汇率兜底数据
 */
function getFallbackPBORates(): Record<string, number> {
  return {
    'USDCNY': 7.2450,
    'EURCNY': 7.8920,
    'GBCNY': 9.1560,
    'JPYCNY': 4.89,  // 100日元
    'AUDCNY': 4.7820,
    'CADCNY': 5.3450,
    'SGDCNY': 5.4120,
    'HKDUSD': 7.8120,
  }
}
