<!-- [WHY] 基金公告区块，从 Detail.vue 提取
[WHAT] 展示基金公告列表，支持点击打开链接
-->
<script setup lang="ts">
defineProps<{
  announcements: Array<{
    id: string
    title: string
    date: string
    type: string
    url?: string
  }>
}>()

defineEmits<{
  openAnnouncement: [url: string]
}>()
</script>

<template>
  <div class="info-section" v-if="announcements.length > 0">
    <div class="section-header">
      <span>基金公告</span>
    </div>
    <div class="announcement-list">
      <div
        v-for="item in announcements.slice(0, 5)"
        :key="item.id"
        class="announcement-item"
        @click="$emit('openAnnouncement', item.url)"
      >
        <div class="announcement-type" :class="item.type">
          {{ item.type === '分红公告' ? '分红' : item.type === '定期报告' ? '报告' : item.type === '人事变动' ? '人事' : '公告' }}
        </div>
        <div class="announcement-content">
          <div class="announcement-title">{{ item.title }}</div>
          <div class="announcement-date">{{ item.date }}</div>
        </div>
        <van-icon name="arrow" class="announcement-arrow" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.info-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header span:first-child {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.announcement-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.announcement-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.announcement-item:active {
  opacity: 0.8;
}

.announcement-type {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.announcement-type.分红公告 {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

.announcement-type.定期报告 {
  background: rgba(66, 165, 245, 0.1);
  color: #42a5f5;
}

.announcement-type.人事变动 {
  background: rgba(255, 167, 38, 0.1);
  color: #ffa726;
}

.announcement-type.公告 {
  background: rgba(120, 144, 156, 0.1);
  color: #78909c;
}

.announcement-content {
  flex: 1;
  min-width: 0;
}

.announcement-title {
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.announcement-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.announcement-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
</style>
