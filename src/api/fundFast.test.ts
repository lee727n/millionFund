// [WHY] fundFast.ts 单元测试：测试纯函数（跳过 JSONP 函数）
import { describe, it, expect } from 'vitest'
import {
  clearFundCache,
  clearAllCache,
  fetchFundEstimatesBatch,
} from '@/api/fundFast'
import { cache } from '@/api/cache'

describe('clearFundCache', () => {
  beforeEach(() => {
    cache.clear()
  })

  it('清除指定基金的缓存', () => {
    const key = 'estimate_000001'
    cache.set(key, { fundcode: '000001', gsz: '1.0' })

    clearFundCache('000001')

    expect(cache.get(key)).toBeNull()
  })

  it('不影响其他基金的缓存', () => {
    cache.set('estimate_000001', { fundcode: '000001' })
    cache.set('estimate_000002', { fundcode: '000002' })

    clearFundCache('000001')

    expect(cache.get('estimate_000002')).not.toBeNull()
  })
})

describe('clearAllCache', () => {
  beforeEach(() => {
    cache.clear()
  })

  it('清除所有基金缓存', () => {
    cache.set('estimate_000001', { fundcode: '000001' })
    cache.set('estimate_000002', { fundcode: '000002' })

    clearAllCache()

    expect(cache.get('estimate_000001')).toBeNull()
    expect(cache.get('estimate_000002')).toBeNull()
  })
})

describe('fetchFundEstimatesBatch', () => {
  it('返回空 Map 当输入空数组', async () => {
    const result = await fetchFundEstimatesBatch([])
    expect(result.size).toBe(0)
  })
})
