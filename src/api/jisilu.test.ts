// [WHY] 集思录 API 单元测试
// [WHAT] 测试可转债行情 API 的纯函数和边界情况

import { describe, it, expect } from 'vitest'
import { fetchConvertibleBonds, fetchConvertibleList, fetchConvertibleQuote, fallbackConvertibleBonds } from '../api/jisilu'
import type { ConvertibleBond } from '../types/convertible'

// ========== 兜底数据测试 ==========

describe('fallbackConvertibleBonds', () => {
  it('应返回预设的可转债兜底数据', () => {
    const data = fallbackConvertibleBonds()

    expect(data).toBeInstanceOf(Array)
    expect(data.length).toBeGreaterThan(0)

    // 检查第一条数据的字段
    const first = data[0]!
    expect(first.code).toBeDefined()
    expect(first.name).toBeDefined()
    expect(first.price).toBeGreaterThan(0)
    expect(first.change).toBeDefined()
    expect(first.changePercent).toBeDefined()
    expect(first.premiumRate).toBeDefined()
    expect(first.residualDuration).toBeDefined()
  })

  it('应包含所有必需字段', () => {
    const data = fallbackConvertibleBonds()

    data.forEach((bond: ConvertibleBond) => {
      expect(bond.code).toBeDefined()
      expect(bond.name).toBeDefined()
      expect(bond.price).toBeDefined()
      expect(bond.change).toBeDefined()
      expect(bond.changePercent).toBeDefined()
      expect(bond.premiumRate).toBeDefined()
      expect(bond.residualDuration).toBeDefined()
      expect(bond.remainingSize).toBeDefined()
      expect(bond.rating).toBeDefined()
      expect(bond.callDays).toBeDefined()
      expect(bond.ytm).toBeDefined()
    })
  })

  it('应返回固定数量的数据（5条）', () => {
    const data = fallbackConvertibleBonds()
    expect(data.length).toBe(5)
  })
})

// ========== fetchConvertibleBonds 测试 ==========

describe('fetchConvertibleBonds', () => {
  it('应返回可转债数组', async () => {
    const result = await fetchConvertibleBonds(5)
    expect(result).toBeInstanceOf(Array)
    // 兜底数据或 API 数据都应该是数组
    expect(Array.isArray(result)).toBe(true)
  })

  it('应尊重 count 参数限制返回数量', async () => {
    const result = await fetchConvertibleBonds(3)
    // 无论是 API 数据还是兜底数据，都应该 ≤ count
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('应返回默认 20 条或更少', async () => {
    const result = await fetchConvertibleBonds()
    expect(result.length).toBeLessThanOrEqual(20)
  })
})

// ========== fetchConvertibleList 测试 ==========

describe('fetchConvertibleList', () => {
  it('应是 fetchConvertibleBonds 的封装', async () => {
    const result = await fetchConvertibleList(5)
    expect(result).toBeInstanceOf(Array)
  })

  it('应返回与 fetchConvertibleBonds 相同的结果', async () => {
    const result1 = await fetchConvertibleBonds(5)
    const result2 = await fetchConvertibleList(5)
    
    expect(result1.length).toBe(result2.length)
    if (result1.length > 0 && result2.length > 0) {
      expect(result1[0]!.code).toBe(result2[0]!.code)
    }
  })
})

// ========== fetchConvertibleQuote 测试 ==========

describe('fetchConvertibleQuote', () => {
  it('应返回空数组当输入为空', async () => {
    const result = await fetchConvertibleQuote([])
    expect(result).toEqual([])
  })

  it('应返回指定代码的可转债行情', async () => {
    const codes = ['113050', '110079']
    const result = await fetchConvertibleQuote(codes)

    expect(result).toBeInstanceOf(Array)
    // 检查返回的数据是否包含指定的代码（如果有的话）
    if (result.length > 0) {
      result.forEach((bond) => {
        expect(codes).toContain(bond.code)
      })
    }
  })

  it('应返回空数组当代码不存在', async () => {
    const codes = ['999999'] // 不存在的代码
    const result = await fetchConvertibleQuote(codes)
    // 兜底数据中没有这个代码，应该返回空数组
    expect(result.length).toBe(0)
  })
})

// ========== 类型检查测试 ==========

describe('ConvertibleBond 类型', () => {
  it('应符合类型定义', () => {
    const bond: ConvertibleBond = {
      code: '113050',
      name: '南银转债',
      price: 125.80,
      change: 0.44,
      changePercent: 0.35,
      premiumRate: -0.5,
      residualDuration: 3.51,
      remainingSize: 8.5,
      rating: 'AAA',
      callDays: 1280,
      ytm: -1.2,
    }

    expect(bond.code).toBe('113050')
    expect(bond.price).toBe(125.80)
    expect(bond.change).toBe(0.44)
    expect(bond.premiumRate).toBe(-0.5)
    expect(bond.residualDuration).toBe(3.51)
  })
})
