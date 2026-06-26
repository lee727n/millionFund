// [WHY] 集思录数据 - 可转债/REITs/基金折溢价套利数据
// [WHAT] 提供可转债行情、LOF基金折溢价、REITs数据
// [DEPS] 依赖 cache 工具和 http 封装

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'
import type { ConvertibleBond } from '@/types/convertible'

const CACHE_TTL = {
  CONVERTIBLE: 60,
  LOF_PREMIUM: 60,
  REITS: 120,
  FUND_LADDER: 120,
}

// ========== 数据类型定义 ==========

/** 可转债行情 */
export interface ConvertibleBond {
  code: string
  name: string
  price: number          // 现价
  change: number         // 涨跌额
  changePercent: number  // 涨跌幅 %
  premiumRate: number    // 溢价率 %
  residualDuration: number // 剩余年限（年）
  remainingSize: number  // 剩余规模（亿）
  rating: string         // 评级
  callDays: number       // 距到期天数
  ytm: number            // 到期税前收益率 %
}

/** LOF基金折溢价 */
export interface LofPremium {
  code: string
  name: string
  nav: number            // 净值
  marketPrice: number    // 交易价格
  premium: number        // 溢价率 %
  volume: number         // 成交量（万手）
  type: 'stock' | 'bond' | 'index' | 'mixed'
}

/** REITs 数据 */
export interface ReitData {
  code: string
  name: string
  price: number
  changePercent: number
  dividend: number       // 年化股息率 %
  totalReturn: number    // 上市以来总回报 %
  daysListed: number     // 上市天数
}

/** 基金排名梯度 */
export interface FundLadder {
  code: string
  name: string
  nav: number
  latestNav: number
  periodReturn: number   // 区间回报 %
  rank: number           // 排名
  total: number          // 同类总数
  type: string           // 基金类型
}

// ========== 可转债行情 ==========

export async function fetchConvertibleBonds(count = 20): Promise<ConvertibleBond[]> {
  const cacheKey = `jsl_cb_${count}`
  const cached = getCache<ConvertibleBond[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://www.jisilu.cn/data/cbnew/cb_list/?___t=${Date.now()}`
    const data = await http.post<{ rows: any[] }>(url, {
      page: 1,
      rp: count,
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.jisilu.cn/',
      },
    })

    if (data?.rows && Array.isArray(data.rows)) {
      const list: ConvertibleBond[] = data.rows.slice(0, count).map((row: any) => {
        const cell = row.cell || row
        const price = parseFloat(cell.price || '0')
        const prevClose = parseFloat(cell.prev_close || cell.price_close || '0')
        const change = prevClose > 0 ? price - prevClose : 0
        const premiumRate = parseFloat(cell.premium_rt || '0')
        // 剩余年限（年）= 距到期天数 / 365
        const residualDuration = parseInt(cell.call_days || '0') / 365

        return {
          code: cell.bond_id || '',
          name: cell.bond_nm || '',
          price,
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(cell.change_rt || '0'),
          premiumRate,
          residualDuration: parseFloat(residualDuration.toFixed(2)),
          remainingSize: parseFloat(cell.remain_size || '0'),
          rating: cell.rating_cd || '',
          callDays: parseInt(cell.call_days || '0'),
          ytm: parseFloat(cell.ytm_rt || '0'),
        }
      })
      setCache(cacheKey, list, CACHE_TTL.CONVERTIBLE)
      return list
    }
    // 兜底数据也限制数量
    return fallbackConvertibleBonds().slice(0, count)
  } catch {
    return fallbackConvertibleBonds().slice(0, count)
  }
}

/**
 * 获取可转债列表
 * [WHAT] 封装 fetchConvertibleBonds，提供更直观的命名
 * @param count 返回数量（默认 20）
 * @returns 可转债列表
 */
export async function fetchConvertibleList(count = 20): Promise<ConvertibleBond[]> {
  return fetchConvertibleBonds(count)
}

/**
 * 获取可转债实时行情
 * [WHAT] 根据转债代码批量查询实时行情
 * @param codes 转债代码数组（如：['113050', '110079']）
 * @returns 可转债行情数据数组
 */
