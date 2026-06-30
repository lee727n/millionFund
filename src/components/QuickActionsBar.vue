<script setup lang="ts">
// [WHY] 快捷操作栏组件 - 包含自动刷新开关、刷新按钮、日志复制、设置入口
// [WHAT] 网页端和移动端有不同的布局

import { useI18n } from 'vue-i18n'
const { t } = useI18n()

defineProps<{
  autoRefreshEnabled: boolean
}>()

const emit = defineEmits<{
  'update:autoRefreshEnabled': [value: boolean]
  refresh: []
  copyLogs: []
  goToSettings: []
}>()

function onSwitchChange(value: boolean) {
  emit('update:autoRefreshEnabled', value)
}
</script>

<template>
  <div class="header-right">
    <!-- 网页端：显示设置按钮 -->
    <div class="web-only">
      <div class="auto-refresh-label">
        <span>{{ autoRefreshEnabled ? t('settings.auto_refresh_on') : t('settings.auto_refresh_off') }}</span>
      </div>
      <van-switch 
        :model-value="autoRefreshEnabled" 
        size="20" 
        @update:model-value="onSwitchChange" 
      />
      <van-icon name="replay" size="22" @click="emit('refresh')" data-test-id="refresh-button" />
      <van-icon name="description-o" size="22" @click="emit('copyLogs')" :title="t('holding.copy_logs')" />
      <van-icon name="setting-o" size="22" @click="emit('goToSettings')" />
    </div>
    <!-- 移动端：只显示自动刷新开关和刷新按钮 -->
    <div class="mobile-only">
      <van-switch 
        :model-value="autoRefreshEnabled" 
        size="20" 
        @update:model-value="onSwitchChange" 
      />
      <van-icon name="replay" size="22" @click="emit('refresh')" data-test-id="refresh-button" />
      <van-icon name="description-o" size="22" @click="emit('copyLogs')" />
      <van-icon name="setting-o" size="22" @click="emit('goToSettings')" :title="t('about.title')" />
    </div>
  </div>
</template>

<style scoped>
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.auto-refresh-label {
  font-size: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.header-right .van-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all 0.2s;
}

.header-right .van-icon:active {
  background: var(--bg-active);
  color: var(--color-primary);
}

/* 移动端隐藏 */
@media (max-width: 767px) {
  .web-only {
    display: none;
  }
}

/* 网页端隐藏移动端 */
@media (min-width: 768px) {
  .mobile-only {
    display: none;
  }
}
</style>
