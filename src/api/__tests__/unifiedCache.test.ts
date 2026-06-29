import { describe, test, expect, vi, beforeEach } from 'vitest'

// 在导入 unifiedCache 之前设置 mock
vi.mock('@/api/cache', () => ({
  cache: {
    get: vi.fn(() => null),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    size: 0,
  },
  CACHE_TTL: { ESTIMATE: 800, FUND_INFO: 300000 },
}))

vi.mock('@/utils/persistCache', () => ({
  persistCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('@/api/tiantianApi', () => ({
  isTradingTime: vi.fn(() => true),
}))

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('unifiedCache.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('get 内存缓存命中', async () => {
    const { cache } = await import('@/api/cache')
    ;(cache.get as any).mockReturnValue({ data: 'test' })

    const { unifiedCache } = await import('@/api/unifiedCache')
    const result = unifiedCache.get('key1')
    expect(result).toEqual({ data: 'test' })
  })

  test('get 内存缓存未命中，持久化缓存命中', async () => {
    const { cache } = await import('@/api/cache')
    const { persistCache } = await import('@/utils/persistCache')
    ;(cache.get as any).mockReturnValue(null)
    ;(persistCache.get as any).mockReturnValue({ data: 'persisted' })

    const { unifiedCache } = await import('@/api/unifiedCache')
    const result = unifiedCache.get('key1')
    expect(result).toEqual({ data: 'persisted' })
    expect(cache.set).toHaveBeenCalled()
  })

  test('get 两级缓存都未命中返回 null', async () => {
    const { cache } = await import('@/api/cache')
    const { persistCache } = await import('@/utils/persistCache')
    ;(cache.get as any).mockReturnValue(null)
    ;(persistCache.get as any).mockReturnValue(null)

    const { unifiedCache } = await import('@/api/unifiedCache')
    const result = unifiedCache.get('key1')
    expect(result).toBeNull()
  })

  test('set 写入内存和持久化', async () => {
    const { cache } = await import('@/api/cache')
    const { persistCache } = await import('@/utils/persistCache')

    const { unifiedCache } = await import('@/api/unifiedCache')
    unifiedCache.set('key1', 'value1', { persist: true })

    expect(cache.set).toHaveBeenCalledWith('key1', 'value1', expect.any(Number))
    expect(persistCache.set).toHaveBeenCalled()
  })

  test('delete 清除内存和持久化', async () => {
    const { cache } = await import('@/api/cache')
    const { persistCache } = await import('@/utils/persistCache')

    const { unifiedCache } = await import('@/api/unifiedCache')
    unifiedCache.delete('key1')

    expect(cache.delete).toHaveBeenCalledWith('key1')
    expect(persistCache.delete).toHaveBeenCalledWith('key1')
  })

  test('has 检查缓存存在', async () => {
    const { cache } = await import('@/api/cache')
    ;(cache.get as any).mockReturnValue('cached')

    const { unifiedCache } = await import('@/api/unifiedCache')
    expect(unifiedCache.has('key1')).toBe(true)
  })

  test('getOrSet 缓存未命中时调用 fetcher', async () => {
    const { cache } = await import('@/api/cache')
    ;(cache.get as any).mockReturnValue(null)

    const { unifiedCache } = await import('@/api/unifiedCache')
    const fetcher = vi.fn().mockResolvedValue('fetched')
    const result = await unifiedCache.getOrSet('key1', fetcher)

    expect(fetcher).toHaveBeenCalled()
    expect(result).toBe('fetched')
    expect(cache.set).toHaveBeenCalled()
  })

  test('getOrSet 缓存命中时直接返回', async () => {
    const { cache } = await import('@/api/cache')
    ;(cache.get as any).mockReturnValue('cached')

    const { unifiedCache } = await import('@/api/unifiedCache')
    const fetcher = vi.fn().mockResolvedValue('fetched')
    const result = await unifiedCache.getOrSet('key1', fetcher)

    expect(fetcher).not.toHaveBeenCalled()
    expect(result).toBe('cached')
  })
})
