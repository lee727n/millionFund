// [WHY] 晨星数据 - 基金评级与分析
// [WHAT] 提供晨星星级评级、投资风格箱、基金分类数据
// [DEPS] 依赖 cache 工具和 http 封装

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'

const MODULE_CACHE_TTL = {
  STAR_RATING: 3600,     // 1小时
  STYLE_BOX: 3600,
  FUND_CATEGORY: 7200,
}

// ========== 数据类型定义 ==========

/** 晨星星级评级 */
export interface StarRating {
  code: string
  name: string
  /** 综合评级 1-5星 */
  overall: number
  /** 三年评级 1-5星 */
  threeYear: number
  /** 五年评级 1-5星 */
  fiveYear: number
  /** 十年评级 1-5星 */
  tenYear: number
  /** 同类基金数量 */
  categoryCount: number
  ratingDate: string
}

/** 投资风格箱（9宫格） */
export interface StyleBox {
  /** 规模维度: large/mid/small */
  size: 'large' | 'mid' | 'small'
  /** 风格维度: value/blend/growth */
  style: 'value' | 'blend' | 'growth'
  /** 占比 % */
  weight: number
}

/** 基金分类 */
export interface FundCategory {
  code: string
  name: string
  category: string       // 晨星分类名称
  categoryCode: string   // 晨星分类代码
  riskLevel: string      // 风险等级
}

/** 晨星分析师评级 */
export interface AnalystRating {
  code: string
  name: string
  /** gold/silver/bronze/neutral/negative */
  rating: 'gold' | 'silver' | 'bronze' | 'neutral' | 'negative'
  ratingDate: string
  summary: string
}

// ========== 基金星级评级 ==========

export async function fetchStarRating(code: string): Promise<StarRating | null> {
  const cacheKey = `ms_rating_${code}`
  const cached = getCache<StarRating>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://api.morningstar.cn/v2/fund/rating?fundCode=${code}`
    const data = await http.get<{ data: any }>(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.morningstar.cn/',
      },
    })

    if (data?.data) {
      const d = data.data
      const result: StarRating = {
        code,
        name: d.fundName || '',
        overall: parseInt(d.overallRating || '0'),
        threeYear: parseInt(d.threeYearRating || '0'),
        fiveYear: parseInt(d.fiveYearRating || '0'),
        tenYear: parseInt(d.tenYearRating || '0'),
        categoryCount: parseInt(d.categoryCount || '0'),
        ratingDate: d.ratingDate || '',
      }
      setCache(cacheKey, result, MODULE_CACHE_TTL.STAR_RATING)
      return result
    }
    return null
  } catch {
    return null
  }
}

// ========== 投资风格箱 ==========

export async function fetchStyleBox(code: string): Promise<StyleBox[]> {
  const cacheKey = `ms_style_${code}`
  const cached = getCache<StyleBox[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://api.morningstar.cn/v2/fund/stylebox?fundCode=${code}`
    const data = await http.get<{ data: any[] }>(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.morningstar.cn/',
      },
    })

    if (data?.data && Array.isArray(data.data)) {
      const list: StyleBox[] = data.data.map((item: any) => ({
        size: item.size || 'mid',
        style: item.style || 'blend',
        weight: parseFloat(item.weight || '0'),
      }))
      setCache(cacheKey, list, MODULE_CACHE_TTL.STYLE_BOX)
      return list
    }
    return fallbackStyleBox()
  } catch {
    return fallbackStyleBox()
  }
}

// ========== 基金分类信息 ==========

export async function fetchFundCategory(code: string): Promise<FundCategory | null> {
  const cacheKey = `ms_category_${code}`
  const cached = getCache<FundCategory>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://api.morningstar.cn/v2/fund/basic?fundCode=${code}`
    const data = await http.get<{ data: any }>(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.morningstar.cn/',
      },
    })

    if (data?.data) {
      const d = data.data
      const result: FundCategory = {
        code,
        name: d.fundName || '',
        category: d.categoryName || '',
        categoryCode: d.categoryCode || '',
        riskLevel: d.riskLevel || '中风险',
      }
      setCache(cacheKey, result, MODULE_CACHE_TTL.FUND_CATEGORY)
      return result
    }
    return null
  } catch {
    return null
  }
}

// ========== 兜底数据 ==========

function fallbackStyleBox(): StyleBox[] {
  return [
    { size: 'large', style: 'value', weight: 15 },
    { size: 'large', style: 'blend', weight: 25 },
    { size: 'large', style: 'growth', weight: 20 },
    { size: 'mid', style: 'value', weight: 5 },
    { size: 'mid', style: 'blend', weight: 12 },
    { size: 'mid', style: 'growth', weight: 13 },
    { size: 'small', style: 'value', weight: 2 },
    { size: 'small', style: 'blend', weight: 5 },
    { size: 'small', style: 'growth', weight: 3 },
  ]
}
