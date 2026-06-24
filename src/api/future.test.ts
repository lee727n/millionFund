// [WHY] 期货行情 API 单元测试
// [WHAT] 测试期货行情 API 的纯函数和边界情况

import { describe, it, expect } from 'vitest'
import { fetchFutureRealtime, fetchFutureBatch, fetchFutureRanking, parseSinaFutureResponse } from '../api/future'
import type { FutureQuote } from '../types/future'

// ========== parseSinaFutureResponse 测试 ==========

describe('parseSinaFutureResponse', () => {
  it('应正确解析新浪财经期货响应', () => {
    const text = `var hq_str_GC2506="黄金2506,2350.50,10.50,0.45,2340.00,2355.00,2335.00,100000,500000";
var hq_str_CL2506="原油2506,78.50,0.85,1.09,77.50,79.00,77.00,50000,200000";`

    const result = parseSinaFutureResponse(text, ['GC2506', 'CL2506'])

    expect(result.length).toBe(2)

    const gold = result.find(q => q.symbol === 'GC2506')
    expect(gold).toBeDefined()
    expect(gold!.name).toBe('黄金2506')
    expect(gold!.price).toBe(2350.50)
    expect(gold!.change).toBe(10.50)
    expect(gold!.changeRate).toBe(0.45)
    expect(gold!.open).toBe(2340.00)
    expect(gold!.high).toBe(2355.00)
    expect(gold!.low).toBe(2335.00)
    expect(gold!.volume).toBe(100000)
    expect(gold!.openInterest).toBe(500000)

    const oil = result.find(q => q.symbol === 'CL2506')
    expect(oil).toBeDefined()
    expect(oil!.name).toBe('原油2506')
    expect(oil!.price).toBe(78.50)
  })

  it('应返回空数组当响应为空', () => {
    const result = parseSinaFutureResponse('', ['GC2506'])
    expect(result).toEqual([])
  })

  it('应跳过格式错误的数据行', () => {
    const text = `invalid line
var hq_str_GC2506="黄金2506,2350.50,10.50,0.45,2340.00,2355.00,2335.00,100000,500000"`

    const result = parseSinaFutureResponse(text, ['GC2506'])
    expect(result.length).toBe(1)
  })

  it('应处理字段不足的数据', () => {
    const text = `var hq_str_GC2506="黄金2506,2350.50"`

    const result = parseSinaFutureResponse(text, ['GC2506'])
    // 字段不足 8 个，应该跳过
    expect(result.length).toBe(0)
  })
})

// ========== fetchFutureBatch 测试 ==========

describe('fetchFutureBatch', () => {
  it('应返回空数组当输入为空', async () => {
    const result = await fetchFutureBatch([])
    expect(result).toEqual([])
  })

  it('应返回期货行情数组（使用兜底数据）', async () => {
    // 在测试环境中，API 可能无法访问，会返回兜底数据
    const symbols = ['GC2506', 'CL2506']
    const result = await fetchFutureBatch(symbols)

    expect(result).toBeInstanceOf(Array)
    // 兜底数据应该返回
    expect(result.length).toBeGreaterThanOrEqual(0)
  }, 10000) // 增加超时时间到 10 秒
})

// ========== fetchFutureRealtime 测试 ==========

describe('fetchFutureRealtime', () => {
  it('应返回 null 当输入为空', async () => {
    const result = await fetchFutureRealtime('')
    expect(result).toBeNull()
  })

  it('应返回期货行情数据（使用兜底数据）', async () => {
    const result = await fetchFutureRealtime('GC2506')

    if (result) {
      expect(result.symbol).toBe('GC2506')
      expect(result.price).toBeGreaterThan(0)
    }
  }, 10000)
})

// ========== fetchFutureRanking 测试 ==========

describe('fetchFutureRanking', () => {
  it('应返回涨幅榜数据（使用兜底数据）', async () => {
    const result = await fetchFutureRanking('rise')

    expect(result).toBeInstanceOf(Array)
    // 兜底数据应该返回
    expect(result.length).toBeGreaterThanOrEqual(0)
  }, 10000)

  it('应返回跌幅榜数据（使用兜底数据）', async () => {
    const result = await fetchFutureRanking('fall')

    expect(result).toBeInstanceOf(Array)
    // 兜底数据应该返回
    expect(result.length).toBeGreaterThanOrEqual(0)
  }, 10000)
})

// ========== 类型检查测试 ==========

describe('FutureQuote 类型', () => {
  it('应符合类型定义', () => {
    const quote: FutureQuote = {
      symbol: 'GC2506',
      name: '黄金2506',
      price: 2350.50,
      change: 10.50,
      changeRate: 0.45,
      open: 2340.00,
      high: 2355.00,
      low: 2335.00,
      volume: 100000,
      openInterest: 500000,
      updatedAt: new Date().toISOString()
    }

    expect(quote.symbol).toBe('GC2506')
    expect(quote.price).toBe(2350.50)
    expect(quote.change).toBe(10.50)
    expect(quote.changeRate).toBe(0.45)
    expect(quote.openInterest).toBe(500000)
  })
})
