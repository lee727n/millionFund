// [WHY] A 股行情 API 单元测试
// [WHAT] 测试纯函数和边界情况，避免真实 HTTP 调用

import { describe, it, expect } from 'vitest'
import { formatSymbol, formatSymbols } from '../api/astock'

// ========== 工具函数测试 ==========

describe('formatSymbol', () => {
  it('应正确格式化沪市股票代码（6 开头）', () => {
    expect(formatSymbol('600519')).toBe('sh600519')
    expect(formatSymbol('601318')).toBe('sh601318')
  })

  it('应正确格式化深市股票代码（0/3 开头）', () => {
    expect(formatSymbol('000001')).toBe('sz000001')
    expect(formatSymbol('300750')).toBe('sz300750')
  })

  it('应正确格式化北交所股票代码（4/8 开头）', () => {
    expect(formatSymbol('430047')).toBe('bj430047')
    expect(formatSymbol('830946')).toBe('bj830946')
  })

  it('应直接返回已有前缀的代码', () => {
    expect(formatSymbol('sh600519')).toBe('sh600519')
    expect(formatSymbol('sz000001')).toBe('sz000001')
    expect(formatSymbol('bj430047')).toBe('bj430047')
  })

  it('应处理空字符串', () => {
    expect(formatSymbol('')).toBe('')
  })
})

describe('formatSymbols', () => {
  it('应批量格式化股票代码', () => {
    const result = formatSymbols(['600519', '000001', '300750'])
    expect(result).toEqual(['sh600519', 'sz000001', 'sz300750'])
  })

  it('应过滤空字符串', () => {
    const result = formatSymbols(['600519', '', '000001'])
    expect(result).toEqual(['sh600519', 'sz000001'])
  })

  it('应返回空数组当输入为空', () => {
    const result = formatSymbols([])
    expect(result).toEqual([])
  })
})
