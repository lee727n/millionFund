import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock cache module
vi.mock('@/api/cache', () => ({
  getCache: vi.fn(),
  setCache: vi.fn()
}))

// Mock http module
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn()
  }
}))

describe('jin10.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 mock import.meta.env.DEV = true
    vi.stubEnv('DEV', true)
  })

  test('getNewsCategories 返回分类列表', async () => {
    const { getNewsCategories } = await import('@/api/jin10')
    const result = getNewsCategories()
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.id).toBe('all')
  })

  test('fetchNewsList 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ id: '1', title: 'test', summary: '', url: '', time: '', category: 'general', tags: [] }])

    const { fetchNewsList } = await import('@/api/jin10')
    const result = await fetchNewsList()

    expect(result.length).toBe(1)
    expect(getCache).toHaveBeenCalled()
  })

  test('fetchNewsList HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockResolvedValue({
      data: [
        { id: '1', title: 'test', content: 'content', time: '10:00', type: 'general', tags: [] }
      ]
    })

    const { fetchNewsList } = await import('@/api/jin10')
    const result = await fetchNewsList()

    expect(result.length).toBe(1)
    expect(result[0]!.title).toBe('test')
    expect(http.get).toHaveBeenCalled()
  })

  test('fetchNewsList HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchNewsList } = await import('@/api/jin10')
    const result = await fetchNewsList()

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchFlashNews 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ id: '1', content: 'test', time: '10:00', type: 'normal' }])

    const { fetchFlashNews } = await import('@/api/jin10')
    const result = await fetchFlashNews()

    expect(result.length).toBe(1)
  })

  test('fetchFlashNews HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockResolvedValue({
      data: [
        { id: '1', content: 'test', time: '10:00', is_important: true }
      ]
    })

    const { fetchFlashNews } = await import('@/api/jin10')
    const result = await fetchFlashNews()

    expect(result.length).toBe(1)
    expect(result[0]!.type).toBe('important')
  })

  test('fetchFlashNews HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchFlashNews } = await import('@/api/jin10')
    const result = await fetchFlashNews()

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchEconomicCalendar 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ id: '1', title: 'test', time: '10:00', importance: 'high' }])

    const { fetchEconomicCalendar } = await import('@/api/jin10')
    const result = await fetchEconomicCalendar()

    expect(result.length).toBe(1)
  })

  test('fetchEconomicCalendar HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockResolvedValue({
      data: [
        { id: '1', name: 'GDP', time: '10:00', importance: 'high' }
      ]
    })

    const { fetchEconomicCalendar } = await import('@/api/jin10')
    const result = await fetchEconomicCalendar()

    expect(result.length).toBe(1)
    expect(result[0]!.title).toBe('GDP')
  })

  test('fetchEconomicCalendar HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchEconomicCalendar } = await import('@/api/jin10')
    const result = await fetchEconomicCalendar()

    expect(result.length).toBeGreaterThan(0)
  })
})