export async function fetchConvertibleQuote(codes: string[]): Promise<ConvertibleBond[]> {
  if (!codes || codes.length === 0) {
    return []
  }

  // 检查缓存
  const cacheKey = `jsl_cb_quote_${codes.join(',')}`
  const cached = getCache<ConvertibleBond[]>(cacheKey)
  if (cached) return cached

  try {
    // 集思录 API 支持批量查询
    const url = `https://www.jisilu.cn/data/cbnew/cb_list/?___t=${Date.now()}`
    const data = await http.post<{ rows: any[] }>(url, {
      page: 1,
      rp: 100, // 获取较多数据，然后过滤
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.jisilu.cn/',
      },
    })

    if (data?.rows && Array.isArray(data.rows)) {
      const list: ConvertibleBond[] = data.rows
        .map((row: any) => {
          const cell = row.cell || row
          const bondCode = cell.bond_id || ''
          // 只返回指定的转债代码
          if (!codes.includes(bondCode)) return null

          const price = parseFloat(cell.price || '0')
          const prevClose = parseFloat(cell.prev_close || cell.price_close || '0')
          const change = prevClose > 0 ? price - prevClose : 0
          const premiumRate = parseFloat(cell.premium_rt || '0')
          const residualDuration = parseInt(cell.call_days || '0') / 365

          return {
            code: bondCode,
            name: cell.bond_nm || '',
            price,
            change: parseFloat(change.toFixed(2)),
            changePercent: parseFloat(cell.change_rt || '0'),
            premiumRate,
            residualDuration: parseFloat(residualDuration.toFixed(2)),
            remainingSize: parseFloat(cell.remain_size || '0'),
            rating: cell.rating_cd || '',
            callDays: parseInt(cell.call_days || '0'),
            ytm: parseFloat(cell.ytm_rt || '0'),
          }
        })
        .filter((item): item is ConvertibleBond => item !== null)

      setCache(cacheKey, list, CACHE_TTL.CONVERTIBLE)
      return list
    }
    return fallbackConvertibleQuotes(codes)
  } catch {
    return fallbackConvertibleQuotes(codes)
  }
}

// ========== LOF基金折溢价 ==========

export async function fetchLofPremiums(): Promise<LofPremium[]> {
  const cacheKey = 'jsl_lof_premium'
  const cached = getCache<LofPremium[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://www.jisilu.cn/data/lof/stock_list/?___t=${Date.now()}`
    const data = await http.get<{ rows: any[] }>(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.jisilu.cn/' },
    })

    if (data?.rows && Array.isArray(data.rows)) {
      const list: LofPremium[] = data.rows.map((row: any) => ({
        code: row.cell?.fund_id || '',
        name: row.cell?.fund_nm || '',
        nav: parseFloat(row.cell?.nav || '0'),
        marketPrice: parseFloat(row.cell?.price || '0'),
        premium: parseFloat(row.cell?.premium_rt || '0'),
        volume: parseFloat(row.cell?.volume || '0') / 10000,
        type: 'stock' as const,
      })).filter(f => f.name).slice(0, 15)
      setCache(cacheKey, list, CACHE_TTL.LOF_PREMIUM)
      return list
    }
    return fallbackLofPremiums()
  } catch {
    return fallbackLofPremiums()
  }
}

// ========== REITs 数据 ==========

export async function fetchReitsData(): Promise<ReitData[]> {
  const cacheKey = 'jsl_reits'
  const cached = getCache<ReitData[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://www.jisilu.cn/data/reits/list/?___t=${Date.now()}`
    const data = await http.get<{ rows: any[] }>(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.jisilu.cn/' },
    })

    if (data?.rows && Array.isArray(data.rows)) {
      const list: ReitData[] = data.rows.map((row: any) => ({
        code: row.cell?.fund_id || '',
        name: row.cell?.fund_nm || '',
        price: parseFloat(row.cell?.price || '0'),
        changePercent: parseFloat(row.cell?.change_rt || '0'),
        dividend: parseFloat(row.cell?.dividend_rt || '0'),
        totalReturn: parseFloat(row.cell?.total_return || '0'),
        daysListed: parseInt(row.cell?.days_listed || '0'),
      })).filter(r => r.name).slice(0, 15)
      setCache(cacheKey, list, CACHE_TTL.REITS)
      return list
    }
    return fallbackReitsData()
  } catch {
    return fallbackReitsData()
  }
}

// ========== 基金排名/梯度 ==========

