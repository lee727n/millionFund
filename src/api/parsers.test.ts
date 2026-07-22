// [WHY] 为各行情 API 的纯解析函数补充单元测试
// [WHAT] 覆盖 A股/期货/大宗商品 新浪行情文本解析，确保字段映射正确
import { describe, it, expect } from 'vitest'
import { parseSinaResponse } from '@/api/astock'
import { parseSinaFutureResponse } from '@/api/future'
import { parseSinaCommodityResponse } from '@/api/commodity'

describe('parseSinaResponse (A股)', () => {
  it('正确解析新浪 A 股行情文本', () => {
    const text =
      'var hq_str_sh600519="贵州茅台,1700.00,1680.00,1730.00,1740.00,1690.00,100,200,1200000,2100000000";'
    const result = parseSinaResponse(text, ['sh600519'])
    expect(result).toHaveLength(1)
    const q = result[0]!
    expect(q.symbol).toBe('sh600519')
    expect(q.name).toBe('贵州茅台')
    expect(q.open).toBe(1700)
    expect(q.prevClose).toBe(1680)
    expect(q.currentPrice).toBe(1730)
    expect(q.high).toBe(1740)
    expect(q.low).toBe(1690)
    expect(q.change).toBeCloseTo(50)
    expect(q.changePercent).toBeCloseTo((50 / 1680) * 100)
  })

  it('忽略空数据与格式错误的行', () => {
    const text = 'var hq_str_sh600519="";\nvar hq_str_sz000001="平安银行,10,9,11,12,8";'
    const result = parseSinaResponse(text, ['sh600519', 'sz000001'])
    // 第一个为空字符串 -> 跳过；第二个字段不足 10 -> 跳过
    expect(result).toHaveLength(0)
  })
})

describe('parseSinaFutureResponse (期货)', () => {
  it('正确解析新浪期货行情文本', () => {
    const text = 'var hq_str_GC2506="黄金期货,2350.50,10.50,0.45,2350.00,2355.00,2345.00,100,5000";'
    const result = parseSinaFutureResponse(text, ['GC2506'])
    expect(result).toHaveLength(1)
    const q = result[0]!
    expect(q.symbol).toBe('GC2506')
    expect(q.name).toBe('黄金期货')
    expect(q.price).toBe(2350.5)
    expect(q.change).toBe(10.5)
    expect(q.changeRate).toBe(0.45)
  })
})

describe('parseSinaCommodityResponse (大宗商品)', () => {
  it('正确解析新浪大宗商品行情文本', () => {
    const text = 'var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00";'
    const result = parseSinaCommodityResponse(text, ['Au9999'])
    expect(result).toHaveLength(1)
    const q = result[0]!
    expect(q.symbol).toBe('Au9999')
    expect(q.name).toBe('上海黄金')
    expect(q.price).toBe(560.5)
    expect(q.change).toBe(2.5)
    expect(q.changePercent).toBe(0.45)
  })
})
