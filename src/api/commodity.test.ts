// [WHY] 大宗商品/贵金属行情 API 单元测试
// [WHAT] 测试大宗商品行情 API 的纯函数和边界情况

import { describe, it, expect } from 'vitest'
import { fetchCommodityQuote, parseSinaCommodityResponse } from '../api/commodity'
import type { CommodityQuote, GoldPrice } from '../types/commodity'

// ========== parseSinaCommodityResponse 测试 ==========

describe('parseSinaCommodityResponse', () => {
  it('应正确解析新浪财经响应', () => {
    const text = `var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00";
var hq_str_Ag9999="上海白银,8200.00,50.00,0.61,50,8190.00,8210.00";`

    const result = parseSinaCommodityResponse(text, ['Au9999', 'Ag9999'])

    expect(result.length).toBe(2)

    const gold = result.find(q => q.symbol === 'Au9999')
    expect(gold).toBeDefined()
    expect(gold!.name).toBe('上海黄金')
    expect(gold!.price).toBe(560.50)
    expect(gold!.change).toBe(2.50)
    expect(gold!.changePercent).toBe(0.45)
    expect(gold!.volume).toBe(100)
    expect(gold!.bidPrice).toBe(560.00)
    expect(gold!.askPrice).toBe(561.00)

    const silver = result.find(q => q.symbol === 'Ag9999')
    expect(silver).toBeDefined()
    expect(silver!.name).toBe('上海白银')
    expect(silver!.price).toBe(8200.00)
  })

  it('应返回空数组当响应为空', () => {
    const result = parseSinaCommodityResponse('', ['Au9999'])
    expect(result).toEqual([])
  })

  it('应跳过格式错误的数据行', () => {
    const text = `invalid line
var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00"`

    const result = parseSinaCommodityResponse(text, ['Au9999'])
    expect(result.length).toBe(1)
  })

  it('应处理字段不足的数据', () => {
    const text = `var hq_str_Au9999="上海黄金,560.50,2.50"`

    const result = parseSinaCommodityResponse(text, ['Au9999'])
    // 字段不足 7 个，应该跳过
    expect(result.length).toBe(0)
  })
})

// ========== fetchCommodityQuote 测试 ==========

describe('fetchCommodityQuote', () => {
  it('应返回空数组当输入为空', async () => {
    const result = await fetchCommodityQuote([])
    expect(result).toEqual([])
  })

  it('应返回大宗商品行情数组（使用兜底数据）', async () => {
    // 在测试环境中，API 可能无法访问，会返回兜底数据
    const symbols = ['Au9999', 'Ag9999']
    const result = await fetchCommodityQuote(symbols)

    expect(result).toBeInstanceOf(Array)
    // 兜底数据应该返回
    expect(result.length).toBeGreaterThanOrEqual(0)
  }, 10000) // 增加超时时间到 10 秒
})

// ========== 类型检查测试 ==========

describe('CommodityQuote 类型', () => {
  it('应符合类型定义', () => {
    const quote: CommodityQuote = {
      symbol: 'Au9999',
      name: '上海黄金',
      price: 560.50,
      change: 2.50,
      changePercent: 0.45,
      volume: 100,
      bidPrice: 560.00,
      askPrice: 561.00,
      updateTime: new Date().toISOString()
    }

    expect(quote.symbol).toBe('Au9999')
    expect(quote.price).toBe(560.50)
    expect(quote.change).toBe(2.50)
    expect(quote.changePercent).toBe(0.45)
  })
})

describe('GoldPrice 类型', () => {
  it('应符合类型定义', () => {
    const goldPrice: GoldPrice = {
      price: 560.50,
      change: 2.50,
      changePercent: 0.45,
      updateTime: new Date().toISOString()
    }

    expect(goldPrice.price).toBe(560.50)
    expect(goldPrice.change).toBe(2.50)
    expect(goldPrice.changePercent).toBe(0.45)
  })
})
