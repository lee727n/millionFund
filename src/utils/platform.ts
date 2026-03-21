/**
 * 平台检测工具
 * [WHY] 检测当前运行环境（Web/Android/iOS）
 * [WHAT] 提供统一的平台判断接口
 */

/** 平台类型 */
export type Platform = 'web' | 'android' | 'ios'

/** 当前平台 */
let currentPlatform: Platform | null = null

/**
 * 获取当前运行平台
 * [WHY] 缓存结果，避免重复计算
 */
export function getPlatform(): Platform {
  if (currentPlatform !== null) {
    return currentPlatform
  }

  const Capacitor = (window as any).Capacitor
  
  if (!Capacitor?.isNativePlatform?.()) {
    currentPlatform = 'web'
    return currentPlatform
  }

  if (Capacitor.getPlatform() === 'android') {
    currentPlatform = 'android'
  } else if (Capacitor.getPlatform() === 'ios') {
    currentPlatform = 'ios'
  } else {
    currentPlatform = 'web'
  }

  return currentPlatform
}

/**
 * 判断是否是 Web 环境
 */
export function isWeb(): boolean {
  return getPlatform() === 'web'
}

/**
 * 判断是否是 Android 环境
 */
export function isAndroid(): boolean {
  return getPlatform() === 'android'
}

/**
 * 判断是否是 iOS 环境
 */
export function isIOS(): boolean {
  return getPlatform() === 'ios'
}

/**
 * 判断是否是移动端（Android 或 iOS）
 */
export function isMobile(): boolean {
  return isAndroid() || isIOS()
}

/**
 * 判断是否是原生应用（非 Web）
 */
export function isNative(): boolean {
  return !isWeb()
}

/**
 * 获取屏幕尺寸类型
 */
export type ScreenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export function getScreenSize(): ScreenSize {
  const width = window.innerWidth
  
  if (width < 576) return 'xs'
  if (width < 768) return 'sm'
  if (width < 992) return 'md'
  if (width < 1200) return 'lg'
  return 'xl'
}

/**
 * 判断是否是大屏幕（电脑端）
 */
export function isLargeScreen(): boolean {
  return window.innerWidth >= 768
}

/**
 * 判断是否是小屏幕（移动端）
 */
export function isSmallScreen(): boolean {
  return window.innerWidth < 768
}