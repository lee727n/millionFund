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

      // [WHAT] 有更新且非静默模式，显示弹窗
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
   * [WHAT] 生成备选下载 URL
   * [WHY] GitHub Release 的 tag 可能带或不带 "v" 前缀，导致 URL 不匹配
   * @param apkUrl 原始 APK URL
   */
  function generateFallbackUrls(apkUrl: string): string[] {
    const urls = [apkUrl]

    // [WHAT] 从 URL 中提取 tag（download/ 后面的路径段）
    // 例如: .../download/v3.8.9/fund-app-v3.8.9.apk → tag = "v3.8.9"
    const match = apkUrl.match(/\/download\/([^/]+)\//)
    if (!match) return urls

    const originalTag = match[1]
    const cleanTag = originalTag.startsWith('v') ? originalTag.slice(1) : originalTag
    const altTag = originalTag.startsWith('v') ? cleanTag : `v${cleanTag}`

    if (altTag !== originalTag) {
      urls.push(apkUrl.replace(`/download/${originalTag}/`, `/download/${altTag}/`))
      console.log(`[appUpdate] 生成备选 URL: ${originalTag} → ${altTag}`)
    }

    return urls
  }

  /**
   * [WHAT] 从 URL 下载 APK
   * [HOW] 支持进度跟踪，失败时自动尝试备选 URL
   */
  async function downloadFromUrl(url: string): Promise<Blob> {
    const urls = generateFallbackUrls(url)
    let lastError: Error | null = null

    for (let i = 0; i < urls.length; i++) {
      const tryUrl = urls[i]
      try {
        console.log(`[appUpdate] 尝试下载 URL (${i + 1}/${urls.length}):`, tryUrl)
        const response = await fetch(tryUrl)
        if (response.ok) {
          if (i > 0) console.log(`[appUpdate] 备选 URL 下载成功:`, tryUrl)
          return await response.blob()
        }
        lastError = new Error(`下载失败: HTTP ${response.status}`)
        console.warn(`[appUpdate] URL 失败 (${i + 1}/${urls.length}): HTTP ${response.status}`)
      } catch (e: any) {
        lastError = e
        console.warn(`[appUpdate] URL 异常 (${i + 1}/${urls.length}):`, e?.message)
      }
    }

    throw lastError || new Error('所有下载 URL 均失败')
  }

  /**
   * [WHAT] 下载 APK
   * [HOW] 通过 fetch 下载到内存，再用 Filesystem 写入缓存目录
   * @returns APK 文件路径，失败返回 null
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

    try {
      const { apkUrl, version } = checkResult.value.versionInfo
      console.log('[appUpdate] 开始下载 APK:', apkUrl)

      const blob = await downloadFromUrl(apkUrl)

      // [WHAT] 读取流数据并跟踪进度（从 blob 重新读取）
      const total = blob.size
      const reader = blob.stream().getReader()
      if (!reader) {
        throw new Error('无法读取下载数据')
      }

      const chunks: Uint8Array[] = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (value) {
          chunks.push(value)
          received += value.length

          if (total > 0) {
            downloadProgress.value = Math.round((received / total) * 100)
          }
        }
      }

      // [WHAT] 合并所有 chunks
      const mergedBlob = new Blob(chunks as BlobPart[])
      const base64 = await blobToBase64(mergedBlob)

      // [WHAT] 写入文件系统
      const { Filesystem, Directory } = await import('@capacitor/filesystem')

      // [WHAT] 生成文件名
      const fileName = `fund-app-${version}.apk`

      const fileResult = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
        recursive: true
      })

      console.log('[appUpdate] APK 下载完成:', fileResult.uri)
      downloadComplete.value = true
      downloadProgress.value = 100

      return fileResult.uri
    } catch (err: any) {
      console.error('[appUpdate] 下载 APK 失败:', err)
      errorMessage.value = err?.message || '下载失败'
      return null
    } finally {
      downloading.value = false
    }
  }

  /**
   * [WHAT] 安装 APK
   * [HOW] 通过自定义 ApkInstaller 插件调用 Android 系统安装器
   */
  async function installApk(fileUri: string): Promise<void> {
    try {
      console.log('[appUpdate] 开始安装 APK:', fileUri)

      // [WHAT] 从 fileUri 中提取路径
      let filePath = fileUri
      if (fileUri.startsWith('file://')) {
        filePath = fileUri.substring(7)
      }

      // [WHAT] 调用自定义插件安装 APK
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
  }

  return {
    checking,
    checkResult,
    showUpdateDialog,
    downloadProgress,
    downloading,
    downloadComplete,
    errorMessage,
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
      // [WHAT] 移除 data:application/octet-stream;base64, 前缀
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
