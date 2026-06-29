import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockGetHoldings = vi.fn(() => Promise.resolve([]))
const mockSaveHoldings = vi.fn(() => Promise.resolve())

vi.mock('@/utils/storage', () => ({
  getHoldings: mockGetHoldings,
  saveHoldings: mockSaveHoldings,
  upsertHolding: vi.fn(() => Promise.resolve()),
  removeHolding: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/api/fundFast', () => ({ fetchFundAccurateData: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/astock', () => ({ fetchAStockQuote: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/api/hkstock', () => ({ fetchHKStockQuote: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/usstock', () => ({ fetchUSStockQuote: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/api/crypto', () => ({ fetchCryptoPrice: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/commodity', () => ({ fetchCommodityQuote: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/future', () => ({ fetchFutureRealtime: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/bond', () => ({ fetchBondQuote: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/api/forex', () => ({ fetchForexRate: vi.fn(() => Promise.resolve(null)) }))

describe('holding.ts 更多覆盖', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  test('initHoldings 空数据', async () => {
    mockGetHoldings.mockResolvedValue([])
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    await store.initHoldings()
    expect(store.holdings).toHaveLength(0)
  })

  test('initHoldings 有数据触发 refreshEstimates', async () => {
    mockGetHoldings.mockResolvedValue([
      { code: '000001', name: '基金A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund' },
    ])
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    await store.initHoldings()
    expect(store.holdings.length).toBe(1)
  })

  test('initHoldings 清理旧字段', async () => {
    mockGetHoldings.mockResolvedValue([
      { code: '000001', name: '基金A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', shareClass: 'A', serviceFeeRate: 0.5, industrySectors: ['金融'] },
    ])
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    await store.initHoldings()
    expect(store.holdings[0]).not.toHaveProperty('shareClass')
  })
})
