import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

describe('platform.ts', () => {
  beforeEach(() => {
    // 重置 window 对象
    delete (window as any).electronAPI
    delete (window as any).Capacitor
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('getPlatform 在 Web 环境返回 web', async () => {
    const { getPlatform } = await import('@/utils/platform')
    const result = getPlatform()
    expect(result).toBe('web')
  })

  test('getPlatform 在 Electron 环境返回 electron', async () => {
    ;(window as any).electronAPI = { isElectron: true }
    vi.resetModules()
    const { getPlatform } = await import('@/utils/platform')
    const result = getPlatform()
    expect(result).toBe('electron')
  })

  test('getPlatform 在 Android 环境返回 android', async () => {
    ;(window as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android'
    }
    vi.resetModules()
    const { getPlatform } = await import('@/utils/platform')
    const result = getPlatform()
    expect(result).toBe('android')
  })

  test('getPlatform 在 iOS 环境返回 ios', async () => {
    ;(window as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios'
    }
    vi.resetModules()
    const { getPlatform } = await import('@/utils/platform')
    const result = getPlatform()
    expect(result).toBe('ios')
  })

  test('isWeb 正确判断', async () => {
    const { isWeb } = await import('@/utils/platform')
    expect(isWeb()).toBe(true)
  })

  test('isMobile 在 Web 环境返回 false', async () => {
    const { isMobile } = await import('@/utils/platform')
    expect(isMobile()).toBe(false)
  })

  test('isDesktop 在 Web 环境返回 true（宽度 >= 768）', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    vi.resetModules()
    const { isDesktop } = await import('@/utils/platform')
    expect(isDesktop()).toBe(true)
  })

  test('isDesktop 在 Web 环境返回 false（宽度 < 768）', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    vi.resetModules()
    const { isDesktop } = await import('@/utils/platform')
    expect(isDesktop()).toBe(false)
  })

  test('getScreenSize 正确返回屏幕类型', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    vi.resetModules()
    const { getScreenSize } = await import('@/utils/platform')
    expect(getScreenSize()).toBe('lg')
  })

  test('isLargeScreen 正确判断', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    vi.resetModules()
    const { isLargeScreen } = await import('@/utils/platform')
    expect(isLargeScreen()).toBe(true)
  })

  test('isSmallScreen 正确判断', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
    vi.resetModules()
    const { isSmallScreen } = await import('@/utils/platform')
    expect(isSmallScreen()).toBe(true)
  })
})
