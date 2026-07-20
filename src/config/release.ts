// [WHY] 发布与下载配置
// [WHAT] 各平台下载链接与发布信息（文件名必须与 CI/CD 产出一致）
// [NOTE] 指向 GitHub Releases，CI 构建的产物文件名见 .github/workflows/build-all.yml

import { APP_VERSION } from './version'

/** GitHub 仓库信息 */
export const GITHUB_REPO = 'ghshhf/millionFund' as const
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}` as const
export const RELEASES_URL = `${GITHUB_URL}/releases` as const
export const RELEASE_DOWNLOAD = `${GITHUB_URL}/releases/download` as const
export const CURRENT_TAG = `v${APP_VERSION}` as const

/** 应用基本信息 */
export const APP_INFO = {
  name: 'AI百万资产',
  version: APP_VERSION,
  releaseDate: getBuildTime().slice(0, 10),
  description: '安卓 + Windows 双端全品种资产管理工具 - 基金/股票/加密货币 · 实时估值 · AI调仓追踪',
  author: 'millionAsset',
  license: 'MIT',
  github: GITHUB_URL,
  homepage: `${GITHUB_URL}#readme`,
}

/**
 * 各平台下载链接
 * [NOTE] 文件名必须与 CI/CD build-all.yml 中的产物名称一致
 * - Android: 见 assembleDebug 步骤 → AI百万资产-Android-debug.apk
 * - Windows: electron-builder → AI百万资产 Setup x.y.z.exe / AI百万资产 x.y.z.exe
 */
export const DOWNLOAD_URLS = {
  android: {
    debug: `${RELEASE_DOWNLOAD}/${CURRENT_TAG}/millionasset-Android-debug.apk`,
    release: `${RELEASE_DOWNLOAD}/${CURRENT_TAG}/millionasset-Android-release.apk`,
  },
  windows: {
    nsis: `${RELEASE_DOWNLOAD}/${CURRENT_TAG}/AI百万资产 Setup ${APP_VERSION}.exe`,
    portable: `${RELEASE_DOWNLOAD}/${CURRENT_TAG}/AI百万资产 ${APP_VERSION}.exe`,
  },
} as const

/** 构建时间 */
export function getBuildTime(): string {
  return (window as any).__BUILD_TIME__ || new Date().toISOString()
}
