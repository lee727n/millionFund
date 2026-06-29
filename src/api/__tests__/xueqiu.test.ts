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

describe('xueqiu.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetchHotDiscussions 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ id: '1', title: 'test', content: '', userId: '1', userName: 'test', userAvatar: '', createTime: '', likeCount: 0, commentCount: 0, isFund: false }])

    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    const result = await fetchHotDiscussions('fund', 20)

    expect(result.length).toBe(1)
    expect(getCache).toHaveBeenCalled()
  })

  test('fetchHotDiscussions HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockResolvedValue({
      list: [
        { id: '1', title: 'test', text: 'content', user: { id: '1', screen_name: 'test' }, created_at: '10:00', like_count: 10, comment_count: 5 }
      ]
    })

    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    const result = await fetchHotDiscussions('fund', 20)

    expect(result.length).toBe(1)
    expect(result[0]!.title).toBe('test')
    expect(http.get).toHaveBeenCalled()
  })

  test('fetchHotDiscussions HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    const result = await fetchHotDiscussions('fund', 20)

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchStockSentimentList 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ code: '110011', name: 'test', sentiment: 'bullish', sentimentScore: 80, discussionCount: 100, bullishRatio: 70, hotRank: 1, hotChange: 5 }])

    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    const result = await fetchStockSentimentList('fund', 10)

    expect(result.length).toBe(1)
  })

  test('fetchStockSentimentList HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockResolvedValue({
      list: [
        { code: '110011', name: 'test', sentiment: 'bullish', sentiment_score: '80', discussion_count: 100, bullish_ratio: '70', hot_rank: 1, hot_change: 5 }
      ]
    })

    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    const result = await fetchStockSentimentList('fund', 10)

    expect(result.length).toBe(1)
    expect(result[0]!.sentiment).toBe('bullish')
  })

  test('fetchStockSentimentList HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    const result = await fetchStockSentimentList('fund', 10)

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchUserViews 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ id: '1', userName: 'test', userDesc: '', title: 'test', summary: '', stock: undefined, direction: 'bullish', createTime: '', likes: 0 }])

    const { fetchUserViews } = await import('@/api/xueqiu')
    const result = await fetchUserViews(10)

    expect(result.length).toBe(1)
  })

  test('fetchUserViews HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockResolvedValue({
      list: [
        { id: '1', title: 'test', text: 'content', user: { screen_name: 'test' }, created_at: '10:00', like_count: 10 }
      ]
    })

    const { fetchUserViews } = await import('@/api/xueqiu')
    const result = await fetchUserViews(10)

    expect(result.length).toBe(1)
    expect(result[0]!.title).toBe('test')
  })

  test('fetchUserViews HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchUserViews } = await import('@/api/xueqiu')
    const result = await fetchUserViews(10)

    expect(result.length).toBeGreaterThan(0)
  })
})
