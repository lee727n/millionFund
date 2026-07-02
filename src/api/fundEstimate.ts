// [WHAT] 基金估值相关 API
// [DEPS] 天天基金公开接口
// [NOTE] 包含实时估值、批量估值获取

import { cache, CACHE_TTL } from './cache'
import { isTradingTime } from './tiantianApi'
import { persistCache } from '../utils/persistCache'
import type { FundEstimate } from '@/types/fund'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { ConcurrencyController } from './fund/request'

// ========== 并发控制 ==========
const requestConcurrency = new ConcurrencyController(5)

// ========== 实时估值API ==========

/**
 * 获取基金实时估值（带缓存）
 * [NOTE] 开盘前使用缓存数据，开盘后获取实时数据
 * [M6] 迁移到 fetch + 正则解析（移除 JSONP）
 */
export async function fetchFundEstimateFast(code: string): Promise<FundEstimate> {
  const cacheKey = `estimate_${code}`

  // [WHAT] 检查内存缓存
  const cached = cache.get<FundEstimate>(cacheKey)
  if (cached) return Promise.resolve(cached)

  // [WHAT] 获取持久化缓存
  const persisted = persistCache.get<FundEstimate>(cacheKey)

  // [WHAT] 非交易时间直接返回持久化缓存
  if (!isTradingTime() && persisted) {
    cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
    return Promise.resolve(persisted)
  }

  return requestConcurrency.execute(() => {
    return new Promise(async (resolve, reject) => {
      try {
        // [M6] 使用 fetch + 正则解析，替代 JSONP
        // 直接请求外部 API，避免代理 404
        const url = `https://fundgz.eastmoney.com/js/${code}.js?rt=${Date.now()}`
        const text = await http.text(url)

        // 解析 jsonpgz({...}) 格式
        const match = text.match(/jsonpgz\(([\s\S]*)\)/)
        if (!match) {
          // [EDGE] 解析失败时返回持久化缓存或 reject
          if (persisted) {
            cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
            resolve(persisted)
            return
          }
          reject(new Error(`解析估值数据失败: ${code}`))
          return
        }

        const jsonStr = match[1] as string
        const data = JSON.parse(jsonStr)
        const result: FundEstimate = {
          fundcode: data.fundcode || code,
          name: data.name || '',
          gsz: data.gsz || '0',
          gszzl: data.gszzl || '0',
          gztime: data.gztime || '',
          dwjz: data.dwjz || '0',
          jzrq: data.jzrq || '',
        }

        cache.set(cacheKey, result, CACHE_TTL.ESTIMATE)
        persistCache.set(cacheKey, result)
        resolve(result)
      } catch (err) {
        // [EDGE] 失败时返回持久化缓存
        if (persisted) {
          cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
          resolve(persisted)
          return
        }
        reject(err)
      }
    })
  })
}

/**
 * 批量获取基金估值（并发优化）
 */
export async function fetchFundEstimatesBatch(codes: string[]): Promise<Map<string, FundEstimate>> {
  const results = new Map<string, FundEstimate>()

  // 并发请求所有基金
  const promises = codes.map(async code => {
    try {
      const data = await fetchFundEstimateFast(code)
      results.set(code, data)
    } catch (err) {
      logger.error('批量获取估值失败', { code, error: err })
    }
  })

  await Promise.all(promises)
  return results
}

// ========== 估值API别名（与原 fund.ts 兼容） ==========

/** 与 fetchFundEstimateFast 功能一致，保持 API 兼容 */
export function fetchFundEstimate(code: string): Promise<FundEstimate> {
  return fetchFundEstimateFast(code)
}
