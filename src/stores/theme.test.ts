import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore, type ThemeMode } from '@/stores/theme'

describe('theme store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    // Ensure data-theme attribute exists
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('默认主题为 dark', () => {
    const store = useThemeStore()
    expect(store.mode).toBe('dark')
    expect(store.actualTheme).toBe('dark')
  })

  it('setTheme 切换到 light', () => {
    const store = useThemeStore()
    store.setTheme('light')
    expect(store.mode).toBe('light')
    expect(store.actualTheme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme 保存到 localStorage', () => {
    const store = useThemeStore()
    store.setTheme('light')
    expect(localStorage.getItem('fund_theme')).toBe('light')
  })

  it('toggleTheme 在 dark 和 light 之间切换', () => {
    const store = useThemeStore()
    expect(store.mode).toBe('dark')

    store.toggleTheme()
    expect(store.mode).toBe('light')

    store.toggleTheme()
    expect(store.mode).toBe('dark')
  })

  it('auto 模式切换时 toggleTheme 会先设置具体值', () => {
    const store = useThemeStore()
    store.setTheme('auto')
    // In auto mode with system light, toggleTheme should set to dark
    store.toggleTheme()
    expect(store.mode).toBe('dark')
  })

  it('setTheme auto 跟随系统主题', () => {
    const store = useThemeStore()
    store.setTheme('auto')
    expect(store.mode).toBe('auto')
    // System theme is mocked as light (matches: false)
    expect(store.actualTheme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('auto 模式下系统主题为 dark', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const store = useThemeStore()
    store.setTheme('auto')
    expect(store.actualTheme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('currentTheme 别名可用', () => {
    const store = useThemeStore()
    expect(store.currentTheme).toBe(store.actualTheme)
    store.setTheme('light')
    expect(store.currentTheme).toBe('light')
  })

  it('initTheme 应用主题并注册系统主题监听', () => {
    const store = useThemeStore()
    store.setTheme('auto')
    const matchMediaSpy = vi.spyOn(window, 'matchMedia')
    store.initTheme()
    // Should have called matchMedia at least once for initTheme
    expect(matchMediaSpy).toHaveBeenCalled()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('从 localStorage 恢复主题', () => {
    localStorage.setItem('fund_theme', 'light')
    setActivePinia(createPinia())
    const store = useThemeStore()
    expect(store.mode).toBe('light')
  })

  it('无效的 localStorage 值回退到默认 dark', () => {
    localStorage.setItem('fund_theme', 'invalid')
    setActivePinia(createPinia())
    const store = useThemeStore()
    expect(store.mode).toBe('dark')
  })
})
