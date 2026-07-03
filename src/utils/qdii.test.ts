import { describe, test, expect } from 'vitest'
import { detectQDII, getQDIIDelayDays, getQDIIDelayText, getQDIIDelayDescription } from './qdii'

describe('QDII 工具函数', () => {
  describe('detectQDII', () => {
    test('检测名称包含QDII的基金', () => {
      expect(detectQDII('易方达QDII股票')).toBe(true)
    })

    test('检测纳斯达克基金', () => {
      expect(detectQDII('广发纳斯达克100指数')).toBe(true)
    })

    test('检测港股基金', () => {
      expect(detectQDII('华夏恒生科技ETF联接')).toBe(true)
    })

    test('检测美股基金', () => {
      expect(detectQDII('博时标普500ETF联接')).toBe(true)
    })

    test('检测黄金基金', () => {
      expect(detectQDII('华安黄金ETF联接')).toBe(true)
    })

    test('检测REITs基金', () => {
      expect(detectQDII('广发美国房地产指数QDII-REITs')).toBe(true)
    })

    test('普通A股基金不被检测为QDII', () => {
      expect(detectQDII('易方达蓝筹精选混合')).toBe(false)
    })

    test('债券型基金不被检测为QDII', () => {
      expect(detectQDII('易方达纯债债券A')).toBe(false)
    })

    test('从类型检测QDII', () => {
      expect(detectQDII('某基金', 'QDII')).toBe(true)
    })

    test('空字符串返回false', () => {
      expect(detectQDII('')).toBe(false)
    })
  })

  describe('getQDIIDelayDays', () => {
    test('港股基金延迟1天', () => {
      expect(getQDIIDelayDays('华夏恒生科技ETF')).toBe(1)
    })

    test('黄金基金延迟1天', () => {
      expect(getQDIIDelayDays('华安黄金ETF联接')).toBe(1)
    })

    test('美股基金延迟2天', () => {
      expect(getQDIIDelayDays('广发纳斯达克100指数')).toBe(2)
    })

    test('标普500基金延迟2天', () => {
      expect(getQDIIDelayDays('博时标普500ETF联接')).toBe(2)
    })

    test('欧洲基金延迟2天', () => {
      expect(getQDIIDelayDays('华安德国30(DAX)ETF联接')).toBe(2)
    })

    test('默认延迟1天', () => {
      expect(getQDIIDelayDays('某QDII基金')).toBe(1)
    })
  })

  describe('getQDIIDelayText', () => {
    test('返回T+N格式', () => {
      expect(getQDIIDelayText('广发纳斯达克100指数')).toBe('T+2')
      expect(getQDIIDelayText('华夏恒生科技ETF')).toBe('T+1')
    })
  })

  describe('getQDIIDelayDescription', () => {
    test('延迟1天的描述', () => {
      expect(getQDIIDelayDescription('华夏恒生科技ETF')).toContain('1个交易日')
    })

    test('延迟2天的描述', () => {
      expect(getQDIIDelayDescription('广发纳斯达克100指数')).toContain('2个交易日')
    })
  })
})
