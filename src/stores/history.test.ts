import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useHistoryStore, type PortfolioSnapshot } from '@/stores/history'

describe('history store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  function makeSnapshot(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
    return {
      date: '2026-07-01',
      totalValueCNY: 100000,
      totalCostCNY: 90000,
      totalProfitCNY: 10000,
      byAssetClass: { stock: { value: 50000 }, bond: { value: 50000 } },
      ...overrides,
    }
  }

  it('初始状态历史为空', () => {
    const store = useHistoryStore()
    expect(store.loadHistory()).toEqual([])
  })

  it('保存快照后可以从 localStorage 读取', () => {
    const store = useHistoryStore()
    const snap = makeSnapshot()
    store.saveSnapshot(snap)

    const loaded = store.loadHistory()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].date).toBe('2026-07-01')
    expect(loaded[0].totalValueCNY).toBe(100000)
    expect(loaded[0].totalProfitCNY).toBe(10000)
  })

  it('同一天多次保存会更新而不是追加', () => {
    const store = useHistoryStore()
    store.saveSnapshot(makeSnapshot())
    store.saveSnapshot(makeSnapshot({ totalValueCNY: 110000, totalProfitCNY: 20000 }))

    const loaded = store.loadHistory()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].totalValueCNY).toBe(110000)
    expect(loaded[0].totalProfitCNY).toBe(20000)
  })

  it('不同天保存会追加并按日期排序', () => {
    const store = useHistoryStore()
    store.saveSnapshot(makeSnapshot({ date: '2026-07-03' }))
    store.saveSnapshot(makeSnapshot({ date: '2026-07-01' }))
    store.saveSnapshot(makeSnapshot({ date: '2026-07-02' }))

    const loaded = store.loadHistory()
    expect(loaded).toHaveLength(3)
    expect(loaded[0].date).toBe('2026-07-01')
    expect(loaded[1].date).toBe('2026-07-02')
    expect(loaded[2].date).toBe('2026-07-03')
  })

  it('超过90天只保留最近90天', () => {
    const store = useHistoryStore()
    for (let i = 0; i < 95; i++) {
      const day = (i + 1).toString().padStart(2, '0')
      store.saveSnapshot(makeSnapshot({ date: `2026-04-${day}`, totalValueCNY: 100000 + i * 1000 }))
    }

    const loaded = store.loadHistory()
    expect(loaded).toHaveLength(90)
  })

  it('hasTodaySnapshot 检测今天是否有快照', () => {
    const store = useHistoryStore()
    const today = new Date().toISOString().split('T')[0]

    expect(store.hasTodaySnapshot()).toBe(false)

    store.saveSnapshot(makeSnapshot({ date: today }))
    expect(store.hasTodaySnapshot()).toBe(true)
  })

  it('getTrend 返回指定天数的趋势', () => {
    const store = useHistoryStore()
    for (let i = 0; i < 10; i++) {
      const day = (i + 1).toString().padStart(2, '0')
      store.saveSnapshot(makeSnapshot({ date: `2026-07-${day}`, totalValueCNY: 100000 + i * 1000 }))
    }

    const trend = store.getTrend(7)
    expect(trend.dates).toHaveLength(7)
    expect(trend.values).toHaveLength(7)
    expect(trend.values[0]).toBe(103000) // July 04: 100000 + 3*1000
    expect(trend.values[6]).toBe(109000) // July 10: 100000 + 9*1000
  })

  it('saveCurrentSnapshot 保存当前资产快照', () => {
    const store = useHistoryStore()
    const today = new Date().toISOString().split('T')[0]

    store.saveCurrentSnapshot({
      totalValueCNY: 500000,
      totalCostCNY: 450000,
      totalProfitCNY: 50000,
      byAssetClass: { fund: { value: 500000 } },
    })

    expect(store.hasTodaySnapshot()).toBe(true)
    const loaded = store.loadHistory()
    const snapshot = loaded.find(s => s.date === today)
    expect(snapshot).toBeDefined()
    expect(snapshot!.totalValueCNY).toBe(500000)
    expect(snapshot!.totalProfitCNY).toBe(50000)
    expect(snapshot!.byAssetClass.fund.value).toBe(500000)
  })

  it('getTrend 不足天数时返回实际条数', () => {
    const store = useHistoryStore()
    store.saveSnapshot(makeSnapshot({ date: '2026-07-01' }))
    store.saveSnapshot(makeSnapshot({ date: '2026-07-02' }))

    const trend = store.getTrend(30)
    expect(trend.dates).toHaveLength(2)
    expect(trend.values).toHaveLength(2)
  })

  it('空历史 getTrend 返回空数组', () => {
    const store = useHistoryStore()
    const trend = store.getTrend(30)
    expect(trend.dates).toEqual([])
    expect(trend.values).toEqual([])
  })
})
