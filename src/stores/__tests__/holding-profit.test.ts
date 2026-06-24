// [WHY] 持仓收益计算测试 - 验证边界情况处理
// [WHAT] 测试 buyNetValue=0、currentValue=0、shares=0 等边界情况

import { describe, it, expect } from 'vitest'
import type { HoldingRecord, HoldingWithProfit } from '@/types/fund'

// [WHAT] 模拟收益计算函数（从 holding.ts 提取的核心逻辑）
function calculateHoldingProfit(
  holding: HoldingRecord,
  currentValue: number,
  dayChange: number
): HoldingWithProfit {
  let shares = holding.shares
  let buyNav = holding.buyNetValue
  
  // [FIX] 边界情况处理：确保份额和成本净值有效
  if (!shares || shares <= 0) {
    // [CASE 1] 优先使用市值/当前净值估算份额
    if (currentValue > 0 && holding.marketValue && holding.marketValue > 0) {
      shares = holding.marketValue / currentValue
    } 
    // [CASE 2] 使用市值/成本净值估算份额
    else if (buyNav > 0 && holding.marketValue && holding.marketValue > 0) {
      shares = holding.marketValue / buyNav
    } 
    // [CASE 3] 无法计算份额，标记为无效持仓
    else {
      shares = 0
    }
  }
  
  // [FIX] 成本净值边界处理
  if (!buyNav || buyNav <= 0) {
    // [CASE 1] 使用当前净值作为成本（观察仓场景）
    if (currentValue > 0) {
      buyNav = currentValue
    } else {
      // [CASE 2] 无法确定成本，标记为无效
      buyNav = 0
    }
  }

  // [FIX] 份额无效时，跳过收益计算
  if (shares <= 0 || currentValue <= 0 || buyNav <= 0) {
    return {
      ...holding,
      currentValue,
      shares,
      buyNetValue: buyNav,
      marketValue: shares > 0 ? shares * currentValue : holding.marketValue,
      profit: 0,
      profitRate: 0,
      todayProfit: 0,
      todayChange: dayChange.toFixed(2),
      loading: false,
      isUpdated: currentValue > 0
    }
  }

  const marketValue = shares * currentValue
  const profit = (currentValue - buyNav) * shares
  const todayProfit = marketValue * (dayChange / 100)
  const profitRate = marketValue > 0 ? (profit / marketValue) * 100 : 0

  return {
    ...holding,
    currentValue,
    shares,
    buyNetValue: buyNav,
    marketValue,
    profit,
    profitRate,
    todayProfit,
    todayChange: dayChange.toFixed(2),
    loading: false,
    isUpdated: true
  }
}

describe('持仓收益计算', () => {
  describe('正常情况', () => {
    it('正常计算持有收益', () => {
      const holding: HoldingRecord = {
        code: '000001',
        name: '测试基金',
        shares: 1000,
        buyNetValue: 1.0,
        marketValue: 1000
      }
      
      const result = calculateHoldingProfit(holding, 1.2, 5)
      
      expect(result.profit).toBeCloseTo(200)  // (1.2 - 1.0) * 1000
      expect(result.profitRate).toBeCloseTo(16.67)  // 200 / 1200 * 100
      expect(result.marketValue).toBe(1200)
      expect(result.todayProfit).toBe(60)  // 1200 * 5%
    })

    it('负收益计算', () => {
      const holding: HoldingRecord = {
        code: '000002',
        name: '亏损基金',
        shares: 500,
        buyNetValue: 2.0,
        marketValue: 1000
      }
      
      const result = calculateHoldingProfit(holding, 1.5, -3)
      
      expect(result.profit).toBeCloseTo(-250)  // (1.5 - 2.0) * 500
      expect(result.profitRate).toBeCloseTo(-33.33)
      expect(result.todayProfit).toBeCloseTo(-22.5)  // 750 * -3%
    })
  })

  describe('边界情况：buyNetValue=0', () => {
    it('buyNetValue=0 时使用 currentValue 作为成本', () => {
      const holding: HoldingRecord = {
        code: '000003',
        name: '观察仓',
        shares: 100,
        buyNetValue: 0,  // 未设置成本
        marketValue: 0
      }
      
      const result = calculateHoldingProfit(holding, 1.5, 2)
      
      expect(result.buyNetValue).toBe(1.5)  // 使用当前净值作为成本
      expect(result.profit).toBe(0)  // 成本=当前净值，收益为0
      expect(result.profitRate).toBe(0)
    })

    it('buyNetValue=0 且 currentValue=0 时标记为无效', () => {
      const holding: HoldingRecord = {
        code: '000004',
        name: '无效持仓',
        shares: 100,
        buyNetValue: 0,
        marketValue: 0
      }
      
      const result = calculateHoldingProfit(holding, 0, 0)
      
      expect(result.profit).toBe(0)
      expect(result.profitRate).toBe(0)
      expect(result.isUpdated).toBe(false)
    })
  })

  describe('边界情况：shares=0', () => {
    it('shares=0 时使用市值/当前净值估算', () => {
      const holding: HoldingRecord = {
        code: '000005',
        name: '份额未知',
        shares: 0,
        buyNetValue: 1.0,
        marketValue: 1000  // 有市值
      }
      
      const result = calculateHoldingProfit(holding, 2.0, 3)
      
      expect(result.shares).toBe(500)  // 1000 / 2.0
      expect(result.profit).toBe(500)  // (2.0 - 1.0) * 500
      expect(result.marketValue).toBe(1000)
    })

    it('shares=0 且 marketValue=0 时标记为无效', () => {
      const holding: HoldingRecord = {
        code: '000006',
        name: '无份额无市值',
        shares: 0,
        buyNetValue: 1.0,
        marketValue: 0
      }
      
      const result = calculateHoldingProfit(holding, 1.5, 2)
      
      expect(result.profit).toBe(0)
      expect(result.isUpdated).toBe(true)
    })
  })

  describe('边界情况：currentValue=0', () => {
    it('currentValue=0 时返回 profit=0', () => {
      const holding: HoldingRecord = {
        code: '000007',
        name: '净值无效',
        shares: 1000,
        buyNetValue: 1.0,
        marketValue: 1000
      }
      
      const result = calculateHoldingProfit(holding, 0, 0)
      
      expect(result.profit).toBe(0)
      expect(result.profitRate).toBe(0)
      expect(result.isUpdated).toBe(false)
    })
  })

  describe('参数化测试', () => {
    const testCases = [
      { shares: 1000, buyNav: 1.0, current: 1.1, expectedProfit: 100 },
      { shares: 500, buyNav: 2.0, current: 1.8, expectedProfit: -100 },
      { shares: 2000, buyNav: 0.5, current: 0.6, expectedProfit: 200 },
      { shares: 100, buyNav: 10.0, current: 12.0, expectedProfit: 200 },
    ]

    testCases.forEach(({ shares, buyNav, current, expectedProfit }) => {
      it(`shares=${shares}, buyNav=${buyNav}, current=${current} → profit=${expectedProfit}`, () => {
        const holding: HoldingRecord = {
          code: 'TEST',
          name: '测试',
          shares,
          buyNetValue: buyNav,
          marketValue: shares * buyNav
        }
        
        const result = calculateHoldingProfit(holding, current, 0)
        
        expect(result.profit).toBeCloseTo(expectedProfit)
      })
    })
  })
})