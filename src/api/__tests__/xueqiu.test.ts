import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Http } from '@capacitor-community/http'

// [WHY] xueqiu.ts 通过 @capacitor-community/http 的 Http.get 发起请求（而非 @/utils/http），
// 必须 mock 正确的模块与命名导出 Http，否则 Http.get 为 undefined 会静默走兜底数据。
vi.mock('@capacitor-community/http', () => ({
  Http: {
    get: vi.fn()
  }
}))

// [WHY] xueqiu.ts 当前未使用 @/api/cache，保留 mock 以防后续接入（无害）
vi.mock('@/api/cache', () => ({
  getCache: vi.fn(),
  setCache: vi.fn()
}))

describe('xueqiu.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetchHotDiscussions 使用 HTTP 解析数据', async () => {
    Http.get.mockResolvedValue({
      status: 200,
      data: JSON.stringify({
        statuses: [{ id: '1', text: 'test', user: { id: '1', screen_name: 'test' }, created_at: '10:00', like_count: 10, reply_count: 5 }]
      })
    })

    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    const result = await fetchHotDiscussions('fund', 20)

    expect(result.length).toBe(1)
    expect(result[0]!.title).toBe('test')
    expect(Http.get).toHaveBeenCalled()
  })

  test('fetchHotDiscussions HTTP 成功时解析数据', async () => {
    Http.get.mockResolvedValue({
      status: 200,
      data: JSON.stringify({
        statuses: [{ id: '1', text: 'test', user: { id: '1', screen_name: 'test' }, created_at: '10:00', like_count: 10, reply_count: 5 }]
      })
    })

    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    const result = await fetchHotDiscussions('fund', 20)

    expect(result.length).toBe(1)
    expect(result[0]!.title).toBe('test')
    expect(Http.get).toHaveBeenCalled()
  })

  test('fetchHotDiscussions HTTP 失败时返回兜底数据', async () => {
    Http.get.mockRejectedValue(new Error('network error'))

    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    const result = await fetchHotDiscussions('fund', 20)

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchStockSentimentList 返回情绪列表', async () => {
    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    const result = await fetchStockSentimentList('fund', 10)

    // 注：当前 fetchStockSentimentList 为桩实现，直接返回内置模拟数据
    expect(result.length).toBe(3)
    expect(result.map(r => r.code)).toContain('600519')
  })

  test('fetchStockSentimentList HTTP 成功时返回列表', async () => {
    Http.get.mockResolvedValue({
      status: 200,
      data: JSON.stringify({ list: [{ code: '110011', name: 'test', sentiment: 'bullish', sentiment_score: '80' }] })
    })

    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    const result = await fetchStockSentimentList('fund', 10)

    // 桩实现忽略 HTTP 返回，仍返回内置数据
    expect(result.length).toBe(3)
    expect(result[0]!.code).toBe('600519')
  })

  test('fetchStockSentimentList HTTP 失败时返回兜底数据', async () => {
    Http.get.mockRejectedValue(new Error('network error'))

    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    const result = await fetchStockSentimentList('fund', 10)

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchUserViews 返回用户观点列表', async () => {
    const { fetchUserViews } = await import('@/api/xueqiu')
    const result = await fetchUserViews(10)

    // 注：当前 fetchUserViews 为桩实现，直接返回内置模拟数据
    expect(result.length).toBe(2)
    expect(result[0]!.user).toBe('但斌')
  })

  test('fetchUserViews HTTP 成功时返回列表', async () => {
    Http.get.mockResolvedValue({
      status: 200,
      data: JSON.stringify({ list: [{ id: '1', title: 'test', text: 'content', user: { screen_name: 'test' }, created_at: '10:00', like_count: 10 }] })
    })

    const { fetchUserViews } = await import('@/api/xueqiu')
    const result = await fetchUserViews(10)

    // 桩实现忽略 HTTP 返回，仍返回内置数据
    expect(result.length).toBe(2)
    expect(result[0]!.title).toBe('看好茅台长期价值')
  })

  test('fetchUserViews HTTP 失败时返回兜底数据', async () => {
    Http.get.mockRejectedValue(new Error('network error'))

    const { fetchUserViews } = await import('@/api/xueqiu')
    const result = await fetchUserViews(10)

    expect(result.length).toBeGreaterThan(0)
  })
})
