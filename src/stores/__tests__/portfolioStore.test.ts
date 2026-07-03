// [WHY] portfolio store 单元测试：验证投资组合汇总数据、资产配置与重置逻辑
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePortfolioStore } from '@/stores/portfolioStore'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('usePortfolioStore - 投资组合汇总', () => {
  it('初始状态：所有汇总值为 0、分布为空', () => {
    const store = usePortfolioStore()
    expect(store.totalValue).toBe(0)
    expect(store.totalProfit).toBe(0)
    expect(store.totalProfitRate).toBe(0)
    expect(store.todayProfit).toBe(0)
    expect(store.assetAllocation).toEqual({})
    expect(store.currencyDistribution).toEqual({})
    expect(store.isProfitable).toBe(false)
    expect(store.profitPercentage).toBe(0)
  })

  it('updateSummary：写入汇总数据', () => {
    const store = usePortfolioStore()
    store.updateSummary({
      totalValue: 10000,
      totalProfit: 1500,
      totalProfitRate: 17.65,
      todayProfit: 200,
    })
    expect(store.totalValue).toBe(10000)
    expect(store.totalProfit).toBe(1500)
    expect(store.totalProfitRate).toBeCloseTo(17.65)
    expect(store.todayProfit).toBe(200)
  })

  it('updateAssetAllocation：写入资产配置分布', () => {
    const store = usePortfolioStore()
    const allocation = { fund: 6000, astock: 3000, crypto: 1000 }
    store.updateAssetAllocation(allocation)
    expect(store.assetAllocation).toEqual(allocation)
    expect(store.assetAllocation).not.toBe(allocation) // 应为浅拷贝
  })

  it('updateCurrencyDistribution：写入币种分布', () => {
    const store = usePortfolioStore()
    const distribution = { CNY: 8000, USD: 2000 }
    store.updateCurrencyDistribution(distribution)
    expect(store.currencyDistribution).toEqual(distribution)
    expect(store.currencyDistribution).not.toBe(distribution)
  })

  it('isProfitable：盈利时为 true、亏损时为 false', () => {
    const store = usePortfolioStore()
    store.updateSummary({ totalValue: 0, totalProfit: 100, totalProfitRate: 0, todayProfit: 0 })
    expect(store.isProfitable).toBe(true)

    store.updateSummary({ totalValue: 0, totalProfit: 0, totalProfitRate: 0, todayProfit: 0 })
    expect(store.isProfitable).toBe(false)

    store.updateSummary({ totalValue: 0, totalProfit: -50, totalProfitRate: 0, todayProfit: 0 })
    expect(store.isProfitable).toBe(false)
  })

  it('profitPercentage：按 totalProfit / totalValue 计算', () => {
    const store = usePortfolioStore()
    store.updateSummary({ totalValue: 10000, totalProfit: 1500, totalProfitRate: 0, todayProfit: 0 })
    expect(store.profitPercentage).toBeCloseTo(15)

    // totalValue 为 0 时返回 0，避免除零
    store.updateSummary({ totalValue: 0, totalProfit: 100, totalProfitRate: 0, todayProfit: 0 })
    expect(store.profitPercentage).toBe(0)
  })

  it('reset：清空所有汇总与分布数据', () => {
    const store = usePortfolioStore()
    store.updateSummary({ totalValue: 10000, totalProfit: 1500, totalProfitRate: 17.65, todayProfit: 200 })
    store.updateAssetAllocation({ fund: 6000, astock: 3000 })
    store.updateCurrencyDistribution({ CNY: 8000, USD: 2000 })

    store.reset()

    expect(store.totalValue).toBe(0)
    expect(store.totalProfit).toBe(0)
    expect(store.totalProfitRate).toBe(0)
    expect(store.todayProfit).toBe(0)
    expect(store.assetAllocation).toEqual({})
    expect(store.currencyDistribution).toEqual({})
    expect(store.isProfitable).toBe(false)
  })
})
