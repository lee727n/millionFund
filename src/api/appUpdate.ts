// [WHY] 应用更新 API - 通过 GitHub Releases 检测和下载新版本
// [WHAT] 提供版本检查、APK 下载、安装功能

import { APP_VERSION } from '@/config/version'

// [WHAT] GitHub 仓库配置
// [HOW] 格式: 用户名/仓库名
const GITHUB_REPO = 'lee727n/millionFund'

// [WHAT] 本地缓存的版本信息（网络不可用时的回退）
let cachedVersionInfo: VersionInfo | null = null
const LAST_CHECK_KEY = 'app_update_last_version'

// [WHAT] version.json 的多个镜像地址（按优先级尝试）
// [WHY] raw.githubusercontent.com 无缓存始终最新（VPN 环境可用），GitHub API 国内快但易 403，jsDelivr 有 12h 缓存
// [FIX] 重排序：raw 第一（新鲜），GitHub API 第二（国内快），jsDelivr 最后（缓存兜底）
const VERSION_JSON_URLS = [
  // [主] GitHub raw（无缓存，始终最新，VPN/海外环境可用）
  `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.json?t=`,
  // [备1] GitHub API（无缓存，国内可访问，但易 403 限流）
  `https://api.github.com/repos/${GITHUB_REPO}/contents/version.json?t=`,
  // [备2] jsDelivr CDN（国内快，但有 12 小时缓存，仅兜底用）
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@main/version.json?t=`,
]

// [WHAT] GitHub Releases API（备用，可获取最新 release 信息）
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

// [WHAT] 请求超时时间（ms）
// [FIX] 缩短到 5s，403 限流或网络异常时快速失败，避免长时间等待
const REQUEST_TIMEOUT = 5000

// [WHAT] 版本信息接口
export interface VersionInfo {
  /** 版本号字符串，如 "1.9.0" */
  version: string
  /** 版本代码（数字），如 190 */
  code: number
  /** APK 下载地址（GitHub Release URL） */
  apkUrl: string
  /** 国内镜像 APK 下载地址（如腾讯云COS/阿里云OSS，国内下载快） */
  apkUrlCn?: string
  /** 更新内容描述 */
  updateContent: string
  /** 是否强制更新 */
  forceUpdate: boolean
  /** 最低兼容版本（低于此版本必须更新） */
  minSupportVersion?: string
  /** 发布日期 */
  publishDate?: string
}

// [WHAT] 版本检查结果
export interface CheckUpdateResult {
  /** 是否有新版本 */
  hasUpdate: boolean
  /** 最新版本信息 */
  versionInfo: VersionInfo | null
  /** 当前版本号 */
  currentVersion: string
  /** 是否需要强制更新 */
  forceUpdate: boolean
  /** 错误信息 */
  error?: string
}

/**
 * [WHAT] 带超时的 fetch 请求
 * [WHY] 移动端网络不稳定，需要超时机制避免长时间等待
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * [WHAT] 从单个 URL 获取 version.json
 * [HOW] 处理 GitHub API 返回的 base64 编码内容
 */
async function fetchVersionJsonFromUrl(url: string): Promise<VersionInfo | null> {
  try {
    const response = await fetchWithTimeout(url, {
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' }
    })

    if (!response.ok) {
      console.warn(`[appUpdate] ${url} 返回 ${response.status}`)
      return null
    }

    // [WHAT] GitHub Contents API 返回 { content: base64, download_url, ... }
    let data: any
    const text = await response.text()

    // [FIX] 优先检测是否是 GitHub Contents API 的元数据格式
    // [WHY] 用文本检测比 URL 检测更可靠，避免 URL 变化导致判断失败
    try {
      const parsed = JSON.parse(text)

      // [WHAT] GitHub Contents API 返回 { name, path, content, encoding, download_url, ... }
      if (parsed && parsed.name && parsed.path && parsed.encoding === 'base64') {
        console.log(`[appUpdate] ${url} 检测到 GitHub Contents API 格式`)

        // [FIX] 优先使用 download_url 直接获取原始 JSON（绕过 base64 解码）
        if (parsed.download_url) {
          console.log(`[appUpdate] ${url} 使用 download_url 获取原始 JSON`)
          try {
            const rawResponse = await fetchWithTimeout(parsed.download_url, {
              cache: 'no-cache',
              headers: { 'Accept': 'application/json' }
            })
            if (rawResponse.ok) {
              data = await rawResponse.json()
              console.log(`[appUpdate] ${url} download_url 获取成功:`, data.version)
            }
          } catch {
            console.warn(`[appUpdate] ${url} download_url 获取失败，尝试 base64 解码`)
          }
        }

        // [FALLBACK] 如果 download_url 失败，尝试 base64 解码
        if (!data && parsed.content) {
          try {
            let base64 = parsed.content.replace(/\n/g, '').replace(/\r/g, '').replace(/-/g, '+').replace(/_/g, '/')
            const pad = base64.length % 4
            if (pad) base64 += '='.repeat(4 - pad)
            const jsonStr = atob(base64)
            data = JSON.parse(jsonStr)
            console.log(`[appUpdate] ${url} base64 解码成功:`, data.version)
          } catch (decodeErr) {
            console.error(`[appUpdate] ${url} base64 解码失败:`, decodeErr)
          }
        }

        if (!data) {
          console.warn(`[appUpdate] ${url} 所有解码方式都失败`)
          return null
        }
      } else {
        // [WHAT] 普通 JSON 格式（jsdelivr 或 raw 返回的原始 JSON）
        data = parsed
      }
    } catch (parseErr) {
      console.warn(`[appUpdate] ${url} JSON 解析失败:`, parseErr)
      return null
    }

    // [WHAT] 验证返回的数据格式是否正确
    console.log(`[appUpdate] ${url} 解析后 data:`, data)
    if (!data || typeof data.version !== 'string' || typeof data.apkUrl !== 'string') {
      console.warn(`[appUpdate] ${url} 返回的数据格式不正确:`, data)
      return null
    }

    console.log(`[appUpdate] 从 ${url} 获取版本信息成功:`, data.version)
    return data as VersionInfo
  } catch (err: any) {
    // [WHAT] AbortController 超时
    if (err.name === 'AbortError') {
      console.warn(`[appUpdate] ${url} 请求超时`)
    } else {
      console.warn(`[appUpdate] ${url} 请求失败:`, err.message)
    }
    return null
  }
}

/**
 * [WHAT] 从 GitHub Releases API 获取最新版本信息
 * [HOW] 直接从 latest release 提取版本号和 APK 下载地址
 * [WHY] Releases API 无 CDN 缓存问题，是获取最新版本的可靠来源
 */
async function fetchVersionFromReleases(): Promise<VersionInfo | null> {
  try {
    const response = await fetchWithTimeout(RELEASES_API_URL, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })

    if (!response.ok) {
      console.warn(`[appUpdate] Releases API 返回 ${response.status}`)
      return null
    }

    const release = await response.json()

    if (!release || !release.tag_name) {
      console.warn('[appUpdate] Releases API 返回数据格式不正确')
      return null
    }

    console.log('[appUpdate] 从 Releases API 获取版本信息成功:', release.tag_name)

    const apkAsset = release.assets?.find((asset: any) =>
      asset.name && asset.name.endsWith('.apk')
    )

    if (!apkAsset || !apkAsset.browser_download_url) {
      console.warn('[appUpdate] Releases 中未找到 APK 文件')
      return null
    }

    const version = release.tag_name.replace(/^v/, '')

    let code = 0
    const codeMatch = release.body?.match(/versionCode[:\s]*(\d+)/i)
    if (codeMatch) {
      code = parseInt(codeMatch[1]) || 0
    } else {
      const parts = version.split('.').map(n => parseInt(n) || 0)
      code = parts[0] * 100 + (parts[1] || 0) * 10 + (parts[2] || 0)
    }

    let updateContent = release.body || '暂无更新说明'
    updateContent = updateContent.replace(/\r\n/g, '\n').replace(/^/gm, '- ')

    return {
      version,
      code,
      apkUrl: apkAsset.browser_download_url,
      updateContent,
      forceUpdate: false,
      publishDate: release.published_at
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[appUpdate] Releases API 请求超时')
    } else {
      console.error('[appUpdate] Releases API 请求失败:', err.message)
    }
    return null
  }
}

/**
 * [WHAT] 从 GitHub 获取最新版本信息
 * [HOW] 并行尝试 version.json 镜像 + Releases API，取第一个成功的
 * [WHY] 避免单一来源失败导致无法获取版本，同时绕过 CDN 缓存问题
 */
export async function fetchLatestVersion(): Promise<VersionInfo | null> {
  const timestamp = Date.now()

  // [第一步] 并行获取：version.json 镜像链 + Releases API
  // Releases API 无 CDN 缓存，即使 version.json 有缓存问题也能兜底
  const versionJsonPromise = (async () => {
    for (const url of VERSION_JSON_URLS) {
      const result = await fetchVersionJsonFromUrl(url + timestamp)
      if (result) return result
    }
    return null
  })()

  const releasesPromise = fetchVersionFromReleases()

  const [versionJsonResult, releasesResult] = await Promise.all([
    versionJsonPromise,
    releasesPromise
  ])

  // [优先] 使用 version.json 结果（包含更丰富的更新信息）
  if (versionJsonResult) {
    // [校验] 如果 version.json 的版本号比 Releases API 还旧，
    //        说明 CDN 缓存未更新，使用 Releases API 的结果
    if (releasesResult && compareVersion(releasesResult.version, versionJsonResult.version) > 0) {
      console.warn(`[appUpdate] version.json 版本(${versionJsonResult.version}) 比 Releases API 版本(${releasesResult.version}) 旧，使用 Releases API`)
      return releasesResult
    }
    return versionJsonResult
  }

  // [回退] version.json 全部失败，使用 Releases API
  if (releasesResult) {
    console.warn('[appUpdate] version.json 全部失败，使用 Releases API 结果')
    return releasesResult
  }

  return null
}

/**
 * [WHAT] 比较版本号
 * [HOW] 语义化版本比较: 1.8.0 < 1.9.0 < 2.0.0
 * @returns -1: v1 < v2, 0: v1 == v2, 1: v1 > v2
 */
export function compareVersion(v1: string, v2: string): number {
  // [FIX] 清理版本号（移除 v 前缀和空格）
  const cleanV1 = v1.replace(/^v/, '').trim()
  const cleanV2 = v2.replace(/^v/, '').trim()

  const parts1 = cleanV1.split('.').map(n => parseInt(n) || 0)
  const parts2 = cleanV2.split('.').map(n => parseInt(n) || 0)
  const maxLen = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 < p2) return -1
    if (p1 > p2) return 1
  }
  return 0
}

/**
 * [WHAT] 检查是否有新版本
 * [HOW] 对比当前版本与 GitHub 上的最新版本
 */
export async function checkForUpdate(): Promise<CheckUpdateResult> {
  const currentVersion = APP_VERSION

  try {
    const latestVersion = await fetchLatestVersion()

    // [WHAT] 无法获取版本信息
    if (!latestVersion) {
      return {
        hasUpdate: false,
        versionInfo: null,
        currentVersion,
        forceUpdate: false,
        error: '无法获取版本信息，请检查网络连接'
      }
    }

    // [WHAT] 验证版本号格式
    if (!latestVersion.version) {
      return {
        hasUpdate: false,
        versionInfo: null,
        currentVersion,
        forceUpdate: false,
        error: '版本信息格式错误'
      }
    }

    const hasUpdate = compareVersion(currentVersion, latestVersion.version) < 0

    // [WHAT] 检查是否强制更新（低于最低兼容版本）
    let forceUpdate = latestVersion.forceUpdate || false
    if (latestVersion.minSupportVersion) {
      if (compareVersion(currentVersion, latestVersion.minSupportVersion) < 0) {
        forceUpdate = true
      }
    }

    console.log('[appUpdate] 版本检查结果:', {
      current: currentVersion,
      latest: latestVersion.version,
      hasUpdate,
      forceUpdate
    })

    return {
      hasUpdate,
      versionInfo: latestVersion,
      currentVersion,
      forceUpdate
    }
  } catch (err: any) {
    console.error('[appUpdate] 检查更新失败:', err)
    return {
      hasUpdate: false,
      versionInfo: null,
      currentVersion,
      forceUpdate: false,
      error: err?.message || '检查更新失败'
    }
  }
}
