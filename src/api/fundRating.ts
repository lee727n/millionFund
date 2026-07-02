// [WHY] 基金评级与配置API模块 - 行业配置、资产配置、基金评级
// [WHAT] 提供基金行业配置、资产配置、风险评级等指标获取功能

import { cache, CACHE_TTL } from './cache'
import { logger } from '@/utils/logger'
import { queueGlobalVarScript } from './fundUtils'
import type { IndustryAllocation, AssetAllocation, FundRating } from './fundUtils'

// [WHAT] 饼图颜色列表
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

// ========== 行业配置 ==========

/**
 * 获取基金行业配置
 * [WHY] 展示基金持仓的行业分布
 * [DEPS] pingzhongdata 接口返回 Data_IndustryAllocation
 */
export async function fetchIndustryAllocation(code: string): Promise<IndustryAllocation[]> {
  const cacheKey = `industry_${code}`
  const cached = cache.get<IndustryAllocation[]>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<IndustryAllocation[]>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const data = (window as any).Data_IndustryAllocation
      if (!data?.series?.[0]?.data) return []

      return data.series[0].data
        .filter((item: any) => item.y > 0)
        .slice(0, 10)
        .map((item: any, idx: number) => ({
          name: item.name || '其他',
          ratio: parseFloat(item.y?.toFixed(2)) || 0,
          color: CHART_COLORS[idx % CHART_COLORS.length]
        }))
    },
    ['Data_IndustryAllocation'],
    []
  )

  cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
  return result
}

// ========== 资产配置 ==========

/**
 * 获取基金资产配置
 * [WHY] 展示股票/债券/现金比例
 */
export async function fetchAssetAllocation(code: string): Promise<AssetAllocation | null> {
  const cacheKey = `asset_${code}`
  const cached = cache.get<AssetAllocation>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<AssetAllocation | null>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const data = (window as any).Data_assetAllocation
      if (!data?.series) return null

      const getSeries = (name: string) => {
        const s = data.series.find((item: any) => item.name === name)
        if (!s?.data?.length) return 0
        return s.data[s.data.length - 1] || 0
      }

      return {
        stock: parseFloat(getSeries('股票占净比').toFixed(2)),
        bond: parseFloat(getSeries('债券占净比').toFixed(2)),
        cash: parseFloat(getSeries('现金占净比').toFixed(2)),
        other: parseFloat(getSeries('其他占净比').toFixed(2))
      }
    },
    ['Data_assetAllocation'],
    null
  )

  if (result) cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
  return result
}

// ========== 基金评级 ==========

/**
 * 获取基金评级和风险指标
 * [WHY] 帮助用户评估基金质量和风险
 */
export async function fetchFundRating(code: string): Promise<FundRating | null> {
  const cacheKey = `rating_${code}`
  const cached = cache.get<FundRating>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<FundRating | null>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const rateInSimilar = (window as any).Data_rateInSimilarType || []
      const performanceData = (window as any).Data_rateInSimilarPers498 || []
      const fluctuation = (window as any).Data_fluctuationScale || {}
      
      let rating = 3
      if (rateInSimilar.length > 0) {
        const latestRank = rateInSimilar[rateInSimilar.length - 1]
        if (latestRank) {
          const rankPercent = (latestRank.rank / latestRank.total) * 100
          if (rankPercent <= 20) rating = 5
          else if (rankPercent <= 40) rating = 4
          else if (rankPercent <= 60) rating = 3
          else if (rankPercent <= 80) rating = 2
          else rating = 1
        }
      }

      let sharpeRatio = 0, maxDrawdown = 0, volatility = 0
      if (fluctuation?.series) {
        const sharpe = fluctuation.series.find((s: any) => s.name?.includes('夏普'))
        if (sharpe?.data?.length) sharpeRatio = sharpe.data[sharpe.data.length - 1] || 0
        const vol = fluctuation.series.find((s: any) => s.name?.includes('标准差') || s.name?.includes('波动'))
        if (vol?.data?.length) volatility = vol.data[vol.data.length - 1] || 0
      }

      if (performanceData.length > 0) {
        const values = performanceData.map((d: any) => d.y || d)
        const max = Math.max(...values)
        const min = Math.min(...values)
        maxDrawdown = max > 0 ? ((max - min) / max) * 100 : 0
      }

      let riskLevel = '中风险'
      if (volatility < 10) riskLevel = '低风险'
      else if (volatility < 20) riskLevel = '中低风险'
      else if (volatility < 30) riskLevel = '中风险'
      else if (volatility < 40) riskLevel = '中高风险'
      else riskLevel = '高风险'

      let rankInSimilar = '--'
      if (rateInSimilar.length > 0) {
        const latest = rateInSimilar[rateInSimilar.length - 1]
        if (latest && latest.rank !== undefined && latest.total !== undefined) {
          rankInSimilar = `${latest.rank}/${latest.total}`
        }
      }

      return {
        rating,
        riskLevel,
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
        volatility: parseFloat(volatility.toFixed(2)),
        rankInSimilar
      }
    },
    ['Data_rateInSimilarType', 'Data_rateInSimilarPers498', 'Data_fluctuationScale'],
    null
  )

  if (result) cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
  return result
}
