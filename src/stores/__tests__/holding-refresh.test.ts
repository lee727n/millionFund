import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockGetHoldings = vi.fn(() => Promise.resolve([]))
const mockSaveHoldings = vi.fn(() => Promise.resolve())
const mockFetchFundAccurateData = vi.fn(() => Promise.resolve(null))

vi.mock('@/utils/storage', () => ({
  getHoldings: mockGetHoldings,
  saveHoldings: mockSaveHoldings,
  upsertHolding: vi.fn(() => Promise.resolve()),
  removeHolding: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/api/fundFast', () => ({ fetchFundAccurateData: mockFetchFundAccurateData }))
vi.mock('@/api/astock', () => ({ fetchAStockQuote: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/api/hkstock', () => ({ fetchHKStockQuote: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/usstock', () => ({ fetchUSStockQuote: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/api/crypto', () => ({ fetchCryptoPrice: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/commodity', () => ({ fetchCommodityQuote: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/future', () => ({ fetchFutureRealtime: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/bond', () => ({ fetchBondQuote: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/forex', () => ({ fetchForexRate: vi.fn(() => Promise.resolve(null)) }))

describe('holding.ts refreshEstimates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  test('refreshEstimates 空持仓不调用 API', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    await store.refreshEstimates()
    expect(mockFetchFundAccurateData).not.toHaveBeenCalled()
  })

  test.skip('refreshEstimates 有基金持仓调用 fundFast', async () => {
    mockFetchFundAccurateData.mockResolvedValue({ code: '000001', estimateValue: 1.1, estimateTime: '15:00', nav: 1.05, navDate: '2024-01-01' })
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '000001', name: '基金A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund', loading: false } as any
    ]
    await store.refreshEstimates()
    expect(mockFetchFundAccurateData).toHaveBeenCalledWith('000001')
  })

  test('refreshEstimates 捕获 API 错误不崩溃', async () => {
    mockFetchFundAccurateData.mockRejectedValue(new Error('API error'))
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '000001', name: '基金A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund', loading: false } as any
    ]
    await expect(store.refreshEstimates()).resolves.not.toThrow()
  })
})
