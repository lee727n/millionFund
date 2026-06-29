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
    text: vi.fn()
  }
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn()
  }
}))

describe('commodity.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('parseSinaCommodityResponse 解析大宗商品响应', async () => {
    const { parseSinaCommodityResponse } = await import('@/api/commodity')
    const text = 'var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00";\n'
    const results = parseSinaCommodityResponse(text, ['Au9999'])

    expect(results.length).toBe(1)
    expect(results[0]!.symbol).toBe('Au9999')
    expect(results[0]!.name).toBe('上海黄金')
    expect(results[0]!.price).toBe(560.5)
    expect(results[0]!.change).toBe(2.5)
    expect(results[0]!.changePercent).toBe(0.45)
  })

  test('parseSinaCommodityResponse 处理无效数据', async () => {
    const { parseSinaCommodityResponse } = await import('@/api/commodity')
    const results = parseSinaCommodityResponse('', ['Au9999'])
    expect(results).toEqual([])
  })

  test('fetchCommodityQuote 从缓存读取', async () => {
    const { getCache } = await import('@/api/cache')
    getCache.mockReturnValue([{ symbol: 'Au9999', name: '黄金', price: 560, change: 2.5, changePercent: 0.45, volume: 100, bidPrice: 560, askPrice: 561, updateTime: '2024-01-01' }])

    const { fetchCommodityQuote } = await import('@/api/commodity')
    const result = await fetchCommodityQuote(['Au9999'])

    expect(result.length).toBe(1)
    expect(getCache).toHaveBeenCalled()
  })

  test('fetchCommodityQuote HTTP 成功时解析数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.text.mockResolvedValue('var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00";')

    const { fetchCommodityQuote } = await import('@/api/commodity')
    const result = await fetchCommodityQuote(['Au9999'])

    expect(result.length).toBe(1)
    expect(result[0]!.price).toBe(560.5)
  })

  test('fetchCommodityQuote HTTP 失败时返回兜底数据', async () => {
    const { getCache } = await import('@/api/cache')
    const { http } = await import('@/utils/http')
    getCache.mockReturnValue(null)
    http.text.mockRejectedValue(new Error('network error'))

    const { fetchCommodityQuote } = await import('@/api/commodity')
    const result = await fetchCommodityQuote(['Au9999'])

    expect(result.length).toBe(1)
    expect(result[0]!.price).toBe(560.5) // 兜底数据
  })

  test('fetchGoldPrice 成功获取黄金价格', async () => {
    const { http } = await import('@/utils/http')
    http.text.mockResolvedValue('var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00";')

    const { fetchGoldPrice } = await import('@/api/commodity')
    const result = await fetchGoldPrice()

    expect(result).not.toBeNull()
    expect(result?.price).toBe(560.5)
  })

  test('fetchGoldPrice 失败时返回兜底数据', async () => {
    const { http } = await import('@/utils/http')
    http.text.mockRejectedValue(new Error('network error'))

    const { fetchGoldPrice } = await import('@/api/commodity')
    const result = await fetchGoldPrice()

    expect(result).not.toBeNull()
    expect(result?.price).toBe(560.5) // 兜底数据
  })

  test('fetchSilverPrice 成功获取白银价格', async () => {
    const { http } = await import('@/utils/http')
    http.text.mockResolvedValue('var hq_str_Ag9999="上海白银,8200.00,50.00,0.61,50,8190.00,8210.00";')

    const { fetchSilverPrice } = await import('@/api/commodity')
    const result = await fetchSilverPrice()

    expect(result).not.toBeNull()
    expect(result?.price).toBe(8200)
  })

  test('fetchCrudeOilPrice 成功获取原油价格', async () => {
    const { http } = await import('@/utils/http')
    http.text.mockResolvedValue('var hq_str_CL2506="WTI原油,78.50,0.85,1.09,1000,78.45,78.55";')

    const { fetchCrudeOilPrice } = await import('@/api/commodity')
    const result = await fetchCrudeOilPrice()

    expect(result).not.toBeNull()
    expect(result?.price).toBe(78.5)
  })
})
