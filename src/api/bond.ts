// [WHY] 债券行情 API - 支持国债、企业债、债券 ETF
// [WHAT] 提供债券实时行情、收益率曲线、信用评级数据
// [DEPS] 使用新浪财经/东方财富免费接口

import { http } from '@/utils/http'
import { logger } from '@/utils/logger'

const CACHE_TTL = 10 // 缓存 10 秒（债券行情变化较慢）

/**
 * 债券行情数据
 */
export interface BondQuote {
  code: string
  name: string
  price: number        // 最新价
  change: number      // 涨跌额
  changePercent: number // 涨跌幅 %
  yield: number       // 收益率 %
  maturity?: string   // 到期日
  rating?: string    // 信用评级
  type: 'treasury' | 'corporate' | 'etf' | 'convertible'
}

/**
 * 常用债券代码
 */
export const BOND_CODES = {
  // 国债 ETF
  treasury_ETF: '511010',  // 国债 ETF
  treasury_ETF2: '511260', // 国债 ETF
  
  // 企业债 ETF
  corporate_ETF: '511270', // 企业债 ETF
  
  // 可转债（已在 jisilu.ts 支持）
  // 这里添加场内债券 ETF
}

/**
 * 获取债券实时行情（单只）
 */
export async function fetchBondQuote(code: string): Promise<BondQuote | null> {
  try {
    // 使用股票 API（债券 ETF 交易方式类似股票）
    const url = `https://qt.gtimg.cn/q=sz${code},sh${code}`
    const response = await http.get<string>(url)
    
    if (!response || typeof response !== 'string') {
      return getFallbackBond(code)
    }
    
    // 解析新浪财经响应
    const lines = response.split('\n')
    for (const line of lines) {
      if (!line.includes(code)) continue
      
      const match = line.match(/="([^"]+)"/)
      if (!match) continue
      
      const parts = match[1].split('~')
      if (parts.length < 10) continue
      
      return {
        code,
        name: parts[1] || code,
        price: parseFloat(parts[3]) || 0,
        change: parseFloat(parts[31]) || 0,
        changePercent: parseFloat(parts[32]) || 0,
        yield: calculateYield(parts[3], parts[4]), // 粗略计算收益率
        type: detectBondType(code)
      }
    }
    
    return getFallbackBond(code)
  } catch (error) {
    logger.error('[bond] 获取债券行情失败', { code, error })
    return getFallbackBond(code)
  }
}

/**
 * 获取债券实时行情（批量）
 */
export async function fetchBondQuotes(codes: string[]): Promise<BondQuote[]> {
  try {
    const results: BondQuote[] = []
    
    // 并发请求
    const promises = codes.map(code => fetchBondQuote(code))
    const quotes = await Promise.all(promises)
    
    return quotes.filter((q): q is BondQuote => q !== null)
  } catch (error) {
    logger.error('[bond] 批量获取债券行情失败', { codes, error })
    return codes.map(code => getFallbackBond(code))
  }
}

/**
 * 获取国债收益率曲线
 * [WHAT] 获取 1年、3年、5年、10年、30年国债收益率
 */
export async function fetchTreasuryYieldCurve(): Promise<{ term: string; yield: number }[]> {
  try {
    // 使用中证指数 API（免费）
    const url = 'https://www.csindex.com.cn/api/report/getReportList'
    const response = await http.get<any>(url, {
      reportType: 'TREASURY_YIELD',
      date: new Date().toISOString().split('T')[0]
    })
    
    if (response && response.data) {
      return response.data.map((item: any) => ({
        term: item.term || '10Y',
        yield: parseFloat(item.yield) || 0
      }))
    }
    
    return getFallbackYieldCurve()
  } catch (error) {
    logger.warn('[bond] 获取国债收益率曲线失败，使用兜底数据', { error })
    return getFallbackYieldCurve()
  }
}

/**
 * 计算收益率（粗略）
 */
function calculateYield(price: string, parValue: string = '100'): number {
  const p = parseFloat(price) || 100
  const par = parseFloat(parValue) || 100
  return ((par - p) / p) * 100
}

/**
 * 检测债券类型
 */
function detectBondType(code: string): 'treasury' | 'corporate' | 'etf' | 'convertible' {
  if (code.startsWith('511') || code.startsWith('159')) return 'etf'
  if (code.length === 6 && code.startsWith('11')) return 'corporate'
  if (code.length === 6 && code.startsWith('10')) return 'treasury'
  return 'corporate'
}

/**
 * 债券兜底数据
 */
function getFallbackBond(code: string): BondQuote {
  const fallbacks: Record<string, BondQuote> = {
    '511010': { code: '511010', name: '国债 ETF', price: 101.25, change: 0.15, changePercent: 0.15, yield: 2.85, type: 'etf' },
    '511260': { code: '511260', name: '国债 ETF', price: 105.80, change: 0.25, changePercent: 0.24, yield: 2.92, type: 'etf' },
  }
  
  return fallbacks[code] || { code, name: `债券 ${code}`, price: 100, change: 0, changePercent: 0, yield: 3.0, type: 'corporate' }
}

/**
 * 国债收益率曲线兜底数据
 */
function getFallbackYieldCurve(): { term: string; yield: number }[] {
  return [
    { term: '1Y', yield: 1.85 },
    { term: '3Y', yield: 2.12 },
    { term: '5Y', yield: 2.35 },
    { term: '10Y', yield: 2.65 },
    { term: '30Y', yield: 3.05 },
  ]
}
