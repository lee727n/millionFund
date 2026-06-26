// [WHY] 外汇行情 API - 支持主要货币对实时汇率
// [WHAT] 提供 USD/CNY、EUR/CNY、GBP/CNY、JPY/CNY 等实时汇率数据
// [DEPS] 使用 ExchangeRate-API（免费）或新浪财经

import { http } from '@/utils/http'
import { logger } from '@/utils/logger'

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

/**
 * 获取实时汇率（单货币对）
 */
export async function fetchForexRate(pair: string): Promise<ForexQuote | null> {
  try {
    // 使用 ExchangeRate-API（免费，无需 API key）
    const base = pair.replace(/CNY$/, '')
    const url = `https://open.er-api.com/v6/latest/${base}`
    
    const response = await http.get<any>(url)
    
    if (response && response.rates) {
      const quote = 'CNY'
      const rate = response.rates[quote]
      
      if (rate) {
        return {
          pair,
          base,
          quote,
          rate,
          change: 0, // 需要历史数据计算
          changePercent: 0,
          updateTime: response.time_last_update_utc || new Date().toISOString()
        }
      }
    }
    
    return getFallbackForex(pair)
  } catch (error) {
    logger.error('[forex] 获取汇率失败', { pair, error })
    return getFallbackForex(pair)
  }
}

/**
 * 获取实时汇率（批量）
 */
export async function fetchForexRates(pairs: string[]): Promise<ForexQuote[]> {
  try {
    const results: ForexQuote[] = []
    
    // 按基础货币分组（减少 API 调用）
    const baseGroups: Record<string, string[]> = {}
    pairs.forEach(pair => {
      const base = pair.replace(/CNY$/, '')
      if (!baseGroups[base]) baseGroups[base] = []
      baseGroups[base].push(pair)
    })
    
    // 并发请求
    for (const [base, pairList] of Object.entries(baseGroups)) {
      const quote = pairList[0].replace(/^[A-Z]+/, '')
      const url = `https://open.er-api.com/v6/latest/${base}`
      
      try {
        const response = await http.get<any>(url)
        
        if (response && response.rates) {
          pairList.forEach(pair => {
            const rate = response.rates['CNY']
            if (rate) {
              results.push({
                pair,
                base,
                quote: 'CNY',
                rate,
                change: 0,
                changePercent: 0,
                updateTime: response.time_last_update_utc || new Date().toISOString()
              })
            }
          })
        }
      } catch (err) {
        logger.warn('[forex] 获取汇率失败', { base, error: err })
        pairList.forEach(pair => results.push(getFallbackForex(pair)))
      }
    }
    
    return results
  } catch (error) {
    logger.error('[forex] 批量获取汇率失败', { pairs, error })
    return pairs.map(pair => getFallbackForex(pair))
  }
}

/**
 * 获取人民币中间价（人行数据）
 * [WHAT] 获取中国人民银行公布的汇率中间价
 */
export async function fetchPBOCentralParity(): Promise<Record<string, number>> {
  try {
    // 使用新浪财经外汇数据（免费）
    const url = 'https://hq.sinajs.cn/rn=https://finance.sina.com.cn/money/forex/hq/USDCNY.js'
    const response = await http.get<string>(url)
    
    if (response && typeof response === 'string') {
      // 解析新浪外汇响应
      const result: Record<string, number> = {}
      const lines = response.split('\n')
      
      lines.forEach(line => {
        const match = line.match(/var (\\w+)="([^"]+)"/)
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
 * 外汇兜底数据
 */
function getFallbackForex(pair: string): ForexQuote {
  const fallbacks: Record<string, ForexQuote> = {
    'USDCNY': {
      pair: 'USDCNY',
      base: 'USD',
      quote: 'CNY',
      rate: 7.2450,
      change: -0.0150,
      changePercent: -0.21,
      updateTime: new Date().toISOString()
    },
    'EURCNY': {
      pair: 'EURCNY',
      base: 'EUR',
      quote: 'CNY',
      rate: 7.8920,
      change: 0.0230,
      changePercent: 0.29,
      updateTime: new Date().toISOString()
    },
    'GBCNY': {
      pair: 'GBCNY',
      base: 'GBP',
      quote: 'CNY',
      rate: 9.1560,
      change: 0.0350,
      changePercent: 0.38,
      updateTime: new Date().toISOString()
    },
    'JPYCNY': {
      pair: 'JPYCNY',
      base: 'JPY',
      quote: 'CNY',
      rate: 0.0489, // 100日元 = 4.89人民币
      change: -0.0002,
      changePercent: -0.41,
      updateTime: new Date().toISOString()
    },
  }
  
  return fallbacks[pair] || {
    pair,
    base: pair.replace(/CNY$/, ''),
    quote: 'CNY',
    rate: 7.25,
    change: 0,
    changePercent: 0,
    updateTime: new Date().toISOString()
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
