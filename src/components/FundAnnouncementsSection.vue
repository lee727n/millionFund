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
/* ========== 基金公告 ========== */
.announcement-list {
  padding: 8px 16px 12px;
}

.announcement-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.announcement-item:last-child {
  border-bottom: none;
}

.announcement-item:active {
  opacity: 0.7;
}

.announcement-type {
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 4px;
  margin-right: 10px;
  white-space: nowrap;
}

.announcement-type.分红公告 {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.announcement-type.定期报告 {
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}

.announcement-type.人事变动 {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.announcement-type.其他公告 {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.announcement-content {
  flex: 1;
  overflow: hidden;
}

.announcement-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-date {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.announcement-arrow {
  color: var(--text-tertiary);
  margin-left: 8px;
}
</style>
