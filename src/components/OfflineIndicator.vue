<!-- [WHY] 离线状态指示器
[WHAT] 当应用离线时显示提示信息，告知用户当前显示的是缓存数据
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 是否离线
const isOffline = ref(!navigator.onLine)

/**
 * 处理离线事件
 */
function handleOffline(): void {
  isOffline.value = true
}

/**
 * 处理在线事件
 */
function handleOnline(): void {
  isOffline.value = false
}

// 监听在线/离线事件
onMounted(() => {
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)
})

onUnmounted(() => {
  window.removeEventListener('offline', handleOffline)
  window.removeEventListener('online', handleOnline)
})
</script>

<template>
  <transition name="slide-down">
    <div v-if="isOffline" class="offline-bar">
      <span class="offline-icon">📡</span>
      <span class="offline-text">{{ t('offline.message', '当前离线，显示缓存数据') }}</span>
    </div>
  </transition>
</template>

<style scoped>
.offline-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
  z-index: 1000;
}

.offline-icon {
  font-size: 16px;
}

.offline-text {
  text-align: center;
}

/* 进入/离开动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
