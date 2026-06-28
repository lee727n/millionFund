<template>
  <div class="mine-page">
    <van-nav-bar :title="t('mine.title')" />
    <div class="p-4">
      <!-- APK 下载卡片 -->
      <van-cell-group inset class="download-card">
        <van-cell class="download-header" :border="false">
          <template #title>
            <div class="app-info">
              <div class="app-icon">📱</div>
              <div class="app-details">
                <div class="app-name">{{ t('app.title') }}</div>
                <div class="app-version">v1.9.8</div>
              </div>
            </div>
          </template>
        </van-cell>
        <van-cell class="download-action" :border="false">
          <template #title>
            <van-button
              type="primary"
              block
              size="large"
              @click="downloadAPK"
              :loading="isDownloading"
              class="download-btn"
            >
              <template #icon>
                <van-icon name="down" size="18" />
              </template>
              {{ isDownloading ? t('mine.downloading') : t('mine.download_apk') }}
            </van-button>
          </template>
        </van-cell>
        <van-cell class="download-tip" :border="false">
          <template #title>
            <div class="tip-text">
              <van-icon name="info-o" size="14" />
              <span>{{ t('mine.download_tip') }}</span>
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 其他功能占位 -->
      <div class="coming-soon">
        <p class="text-gray-500">{{ t('mine.coming_soon') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'

const { t } = useI18n()
const isDownloading = ref(false)

const APK_URL = 'https://github.com/ghshhf/millionFund/releases/download/android-dev/AI%E7%99%BE%E4%B8%87%E5%AE%9E%E7%9B%98-v1.9.8.apk'
const APK_FILENAME = 'AI百万实盘-v1.9.8.apk'

function downloadAPK() {
  isDownloading.value = true

  try {
    // 创建隐藏的 a 标签触发下载
    const link = document.createElement('a')
    link.href = APK_URL
    link.download = APK_FILENAME
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    showToast({
      message: t('mine.download_started'),
      type: 'success'
    })
  } catch (error) {
    showToast({
      message: t('mine.download_failed'),
      type: 'fail'
    })
    console.error('[Mine] APK 下载失败', error)
  } finally {
    // 延迟重置状态，让用户看到反馈
    setTimeout(() => {
      isDownloading.value = false
    }, 1500)
  }
}
</script>

<style scoped>
.mine-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.download-card {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
}

.download-header {
  background: linear-gradient(135deg, #1989fa, #4fa0fb);
  padding: 24px 16px;
}

.app-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-icon {
  width: 56px;
  height: 56px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
}

.app-details {
  flex: 1;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: white;
  margin-bottom: 4px;
}

.app-version {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.download-action {
  padding: 16px;
}

.download-btn {
  height: 48px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
}

.download-tip {
  padding: 12px 16px;
  background: #fafafa;
}

.tip-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999;
}

.coming-soon {
  margin-top: 32px;
  text-align: center;
}
</style>
