import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('holding.ts (store CRUD)', () => {
  let store: any

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    vi.mock('@/utils/storage', () => ({
      getHoldings: vi.fn().mockResolvedValue([]),
      saveHoldings: vi.fn().mockResolvedValue(undefined),
      upsertHolding: vi.fn().mockResolvedValue(undefined),
      removeHolding: vi.fn().mockResolvedValue(undefined),
    }))
    vi.mock('@/api/fundFast', () => ({
      fetchFundAccurateData: vi.fn().mockResolvedValue(null),
    }))
  })

  test('addOrUpdateHolding 添加新持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    store = useHoldingStore()
    const record = {
      code: '000001',
      name: '测试基金',
      buyNetValue: 1.5,
      shares: 1000,
      buyDate: '2024-01-01',
      assetClass: 'fund' as const,
    }
    await store.addOrUpdateHolding(record)
    expect(store.holdings.length).toBe(1)
    expect(store.holdings[0].code).toBe('000001')
  })

  test('addOrUpdateHolding 更新已有持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    store = useHoldingStore()
    await store.addOrUpdateHolding({ code: '000001', name: 'A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund' })
    await store.addOrUpdateHolding({ code: '000001', name: 'B', buyNetValue: 1.2, shares: 200, buyDate: '2024-01-01', assetClass: 'fund' })
    expect(store.holdings.length).toBe(1)
    expect(store.holdings[0].name).toBe('B')
  })

  test('removeHolding 删除持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    store = useHoldingStore()
    await store.addOrUpdateHolding({ code: '000001', name: 'A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund' })
    await store.addOrUpdateHolding({ code: '000002', name: 'B', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund' })
    expect(store.holdings.length).toBe(2)
    store.removeHolding('000001')
    expect(store.holdings.length).toBe(1)
  })

  test('hasHolding 正确判断', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    store = useHoldingStore()
    expect(store.hasHolding('000001')).toBe(false)
    await store.addOrUpdateHolding({ code: '000001', name: 'A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund' })
    expect(store.hasHolding('000001')).toBe(true)
  })

  test('getHoldingByCode 返回正确持仓', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    store = useHoldingStore()
    await store.addOrUpdateHolding({ code: '000001', name: 'A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', assetClass: 'fund' })
    const h = store.getHoldingByCode('000001')
    expect(h).toBeTruthy()
    expect(h.name).toBe('A')
  })

  test('updateHoldingDays 更新持有天数', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    store = useHoldingStore()
    const buyDate = new Date()
    buyDate.setFullYear(buyDate.getFullYear() - 1)
    const dateStr = buyDate.toISOString().split('T')[0]
    await store.addOrUpdateHolding({ code: '000001', name: 'A', buyNetValue: 1, shares: 100, buyDate: dateStr, assetClass: 'fund' })
    store.updateHoldingDays()
    expect(store.holdings[0].holdingDays).toBeGreaterThan(360)
  })
})
