import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock localStorage
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) }),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock storage utilities
const mockUpsertHolding = vi.fn()
const mockRemoveHoldingStorage = vi.fn()
const mockSaveHoldings = vi.fn(async () => {})
const mockGetHoldings = vi.fn(async () => [])

vi.mock('@/utils/storage', () => ({
  getHoldings: mockGetHoldings,
  saveHoldings: mockSaveHoldings,
  upsertHolding: mockUpsertHolding,
  removeHolding: mockRemoveHoldingStorage,
}))

// Mock all API modules used by refreshEstimates
vi.mock('@/api/fundFast', () => ({
  fetchFundAccurateData: vi.fn().mockResolvedValue({
    currentValue: 1.5, name: '测试基金', dayChange: 1.0,
    nav: 1.5, navDate: new Date().toISOString().split('T')[0],
    dataSource: 'nav', estimateTime: '',
  }),
}))

vi.mock('@/api/astock', () => ({
  fetchAStockQuote: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/hkstock', () => ({
  fetchHKStockQuote: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/usstock', () => ({
  fetchUSStockQuote: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/crypto', () => ({
  fetchCryptoPrice: vi.fn().mockReturnValue(new Map()),
}))

vi.mock('@/api/commodity', () => ({
  fetchCommodityQuote: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/future', () => ({
  fetchFutureRealtime: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/api/bond', () => ({
  fetchBondQuote: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/api/forex', () => ({
  fetchForexRate: vi.fn().mockResolvedValue(null),
}))

describe('holding store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockUpsertHolding.mockClear()
    mockRemoveHoldingStorage.mockClear()
    mockSaveHoldings.mockClear()
    mockGetHoldings.mockResolvedValue([])
    setActivePinia(createPinia())
  })

  // ─── updateHoldingDays ───────────────────────────────────────

  test('updateHoldingDays 计算持有天数', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()

    const pastDate = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]
    store.holdings = [
      { code: '001', name: '测试基金', buyDate: pastDate, shares: 1000, buyNetValue: 1.0 } as any,
      { code: '002', name: '无日期基金', shares: 500, buyNetValue: 1.5 } as any,
    ]

    store.updateHoldingDays()

    expect(store.holdings[0].holdingDays).toBeGreaterThanOrEqual(4)
    expect(store.holdings[0].holdingDays).toBeLessThanOrEqual(6)
    expect(store.holdings[1].holdingDays).toBeUndefined()
  })

  // ─── hasHolding ──────────────────────────────────────────────

  test('hasHolding 存在时返回 true', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [{ code: '001', name: '测试', shares: 1000, buyNetValue: 1.0 } as any]
    expect(store.hasHolding('001')).toBe(true)
  })

  test('hasHolding 不存在时返回 false', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [{ code: '001', name: '测试', shares: 1000, buyNetValue: 1.0 } as any]
    expect(store.hasHolding('999')).toBe(false)
  })

  test('hasHolding 空列表返回 false', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = []
    expect(store.hasHolding('001')).toBe(false)
  })

  // ─── getHoldingByCode ────────────────────────────────────────

  test('getHoldingByCode 返回匹配的持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '001', name: '基金A', shares: 1000, buyNetValue: 1.0 } as any,
      { code: '002', name: '基金B', shares: 500, buyNetValue: 1.5 } as any,
    ]
    const result = store.getHoldingByCode('001')
    expect(result).toBeDefined()
    expect(result!.name).toBe('基金A')
  })

  test('getHoldingByCode 不匹配时返回 undefined', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [{ code: '001', name: '基金A', shares: 1000, buyNetValue: 1.0 } as any]
    expect(store.getHoldingByCode('999')).toBeUndefined()
  })

  // ─── removeHolding ───────────────────────────────────────────

  test('removeHolding 移除持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '001', name: '基金A', shares: 1000, buyNetValue: 1.0 } as any,
      { code: '002', name: '基金B', shares: 500, buyNetValue: 1.5 } as any,
    ]
    store.removeHolding('001')
    expect(store.holdings.length).toBe(1)
    expect(store.holdings[0].code).toBe('002')
    expect(mockRemoveHoldingStorage).toHaveBeenCalledWith('001')
  })

  // ─── addOrUpdateHolding ──────────────────────────────────────

  test('addOrUpdateHolding 添加新持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = []

    await store.addOrUpdateHolding({
      code: '001',
      name: '新基金',
      assetClass: 'fund',
      shares: 1000,
      buyNetValue: 1.0,
    })

    expect(store.holdings.length).toBe(1)
    expect(store.holdings[0].code).toBe('001')
    expect(store.holdings[0].shares).toBe(1000)
  })

  test('addOrUpdateHolding 更新已有持仓的份额', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '001', name: '基金A', assetClass: 'fund', shares: 1000, buyNetValue: 1.0, loading: false } as any,
    ]

    await store.addOrUpdateHolding({
      code: '001',
      name: '基金A-改名',
      assetClass: 'fund',
      shares: 2000,
      buyNetValue: 1.5,
    })

    expect(store.holdings.length).toBe(1)
    // shares 被更新（refreshEstimates 通过 mock API 更新数据，但 shares 保持）
    expect(store.holdings[0].shares).toBe(2000)
  })

  // ─── holdingCodes computed ───────────────────────────────────

  test('holdingCodes 返回所有代码', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '001', name: '基金A', shares: 1000, buyNetValue: 1.0 } as any,
      { code: '002', name: '基金B', shares: 500, buyNetValue: 1.5 } as any,
    ]
    expect(store.holdingCodes).toEqual(['001', '002'])
  })

  // ─── summary computed ────────────────────────────────────────

  test('summary 计算总资产和总收益', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '001', name: '基金A', shares: 1000, buyNetValue: 1.0, marketValue: 1200, profit: 200, todayProfit: 10 } as any,
      { code: '002', name: '基金B', shares: 500, buyNetValue: 1.5, marketValue: 800, profit: -100, todayProfit: -5 } as any,
    ]

    const summary = store.summary
    expect(summary.totalValue).toBe(2000)
    expect(summary.totalProfit).toBe(100)
    expect(summary.todayProfit).toBe(5)
  })

  test('summary 空持仓返回零值', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = []
    const summary = store.summary
    expect(summary.totalValue).toBe(0)
    expect(summary.totalProfit).toBe(0)
    expect(summary.todayProfit).toBe(0)
    expect(summary.totalProfitRate).toBe(0)
  })
})
