import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/utils/persistCache', () => ({
  persistCache: { get: vi.fn(() => null), set: vi.fn(), delete: vi.fn(), clear: vi.fn() }
}))
vi.mock('./tiantianApi', () => ({ isTradingTime: vi.fn(() => true) }))

describe('cache.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('set 和 get 基本操作', async () => {
    const { cache } = await import('@/api/cache')
    cache.clear()
    
    cache.set('key1', 'value1', 1000)
    expect(cache.get('key1')).toBe('value1')
    expect(cache.size).toBe(1)
  })

  test('get 过期返回 null', async () => {
    const { cache } = await import('@/api/cache')
    cache.clear()
    
    cache.set('key1', 'value1', -1) // 已过期
    expect(cache.get('key1')).toBeNull()
  })

  test('has 检查缓存存在', async () => {
    const { cache } = await import('@/api/cache')
    cache.clear()
    
    cache.set('key1', 'value1', 1000)
    expect(cache.has('key1')).toBe(true)
    expect(cache.has('key2')).toBe(false)
  })

  test('delete 删除缓存', async () => {
    const { cache } = await import('@/api/cache')
    cache.clear()
    
    cache.set('key1', 'value1', 1000)
    cache.delete('key1')
    expect(cache.get('key1')).toBeNull()
    expect(cache.size).toBe(0)
  })

  test('clear 清空所有缓存', async () => {
    const { cache } = await import('@/api/cache')
    cache.clear()
    
    cache.set('key1', 'value1', 1000)
    cache.set('key2', 'value2', 1000)
    cache.clear()
    expect(cache.size).toBe(0)
  })

  test('getCache / setCache 兼容接口', async () => {
    const { getCache, setCache, clearCache, removeCache } = await import('@/api/cache')
    
    setCache('key1', 'value1', 1)
    expect(getCache('key1')).toBe('value1')
    
    removeCache('key1')
    expect(getCache('key1')).toBeUndefined()
    
    setCache('key2', 'value2', 1)
    clearCache()
    expect(getCache('key2')).toBeUndefined()
  })

  test('CACHE_TTL 常量值正确', async () => {
    const { CACHE_TTL } = await import('@/api/cache')
    expect(CACHE_TTL.ESTIMATE).toBe(800)
    expect(CACHE_TTL.MARKET_INDEX).toBe(3000)
    expect(CACHE_TTL.FUND_INFO).toBe(300000)
  })
})
