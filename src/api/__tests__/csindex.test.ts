import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IndexQuote, IndexValuation } from '@/api/csindex'

const mockHttp = { get: vi.fn(), text: vi.fn() }
const mockGetCache = vi.fn(() => null)
const mockSetCache = vi.fn()

vi.mock('@/api/cache', () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
}))

vi.mock('@/utils/http', () => ({
  http: mockHttp,
}))

describe('csindex.ts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
  })

  test('fetchIndexQuote 成功时解析 HTML 返回数据', async () => {
    mockHttp.text.mockResolvedValue(
      '"latest"=>12.5,"change"=>1.2,<title>沪深300 - 中证指数'
    )
    const { fetchIndexQuote } = await import('@/api/csindex')
    const result = await fetchIndexQuote('000300')
    expect(result).not.toBeNull()
    expect(result!.code).toBe('000300')
    expect(result!.price).toBe(12.5)
    expect(result!.changePercent).toBe(1.2)
  })

  test('fetchIndexQuote HTTP 失败时返回 null', async () => {
    mockHttp.text.mockRejectedValue(new Error('network error'))
    const { fetchIndexQuote } = await import('@/api/csindex')
    const result = await fetchIndexQuote('000300')
    expect(result).toBeNull()
  })

  test('fetchIndexValuation 成功时返回估值数据', async () => {
    mockHttp.text.mockResolvedValue('pe=>12.5,pb=>1.45,pe_percentile=>45')
    const { fetchIndexValuation } = await import('@/api/csindex')
    const result = await fetchIndexValuation('000300')
    expect(result).not.toBeNull()
    expect(result!.code).toBe('000300')
    expect(result!.pe).toBe(12.5)
  })

  test('fetchIndexValuation HTTP 失败时返回 fallback', async () => {
    mockHttp.text.mockRejectedValue(new Error('network error'))
    const { fetchIndexValuation } = await import('@/api/csindex')
    const result = await fetchIndexValuation('000300')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('沪深300')
    expect(result!.riskLevel).toBe('正常')
  })

  test('fetchCommonIndexValuations 返回多个指数估值', async () => {
    mockHttp.text.mockResolvedValue('pe=>12.5,pb=>1.45')
    const { fetchCommonIndexValuations } = await import('@/api/csindex')
    const result = await fetchCommonIndexValuations()
    expect(result.length).toBeGreaterThan(0)
  })

  test('fetchIndexQuote 使用缓存', async () => {
    mockGetCache.mockReturnValue({ code: '000300', name: '沪深300', price: 12, changePercent: 1, volume: 0, PE: 12, PB: 1.4, ROE: 11 } as IndexQuote)
    const { fetchIndexQuote } = await import('@/api/csindex')
    const result = await fetchIndexQuote('000300')
    expect(result!.price).toBe(12)
    expect(mockHttp.text).not.toHaveBeenCalled()
  })
})
