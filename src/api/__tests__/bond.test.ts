import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/http', () => ({ http: { get: vi.fn() } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

describe('bond.ts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('calculateYield 正收益', async () => {
    const { calculateYield } = await import('@/api/bond')
    expect(calculateYield('95', '100')).toBeCloseTo(5.26, 1)
  })

  test('calculateYield 折价', async () => {
    const { calculateYield } = await import('@/api/bond')
    expect(calculateYield('105', '100')).toBeCloseTo(-4.76, 1)
  })

  test('detectBondType ETF 前缀', async () => {
    const { detectBondType } = await import('@/api/bond')
    expect(detectBondType('511010')).toBe('etf')
    expect(detectBondType('159001')).toBe('etf')
  })

  test('detectBondType 企业债前缀', async () => {
    const { detectBondType } = await import('@/api/bond')
    expect(detectBondType('110001')).toBe('corporate')
  })

  test('detectBondType 国债前缀', async () => {
    const { detectBondType } = await import('@/api/bond')
    expect(detectBondType('100001')).toBe('treasury')
  })

  test('detectBondType 默认 corporate', async () => {
    const { detectBondType } = await import('@/api/bond')
    expect(detectBondType('123456')).toBe('corporate')
  })

  test('getFallbackBond 已知代码', async () => {
    const { getFallbackBond } = await import('@/api/bond')
    const r = getFallbackBond('511010')
    expect(r.code).toBe('511010')
    expect(r.name).toBe('国债 ETF')
    expect(r.type).toBe('etf')
  })

  test('getFallbackBond 未知代码返回默认值', async () => {
    const { getFallbackBond } = await import('@/api/bond')
    const r = getFallbackBond('999999')
    expect(r.code).toBe('999999')
    expect(r.name).toBe('债券 999999')
    expect(r.type).toBe('corporate')
  })

  test('getFallbackYieldCurve 返回5个期限', async () => {
    const { getFallbackYieldCurve } = await import('@/api/bond')
    const curve = getFallbackYieldCurve()
    expect(curve).toHaveLength(5)
    expect(curve[0]!.term).toBe('1Y')
    expect(curve[4]!.term).toBe('30Y')
  })

  test('BOND_CODES 常量定义正确', async () => {
    const { BOND_CODES } = await import('@/api/bond')
    expect(BOND_CODES.treasury_ETF).toBe('511010')
    expect(BOND_CODES.treasury_ETF2).toBe('511260')
    expect(BOND_CODES.corporate_ETF).toBe('511270')
  })

  test('fetchBondQuote HTTP 失败时返回兜底数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('network error'))
    const { fetchBondQuote } = await import('@/api/bond')
    const result = await fetchBondQuote('511010')
    expect(result).not.toBeNull()
    expect(result?.code).toBe('511010')
  })

  test('fetchTreasuryYieldCurve HTTP 失败时返回兜底数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('network error'))
    const { fetchTreasuryYieldCurve } = await import('@/api/bond')
    const result = await fetchTreasuryYieldCurve()
    expect(result).toHaveLength(5)
    expect(result[0]!.term).toBe('1Y')
  })
})