export async function fetchFundLadder(): Promise<FundLadder[]> {
  const cacheKey = 'jsl_fund_ladder'
  const cached = getCache<FundLadder[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://www.jisilu.cn/data/fund/fund_ladder/?___t=${Date.now()}`
    const data = await http.get<{ rows: any[] }>(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.jisilu.cn/' },
    })

    if (data?.rows && Array.isArray(data.rows)) {
      const list: FundLadder[] = data.rows.slice(0, 20).map((row: any) => ({
        code: row.cell?.fund_id || '',
        name: row.cell?.fund_nm || '',
        nav: parseFloat(row.cell?.nav || '0'),
        latestNav: parseFloat(row.cell?.latest_nav || '0'),
        periodReturn: parseFloat(row.cell?.period_return || '0'),
        rank: parseInt(row.cell?.rank || '0'),
        total: parseInt(row.cell?.total || '0'),
        type: row.cell?.fund_type || '',
      })).filter(f => f.name)
      setCache(cacheKey, list, CACHE_TTL.FUND_LADDER)
      return list
    }
    return fallbackFundLadder()
  } catch {
    return fallbackFundLadder()
  }
}

// ========== 兜底数据 ==========

/**
 * 可转债兜底数据
 * [WHAT] API 失败时使用模拟数据
 */
export function fallbackConvertibleBonds(): ConvertibleBond[] {
  return [
    { code: '113050', name: '南银转债', price: 125.80, change: 0.44, changePercent: 0.35, premiumRate: -0.5, residualDuration: 3.51, remainingSize: 8.5, rating: 'AAA', callDays: 1280, ytm: -1.2 },
    { code: '110079', name: '杭银转债', price: 122.50, change: 0.34, changePercent: 0.28, premiumRate: 1.2, residualDuration: 3.70, remainingSize: 10.2, rating: 'AAA', callDays: 1350, ytm: -0.8 },
    { code: '110059', name: '浦发转债', price: 108.20, change: -0.16, changePercent: -0.15, premiumRate: 35.8, residualDuration: 2.68, remainingSize: 500.0, rating: 'AAA', callDays: 980, ytm: 2.1 },
    { code: '123172', name: '神马转债', price: 118.60, change: 1.47, changePercent: 1.25, premiumRate: -2.8, residualDuration: 4.33, remainingSize: 3.2, rating: 'AA', callDays: 1580, ytm: -0.5 },
    { code: '128136', name: '药石转债', price: 112.30, change: -0.51, changePercent: -0.45, premiumRate: 18.5, residualDuration: 3.89, remainingSize: 5.8, rating: 'AA', callDays: 1420, ytm: 1.5 },
  ]
}

/**
 * 兜底数据：根据代码返回对应的可转债行情
 */
function fallbackConvertibleQuotes(codes: string[]): ConvertibleBond[] {
  const allFallbacks = fallbackConvertibleBonds()
  return allFallbacks.filter(bond => codes.includes(bond.code))
}

function fallbackLofPremiums(): LofPremium[] {
  return [
    { code: '161725', name: '白酒基金', nav: 0.985, marketPrice: 1.012, premium: 2.74, volume: 85.2, type: 'index' },
    { code: '501018', name: '南方原油', nav: 1.215, marketPrice: 1.180, premium: -2.88, volume: 32.5, type: 'index' },
    { code: '164906', name: '中概互联', nav: 1.085, marketPrice: 1.110, premium: 2.30, volume: 168.0, type: 'index' },
  ]
}

function fallbackReitsData(): ReitData[] {
  return [
    { code: '508000', name: '华夏REIT', price: 5.82, changePercent: 0.52, dividend: 6.5, totalReturn: 18.2, daysListed: 680 },
    { code: '508001', name: '招商REIT', price: 4.96, changePercent: -0.20, dividend: 7.2, totalReturn: 15.8, daysListed: 620 },
    { code: '180201', name: '广河REIT', price: 8.15, changePercent: 0.35, dividend: 5.8, totalReturn: 12.5, daysListed: 550 },
  ]
}

function fallbackFundLadder(): FundLadder[] {
  return [
    { code: '001354', name: '科技成长混合', nav: 1.825, latestNav: 1.856, periodReturn: 18.5, rank: 25, total: 650, type: '偏股混合' },
    { code: '006113', name: '医药健康混合', nav: 0.956, latestNav: 0.985, periodReturn: 12.3, rank: 68, total: 650, type: '偏股混合' },
    { code: '161725', name: '白酒指数', nav: 0.985, latestNav: 1.012, periodReturn: 8.2, rank: 120, total: 650, type: '指数' },
  ]
}
