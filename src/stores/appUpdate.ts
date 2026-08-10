// [WHY] 应用更新管理 Store
// [WHAT] 管理版本检查状态、下载进度、更新弹窗显示

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkForUpdate, type CheckUpdateResult } from '@/api/appUpdate'
import { registerPlugin } from '@capacitor/core'

// [WHAT] 注册自定义 APK 安装插件
// [HOW] 定义插件接口类型，确保 TS 能识别 installApk 方法
interface ApkInstallerPlugin {
  installApk(options: { filePath: string }): Promise<{ success: boolean; message: string }>
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller', {
  web: () => Promise.resolve({
    installApk: () => Promise.reject(new Error('APK 安装仅在 Android 端可用'))
  })
})

// [WHAT] 下载超时配置
const DOWNLOAD_CONNECT_TIMEOUT = 30000 // 30s 连接超时
const DOWNLOAD_STALL_TIMEOUT = 10000  // 10s 无进度则切换

export const useAppUpdateStore = defineStore('appUpdate', () => {
  /** 是否正在检查更新 */
  const checking = ref(false)
  /** 检查结果 */
  const checkResult = ref<CheckUpdateResult | null>(null)
  /** 是否显示更新弹窗 */
  const showUpdateDialog = ref(false)
  /** 下载进度 (0-100) */
  const downloadProgress = ref(0)
  /** 是否正在下载 */
  const downloading = ref(false)
  /** 下载是否完成 */
  const downloadComplete = ref(false)
  /** 错误信息 */
  const errorMessage = ref('')
  /** 当前使用的下载源名称 */
  const currentMirror = ref('')

  /**
   * [WHAT] 检查更新
   * [HOW] 调用 API 对比版本号，有更新时显示弹窗
   * @param silent 是否静默检查（不弹窗，仅更新状态）
   */
  async function check(silent: boolean = false): Promise<CheckUpdateResult> {
    checking.value = true
    errorMessage.value = ''

    try {
      const result = await checkForUpdate()
      checkResult.value = result

      if (result.hasUpdate && !silent) {
        showUpdateDialog.value = true
      }

      return result
    } catch (err: any) {
      errorMessage.value = err?.message || '检查更新失败'
      return {
        hasUpdate: false,
        versionInfo: null,
        currentVersion: '',
        forceUpdate: false,
        error: errorMessage.value
      }
    } finally {
      checking.value = false
    }
  }

  /**
   * [WHAT] 生成下载 URL 列表（按优先级）
   * [HOW] 1. apkUrlCn 国内源 → 2. GitHub tag 变体
   */
  function generateDownloadUrls(versionInfo: { apkUrl: string, apkUrlCn?: string }): Array<{ url: string, name: string }> {
    const urls: Array<{ url: string, name: string }> = []

    // [第一优先级] 国内镜像（如果配置了）
    if (versionInfo.apkUrlCn) {
      urls.push({ url: versionInfo.apkUrlCn, name: '国内镜像' })
    }

    // [第二优先级] GitHub Release 直链（tag 变体）
    const apkUrl = versionInfo.apkUrl
    urls.push({ url: apkUrl, name: 'GitHub' })

    // 生成 tag 变体（v前缀 ↔ 无前缀）
    const match = apkUrl.match(/\/download\/([^/]+)\//)
    if (match) {
      const originalTag = match[1]
      const cleanTag = originalTag.startsWith('v') ? originalTag.slice(1) : originalTag
      const altTag = originalTag.startsWith('v') ? cleanTag : `v${cleanTag}`
      if (altTag !== originalTag) {
        const altUrl = apkUrl.replace(`/download/${originalTag}/`, `/download/${altTag}/`)
        urls.push({ url: altUrl, name: 'GitHub' })
      }
    }

    return urls
  }

  /**
   * [WHAT] 流式下载
   * [HOW] 边下载边更新进度，支持卡顿检测
   */
  async function streamDownload(
    url: string,
    onProgress: (received: number, total: number) => void,
    signal: AbortSignal
  ): Promise<Blob> {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const total = response.headers.get('Content-Length')
      ? parseInt(response.headers.get('Content-Length')!)
      : 0

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const chunks: Uint8Array[] = []
    let received = 0
    let lastProgressTime = Date.now()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (value) {
        chunks.push(value)
        received += value.length
        lastProgressTime = Date.now()

        onProgress(received, total)

        // [卡顿检测] 超过 DOWNLOAD_STALL_TIMEOUT 无进度则中断
        if (total > 0 && received < total && Date.now() - lastProgressTime > DOWNLOAD_STALL_TIMEOUT) {
          throw new Error('下载速度过慢，切换下载源')
        }
      }
    }

    return new Blob(chunks as BlobPart[])
  }

  /**
   * [WHAT] 下载 APK
   * [HOW] 依次尝试国内镜像 → GitHub 直链，自动切换
   */
  async function downloadApk(): Promise<string | null> {
    if (!checkResult.value?.versionInfo) {
      errorMessage.value = '无版本信息'
      return null
    }

    downloading.value = true
    downloadProgress.value = 0
    downloadComplete.value = false
    errorMessage.value = ''

    const { versionInfo } = checkResult.value
    const urls = generateDownloadUrls(versionInfo)
    console.log(`[appUpdate] 准备下载 APK, 共 ${urls.length} 个备选 URL`)

    let lastError: Error | null = null

    for (let i = 0; i < urls.length; i++) {
      const { url, name } = urls[i]
      currentMirror.value = name
      downloadProgress.value = 0

      try {
        console.log(`[appUpdate] 尝试 ${name} (${i + 1}/${urls.length}): ${url}`)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_CONNECT_TIMEOUT)

        const blob = await streamDownload(url, (received, total) => {
          if (total > 0) {
            downloadProgress.value = Math.round((received / total) * 100)
          } else {
            downloadProgress.value = Math.min(99, Math.round(received / 1024 / 1024))
          }
        }, controller.signal)

        clearTimeout(timeoutId)

        // [下载成功]
        downloadProgress.value = 100

        const base64 = await blobToBase64(blob)
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const fileName = `fund-app-${versionInfo.version}.apk`

        const fileResult = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
          recursive: true
        })

        console.log(`[appUpdate] APK 下载完成 (${name}):`, fileResult.uri)
        downloadComplete.value = true
        currentMirror.value = ''
        return fileResult.uri

      } catch (err: any) {
        lastError = err
        currentMirror.value = ''

        const errMsg = err?.message || ''
        const isNetworkError = errMsg.includes('HTTP') ||
          errMsg.includes('network') ||
          errMsg.includes('超时') ||
          errMsg.includes('卡顿') ||
          errMsg.includes('速度过慢') ||
          err.name === 'AbortError'

        if (isNetworkError && i < urls.length - 1) {
          console.warn(`[appUpdate] ${name} 失败: ${errMsg}, 切换下一个下载源...`)
          continue
        }

        if (i === urls.length - 1) {
          console.error(`[appUpdate] 所有 ${urls.length} 个下载源均失败`)
        }
      }
    }

    errorMessage.value = lastError?.message || '下载失败'
    return null
  }

  /**
   * [WHAT] 安装 APK
   * [HOW] 通过自定义 ApkInstaller 插件调用 Android 系统安装器
   */
  async function installApk(fileUri: string): Promise<void> {
    try {
      console.log('[appUpdate] 开始安装 APK:', fileUri)

      let filePath = fileUri
      if (fileUri.startsWith('file://')) {
        filePath = fileUri.substring(7)
      }

      await ApkInstaller.installApk({ filePath })
      console.log('[appUpdate] APK 安装界面已启动')
    } catch (err: any) {
      console.error('[appUpdate] 安装 APK 失败:', err)
      errorMessage.value = err?.message || '安装失败'
      throw err
    }
  }

  /**
   * [WHAT] 下载并安装 APK（一键完成）
   */
  async function downloadAndInstall(): Promise<void> {
    const fileUri = await downloadApk()
    if (fileUri) {
      await installApk(fileUri)
    }
  }

  /**
   * [WHAT] 关闭更新弹窗
   */
  function closeDialog() {
    showUpdateDialog.value = false
  }

  /**
   * [WHAT] 重置状态
   */
  function reset() {
    checking.value = false
    checkResult.value = null
    showUpdateDialog.value = false
    downloadProgress.value = 0
    downloading.value = false
    downloadComplete.value = false
    errorMessage.value = ''
    currentMirror.value = ''
  }

  return {
    checking,
    checkResult,
    showUpdateDialog,
    downloadProgress,
    downloading,
    downloadComplete,
    errorMessage,
    currentMirror,
    check,
    downloadApk,
    installApk,
    downloadAndInstall,
    closeDialog,
    reset
  }
})

/**
 * [WHAT] Blob 转 Base64
 * [WHY] Capacitor Filesystem.writeFile 需要 base64 格式数据
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}