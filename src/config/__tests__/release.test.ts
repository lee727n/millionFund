import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  GITHUB_REPO,
  GITHUB_URL,
  RELEASES_URL,
  RELEASE_DOWNLOAD,
  CURRENT_TAG,
  APP_INFO,
  DOWNLOAD_URLS,
  getBuildTime,
} from '@/config/release'

describe('release.ts', () => {
  test('GITHUB_REPO 格式正确', () => {
    expect(GITHUB_REPO).toBe('ghshhf/millionFund')
  })

  test('GITHUB_URL 拼接正确', () => {
    expect(GITHUB_URL).toBe('https://github.com/ghshhf/millionFund')
  })

  test('RELEASES_URL 拼接正确', () => {
    expect(RELEASES_URL).toBe('https://github.com/ghshhf/millionFund/releases')
  })

  test('RELEASE_DOWNLOAD 拼接正确', () => {
    expect(RELEASE_DOWNLOAD).toBe('https://github.com/ghshhf/millionFund/releases/download')
  })

  test('CURRENT_TAG 包含版本号', () => {
    expect(CURRENT_TAG).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  test('APP_INFO 字段完整', () => {
    expect(APP_INFO.name).toBe('AI百万实盘')
    expect(APP_INFO.version).toBeTruthy()
    expect(APP_INFO.license).toBe('MIT')
    expect(APP_INFO.github).toBe(GITHUB_URL)
  })

  test('DOWNLOAD_URLS 各平台链接格式正确', () => {
    // Android
    expect(DOWNLOAD_URLS.android.debug).toContain(RELEASE_DOWNLOAD)
    expect(DOWNLOAD_URLS.android.debug).toContain('.apk')
    expect(DOWNLOAD_URLS.android.release).toContain('.apk')

    // Windows
    expect(DOWNLOAD_URLS.windows.nsis).toContain('.exe')
    expect(DOWNLOAD_URLS.windows.portable).toContain('.exe')

    // macOS
    expect(DOWNLOAD_URLS.macos.dmg).toContain('.dmg')
    expect(DOWNLOAD_URLS.macos.arm64).toContain('arm64.dmg')

    // Linux
    expect(DOWNLOAD_URLS.linux.appimage).toContain('.AppImage')
    expect(DOWNLOAD_URLS.linux.deb).toContain('.deb')
  })

  test('getBuildTime 有 __BUILD_TIME__ 时返回它', () => {
    ;(window as any).__BUILD_TIME__ = '2024-01-01T00:00:00.000Z'
    const result = getBuildTime()
    expect(result).toBe('2024-01-01T00:00:00.000Z')
    delete (window as any).__BUILD_TIME__
  })

  test('getBuildTime 无 __BUILD_TIME__ 时返回当前时间字符串', () => {
    delete (window as any).__BUILD_TIME__
    const result = getBuildTime()
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
