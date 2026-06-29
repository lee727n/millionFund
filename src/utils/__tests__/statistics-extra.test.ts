import { describe, test, expect } from 'vitest'
import {
  calculateReturnAnalysis,
  calculateFundScore,
  simulateDIP,
  analyzeBestDIPDay,
  calculateCorrelation,
  predictTrend,
  analyzeAllocation,
  type NetValuePoint
} from '@/utils/statistics'

function makeData(points: number, startNav = 1): NetValuePoint[] {
  const r: NetValuePoint[] = []
  for (let i = 0; i < points; i++) {
    const d = new Date(2024, 0, i + 1)
    r.push({ date: d.toISOString().slice(0, 10), value: startNav + i * 0.01 })
  }
  return r
}

describe('statistics.ts', () => {
  test('calculateReturnAnalysis 数据不足返回 null', () => {
    expect(calculateReturnAnalysis([])).toBeNull()
    expect(calculateReturnAnalysis([{ date: '2024-01-01', value: 1 }])).toBeNull()
  })

  test('calculateReturnAnalysis 正常数据返回分析结果', () => {
    const data = makeData(30)
    const r = calculateReturnAnalysis(data)
    expect(r).not.toBeNull()
    expect(r!.tradingDays).toBe(29)
    expect(r!.totalReturn).toBeTypeOf('number')
  })

  test('calculateFundScore 高收益高分', () => {
    const analysis = calculateReturnAnalysis(makeData(252))!
    const score = calculateFundScore(analysis)
    expect(score.totalScore).toBeGreaterThan(0)
    expect(['S','A','B','C','D']).toContain(score.level)
  })

  test('simulateDIP 数据不足返回 null', () => {
    expect(simulateDIP([{ date: '2024-01-01', value: 1 }], 1000)).toBeNull()
  })

  test('simulateDIP 正常数据返回模拟结果', () => {
    const data = makeData(100)
    const r = simulateDIP(data, 1000)
    expect(r).not.toBeNull()
    expect(r!.periods).toBeGreaterThan(0)
  })

  test('analyzeBestDIPDay 数据不足返回空数组', () => {
    expect(analyzeBestDIPDay([{ date: '2024-01-01', value: 1 }])).toEqual([])
  })

  test('calculateCorrelation 不足2只基金返回 null', () => {
    expect(calculateCorrelation([{ code: '1', name: 'A', data: makeData(10) }])).toBeNull()
  })

  test('calculateCorrelation 2只基金返回相关性矩阵', () => {
    const r = calculateCorrelation([
      { code: '1', name: 'A', data: makeData(30) },
      { code: '2', name: 'B', data: makeData(30) },
    ])
    expect(r).not.toBeNull()
    expect(r!.codes).toHaveLength(2)
    expect(r!.matrix).toHaveLength(2)
  })

  test('predictTrend 数据不足返回 null', () => {
    expect(predictTrend([{ date: '2024-01-01', value: 1 }])).toBeNull()
  })

  test('predictTrend 足够数据返回预测', () => {
    const r = predictTrend(makeData(60))
    expect(r).not.toBeNull()
    expect(['up','down','sideways']).toContain(r!.trend)
  })

  test('analyzeAllocation 空持仓返回合理结果', () => {
    const r = analyzeAllocation([])
    expect(r.currentAllocation).toHaveLength(0)
    expect(r.suggestedAllocation.length).toBeGreaterThan(0)
  })

  test('analyzeAllocation 有持仓返回配置分析', () => {
    const r = analyzeAllocation([
      { code: '000001', name: '基金A', amount: 10000, type: '股票型' },
      { code: '110001', name: '基金B', amount: 5000, type: '债券型' },
    ])
    expect(r.currentAllocation.length).toBe(2)
    expect(r.riskLevel).toBeTruthy()
  })
})
