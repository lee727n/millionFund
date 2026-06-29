import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('history.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('loadHistory 从 localStorage 读取数据', async () => {
    const snapshot = JSON.stringify([{ date: '2024-01-01', totalValueCNY: 10000, totalCostCNY: 9000, totalProfitCNY: 1000, byAssetClass: {} }])
    localStorage.setItem('portfolio_history', snapshot)

    const { useHistoryStore } = await import('@/stores/history')
    const store = useHistoryStore()
    const result = store.loadHistory()

    expect(result.length).toBe(1)
    expect(result[0]!.date).toBe('2024-01-01')
  })

  test('loadHistory localStorage 为空时返回空数组', async () => {
    const { useHistoryStore } = await import('@/stores/history')
    const store = useHistoryStore()
    const result = store.loadHistory()

    expect(result).toEqual([])
  })

  test('saveSnapshot 保存快照', async () => {
    const { useHistoryStore } = await import('@/stores/history')
    const store = useHistoryStore()

    store.saveSnapshot({
      date: '2024-01-01',
      totalValueCNY: 10000,
      totalCostCNY: 9000,
      totalProfitCNY: 1000,
      byAssetClass: {},
    })

    const data = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
    expect(data.length).toBe(1)
    expect(data[0].date).toBe('2024-01-01')
  })

  test('saveSnapshot 同一天更新而非新增', async () => {
    const { useHistoryStore } = await import('@/stores/history')
    const store = useHistoryStore()

    store.saveSnapshot({ date: '2024-01-01', totalValueCNY: 10000, totalCostCNY: 9000, totalProfitCNY: 1000, byAssetClass: {} })
    store.saveSnapshot({ date: '2024-01-01', totalValueCNY: 11000, totalCostCNY: 9000, totalProfitCNY: 2000, byAssetClass: {} })

    const data = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
    expect(data.length).toBe(1)
    expect(data[0].totalValueCNY).toBe(11000)
  })

  test('getTrend 获取趋势数据', async () => {
    const { useHistoryStore } = await import('@/stores/history')
    const store = useHistoryStore()

    store.saveSnapshot({ date: '2024-01-01', totalValueCNY: 10000, totalCostCNY: 9000, totalProfitCNY: 1000, byAssetClass: {} })
    store.saveSnapshot({ date: '2024-01-02', totalValueCNY: 11000, totalCostCNY: 9000, totalProfitCNY: 2000, byAssetClass: {} })

    const trend = store.getTrend(7)
    expect(trend.dates.length).toBe(2)
    expect(trend.values.length).toBe(2)
  })

  test('hasTodaySnapshot 检查今天快照', async () => {
    const { useHistoryStore } = await import('@/stores/history')
    const store = useHistoryStore()

    const today = new Date().toISOString().split('T')[0]
    store.saveSnapshot({ date: today, totalValueCNY: 10000, totalCostCNY: 9000, totalProfitCNY: 1000, byAssetClass: {} })

    expect(store.hasTodaySnapshot()).toBe(true)
  })
})
