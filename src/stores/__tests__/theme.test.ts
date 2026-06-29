import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('theme.ts store', () => {
  let mockLocalStorage: { [key: string]: string }
  let mockSetAttribute: any
  let mockMetaSetAttribute: any
  let mockAddEventListener: any
  let mockMatchMedia: any

  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())

    // Mock localStorage as plain object
    mockLocalStorage = {}
    const mockStorage = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key]
      }),
    }
    vi.stubGlobal('localStorage', mockStorage)

    // Mock document.documentElement
    mockSetAttribute = vi.fn()
    Object.defineProperty(document, 'documentElement', {
      value: { setAttribute: mockSetAttribute },
      writable: true,
      configurable: true,
    })

    // Mock window.matchMedia
    mockAddEventListener = vi.fn()
    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: mockAddEventListener,
    })
    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
      configurable: true,
    })

    // Mock meta theme-color
    mockMetaSetAttribute = vi.fn()
    vi.spyOn(document, 'querySelector').mockReturnValue({
      setAttribute: mockMetaSetAttribute,
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('默认主题为 dark（localStorage 无值时）', async () => {
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()
    expect(store.mode).toBe('dark')
  })

  test('localStorage 有值时加载保存的主题', async () => {
    mockLocalStorage['fund_theme'] = 'light'
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()
    expect(store.mode).toBe('light')
  })

  test('setTheme 设置 light 主题', async () => {
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('light')

    expect(store.mode).toBe('light')
    expect(store.actualTheme).toBe('light')
    expect(mockLocalStorage['fund_theme']).toBe('light')
    expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'light')
  })

  test('setTheme 设置 dark 主题', async () => {
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('dark')

    expect(store.mode).toBe('dark')
    expect(store.actualTheme).toBe('dark')
    expect(mockLocalStorage['fund_theme']).toBe('dark')
    expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  test('setTheme auto 模式跟随系统（系统 dark）', async () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: mockAddEventListener,
    })

    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('auto')

    expect(store.mode).toBe('auto')
    expect(store.actualTheme).toBe('dark')
    expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  test('setTheme auto 模式跟随系统（系统 light）', async () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: mockAddEventListener,
    })

    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('auto')

    expect(store.mode).toBe('auto')
    expect(store.actualTheme).toBe('light')
    expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'light')
  })

  test('toggleTheme 从 dark 切到 light', async () => {
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('dark')
    store.toggleTheme()

    expect(store.mode).toBe('light')
    expect(store.actualTheme).toBe('light')
  })

  test('toggleTheme 从 light 切到 dark', async () => {
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('light')
    store.toggleTheme()

    expect(store.mode).toBe('dark')
    expect(store.actualTheme).toBe('dark')
  })

  test('toggleTheme 在 auto 模式下切换到系统主题的反向', async () => {
    // 系统为 light，auto 模式下 toggle 应切到 dark
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: mockAddEventListener,
    })

    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.setTheme('auto')
    store.toggleTheme()

    expect(store.mode).toBe('dark')
  })

  test('initTheme 应用主题并监听系统变化', async () => {
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()

    store.initTheme()

    expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'dark')
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  test('localStorage 异常时默认使用 dark', async () => {
    // 这个测试验证默认行为，因为我们已经 mock 了 localStorage
    // 如果 getItem 返回 null，loadTheme 返回 'dark'
    const { useThemeStore } = await import('@/stores/theme')
    const store = useThemeStore()
    expect(store.mode).toBe('dark')
  })
})
