import { describe, test, expect } from 'vitest'
import { aggregateKLine, type SimpleKLineData } from '@/api/fundNetValue'

function daily(values: Array<[string, number]>): SimpleKLineData[] {
  return values.map(([time, value]) => ({ time, value, change: 0 }))
}

describe('aggregateKLine', () => {
  test('空数据返回空数组', () => {
    expect(aggregateKLine([], 'week')).toEqual([])
  })

  test('周线聚合：按周一分组并计算 OHLC', () => {
    // 2024-01-01 为周一；构造跨两周的数据
    const data = daily([
      ['2024-01-01', 1.0], // 周一
      ['2024-01-02', 1.1],
      ['2024-01-03', 0.9],
      ['2024-01-04', 1.2],
      ['2024-01-05', 1.15], // 周五
      ['2024-01-08', 1.3], // 下周一
      ['2024-01-09', 1.25],
    ])
    const candles = aggregateKLine(data, 'week')
    expect(candles.length).toBe(2)

    // 第一周：open=周一, close=周五, high/low 取极值
    expect(candles[0]!.time).toBe('2024-01-01')
    expect(candles[0]!.open).toBe(1.0)
    expect(candles[0]!.close).toBeCloseTo(1.15)
    expect(candles[0]!.high).toBeCloseTo(1.2)
    expect(candles[0]!.low).toBeCloseTo(0.9)
    expect(candles[0]!.change).toBeCloseTo(15)

    // 第二周
    expect(candles[1]!.time).toBe('2024-01-08')
    expect(candles[1]!.open).toBe(1.3)
    expect(candles[1]!.close).toBeCloseTo(1.25)
  })

  test('月线聚合：按 YYYY-MM 分组', () => {
    const data = daily([
      ['2024-01-02', 1.0],
      ['2024-01-15', 1.2],
      ['2024-01-31', 0.95],
      ['2024-02-01', 1.5],
      ['2024-02-20', 1.4],
    ])
    const candles = aggregateKLine(data, 'month')
    expect(candles.length).toBe(2)

    expect(candles[0]!.time).toBe('2024-01')
    expect(candles[0]!.open).toBe(1.0)
    expect(candles[0]!.close).toBeCloseTo(0.95)
    expect(candles[0]!.high).toBeCloseTo(1.2)
    expect(candles[0]!.low).toBeCloseTo(0.95)

    expect(candles[1]!.time).toBe('2024-02')
    expect(candles[1]!.open).toBe(1.5)
    expect(candles[1]!.close).toBeCloseTo(1.4)
  })

  test('乱序输入按时间排序后再聚合', () => {
    const data = daily([
      ['2024-01-05', 1.15],
      ['2024-01-01', 1.0],
      ['2024-01-08', 1.3],
    ])
    const candles = aggregateKLine(data, 'week')
    expect(candles[0]!.time).toBe('2024-01-01')
    expect(candles[1]!.time).toBe('2024-01-08')
  })
})
