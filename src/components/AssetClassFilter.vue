<script setup lang="ts">
// [WHY] 资产类别筛选栏组件
// [WHAT] 提供资产类别筛选功能，支持全部和各类资产切换

import { ASSET_CLASS_CONFIG } from '@/types/holding'
import type { AssetClass } from '@/types/holding'

const props = defineProps<{
  currentFilter: AssetClass | ''
}>()

const emit = defineEmits<{
  (e: 'update:currentFilter', value: AssetClass | ''): void
}>()

function filterByAssetClass(assetClass: AssetClass | '') {
  emit('update:currentFilter', assetClass)
}
</script>

<template>
  <div class="asset-class-filter">
    <div class="filter-tabs">
      <span 
        class="filter-tab" 
        :class="{ active: currentFilter === '' }"
        @click="filterByAssetClass('')"
      >{{ $t('home.filter_all') }}</span>
      <span 
        v-for="(config, assetClass) in ASSET_CLASS_CONFIG" 
        :key="assetClass"
        class="filter-tab"
        :class="{ active: currentFilter === assetClass }"
        @click="filterByAssetClass(assetClass as AssetClass)"
      >
        {{ config.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.filter-tabs {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.filter-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.filter-tab:active {
  background: var(--bg-active);
}

.filter-tab.active {
  color: #fff;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  font-weight: 600;
}
</style>
