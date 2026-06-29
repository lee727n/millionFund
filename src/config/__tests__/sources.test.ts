import { describe, test, expect, vi } from 'vitest'

describe('sources.ts', () => {
  test('FUND_SOURCES 包含所有来源', async () => {
    const { FUND_SOURCES } = await import('@/config/sources')
    expect(Object.keys(FUND_SOURCES)).toContain('ali')
    expect(Object.keys(FUND_SOURCES)).toContain('TX')
    expect(Object.keys(FUND_SOURCES)).toContain('JD')
    expect(Object.keys(FUND_SOURCES)).toContain('observe')
  })

  test('FUND_SOURCES 每个来源有 label 和 icon', async () => {
    const { FUND_SOURCES } = await import('@/config/sources')
    for (const [key, value] of Object.entries(FUND_SOURCES)) {
      expect(value.label).toBeDefined()
      expect(value.icon).toBeDefined()
    }
  })

  test('getSourceLabel 返回来源标签', async () => {
    const { getSourceLabel } = await import('@/config/sources')
    expect(getSourceLabel('ali')).toBe('支付宝')
    expect(getSourceLabel('TX')).toBe('腾讯')
    expect(getSourceLabel('JD')).toBe('京东')
    expect(getSourceLabel('observe')).toBe('观察')
  })

  test('getSourceLabel 未知来源返回原值', async () => {
    const { getSourceLabel } = await import('@/config/sources')
    expect(getSourceLabel('unknown')).toBe('unknown')
  })

  test('sourceOptions 包含所有来源选项', async () => {
    const { sourceOptions } = await import('@/config/sources')
    expect(sourceOptions).toBeInstanceOf(Array)
    expect(sourceOptions.length).toBe(4)
    expect(sourceOptions[0]).toHaveProperty('text')
    expect(sourceOptions[0]).toHaveProperty('value')
  })
})
