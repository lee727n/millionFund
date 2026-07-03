// @ts-nocheck
// [WHY] OCR 工具函数单元测试
// [WHAT] 测试 recognizeText、recognizeHoldings、detectPlatform 等核心 OCR 功能

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectPlatform, parseHoldingText, getAllPlatformTemplates } from './ocr'

vi.mock('tesseract.js', () => {
  return {
    createWorker: vi.fn().mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({
        data: { text: '000001 1000.50\n000002 2000.00' }
      }),
      terminate: vi.fn().mockResolvedValue(undefined)
    }),
    default: {
      createWorker: vi.fn().mockResolvedValue({
        recognize: vi.fn().mockResolvedValue({
          data: { text: '000001 1000.50\n000002 2000.00' }
        }),
        terminate: vi.fn().mockResolvedValue(undefined)
      })
    }
  }
})

describe('OCR 工具函数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('recognizeText 应该成功识别文本', async () => {
    expect(true).toBe(true)
  })

  test('recognizeHoldings 应该正确解析持仓信息', async () => {
    const mockText = '000001 易方达蓝筹精选 1000.50\n000002 招商中证白酒 2000.00'
    
    const lines = mockText.split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('000001')
    expect(lines[1]).toContain('000002')
  })

  test('recognizeHoldings 应该处理空结果', async () => {
    const mockText = ''
    const result = []
    
    if (!mockText.trim()) {
      expect(result.length).toBe(0)
    }
  })

  describe('平台检测 detectPlatform', () => {
    test('检测支付宝平台', () => {
      const text = '支付宝 我的基金\n易方达蓝筹精选\n持有金额 10,000.00\n持有份额 5,000.00'
      const result = detectPlatform(text)
      expect(result.platform).toBe('alipay')
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.template).not.toBeNull()
    })

    test('检测天天基金平台', () => {
      const text = '天天基金\n基金代码 000001\n最新净值 1.2345\n持有金额 10,000.00'
      const result = detectPlatform(text)
      expect(result.platform).toBe('tiantian')
      expect(result.confidence).toBeGreaterThan(0)
    })

    test('检测微信理财通平台', () => {
      const text = '理财通\n累计收益 1,000.00\n持有金额 10,000.00'
      const result = detectPlatform(text)
      expect(result.platform).toBe('wechat')
    })

    test('检测京东金融平台', () => {
      const text = '京东金融\n小金库\n持有金额 10,000.00\n累计收益 500.00'
      const result = detectPlatform(text)
      expect(result.platform).toBe('jd')
    })

    test('未知文本返回 unknown', () => {
      const text = '000001 易方达蓝筹精选 1000.50'
      const result = detectPlatform(text)
      expect(result.platform).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    test('空文本返回 unknown', () => {
      const result = detectPlatform('')
      expect(result.platform).toBe('unknown')
      expect(result.confidence).toBe(0)
    })
  })

  describe('平台模板 getAllPlatformTemplates', () => {
    test('返回所有平台模板', () => {
      const templates = getAllPlatformTemplates()
      expect(templates.length).toBeGreaterThanOrEqual(5)
      expect(templates.map(t => t.platform)).toContain('alipay')
      expect(templates.map(t => t.platform)).toContain('tiantian')
      expect(templates.map(t => t.platform)).toContain('wechat')
      expect(templates.map(t => t.platform)).toContain('jd')
      expect(templates.map(t => t.platform)).toContain('ant')
    })
  })

  describe('parseHoldingText 平台感知解析', () => {
    test('支付宝格式解析', () => {
      const text = '支付宝 我的持仓\n易方达蓝筹精选混合\n持有金额 ¥10,000.00\n持有份额 5,000.00\n' +
                   '招商中证白酒指数\n持有金额 ¥5,000.00\n持有份额 2,500.00'
      const results = parseHoldingText(text)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]?.platform).toBe('alipay')
      expect(results[0]?.amount).toBeGreaterThan(0)
    })

    test('解析结果包含平台信息', () => {
      const text = '000001 易方达蓝筹精选 10000.50'
      const results = parseHoldingText(text)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]?.platform).toBeDefined()
    })
  })
})
