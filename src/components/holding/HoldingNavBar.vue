<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

defineProps<{
  sortDirection: 'none' | 'up' | 'down'
  currentSourceFilter: string
  riseIcon: string
  downIcon: string
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'copy-logs'): void
  (e: 'import-screenshot'): void
  (e: 'batch-entry'): void
  (e: 'export-csv'): void
  (e: 'backup'): void
  (e: 'restore'): void
  (e: 'sort', direction: 'none' | 'up' | 'down'): void
  (e: 'filter-source', source: string): void
}>()

function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}
</script>

<template>
  <div class="custom-nav-bar">
    <div class="nav-title">{{ t('holding.title') }}</div>
    <div class="nav-actions">
      <div class="web-actions web-only">
        <van-icon name="replay" size="20" @click="emit('refresh')" class="refresh-icon" />
        <van-icon name="description-o" size="20" @click="emit('copy-logs')" :title="t('holding.copy_logs')" />
        <van-button size="small" @click="emit('import-screenshot')" class="nav-btn">{{ t('holding.import_screenshot') }}</van-button>
        <van-button size="small" @click="emit('batch-entry')" class="nav-btn">{{ t('holding.batch') }}</van-button>
        <van-button size="small" @click="emit('export-csv')" class="nav-btn">{{ t('holding.export_csv') }}</van-button>
        <van-button size="small" @click="emit('backup')" class="nav-btn">{{ t('holding.backup') }}</van-button>
        <van-button size="small" @click="emit('restore')" class="nav-btn">{{ t('holding.restore') }}</van-button>
      </div>
      
      <div class="mobile-actions mobile-only">
        <img 
          :src="riseIcon" 
          class="sort-mobile-icon"
          :class="{ active: sortDirection === 'up' }"
          @click="emit('sort', 'up')"
          :alt="t('holding.sort_asc')" 
        />
        <img 
          :src="downIcon" 
          class="sort-mobile-icon"
          :class="{ active: sortDirection === 'down' }"
          @click="emit('sort', 'down')"
          :alt="t('holding.sort_desc')" 
        />
        <van-icon name="description-o" size="20" @click="emit('copy-logs')" :title="t('holding.copy_logs')" />
        <van-button size="small" @click="emit('import-screenshot')">{{ t('holding.import_screenshot') }}</van-button>
        <van-button size="small" @click="emit('batch-entry')">{{ t('holding.batch') }}</van-button>
        <van-button size="small" @click="emit('export-csv')">{{ t('holding.export_csv') }}</van-button>
        <van-button size="small" @click="emit('restore')">{{ t('holding.restore') }}</van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.nav-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.web-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-btn {
  margin-left: 4px;
}

.refresh-icon {
  cursor: pointer;
  color: var(--text-secondary);
}

.sort-mobile-icon {
  width: 20px;
  height: 20px;
  opacity: 0.5;
  cursor: pointer;
}

.sort-mobile-icon.active {
  opacity: 1;
}

.mobile-only {
  display: none;
}

.web-only {
  display: flex;
}

@media (max-width: 768px) {
  .mobile-only {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .web-only {
    display: none;
  }
}
</style>
