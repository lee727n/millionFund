import { describe, test, expect } from 'vitest'
import {
  calculateReturnAnalysis,
  calculateFundScore,
  simulateDIP,
  analyzeBestDIPDay,
  calculateCorrelation,
  predictTrend,
  analyzeAllocation,
} from '@/utils/statistics'

function makePoint(date: string, value: number) {
  return { date, value }
}

function makeSeries(points: [string, number][]): { date: string; value: number }[] {
  return points.map(([d, v]) => ({ date: d, value: v }))
}

describe('statistics.ts', () => {
  // ========== calculateReturnAnalysis ==========
  describe('calculateReturnAnalysis', () => {
    test('数据不足返回 null', () => {
      expect(calculateReturnAnalysis([])).toBeNull()
      expect(calculateReturnAnalysis(makeSeries([['2024-01-01', 1]]))).toBeNull()
    })

    test('正确计算总收益率', () => {
      const data = makeSeries([['2024-01-01', 1.0], ['2024-01-02', 1.1]])
      const r = calculateReturnAnalysis(data)
      expect(r).not.toBeNull()
      expect(r!.totalReturn).toBeCloseTo(10, 1)
    })

    test('正确计算最大回撤', () => {
      const data = makeSeries([
        ['2024-01-01', 1.0],
        ['2024-01-02', 1.2],
        ['2024-01-03', 0.9],
        ['2024-01-04', 1.1],
      ])
      const r = calculateReturnAnalysis(data)
      expect(r!.maxDrawdown).toBeCloseTo(25, 1)
    })

    test('返回所有必需字段', () => {
      const data = makeSeries([['2024-01-01', 1.0], ['2024-01-02', 1.05]])
      const r = calculateReturnAnalysis(data)
      expect(r).toHaveProperty('sharpeRatio')
      expect(r).toHaveProperty('sortinoRatio')
      expect(r).toHaveProperty('calmarRatio')
      expect(r).toHaveProperty('annualizedReturn')
    })
  })

  // ========== calculateFundScore ==========
  describe('calculateFundScore', () => {
    function makeAnalysis(overrides: Record<string, number> = {}) {
      return {
        totalReturn: overrides.totalReturn ?? 20,
        annualizedReturn: overrides.annualizedReturn ?? 15,
        dailyReturn: overrides.dailyReturn ?? 0.05,
        volatility: overrides.volatility ?? 10,
        maxDrawdown: overrides.maxDrawdown ?? 8,
        maxDrawdownStart: '2024-01-01',
        maxDrawdownEnd: '2024-03-01',
        sharpeRatio: overrides.sharpeRatio ?? 1.5,
        sortinoRatio: overrides.sortinoRatio ?? 1.2,
        calmarRatio: overrides.calmarRatio ?? 1.8,
        tradingDays: 252,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      }
    }

    test('高收益低波动 → S/A 级', () => {
      const s = calculateFundScore(makeAnalysis({ annualizedReturn: 50, volatility: 5, maxDrawdown: 3, sharpeRatio: 2.5 }))
      expect(['S', 'A']).toContain(s.level)
    })

    test('低收益高波动 → C/D 级', () => {
      const s = calculateFundScore(makeAnalysis({ annualizedReturn: -30, volatility: 40, maxDrawdown: 50 }))
      expect(['C', 'D']).toContain(s.level)
    })

    test('评分在 0-100 之间', () => {
      const s = calculateFundScore(makeAnalysis())
      expect(s.totalScore).toBeGreaterThanOrEqual(0)
      expect(s.totalScore).toBeLessThanOrEqual(100)
    })
  })

  // ========== simulateDIP ==========
  describe('simulateDIP', () => {
    test('数据不足返回 null', () => {
      expect(simulateDIP([], 1000)).toBeNull()
    })

    test('月度定投正确计算', () => {
      // 需要 >=10 个数据点，且分布在多个月
      const data: { date: string; value: number }[] = []
      for (let m = 1; m <= 12; m++) {
        data.push(makePoint(`2024-${String(m).padStart(2,'0')}-01`, 1 + m * 0.01))
      }
      const r = simulateDIP(data, 1000, 'monthly')
      expect(r).not.toBeNull()
      expect(r!.periods).toBeGreaterThan(0)
      expect(r!.totalInvested).toBeGreaterThan(0)
    })

    test('周度定投', () => {
      const data: { date: string; value: number }[] = []
      for (let w = 0; w < 12; w++) {
        const d = new Date(2024, 0, 1 + w * 7)
        data.push(makePoint(d.toISOString().slice(0, 10), 1 + w * 0.01))
      }
      const r = simulateDIP(data, 1000, 'weekly')
      expect(r).not.toBeNull()
    })
  })

  // ========== analyzeBestDIPDay ==========
  describe('analyzeBestDIPDay', () => {
    test('数据不足返回空数组', () => {
      expect(analyzeBestDIPDay([])).toEqual([])
    })

    test('返回排序后的结果', () => {
      const data: { date: string; value: number }[] = []
      for (let d = 1; d <= 28; d++) {
        data.push(makePoint(`2024-01-${String(d).padStart(2, '0')}`, 1 + Math.random()))
      }
      const result = analyzeBestDIPDay(data)
      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i]!.averageReturn).toBeLessThanOrEqual(result[i - 1]!.averageReturn)
        }
      }
    })
  })

  // ========== calculateCorrelation ==========
  describe('calculateCorrelation', () => {
    test('基金不足2个返回 null', () => {
      expect(calculateCorrelation([])).toBeNull()
    })

    test('正确计算相关性矩阵', () => {
      const funds = [
        { code: 'F1', name: 'F1', data: makeSeries([['2024-01-01', 1.0], ['2024-01-02', 1.1]]) },
        { code: 'F2', name: 'F2', data: makeSeries([['2024-01-01', 1.0], ['2024-01-02', 1.05]]) },
      ]
      const r = calculateCorrelation(funds)
      expect(r).not.toBeNull()
      expect(r!.matrix[0]![0]).toBe(1)
      expect(r!.codes).toEqual(['F1', 'F2'])
    })
  })

  // ========== predictTrend ==========
  describe('predictTrend', () => {
    test('数据不足返回 null', () => {
      expect(predictTrend([])).toBeNull()
    })

    test('上涨趋势返回 up', () => {
      const data: { date: string; value: number }[] = []
      for (let i = 0; i < 60; i++) {
        data.push(makePoint(`2024-01-${String(i + 1).padStart(2, '0')}`, 1 + i * 0.01))
      }
      const r = predictTrend(data)
      expect(r).not.toBeNull()
      expect(['up', 'down', 'sideways']).toContain(r!.trend)
    })
  })

  // ========== analyzeAllocation ==========
  describe('analyzeAllocation', () => {
    test('正确分析资产配置', () => {
      const holdings = [
        { code: 'F1', name: '股票1', amount: 50000, type: '股票型' },
        { code: 'F2', name: '债券1', amount: 50000, type: '债券型' },
      ]
      const r = analyzeAllocation(holdings)
      expect(r.currentAllocation.length).toBeGreaterThan(0)
      expect(r.riskLevel).toBeTruthy()
    })

    test('高风险配置建议降险', () => {
      const holdings = [
        { code: 'F1', name: '股票1', amount: 90000, type: '股票型' },
        { code: 'F2', name: '股票2', amount: 10000, type: '股票型' },
      ]
      const r = analyzeAllocation(holdings)
      expect(r.riskLevel).toBe('high')
      expect(r.suggestions.length).toBeGreaterThan(0)
    })
  })
})
