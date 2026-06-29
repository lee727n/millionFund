import { describe, test, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('holding.ts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  test('summary getter 计算正确', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '000001', name: '基金A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', holdingDays: 0, currentValue: 1.1, marketValue: 110, profit: 10, profitRate: 10, todayChange: '1%', todayProfit: 1, loading: false, source: '测试', isQDII: false, createdAt: Date.now() } as any,
      { code: '000002', name: '基金B', buyNetValue: 2, shares: 50, buyDate: '2024-01-01', holdingDays: 0, currentValue: 1.9, marketValue: 95, profit: -5, profitRate: -5, todayChange: '-1%', todayProfit: -1, loading: false, source: '测试', isQDII: false, createdAt: Date.now() } as any,
    ]
    expect(store.summary.totalValue).toBe(205)
    expect(store.summary.totalProfit).toBe(5)
  })

  test('holdingCodes getter 返回代码列表', async () => {
    const { useHoldingStore } = await import('@/stores/holding')
    const store = useHoldingStore()
    store.holdings = [
      { code: '000001', name: 'A' } as any,
      { code: '000002', name: 'B' } as any,
    ]
    expect(store.holdingCodes).toEqual(['000001', '000002'])
  })
})
