import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/http', () => ({ http: { text: vi.fn(), json: vi.fn() } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('./cache', () => ({ cache: { get: vi.fn(() => null), set: vi.fn() } }))

describe('astock.ts - parseSinaResponse', () => {
  test('解析单只股票', async () => {
    const { parseSinaResponse } = await import('@/api/astock')
    const text = 'var hq_str_sh600519="贵州茅台,1234.56,1233.33,1240.00,1245.00,1230.00,100,200,1234567,9876543";'
    const result = parseSinaResponse(text, ['sh600519'])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('贵州茅台')
    expect(result[0]!.currentPrice).toBe(1240)
    expect(result[0]!.change).toBeCloseTo(6.67, 1)
  })

  test('解析多只股票', async () => {
    const { parseSinaResponse } = await import('@/api/astock')
    const text = [
      'var hq_str_sh600519="贵州茅台,1234.56,1233.33,1240.00,1245.00,1230.00,100,200,1234567,9876543";',
      'var hq_str_sz000001="平安银行,12.34,12.30,12.40,12.50,12.20,10,20,123456,98765";'
    ].join('\n')
    const result = parseSinaResponse(text, ['sh600519', 'sz000001'])
    expect(result).toHaveLength(2)
  })

  test('空字符串返回空数组', async () => {
    const { parseSinaResponse } = await import('@/api/astock')
    expect(parseSinaResponse('', ['sh600519'])).toEqual([])
  })

  test('数据不足10字段跳过', async () => {
    const { parseSinaResponse } = await import('@/api/astock')
    const text = 'var hq_str_sh600519="贵州茅台,1234.56";'
    expect(parseSinaResponse(text, ['sh600519'])).toEqual([])
  })
})
