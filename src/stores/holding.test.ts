// [WHY] holding store 单元测试：验证持仓管理、收益计算与汇总统计
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useHoldingStore } from '@/stores/holding'
import * as storage from '@/utils/storage'

vi.mock('@/api/fundFast', () => ({
  fetchFundAccurateData: vi.fn((code: string) =>
    Promise.resolve({
      code,
      name: `持仓基金${code}`,
      nav: 1.2000,
      navDate: '2024-01-15',
      navChange: 0,
      estimate: 1.2200,
      estimateTime: '2024-01-15 15:00',
      estimateChange: 1.67,
      currentValue: 1.2200,
      dayChange: 1.67,
      dataSource: 'estimate' as const,
      updateTime: '2024-01-15',
    })
  ),
  fetchNetValueHistoryFast: vi.fn(() =>
    Promise.resolve({ records: [], fundName: '' })
  ),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
  vi.restoreAllMocks()
})

const defaultHolding = {
  code: '000001',
  name: '测试基金',
  buyNetValue: 1.0000,
  shares: 1000,
  buyDate: '2024-01-01',
  holdingDays: 14,
  source: '手动',
  isQDII: false,
  createdAt: Date.now(),
}

describe('useHoldingStore - 持仓管理', () => {
  it('初始状态：空持仓、无汇总', () => {
    const store = useHoldingStore()
    expect(store.holdings).toEqual([])
    expect(store.summary).toEqual({
      totalValue: 0,
      totalProfit: 0,
      totalProfitRate: 0,
      todayProfit: 0,
    })
    expect(store.isRefreshing).toBe(false)
  })

  it('addOrUpdateHolding：新增持仓', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding(defaultHolding)
    expect(store.holdings).toHaveLength(1)
    expect(store.holdings[0]?.code).toBe('000001')
    expect(store.holdingCodes).toEqual(['000001'])
    expect(store.holdings.find(h => h.code === '000001')).toBeDefined()
  })

  it('addOrUpdateHolding：更新已有持仓', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding(defaultHolding)
    store.addOrUpdateHolding({ ...defaultHolding, shares: 2000 })
    expect(store.holdings).toHaveLength(1)
    expect(store.holdings[0]?.shares).toBe(2000)
  })

  it('hasHolding / getHoldingByCode：查找持仓', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding(defaultHolding)
    expect(store.hasHolding('000001')).toBe(true)
    expect(store.hasHolding('999999')).toBe(false)
    expect(store.getHoldingByCode('000001')?.name).toBe('测试基金')
    expect(store.getHoldingByCode('999999')).toBeUndefined()
  })

  it('removeHolding：删除持仓', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding(defaultHolding)
    store.addOrUpdateHolding({ ...defaultHolding, code: '000002', name: '基金2' })
    store.removeHolding('000001')
    expect(store.holdings).toHaveLength(1)
    expect(store.holdings[0]?.code).toBe('000002')
  })

  it('updateHoldingDays：根据 buyDate 计算持仓天数', () => {
    const store = useHoldingStore()
    const now = new Date()
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)
    store.addOrUpdateHolding({ ...defaultHolding, buyDate: tenDaysAgo })
    store.updateHoldingDays()
    expect(store.holdings[0]?.holdingDays).toBeGreaterThanOrEqual(10)
  })

  it('summary：根据持仓计算汇总', async () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding({
      ...defaultHolding,
      currentValue: 1.22,
      marketValue: 1220,
      profit: 220,
      profitRate: 18.03,
      todayChange: '1.67',
      todayProfit: 20.37,
      loading: false,
    })

    const { totalValue, totalProfit, todayProfit, totalProfitRate } = store.summary
    expect(totalValue).toBeCloseTo(1220)
    expect(totalProfit).toBeCloseTo(220)
    expect(todayProfit).toBeCloseTo(20.37)
    expect(totalProfitRate).toBeGreaterThan(0)
  })

  it('refreshEstimates：空列表时不触发请求', async () => {
    const store = useHoldingStore()
    await store.refreshEstimates()
    expect(store.isRefreshing).toBe(false)
  })

  it('fetchPortfolioSummary：计算资产汇总', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding({
      ...defaultHolding,
      assetClass: 'fund',
      currentValue: 1.22,
      marketValue: 1220,
      profit: 220,
      profitRate: 18.03,
      todayProfit: 20.37,
      loading: false,
    })

    const summary = store.fetchPortfolioSummary()

    expect(summary.totalValueCNY).toBeCloseTo(1220)
    expect(summary.totalProfitCNY).toBeCloseTo(220)
    expect(summary.todayChangeCNY).toBeCloseTo(20.37)
    expect(summary.byAssetClass.fund.count).toBe(1)
    expect(summary.byAssetClass.fund.value).toBeCloseTo(1220)
  })

  it('fetchPortfolioSummary：按资产类别分组', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding({
      ...defaultHolding,
      code: '000001',
      assetClass: 'fund',
      marketValue: 10000,
      profit: 1000,
      loading: false,
    })
    store.addOrUpdateHolding({
      ...defaultHolding,
      code: '600001',
      name: 'A股测试',
      assetClass: 'astock',
      marketValue: 5000,
      profit: -500,
      loading: false,
    })

    const summary = store.fetchPortfolioSummary()

    expect(summary.byAssetClass.fund.count).toBe(1)
    expect(summary.byAssetClass.fund.value).toBeCloseTo(10000)
    expect(summary.byAssetClass.astock.count).toBe(1)
    expect(summary.byAssetClass.astock.value).toBeCloseTo(5000)
    expect(summary.totalValueCNY).toBeCloseTo(15000)
    expect(summary.totalProfitCNY).toBeCloseTo(500)
  })

  it('assetClass 默认值为 fund', () => {
    const store = useHoldingStore()
    store.addOrUpdateHolding(defaultHolding) // 不设置 assetClass
    // initHoldings 会将 assetClass 默认为 'fund'（见 holding.ts:145）
    // 但 addOrUpdateHolding 不会，需要手动检查默认值逻辑
    expect(store.holdings[0]?.assetClass).toBeUndefined()
    // fetchPortfolioSummary 内会将 undefined assetClass 视为 'fund'
    const summary = store.fetchPortfolioSummary()
    expect(summary.byAssetClass.fund.count).toBe(1)
  })
})
