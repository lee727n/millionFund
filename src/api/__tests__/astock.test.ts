import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/utils/http', () => ({ http: { text: vi.fn(), json: vi.fn() } }))
vi.mock('./cache', () => ({ cache: { get: vi.fn(), set: vi.fn() } }))

describe('astock.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('formatSymbol 添加 sh 前缀（6开头）', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('600519')).toBe('sh600519')
    expect(formatSymbol('900900')).toBe('sh900900')
  })

  test('formatSymbol 添加 bj 前缀（4/8开头）', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('430001')).toBe('bj430001')
    expect(formatSymbol('830001')).toBe('bj830001')
  })

  test('formatSymbol 添加 sz 前缀（其他）', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('000001')).toBe('sz000001')
    expect(formatSymbol('300001')).toBe('sz300001')
    expect(formatSymbol('002001')).toBe('sz002001')
  })

  test('formatSymbol 已含前缀时直接返回小写', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('SH600519')).toBe('sh600519')
    expect(formatSymbol('sz000001')).toBe('sz000001')
  })

  test('formatSymbol 空字符串返回空', async () => {
    const { formatSymbol } = await import('@/api/astock')
    expect(formatSymbol('')).toBe('')
    expect(formatSymbol('   ')).toBe('')
  })

  test('formatSymbols 批量格式化', async () => {
    const { formatSymbols } = await import('@/api/astock')
    expect(formatSymbols(['600519', '000001'])).toEqual(['sh600519', 'sz000001'])
  })

  test('fetchAStockQuote 空数组返回空', async () => {
    const { fetchAStockQuote } = await import('@/api/astock')
    const result = await fetchAStockQuote([])
    expect(result).toEqual([])
  })

  test('fetchSingleAStock 失败时返回 null', async () => {
    const { fetchSingleAStock } = await import('@/api/astock')
    const result = await fetchSingleAStock('sh600519')
    expect(result).toBeNull()
  })

  describe('parseSinaResponse', () => {
    test('解析单只股票响应', async () => {
      const { parseSinaResponse } = await import('@/api/astock')
      const text = 'var hq_str_sh600519="贵州茅台,1234.56,1233.33,1240.00,1245.00,1230.00,100,200,1234567,9876543";'
      const result = parseSinaResponse(text, ['sh600519'])
      expect(result).toHaveLength(1)
      expect(result[0]!.symbol).toBe('sh600519')
      expect(result[0]!.name).toBe('贵州茅台')
      expect(result[0]!.currentPrice).toBe(1240)
      expect(result[0]!.prevClose).toBe(1233.33)
      expect(result[0]!.change).toBeCloseTo(6.67, 1)
      expect(result[0]!.changePercent).toBeCloseTo(0.54, 1)
    })

    test('解析多只股票响应', async () => {
      const { parseSinaResponse } = await import('@/api/astock')
      const text = [
        'var hq_str_sh600519="贵州茅台,1234.56,1233.33,1240.00,1245.00,1230.00,100,200,1234567,9876543";',
        'var hq_str_sz000001="平安银行,12.34,12.30,12.40,12.50,12.20,10,20,123456,98765";'
      ].join('\n')
      const result = parseSinaResponse(text, ['sh600519', 'sz000001'])
      expect(result).toHaveLength(2)
      expect(result[0]!.symbol).toBe('sh600519')
      expect(result[1]!.symbol).toBe('sz000001')
    })

    test('空响应返回空数组', async () => {
      const { parseSinaResponse } = await import('@/api/astock')
      const result = parseSinaResponse('', ['sh600519'])
      expect(result).toEqual([])
    })

    test('格式错误行被跳过', async () => {
      const { parseSinaResponse } = await import('@/api/astock')
      const text = 'invalid line\nvar hq_str_sh600519="贵州茅台,1234.56,1233.33,1240.00,1245.00,1230.00,100,200,1234567,9876543";'
      const result = parseSinaResponse(text, ['sh600519'])
      expect(result).toHaveLength(1)
    })

    test('数据不足10个字段时跳过', async () => {
      const { parseSinaResponse } = await import('@/api/astock')
      const text = 'var hq_str_sh600519="贵州茅台,1234.56";'
      const result = parseSinaResponse(text, ['sh600519'])
      expect(result).toEqual([])
    })
  })
})
