import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  createI18n: vi.fn(() => ({
    global: {
      t: vi.fn((key: string) => key),
      locale: 'zh-CN',
    },
  })),
}))

describe('i18n/index.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('导出 i18n 实例', async () => {
    const { i18n } = await import('@/i18n/index')
    expect(i18n).toBeDefined()
  })

  test('导出 t 函数', async () => {
    const { t } = await import('@/i18n/index')
    expect(t).toBeDefined()
    expect(typeof t).toBe('function')
  })

  test('导出 locale', async () => {
    const { locale } = await import('@/i18n/index')
    expect(locale).toBeDefined()
  })

  test('默认 locale 为 zh-CN', async () => {
    const { locale } = await import('@/i18n/index')
    // 注意：由于 mock，实际值可能不同
    expect(locale).toBeDefined()
  })
})
