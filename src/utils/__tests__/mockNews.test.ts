import { describe, test, expect } from 'vitest'
import { generateMockNews } from '@/utils/mockNews'

describe('generateMockNews', () => {
  test('返回带 source 与 id 前缀的兜底新闻', () => {
    const items = generateMockNews('同花顺', '10jqka', 'https://news.10jqka.com.cn/', 1, 20)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]!.source).toBe('同花顺')
    expect(items[0]!.id).toContain('10jqka_mock_1_')
    expect(items[0]!.url).toBe('https://news.10jqka.com.cn/')
    expect(items[0]!.title).toBeTruthy()
    expect(items[0]!.summary).toBeTruthy()
  })

  test('publishedAt 为有效 ISO 时间', () => {
    const items = generateMockNews('腾讯财经', 'tencent', 'https://finance.qq.com/', 1, 20)
    expect(() => new Date(items[0]!.publishedAt).toISOString()).not.toThrow()
  })

  test('分页偏移正确且 id 不重复', () => {
    const p1 = generateMockNews('X', 'x', 'https://x.com', 1, 2)
    const p2 = generateMockNews('X', 'x', 'https://x.com', 2, 2)
    expect(p1.length).toBe(2)
    expect(p2.length).toBe(2)
    expect(p1[0]!.id).not.toBe(p2[0]!.id)
  })
})
