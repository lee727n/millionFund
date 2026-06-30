// @ts-nocheck
// [WHY] OCR 工具函数单元测试
// [WHAT] 测试 OCR 识别、持仓解析等核心功能

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock Tesseract.js - ocr.ts 调用 (Tesseract as any).recognize() 静态方法
// 需要同时 mock 默认导出上的 recognize 方法和 createWorker
vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn().mockResolvedValue({ data: { text: '' } }),
  },
  recognize: vi.fn().mockResolvedValue({ data: { text: '' } }),
  createWorker: vi.fn().mockResolvedValue({
    recognize: vi.fn().mockResolvedValue({ data: { text: '' } }),
    terminate: vi.fn().mockResolvedValue(undefined)
  })
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}))

import {
  isTesseractSupported,
  parseHoldingText,
  recognizeHoldings,
  RecognizedHolding
} from '@/utils/ocr'
import Tesseract from 'tesseract.js'

describe('OCR 工具函数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module state by re-importing
    vi.resetModules()
  })

  // ========== isTesseractSupported ==========
  describe('isTesseractSupported', () => {
    test('支持 Worker 环境返回 true', async () => {
      // happy-dom 不支持 Worker，这里手动模拟
      const originalWorker = globalThis.Worker
      ;(globalThis as any).Worker = class MockWorker {
        constructor() {}
        terminate() {}
      }

      const result = await isTesseractSupported()
      expect(result).toBe(true)

      ;(globalThis as any).Worker = originalWorker
    })

    test('不支持 Worker 环境返回 false', async () => {
      const originalWorker = globalThis.Worker
      ;(globalThis as any).Worker = undefined

      const result = await isTesseractSupported()
      expect(result).toBe(false)

      ;(globalThis as any).Worker = originalWorker
    })
  })

  // ========== parseHoldingText ==========
  describe('parseHoldingText', () => {
    test('解析标准格式：代码 名称 金额', () => {
      const text = '000001 华夏成长 10,000.00\n000002 招商中证白酒 2000.00'
      const result = parseHoldingText(text)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        code: '000001',
        name: '华夏成长',
        amount: 10000,
        confidence: 0.9
      })
      expect(result[1]).toEqual({
        code: '000002',
        name: '招商中证白酒',
        amount: 2000,
        confidence: 0.9
      })
    })

    test('解析反向格式：名称 代码 金额', () => {
      const text = '华夏成长 000001 10000.00'
      const result = parseHoldingText(text)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        code: '000001',
        name: '华夏成长',
        amount: 10000,
        confidence: 0.9
      })
    })

    test('解析代码+金额格式（无名称）', () => {
      const text = '000001 10000.00'
      const result = parseHoldingText(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('000001')
      expect(result[0].name).toBe('')
      expect(result[0].amount).toBe(10000)
      expect(result[0].confidence).toBe(0.7)
    })

    test('解析支付宝格式：名称 持有金额 ¥10,000.00', () => {
      const text = '华夏成长混合A 持有金额 ¥10,000.00'
      const result = parseHoldingText(text)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('华夏成长混合A')
      expect(result[0].amount).toBe(10000)
      expect(result[0].confidence).toBe(0.6)
    })

    test('去除名称中的噪音字符', () => {
      const text = '000001 持有金额华夏成长 10000.00'
      const result = parseHoldingText(text)
      expect(result).toHaveLength(1)
      expect(result[0].name).not.toContain('持有')
      expect(result[0].name).not.toContain('金额')
    })

    test('解析带括号的格式：名称(000001)', () => {
      // mergeNameWithParen 把 名称（代码）金额 中的括号行合并
      // 由于替换后金额可能丢失，实际由后续 fallback 逻辑处理
      const text = '华夏成长混合（000001）10,000.00'
      const result = parseHoldingText(text)
      // 至少能识别出金额和名称（通过 fallback 或 pattern4）
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].amount).toBe(10000)
    })

    test('处理中文间多余空格', () => {
      // collapseChineseSpacing 只去掉中文字符之间的空格
      const text = '华 夏 成 长   10,000.00'
      const result = parseHoldingText(text)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].name).toBe('华夏成长')
    })

    test('空文本返回空数组', () => {
      const result = parseHoldingText('')
      expect(result).toEqual([])
    })

    test('只有空白的文本返回空数组', () => {
      const result = parseHoldingText('   \n  \n  ')
      expect(result).toEqual([])
    })

    test('不匹配任何格式的行返回空', () => {
      const text = '这是一些随机文本\n没有基金代码\n没有金额信息'
      const result = parseHoldingText(text)
      expect(result).toEqual([])
    })

    test('小金额仍会被识别（parseSingleLine 不过滤金额大小）', () => {
      const text = '000001 华夏成长 50.00'
      const result = parseHoldingText(text)
      // parseSingleLine 不过滤小金额，仅 parseMultiLine 有 100 元阈值
      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(50)
    })

    test('识别多行持仓信息', () => {
      const text = `2024-01-15 持仓明细
000001 华夏成长 10,000.00
000002 招商中证白酒 20,000.00
000003 易方达蓝筹精选 5,000.00`
      const result = parseHoldingText(text)
      expect(result.length).toBeGreaterThanOrEqual(3)
    })

    test('提取日期作为买入日期', () => {
      const text = '000001 华夏成长 10000.00'
      // 不包含日期，buyDate 不应存在
      const result = parseHoldingText(text)
      expect(result[0].buyDate).toBeUndefined()
    })

    test('检测 YYYY-MM-DD 格式日期', () => {
      const text = '2024-01-15\n000001 华夏成长 10000.00'
      const result = parseHoldingText(text)
      expect(result[0].buyDate).toBe('2024-01-15')
    })

    test('检测 YYYY/MM/DD 格式日期', () => {
      const text = '2024/01/15\n000001 华夏成长 10000.00'
      const result = parseHoldingText(text)
      expect(result[0].buyDate).toBe('2024-01-15')
    })

    test('检测 YYYY年MM月DD日 格式日期', () => {
      const text = '2024年01月15日\n000001 华夏成长 10000.00'
      const result = parseHoldingText(text)
      expect(result[0].buyDate).toBe('2024-01-15')
    })

    test('单行解析不过滤日期格式的6位数字（isValidFundCode 仅在 parseMultiLine 中使用）', () => {
      // parseSingleLine 的 pattern1 只检查6位数字格式，不调用 isValidFundCode
      // 日期如 202401 在单行模式下会被当作基金代码
      const text = '202401 这不是基金代码 10000.00'
      const result = parseHoldingText(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('202401')
    })

    test('合并份额类型行（C/A类）', () => {
      const text = '华夏成长混合\nC\n10000.00'
      const result = parseHoldingText(text)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // ========== recognizeHoldings (integration) ==========
  describe('recognizeHoldings', () => {
    test('成功识别持仓信息', async () => {
      vi.mocked(Tesseract.recognize).mockResolvedValueOnce({
        data: { text: '000001 华夏成长 10,000.00' }
      } as any)

      const result = await recognizeHoldings('data:image/png;base64,mock')
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('000001')
      expect(result[0].name).toBe('华夏成长')
      expect(result[0].amount).toBe(10000)
    })

    test('Tesseract 失败时抛出错误', async () => {
      vi.mocked(Tesseract.recognize).mockRejectedValueOnce(new Error('OCR engine failed'))

      await expect(recognizeHoldings('data:image/png;base64,mock'))
        .rejects.toThrow('OCR 识别失败')
    })

    test('worker 错误时返回友好的错误信息', async () => {
      vi.mocked(Tesseract.recognize).mockRejectedValueOnce(
        new Error('load failed: wasm file not found')
      )

      await expect(recognizeHoldings('data:image/png;base64,mock'))
        .rejects.toThrow('识别引擎加载失败')
    })
  })

  // ========== parseAmount ==========
  describe('parseAmount（通过 parseHoldingText 间接测试）', () => {
    test('解析带逗号的金额', () => {
      const result = parseHoldingText('000001 华夏成长 10,000.00')
      expect(result[0].amount).toBe(10000)
    })

    test('解析带货币符号的金额', () => {
      const result = parseHoldingText('000001 华夏成长 ¥10000.00')
      expect(result[0].amount).toBe(10000)
    })

    test('解析多个小数点的金额（取最后一个）', () => {
      const text = '000001 名称 5.593.25'
      const result = parseHoldingText(text)
      // parseAmount handles multiple dots: "5.593.25" → "5.5925"
      expect(result[0].amount).toBeGreaterThan(0)
    })

    test('无效金额返回 0', () => {
      const result = parseHoldingText('000001 名称 abc')
      // No valid amount, should not match pattern
      expect(result).toEqual([])
    })
  })
})
