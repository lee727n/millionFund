// [WHY] 市场指数API模块 - 大盘指数、全球指数
// [WHAT] 提供大盘指数和全球主要指数行情获取功能

import { cache, CACHE_TTL } from './cache'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import type { MarketIndexSimple, GlobalIndex } from './fundTypes'

// ========== 大盘指数 ==========

/**
 * 获取大盘指数
 * [WHAT] 上证指数、深证成指、创业板指、沪深300
 */
export async function fetchMarketIndicesFast(): Promise<MarketIndexSimple[]> {
  const cacheKey = 'market_indices'
  const cached = cache.get<MarketIndexSimple[]>(cacheKey)
  if (cached) return cached

  try {
    // [WHAT] 添加沪深300指数 (1.000300)
    const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000300&fields=f2,f3,f4,f12,f14'
    const data = await http.get<{ data?: { diff?: any[] } }>(url)

    if (!data?.data?.diff) return []

    const indices: MarketIndexSimple[] = data.data.diff.map((item: any) => ({
      code: item.f12,
      name: item.f14,
      current: item.f2,
      change: item.f4,
      changePercent: item.f3
    }))

    cache.set(cacheKey, indices, CACHE_TTL.MARKET_INDEX)
    return indices
  } catch (e) {
    logger.warn('[fundMarket] 获取大盘指数失败', e)
    return getFallbackMarketIndices()
  }
}

/**
 * 大盘指数兜底数据
 * [WHY] API 失败时使用，避免首页指标区域空白
 */
function getFallbackMarketIndices(): MarketIndexSimple[] {
  return [
    { code: '000001', name: '上证指数', current: 3150, change: 12.5, changePercent: 0.40 },
    { code: '399001', name: '深证成指', current: 9850, change: 45.2, changePercent: 0.46 },
    { code: '399006', name: '创业板指', current: 2050, change: 8.6, changePercent: 0.42 },
    { code: '000300', name: '沪深300', current: 3780, change: 15.8, changePercent: 0.42 },
  ]
}

// ========== 全球指数 ==========

/**
 * 获取全球主要指数行情
 * [WHY] 帮助投资者了解全球市场走势
 * [DEPS] 使用东方财富 push2 接口（直接返回 JSON）
 * [M6] 已迁移到 http.get()（移除 JSONP）
 */
export async function fetchGlobalIndices(): Promise<GlobalIndex[]> {
  const cacheKey = 'global_indices'
  const cached = cache.get<GlobalIndex[]>(cacheKey)
  if (cached) return cached

  // [WHAT] 东方财富全球指数代码
  // 格式：市场代码.指数代码
  const indices = [
    { code: '1.000001', name: '上证指数', region: 'cn' as const },
    { code: '0.399001', name: '深证成指', region: 'cn' as const },
    { code: '0.399006', name: '创业板指', region: 'cn' as const },
    { code: '100.HSI', name: '恒生指数', region: 'hk' as const },
    { code: '100.DJIA', name: '道琼斯', region: 'us' as const },
    { code: '100.NDX', name: '纳斯达克', region: 'us' as const },
    { code: '100.SPX', name: '标普500', region: 'us' as const },
    { code: '100.N225', name: '日经225', region: 'asia' as const },
  ]

  try {
    const codes = indices.map(i => i.code).join(',')

    // [M6] 直接使用 http.get()，不再使用 JSONP
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${codes}&fields=f2,f3,f4,f12,f14&_=${Date.now()}`
    const data = await http.get<{ data?: { diff?: any[] } }>(url)

    const results: GlobalIndex[] = []

    if (data?.data?.diff) {
      data.data.diff.forEach((item: any, idx: number) => {
        if (indices[idx] && item.f2 > 0) {
          results.push({
            name: indices[idx].name,
            code: indices[idx].code,
            price: item.f2,
            change: item.f4,
            changePercent: item.f3,
            region: indices[idx].region
          })
        }
      })
    }

    if (results.length === 0) return getDefaultGlobalIndices()

    cache.set(cacheKey, results, CACHE_TTL.MARKET_INDEX)
    return results
  } catch (err) {
    logger.warn('[fundMarket] fetchGlobalIndices 失败', { error: err })
    return getDefaultGlobalIndices()
  }
}

function getDefaultGlobalIndices(): GlobalIndex[] {
  return [
    { name: '上证指数', code: 's_sh000001', price: 0, change: 0, changePercent: 0, region: 'cn' },
    { name: '深证成指', code: 's_sz399001', price: 0, change: 0, changePercent: 0, region: 'cn' },
    { name: '恒生指数', code: 'rt_hkHSI', price: 0, change: 0, changePercent: 0, region: 'hk' },
    { name: '道琼斯', code: 'gb_$dji', price: 0, change: 0, changePercent: 0, region: 'us' },
    { name: '纳斯达克', code: 'gb_$ixic', price: 0, change: 0, changePercent: 0, region: 'us' },
    { name: '日经225', code: 'int_nikkei', price: 0, change: 0, changePercent: 0, region: 'asia' },
  ]
}
