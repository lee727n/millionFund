<!-- [WHY] 基金公告时间线视图
[WHAT] 将公告按日期分组，用时间线样式展示（左侧日期线 + 右侧公告卡片），支持按年份筛选
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Announcement {
  id: string
  title: string
  date: string
  type: string
  url?: string
}

const props = defineProps<{
  announcements: Announcement[]
}>()

defineEmits<{
  openAnnouncement: [url: string]
}>()

// 当前选中的年份筛选
const selectedYear = ref<string>('all')

// 获取所有可用的年份
const availableYears = computed(() => {
  const years = new Set<string>()
  props.announcements.forEach(item => {
    const year = item.date.substring(0, 4)
    if (year) years.add(year)
  })
  return Array.from(years).sort((a, b) => b.localeCompare(a)) // 降序排列
})

// 按年份筛选后的公告
const filteredAnnouncements = computed(() => {
  if (selectedYear.value === 'all') {
    return props.announcements
  }
  return props.announcements.filter(item => 
    item.date.substring(0, 4) === selectedYear.value
  )
})

// 按日期分组的公告
const groupedAnnouncements = computed(() => {
  const groups: Map<string, Announcement[]> = new Map()
  
  filteredAnnouncements.value.forEach(item => {
    const dateKey = item.date
    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(item)
  })
  
  // 转换为数组并按日期降序排序
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items
    }))
})

// 格式化日期显示
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}-${day}`
}

// 获取星期几
function getWeekDay(dateStr: string): string {
  const date = new Date(dateStr)
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekDays[date.getDay()]
}

// 获取公告类型的显示文本
function getTypeLabel(type: string): string {
  const typeMap: Record<string, string> = {
    '分红公告': '分红',
    '定期报告': '报告',
    '人事变动': '人事',
    '公告': '公告'
  }
  return typeMap[type] || '公告'
}

// 获取公告类型对应的CSS类名（使用英文 slug，避免中文字符串作 class）
const TYPE_CLASS_MAP: Record<string, string> = {
  '分红公告': 'dividend',
  '定期报告': 'report',
  '人事变动': 'personnel',
  '公告': 'default',
}
function getTypeClass(type: string): string {
  return TYPE_CLASS_MAP[type] || 'default'
}
</script>

<template>
  <div class="announcement-timeline" v-if="announcements.length > 0">
    <!-- 头部：标题 + 年份筛选 -->
    <div class="timeline-header">
      <span class="timeline-title">{{ t('fund_announcements.title') }}</span>
      <div class="year-filter" v-if="availableYears.length > 1">
        <select v-model="selectedYear" class="year-select">
          <option value="all">全部年份</option>
          <option v-for="year in availableYears" :key="year" :value="year">
            {{ year }}年
          </option>
        </select>
      </div>
    </div>

    <!-- 时间线内容 -->
    <div class="timeline-content">
      <div 
        v-for="group in groupedAnnouncements" 
        :key="group.date"
        class="timeline-group"
      >
        <!-- 日期标记（左侧） -->
        <div class="timeline-date-marker">
          <div class="date-circle"></div>
          <div class="date-text">
            <span class="date-month-day">{{ formatDate(group.date) }}</span>
            <span class="date-weekday">{{ getWeekDay(group.date) }}</span>
          </div>
        </div>

        <!-- 公告卡片（右侧） -->
        <div class="timeline-cards">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="announcement-card"
            @click="$emit('openAnnouncement', item.url)"
          >
            <!-- 公告类型标签 -->
            <div class="card-type" :class="getTypeClass(item.type)">
              {{ getTypeLabel(item.type) }}
            </div>

            <!-- 公告内容 -->
            <div class="card-content">
              <div class="card-title">{{ item.title }}</div>
              <div class="card-meta">
                <span class="card-date">{{ group.date }}</span>
                <van-icon name="arrow" class="card-arrow" v-if="item.url" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="timeline-empty" v-if="filteredAnnouncements.length === 0">
      <van-empty :description="`${selectedYear}年暂无公告`" />
    </div>
  </div>
</template>

<style scoped>
.announcement-timeline {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.announcement-timeline:last-child {
  border-bottom: none;
}

/* 头部样式 */
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.timeline-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.year-filter {
  flex-shrink: 0;
}

.year-select {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.year-select:focus {
  border-color: var(--primary-color);
}

/* 时间线内容 */
.timeline-content {
  position: relative;
  padding-left: 120px; /* 为日期标记留出空间 */
}

/* 垂直时间线 */
.timeline-content::before {
  content: '';
  position: absolute;
  left: 100px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, var(--primary-color), var(--border-color));
}

/* 时间线分组 */
.timeline-group {
  position: relative;
  margin-bottom: 24px;
  display: flex;
  gap: 20px;
}

.timeline-group:last-child {
  margin-bottom: 0;
}

/* 日期标记（左侧） */
.timeline-date-marker {
  position: absolute;
  left: -120px;
  width: 100px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-right: 20px;
}

.date-circle {
  position: absolute;
  right: -7px;
  top: 8px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--primary-color);
  border: 2px solid var(--bg-primary);
  z-index: 1;
}

.date-text {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.date-month-day {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.date-weekday {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 公告卡片（右侧） */
.timeline-cards {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.announcement-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: var(--bg-tertiary);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.announcement-card:hover {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  transform: translateX(4px);
}

.announcement-card:active {
  opacity: 0.8;
  transform: translateX(2px);
}

/* 公告类型标签 */
.card-type {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  flex-shrink: 0;
  min-width: 40px;
  text-align: center;
}

.card-type.分红公告 {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.card-type.定期报告 {
  background: rgba(66, 165, 245, 0.15);
  color: #42a5f5;
}

.card-type.人事变动 {
  background: rgba(255, 167, 38, 0.15);
  color: #ffa726;
}

.card-type.default {
  background: rgba(120, 144, 156, 0.15);
  color: #78909c;
}

/* 公告内容 */
.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.card-arrow {
  color: var(--text-tertiary);
  font-size: 14px;
}

/* 空状态 */
.timeline-empty {
  padding: 40px 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .timeline-content {
    padding-left: 90px;
  }

  .timeline-content::before {
    left: 70px;
  }

  .timeline-date-marker {
    left: -90px;
    width: 70px;
    padding-right: 15px;
  }

  .date-month-day {
    font-size: 13px;
  }

  .date-weekday {
    font-size: 11px;
  }
}
</style>
