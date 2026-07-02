<!-- [WHY] WebSocket 连接状态指示器
[WHAT] 在页面右上角显示 WebSocket 连接状态（连接中/已连接/已断开）
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useHomeData } from '@/composables/useHomeData'

const { t } = useI18n()
const { connectionStatus } = useHomeData()

/**
 * 获取状态文本
 */
function getStatusText() {
  switch (connectionStatus.value) {
    case 'connected':
      return '实时连接已建立'
    case 'connecting':
      return '正在连接...'
    case 'disconnected':
      return '实时连接已断开'
    case 'error':
      return '连接错误'
    default:
      return '未知状态'
  }
}

/**
 * 获取状态颜色
 */
function getStatusColor() {
  switch (connectionStatus.value) {
    case 'connected':
      return '#07c160' // 绿色
    case 'connecting':
      return '#ffc300' // 黄色
    case 'disconnected':
      return '#969799' // 灰色
    case 'error':
      return '#ee0a24' // 红色
    default:
      return '#969799'
  }
}
</script>

<template>
  <div class="connection-status" v-if="connectionStatus !== 'disconnected'">
    <div class="status-indicator" :style="{ backgroundColor: getStatusColor() }"></div>
    <span class="status-text">{{ getStatusText() }}</span>
  </div>
</template>

<style scoped>
.connection-status {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  font-size: 12px;
  backdrop-filter: blur(10px);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

/* 连接中的脉冲动画 */
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 195, 0, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(255, 195, 0, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 195, 0, 0);
  }
}

/* 已连接时不显示脉冲 */
.connection-status:has(.status-indicator[style*="07c160"]) .status-indicator {
  animation: none;
}

.status-text {
  color: #323233;
  white-space: nowrap;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .connection-status {
    top: 12px;
    right: 12px;
    padding: 4px 10px;
    font-size: 11px;
  }
}
</style>
