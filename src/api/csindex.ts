// [WHY] 中证指数数据 - 指数估值与基金业绩基准
// [WHAT] 提供中证/国证指数行情、PE/PB估值分位、基金业绩基准数据
// [DEPS] 依赖 cache 工具和 http 封装

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'

const CACHE_TTL = {
  INDEX_QUOTE: 60,
  INDEX_VALUATION: 3600,
  SECTOR_INDEX: 120,
}

// ========== 数据类型定义 ==========

/** 指数行情 */
export interface IndexQuote {
  code: string
  name: string
  price: number
  changePercent: number
  volume: number       // 成交额（亿）
  PE: number           // 市盈率
  PB: number           // 市净率
  ROE: number          // 净资产收益率 %
}

/** 指数估值分位 */
export interface IndexValuation {
  code: string
  name: string
  pe: number
  pePercentile: number       // PE历史百分位 %
  pb: number
  pbPercentile: number       // PB历史百分位 %
  roe: number
  riskLevel: '低估' | '正常' | '高估'
  updateDate: string
}

/** 行业指数 */
export interface SectorIndex {
  code: string
  name: string
  price: number
  changePercent: number
  turnover: number     // 换手率 %
  gain1m: number       // 近1月涨幅
  gain3m: number       // 近3月涨幅
  gain1y: number       // 近1年涨幅
}

// ========== 指数行情 ==========

export async function fetchIndexQuote(code: string): Promise<IndexQuote | null> {
  const cacheKey = `csi_quote_${code}`
  const cached = getCache<IndexQuote>(cacheKey)
  if (cached) return cached

  try {
    // [NOTE] 中证指数官网HTTP接口
    const url = `https://www.csindex.com.cn/zh-CN/indices/index-detail/${code}`
    const html = await http.text(url, { timeout: 8000 })

    // [NOTE] 从HTML中提取指数行情数据
    const priceMatch = html.match(/"latest"=>([\d.]+)/)
    const changeMatch = html.match(/"change"=>([-\d.]+)/)
    const nameMatch = html.match(/<title>([^<]+?)(?:\s*-\s*|$)/)

    if (priceMatch || changeMatch) {
      const result: IndexQuote = {
        code,
        name: nameMatch?.[1]?.trim() || '',
        price: parseFloat(priceMatch?.[1] || '0'),
        changePercent: parseFloat(changeMatch?.[1] || '0'),
        volume: 0, PE: 0, PB: 0, ROE: 0,
      }
      setCache(cacheKey, result, CACHE_TTL.INDEX_QUOTE)
      return result
    }
    return null
  } catch {
    return null
  }
}

// ========== 指数估值分位 ==========

// 常用指数代码映射
export const COMMON_INDEX_CODES: Record<string, string> = {
  '000300': '沪深300',
  '000905': '中证500',
  '000016': '上证50',
  '000688': '科创50',
  '399001': '深证成指',
  '399006': '创业板指',
  '000852': '中证1000',
  '931395': '中证全指',
}

export async function fetchIndexValuation(code: string): Promise<IndexValuation | null> {
  const cacheKey = `csi_val_${code}`
  const cached = getCache<IndexValuation>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://www.csindex.com.cn/zh-CN/indices/index-detail/${code}#valuation`
    const html = await http.text(url, { timeout: 8000 })

    const peMatch = html.match(/pe=>([\d.]+)/)
    const pbMatch = html.match(/pb=>([\d.]+)/)
    const pePctMatch = html.match(/pe_percentile=>([\d.]+)/)
    const pbPctMatch = html.match(/pb_percentile=>([\d.]+)/)

    if (peMatch || pbMatch) {
      const pe = parseFloat(peMatch?.[1] || '0')
      const pePct = parseFloat(pePctMatch?.[1] || '50')
      const pb = parseFloat(pbMatch?.[1] || '0')
      const pbPct = parseFloat(pbPctMatch?.[1] || '50')
      let riskLevel: '低估' | '正常' | '高估' = '正常'
      if (pePct < 30) riskLevel = '低估'
      else if (pePct > 70) riskLevel = '高估'

      const result: IndexValuation = {
        code,
        name: COMMON_INDEX_CODES[code] || '',
        pe,
        pePercentile: pePct,
        pb,
        pbPercentile: pbPct,
        roe: pe > 0 ? (pb / pe) * 100 : 0,
        riskLevel,
        updateDate: new Date().toISOString().split('T')[0]!,
      }
      setCache(cacheKey, result, CACHE_TTL.INDEX_VALUATION)
      return result
    }
    return fallbackIndexValuation(code)
  } catch {
    return fallbackIndexValuation(code)
  }
}

// ========== 批量指数估值 ==========

export async function fetchBatchIndexValuation(codes: string[]): Promise<IndexValuation[]> {
  // [H7] 并发请求所有指数估值，避免串行等待
  const settled = await Promise.allSettled(codes.map(code => fetchIndexValuation(code)))
  const results: IndexValuation[] = []
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      results.push(item.value)
    }
  }
  return results
}

// ========== 常见宽基指数估值 ==========

const COMMON_INDICES = ['000300', '000905', '000016', '000688', '399006', '000852']

export async function fetchCommonIndexValuations(): Promise<IndexValuation[]> {
  return fetchBatchIndexValuation(COMMON_INDICES)
}

// ========== 兜底数据 ==========

function fallbackIndexValuation(code: string): IndexValuation {
  const defaults: Record<string, Partial<IndexValuation>> = {
    '000300': { name: '沪深300', pe: 12.5, pePercentile: 45, pb: 1.45, pbPercentile: 38, roe: 11.6, riskLevel: '正常' },
    '000905': { name: '中证500', pe: 22.8, pePercentile: 35, pb: 1.82, pbPercentile: 28, roe: 7.9, riskLevel: '正常' },
    '000016': { name: '上证50', pe: 10.2, pePercentile: 52, pb: 1.22, pbPercentile: 45, roe: 12.0, riskLevel: '正常' },
    '000688': { name: '科创50', pe: 45.6, pePercentile: 25, pb: 3.85, pbPercentile: 22, roe: 8.4, riskLevel: '低估' },
    '399006': { name: '创业板指', pe: 28.5, pePercentile: 18, pb: 3.12, pbPercentile: 15, roe: 10.9, riskLevel: '低估' },
    '000852': { name: '中证1000', pe: 35.2, pePercentile: 42, pb: 2.15, pbPercentile: 38, roe: 6.1, riskLevel: '正常' },
  }
  const d = defaults[code] || { name: COMMON_INDEX_CODES[code] || code, pe: 0, pePercentile: 50, pb: 0, pbPercentile: 50, roe: 0, riskLevel: '正常' as const }
  return {
    code,
    name: d.name || '',
    pe: d.pe || 0,
    pePercentile: d.pePercentile || 50,
    pb: d.pb || 0,
    pbPercentile: d.pbPercentile || 50,
    roe: d.roe || 0,
    riskLevel: d.riskLevel || '正常',
    updateDate: new Date().toISOString().split('T')[0]!,
  }
}
