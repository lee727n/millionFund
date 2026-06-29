import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

vi.mock('@/utils/http', () => ({
  http: { get: vi.fn(), text: vi.fn(), json: vi.fn() }
}))

vi.mock('@/api/unifiedCache', () => ({
  unifiedCache: {
    getMemory: vi.fn(),
    setMemory: vi.fn(),
    getPersistent: vi.fn(),
    setPersistent: vi.fn(),
    getOrSet: vi.fn(),
  },
  UNIFIED_CACHE_TTL: {
    FUND_INFO: 60000,
    DIVIDEND: 60000,
    FEES: 60000,
    FUND_LIST: 60000,
  },
}))

describe('tiantianApi.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('getTradingSession 返回有效时段', async () => {
    const { getTradingSession } = await import('@/api/tiantianApi')
    const session = getTradingSession()
    expect(['morning', 'noon_break', 'afternoon', 'closed', 'weekend', 'holiday', 'pre_market', 'post_market']).toContain(session)
  })

  test('isTradingTime 返回布尔值', async () => {
    const { isTradingTime } = await import('@/api/tiantianApi')
    expect(typeof isTradingTime()).toBe('boolean')
  })

  test('calculateRedemptionFee 匹配对应层级', async () => {
    const { calculateRedemptionFee } = await import('@/api/tiantianApi')
    const fees = [
      { minDays: 0, maxDays: 7, rate: 1.5 },
      { minDays: 7, maxDays: 30, rate: 0.5 },
      { minDays: 30, maxDays: Infinity, rate: 0 },
    ]
    expect(calculateRedemptionFee(3, 1000, fees)).toEqual({ rate: 1.5, fee: 15 })
    expect(calculateRedemptionFee(10, 1000, fees)).toEqual({ rate: 0.5, fee: 5 })
    expect(calculateRedemptionFee(100, 1000, fees)).toEqual({ rate: 0, fee: 0 })
  })

  test('calculateRedemptionFee 无匹配时返回0', async () => {
    const { calculateRedemptionFee } = await import('@/api/tiantianApi')
    const fees = [{ minDays: 0, maxDays: 7, rate: 1.5 }]
    expect(calculateRedemptionFee(100, 1000, fees)).toEqual({ rate: 0, fee: 0 })
  })

  test('initMobileDefaultCache 不抛异常', async () => {
    const { initMobileDefaultCache } = await import('@/api/tiantianApi')
    expect(() => initMobileDefaultCache()).not.toThrow()
  })

  test('fetchFundFees A类基金返回正确费率', async () => {
    const { fetchFundFees } = await import('@/api/tiantianApi')
    const result = await fetchFundFees('000001')
    expect(result.managementFee).toBe(1.5)
    expect(result.custodianFee).toBe(0.25)
  })

  test('fetchFundFees C类基金返回0申购费', async () => {
    const { fetchFundFees } = await import('@/api/tiantianApi')
    const result = await fetchFundFees('000001C')
    expect(result.purchaseFees[0]!.rate).toBe(0)
  })
})
