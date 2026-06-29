import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock cache module
vi.mock('@/api/cache', () => ({
  getCache: vi.fn(),
  setCache: vi.fn()
}))

// Mock http module
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

describe('jisilu.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetchConvertibleBonds 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ code: '113050', name: 'test', price: 125, change: 0.44, changePercent: 0.35, premiumRate: -0.5, residualDuration: 3.51, remainingSize: 8.5, rating: 'AAA', callDays: 1280, ytm: -1.2 }])

    const { fetchConvertibleBonds } = await import('@/api/jisilu')
    const result = await fetchConvertibleBonds()

    expect(result.length).toBe(1)
    expect(getCache).toHaveBeenCalled()
  })

  test('fetchConvertibleBonds HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.post.mockResolvedValue({
      rows: [
        { cell: { bond_id: '113050', bond_nm: '南银转债', price: '125.80', prev_close: '125.36', change_rt: '0.35', premium_rt: '-0.5', call_days: '1280', remain_size: '8.5', rating_cd: 'AAA', ytm_rt: '-1.2' } }
      ]
    })

    const { fetchConvertibleBonds } = await import('@/api/jisilu')
    const result = await fetchConvertibleBonds()

    expect(result.length).toBe(1)
    expect(result[0]!.code).toBe('113050')
    expect(result[0]!.price).toBe(125.8)
  })

  test('fetchConvertibleBonds HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.post.mockRejectedValue(new Error('network error'))

    const { fetchConvertibleBonds } = await import('@/api/jisilu')
    const result = await fetchConvertibleBonds()

    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchConvertibleList 调用 fetchConvertibleBonds', async () => {
    const { fetchConvertibleList } = await import('@/api/jisilu')
    // 直接调用，应该返回兜底数据或缓存数据
    const result = await fetchConvertibleList(20)
    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchConvertibleQuote 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ code: '113050', name: 'test', price: 125, change: 0.44, changePercent: 0.35, premiumRate: -0.5, residualDuration: 3.51, remainingSize: 8.5, rating: 'AAA', callDays: 1280, ytm: -1.2 }])

    const { fetchConvertibleQuote } = await import('@/api/jisilu')
    const result = await fetchConvertibleQuote(['113050'])

    expect(result.length).toBe(1)
  })

  test('fetchLofPremiums 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ code: '161725', name: '白酒基金', nav: 0.985, marketPrice: 1.012, premium: 2.74, volume: 85.2, type: 'index' }])

    const { fetchLofPremiums } = await import('@/api/jisilu')
    const result = await fetchLofPremiums()

    expect(result.length).toBe(1)
  })

  test('fetchReitsData 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ code: '508000', name: '华夏REIT', price: 5.82, changePercent: 0.52, dividend: 6.5, totalReturn: 18.2, daysListed: 680 }])

    const { fetchReitsData } = await import('@/api/jisilu')
    const result = await fetchReitsData()

    expect(result.length).toBe(1)
  })

  test('fetchFundLadder 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ code: '001354', name: '科技成长', nav: 1.825, latestNav: 1.856, periodReturn: 18.5, rank: 25, total: 650, type: '偏股混合' }])

    const { fetchFundLadder } = await import('@/api/jisilu')
    const result = await fetchFundLadder()

    expect(result.length).toBe(1)
  })

  test('fallbackConvertibleBonds 返回兜底数据', async () => {
    const { fallbackConvertibleBonds } = await import('@/api/jisilu')
    const result = fallbackConvertibleBonds()

    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.code).toBe('113050')
  })
})
