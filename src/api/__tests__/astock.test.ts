import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/utils/http', () => ({ http: { text: vi.fn(), json: vi.fn() } }))
vi.mock('./cache', () => ({ cache: { get: vi.fn(), set: vi.fn() } }))
vi.mock('./unifiedCache', () => ({
  unifiedCache: { getMemory: vi.fn(), setMemory: vi.fn(), getPersistent: vi.fn(), setPersistent: vi.fn(), getOrSet: vi.fn() },
  UNIFIED_CACHE_TTL: { FUND_INFO: 60000, DIVIDEND: 60000, FEES: 60000, FUND_LIST: 60000 },
}))

describe('astock.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('formatSymbol 添加 sh 前缀（6开头）', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('600519')).toBe('sh600519')
    expect(formatSymbol('900900')).toBe('sh900900')
  })

  test('formatSymbol 添加 bj 前缀（4/8开头）', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('430001')).toBe('bj430001')
    expect(formatSymbol('830001')).toBe('bj830001')
  })

  test('formatSymbol 添加 sz 前缀（其他）', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('000001')).toBe('sz000001')
    expect(formatSymbol('300001')).toBe('sz300001')
    expect(formatSymbol('002001')).toBe('sz002001')
  })

  test('formatSymbol 已含前缀时直接返回小写', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('SH600519')).toBe('sh600519')
    expect(formatSymbol('sz000001')).toBe('sz000001')
  })

  test('formatSymbol 空字符串返回空', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('')).toBe('')
    expect(formatSymbol('   ')).toBe('')
  })

  test('formatSymbols 批量格式化', async () => {
    const { formatSymbols } = await import('@/api/astock')
    expect(formatSymbols(['600519', '000001'])).toEqual(['sh600519', 'sz000001'])
  })

  test('fetchAStockQuote 空数组返回空', async () => {
    const { fetchAStockQuote } = await import('@/api/astock')
    const result = await fetchAStockQuote([])
    expect(result).toEqual([])
  })

  test('fetchSingleAStock 失败时返回 null', async () => {
    const { fetchSingleAStock } = await import('@/api/astock')
    // 网络请求会失败，应该返回 null
    const result = await fetchSingleAStock('sh600519')
    expect(result).toBeNull()
  })
})
