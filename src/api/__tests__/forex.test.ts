import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockHttp = { get: vi.fn() }
const mockGetCache = vi.fn(() => null)
const mockSetCache = vi.fn()

vi.mock('@/utils/http', () => ({
  http: mockHttp,
}))

vi.mock('@/api/cache', () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
}))

describe('forex.ts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
  })

  test('fetchForexRate 成功获取汇率', async () => {
    mockHttp.get.mockResolvedValue({ rates: { CNY: 7.25 } })
    const { fetchForexRate } = await import('@/api/forex')
    const result = await fetchForexRate('USDCNY')
    expect(result).not.toBeNull()
    expect(result!.rate).toBe(7.25)
    expect(result!.pair).toBe('USDCNY')
  })

  test('fetchForexRate API 失败时返回 null', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchForexRate } = await import('@/api/forex')
    const result = await fetchForexRate('USDCNY')
    expect(result).toBeNull()
  })

  test('fetchForexRates 批量获取汇率', async () => {
    mockHttp.get.mockResolvedValue({ rates: { CNY: 7.25, EUR: 7.85 } })
    const { fetchForexRates } = await import('@/api/forex')
    const result = await fetchForexRates(['USDCNY', 'EURUSD'])
    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchForexRates 使用缓存', async () => {
    mockGetCache.mockReturnValue([{ pair: 'USDCNY', rate: 7.2, change: 0, changePercent: 0, updateTime: '12:00', base: 'USD', quote: 'CNY' }])
    const { fetchForexRates } = await import('@/api/forex')
    const result = await fetchForexRates(['USDCNY'])
    expect(result.length).toBe(1)
    expect(mockHttp.get).not.toHaveBeenCalled()
  })
})
