<script setup lang="ts">
// [WHY] 应用更新弹窗组件
// [WHAT] 显示版本信息、下载进度、安装按钮
// [HOW] 通过 useAppUpdateStore 管理状态

import { computed } from 'vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { APP_VERSION } from '@/config/version'

const updateStore = useAppUpdateStore()

// [WHAT] 版本信息
const versionInfo = computed(() => updateStore.checkResult?.versionInfo)
const hasUpdate = computed(() => updateStore.checkResult?.hasUpdate ?? false)
const forceUpdate = computed(() => updateStore.checkResult?.forceUpdate ?? false)

// [WHAT] 下载状态文本
const statusText = computed(() => {
  if (updateStore.downloading) {
    const mirror = updateStore.currentMirror
    if (mirror && mirror !== 'GitHub 直链') {
      return `通过 ${mirror} 下载中 ${updateStore.downloadProgress}%`
    }
    if (mirror) {
      return `下载中 ${updateStore.downloadProgress}%`
    }
    return `下载中 ${updateStore.downloadProgress}%`
  }
  if (updateStore.downloadComplete) {
    return '下载完成，准备安装'
  }
  if (updateStore.errorMessage) {
    return updateStore.errorMessage
  }
  return ''
})

// [WHAT] 处理下载并安装
async function handleDownloadAndInstall() {
  await updateStore.downloadAndInstall()
}

// [WHAT] 关闭弹窗（强制更新时不允许关闭）
function handleClose() {
  if (!forceUpdate.value && !updateStore.downloading) {
    updateStore.closeDialog()
  }
}
</script>

<template>
  <van-dialog
    :show="updateStore.showUpdateDialog"
    :show-cancel-button="!forceUpdate && !updateStore.downloading"
    :close-on-click-overlay="false"
    :close-on-popstate="false"
    :confirm-button-text="updateStore.downloading ? `下载中 ${updateStore.downloadProgress}%` : (updateStore.downloadComplete ? '安装' : '立即更新')"
    :confirm-button-disabled="updateStore.downloading"
    cancel-button-text="稍后再说"
    class="update-dialog"
    @confirm="handleDownloadAndInstall"
    @cancel="handleClose"
  >
    <template #title>
      <div class="update-title">
        <span>发现新版本</span>
        <span v-if="forceUpdate" class="force-badge">强制更新</span>
      </div>
    </template>

    <div class="update-content" v-if="versionInfo">
      <!-- 版本信息 -->
      <div class="version-info">
        <div class="version-row">
          <span class="label">最新版本</span>
          <span class="value">v{{ versionInfo.version }}</span>
        </div>
        <div class="version-row">
          <span class="label">当前版本</span>
          <span class="value current">v{{ APP_VERSION }}</span>
        </div>
      </div>

      <!-- 更新内容 -->
      <div class="update-log" v-if="versionInfo.updateContent">
        <div class="log-title">更新内容</div>
        <div class="log-content">{{ versionInfo.updateContent }}</div>
      </div>

      <!-- 下载进度 -->
      <div class="download-progress" v-if="updateStore.downloading || updateStore.downloadComplete">
        <van-progress
          :percentage="updateStore.downloadProgress"
          :color="'#1989fa'"
          :show-pivot="true"
          stroke-width="4"
        />
        <div class="status-text" :class="{ error: updateStore.errorMessage }">
          {{ statusText }}
        </div>
      </div>

      <!-- 错误信息 -->
      <div class="error-msg" v-if="updateStore.errorMessage && !updateStore.downloading">
        {{ updateStore.errorMessage }}
      </div>
    </div>
  </van-dialog>
</template>

<style scoped>
/* [FIX] 弹窗最小宽度，避免内容少时弹窗过窄 */
:global(.van-dialog) {
  min-width: 300px !important;
  width: 85vw !important;
  max-width: 400px !important;
}

.update-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.force-badge {
  font-size: 10px;
  color: #fff;
  background: #ee0a24;
  padding: 2px 6px;
  border-radius: 4px;
}

.update-content {
  padding: 16px;
}

.version-info {
  background: rgba(25, 137, 250, 0.05);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.version-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.version-row .label {
  font-size: 13px;
  color: #969799;
}

.version-row .value {
  font-size: 15px;
  font-weight: 600;
  color: #1989fa;
}

.version-row .value.current {
  color: #969799;
  font-weight: 400;
}

.update-log {
  margin-bottom: 16px;
}

.log-title {
  font-size: 13px;
  color: #969799;
  margin-bottom: 8px;
}

.log-content {
  font-size: 14px;
  color: #323233;
  line-height: 1.6;
  white-space: pre-line;
  background: #f7f8fa;
  border-radius: 6px;
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.download-progress {
  margin-top: 16px;
}

.status-text {
  font-size: 12px;
  color: #969799;
  text-align: center;
  margin-top: 8px;
}

.status-text.error {
  color: #ee0a24;
}

.error-msg {
  font-size: 13px;
  color: #ee0a24;
  text-align: center;
  padding: 8px;
  background: rgba(238, 10, 36, 0.05);
  border-radius: 6px;
  margin-top: 8px;
}
</style>
