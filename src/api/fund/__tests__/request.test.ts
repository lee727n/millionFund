import { describe, test, expect, vi, beforeEach } from 'vitest'
import {
  parseJsVariable,
  parseJsonpResponse,
  parseJsStringVariable,
  withConcurrencyControl,
  fetchJsData,
  fetchJsonpData,
  fetchFundEstimateViaHttp,
  fetchBatch,
} from '@/api/fund/request'

vi.mock('@/utils/http', () => ({
  http: {
    text: vi.fn(),
    json: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const http = (await import('@/utils/http')).http as any

describe('fund/request.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── parseJsVariable ─────────────────────────────────────────

  describe('parseJsVariable', () => {
    test('解析 var 格式的对象', () => {
      const text = 'var Data_netWorthTrend = [{"x":1704067200000,"y":1.234}];'
      const result = parseJsVariable<{ x: number; y: number }[]>(text, 'Data_netWorthTrend')
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].y).toBe(1.234)
    })

    test('解析数组格式', () => {
      const text = 'var Data_ACWorthTrend = [100,200,300];'
      const result = parseJsVariable<number[]>(text, 'Data_ACWorthTrend')
      expect(result).not.toBeNull()
      expect(result!).toEqual([100, 200, 300])
    })

    test('解析 window.varName 格式', () => {
      const text = 'window.Data_rateInSimilarPers498 = {"Z": {"syl": "5.23"}};'
      const result = parseJsVariable<any>(text, 'Data_rateInSimilarPers498')
      expect(result).not.toBeNull()
      expect(result!.Z).toBeDefined()
    })

    test('解析 JSONP 回调格式 callback({...})', () => {
      const text = 'jsonpgz({"fundcode": "001", "name": "测试基金", "gsz": "1.234"});'
      const result = parseJsVariable<any>(text, 'jsonpgz')
      expect(result).not.toBeNull()
      expect(result!.fundcode).toBe('001')
    })

    test('不匹配时返回 null', () => {
      const text = 'var Data_other = "hello";'
      expect(parseJsVariable(text, 'Data_netWorthTrend')).toBeNull()
    })

    test('空字符串返回 null', () => {
      expect(parseJsVariable('', 'Data_netWorthTrend')).toBeNull()
    })

    test('无效 JSON 返回 null', () => {
      const text = 'var Data_netWorthTrend = [invalid json];'
      expect(parseJsVariable(text, 'Data_netWorthTrend')).toBeNull()
    })

    test('JSON 末尾多余逗号时自动清理', () => {
      const text = 'var Data = {"a": 1,};'
      const result = parseJsVariable<any>(text, 'Data')
      expect(result).not.toBeNull()
      expect(result!.a).toBe(1)
    })

    test('case insensitive 匹配', () => {
      const text = 'VAR Data_test = [1, 2, 3];'
      const result = parseJsVariable<number[]>(text, 'Data_test')
      expect(result).toEqual([1, 2, 3])
    })

    test('解析带嵌套对象的 JSON', () => {
      const text = 'var Data_fundInfo = {"fundcode":"001","name":"测试","Data_netWorthTrend":[1,2,3]};'
      const result = parseJsVariable<any>(text, 'Data_fundInfo')
      expect(result).not.toBeNull()
      expect(result!.fundcode).toBe('001')
      expect(result!['Data_netWorthTrend']).toEqual([1, 2, 3])
    })
  })

  // ─── parseJsonpResponse ──────────────────────────────────────

  describe('parseJsonpResponse', () => {
    test('指定回调名精确匹配', () => {
      const text = 'jsonpgz({"fundcode": "001", "gsz": "1.234"});'
      const result = parseJsonpResponse<any>(text, 'jsonpgz')
      expect(result).not.toBeNull()
      expect(result!.fundcode).toBe('001')
    })

    test('不指定回调名时通用匹配', () => {
      // genericPattern regex: /^[a-zA-Z0-9_]+\s*\(\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\)$/
      // 需要整个文本就是一个 callback({...}) 调用（无尾部分号）
      const text = 'cb({"x": 1})'
      const result = parseJsonpResponse<any>(text)
      expect(result).not.toBeNull()
      expect(result!.x).toBe(1)
    })

    test('匹配失败返回 null', () => {
      expect(parseJsonpResponse('not a jsonp response', 'cb')).toBeNull()
    })

    test('无效 JSON 返回 null', () => {
      expect(parseJsonpResponse('callback(invalid)', 'callback')).toBeNull()
    })
  })

  // ─── parseJsStringVariable ───────────────────────────────────

  describe('parseJsStringVariable', () => {
    test('解析单引号字符串', () => {
      const text = "var fundName = '易方达蓝筹精选';"
      expect(parseJsStringVariable(text, 'fundName')).toBe('易方达蓝筹精选')
    })

    test('解析双引号字符串', () => {
      const text = 'var fundName = "易方达蓝筹精选";'
      expect(parseJsStringVariable(text, 'fundName')).toBe('易方达蓝筹精选')
    })

    test('不匹配时返回 null', () => {
      expect(parseJsStringVariable('var other = 123;', 'fundName')).toBeNull()
    })

    test('解析无引号的数字值', () => {
      const text = 'var count = 42;'
      expect(parseJsStringVariable(text, 'count')).toBe('42')
    })
  })

  // ─── withConcurrencyControl ──────────────────────────────────

  describe('withConcurrencyControl', () => {
    test('并发执行', async () => {
      const results: number[] = []
      const fn = async (id: number) => {
        await new Promise(r => setTimeout(r, 10))
        results.push(id)
        return id
      }

      const promises = [
        withConcurrencyControl(() => fn(1)),
        withConcurrencyControl(() => fn(2)),
        withConcurrencyControl(() => fn(3)),
      ]

      await Promise.all(promises)
      expect(results).toContain(1)
      expect(results).toContain(2)
      expect(results).toContain(3)
    })

    test('失败时 reject', async () => {
      const fn = async () => { throw new Error('test error') }
      await expect(withConcurrencyControl(() => fn())).rejects.toThrow('test error')
    })

    test('多个并发不超过限制', async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const fn = async () => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise(r => setTimeout(r, 20))
        currentConcurrent--
        return 'done'
      }

      const promises = Array.from({ length: 8 }, (_, i) =>
        withConcurrencyControl(() => fn())
      )

      await Promise.all(promises)
      expect(maxConcurrent).toBeLessThanOrEqual(5)
    })
  })

  // ─── fetchFundEstimateViaHttp ────────────────────────────────

  describe('fetchFundEstimateViaHttp', () => {
    test('成功获取估值数据', async () => {
      const mockText = 'jsonpgz({"fundcode": "001", "name": "易方达蓝筹", "gsz": "1.234", "gszzl": "0.50", "gztime": "2026-06-30", "dwjz": "1.200"});'
      vi.mocked(http.text).mockResolvedValue(mockText)

      const result = await fetchFundEstimateViaHttp('001')
      expect(result).not.toBeNull()
      expect(result!.fundcode).toBe('001')
      expect(result!.gsz).toBe('1.234')
    })

    test('无 fundcode 时仍返回解析的数据（parseJsVariable 回退）', async () => {
      // 当 parseJsonpResponse 返回无 fundcode 的数据后，
      // 代码还会尝试 parseJsVariable 作为回退，最终返回找到的数据
      const mockText = 'jsonpgz({"name": "易方达蓝筹"});'
      vi.mocked(http.text).mockResolvedValue(mockText)

      const result = await fetchFundEstimateViaHttp('001')
      // parseJsVariable 会匹配 jsonpgz({...}) 格式并返回数据
      expect(result).not.toBeNull()
      expect(result!.name).toBe('易方达蓝筹')
    })

    test('请求失败返回 null', async () => {
      vi.mocked(http.text).mockRejectedValue(new Error('network'))
      const result = await fetchFundEstimateViaHttp('001')
      expect(result).toBeNull()
    })
  })

  // ─── fetchBatch ──────────────────────────────────────────────

  describe('fetchBatch', () => {
    test('批量成功获取', async () => {
      vi.mocked(http.text).mockResolvedValue('[{"name":"a"}]')

      const result = await fetchBatch(['001', '002'], async (code) => {
        const text = await http.text(`http://example.com/${code}`)
        return { code, data: text }
      })

      expect(result.size).toBe(2)
      expect(result.get('001')).toBeDefined()
      expect(result.get('002')).toBeDefined()
    })

    test('部分失败时继续处理其他项', async () => {
      let callCount = 0
      vi.mocked(http.text).mockImplementation(async (url: string) => {
        callCount++
        if (url.includes('fail')) throw new Error('fail')
        return '["ok"]'
      })

      const result = await fetchBatch(
        ['001', 'fail', '003'],
        async (code) => {
          const text = await http.text(`http://example.com/${code}`)
          return { code, data: text }
        },
        { continueOnError: true }
      )

      expect(result.size).toBe(2)
      expect(result.get('001')).toBeDefined()
      expect(result.get('003')).toBeDefined()
    })

    test('continueOnError=false 时抛出错误', async () => {
      vi.mocked(http.text).mockRejectedValue(new Error('fail'))

      await expect(
        fetchBatch(
          ['001'],
          async (code) => {
            const text = await http.text(`http://example.com/${code}`)
            return { code, data: text }
          },
          { continueOnError: false }
        )
      ).rejects.toThrow('fail')
    })
  })
})
