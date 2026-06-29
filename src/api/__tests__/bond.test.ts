import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock http module
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn()
  }
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('bond.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('fetchBondQuote 成功获取债券行情', async () => {
    const { http } = await import('@/utils/http')
    // 新浪格式：var hq_str_sz511010="name~price~..."（用 ~ 分隔）
    const mockResponse = 'var hq_str_sz511010="国债ETF~101.40~101.00~101.50~101.10~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0";'
    http.get.mockResolvedValue(mockResponse)

    const { fetchBondQuote } = await import('@/api/bond')
    const result = await fetchBondQuote('511010')

    expect(result).not.toBeNull()
    expect(result?.code).toBe('511010')
    expect(result?.price).toBe(101.5)
    expect(result?.type).toBe('etf')
  })

  test('fetchBondQuote HTTP 失败时返回兜底数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchBondQuote } = await import('@/api/bond')
    const result = await fetchBondQuote('511010')

    expect(result).not.toBeNull()
    expect(result?.code).toBe('511010')
    expect(result?.name).toBe('国债 ETF')
  })

  test('fetchBondQuote 响应格式错误时返回兜底数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockResolvedValue('invalid response')

    const { fetchBondQuote } = await import('@/api/bond')
    const result = await fetchBondQuote('511010')

    expect(result).not.toBeNull()
    expect(result?.code).toBe('511010')
  })

  test('fetchBondQuotes 批量获取债券行情', async () => {
    const { http } = await import('@/utils/http')
    // Mock 两次调用
    http.get
      .mockResolvedValueOnce('var hq_str_sz511010="国债ETF,101.25,101.00,101.40,101.10,101.30,100,200,1234567,9876543";')
      .mockResolvedValueOnce('var hq_str_sz511260="国债ETF2,105.80,105.00,106.00,105.50,105.90,100,200,1234567,9876543";')

    const { fetchBondQuotes } = await import('@/api/bond')
    const results = await fetchBondQuotes(['511010', '511260'])

    expect(results.length).toBe(2)
    expect(results[0]?.code).toBe('511010')
    expect(results[1]?.code).toBe('511260')
  })

  test('fetchTreasuryYieldCurve 成功获取收益率曲线', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockResolvedValue({
      data: [
        { term: '1Y', yield: 1.85 },
        { term: '10Y', yield: 2.65 }
      ]
    })

    const { fetchTreasuryYieldCurve } = await import('@/api/bond')
    const result = await fetchTreasuryYieldCurve()

    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.term).toBe('1Y')
  })

  test('fetchTreasuryYieldCurve HTTP 失败时返回兜底数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('network error'))

    const { fetchTreasuryYieldCurve } = await import('@/api/bond')
    const result = await fetchTreasuryYieldCurve()

    expect(result.length).toBe(5)
    expect(result[0]!.term).toBe('1Y')
    expect(result[4]!.term).toBe('30Y')
  })

  test('BOND_CODES 常量定义正确', async () => {
    const { BOND_CODES } = await import('@/api/bond')
    expect(BOND_CODES.treasury_ETF).toBe('511010')
    expect(BOND_CODES.treasury_ETF2).toBe('511260')
    expect(BOND_CODES.corporate_ETF).toBe('511270')
  })
})
