<script setup lang="ts">
// [WHY] 资讯快讯组件 - 展示最新的基金资讯和快讯
// [WHAT] 当前为占位组件，后续可接入真实资讯API

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 占位数据 - 后续可替换为真实API数据
const newsItems = ref([
  {
    id: 1,
    title: '市场震荡上行，科技板块表现强势',
    time: '10分钟前',
    type: 'market'
  },
  {
    id: 2,
    title: '多只基金净值创新高，投资者收益可观',
    time: '30分钟前',
    type: 'fund'
  },
  {
    id: 3,
    title: '央行宣布降准，流动性预期改善',
    time: '1小时前',
    type: 'policy'
  }
])

// [WHAT] 根据资讯类型返回对应的样式类
function getNewsTypeClass(type: string) {
  const typeMap: Record<string, string> = {
    'market': 'type-market',
    'fund': 'type-fund',
    'policy': 'type-policy'
  }
  return typeMap[type] || 'type-default'
}
</script>

<template>
  <div class="news-flash-section">
    <div class="section-header">
      <span class="section-title">{{ t('home.news_flash') || '资讯快讯' }}</span>
      <span class="view-more" @click="console.log('查看更多资讯')">
        {{ t('home.view_more') || '更多' }}
        <van-icon name="arrow" />
      </span>
    </div>
    
    <div class="news-list">
      <div 
        v-for="item in newsItems" 
        :key="item.id"
        class="news-item"
        @click="console.log('点击资讯', item.id)"
      >
        <div class="news-content">
          <span class="news-type-badge" :class="getNewsTypeClass(item.type)">
            {{ item.type }}
          </span>
          <span class="news-title">{{ item.title }}</span>
        </div>
        <span class="news-time">{{ item.time }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 资讯快讯样式 ========== */
.news-flash-section {
  padding: 16px;
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.view-more {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--color-primary);
  cursor: pointer;
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.news-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.news-item:active {
  transform: scale(0.98);
  background: var(--bg-active);
}

.news-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.news-type-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.news-type-badge.type-market {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.news-type-badge.type-fund {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.news-type-badge.type-policy {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.news-type-badge.type-default {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.news-title {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 8px;
}
</style>
