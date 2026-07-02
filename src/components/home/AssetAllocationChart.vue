<script setup lang="ts">
// [WHY] 资产分配图组件 - 展示持仓资产的分配比例
// [WHAT] 使用饼图展示不同资产类别的分布，当前为占位组件

import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHoldingStore } from '@/stores/holding'
import { ASSET_CLASS_CONFIG } from '@/types/holding'
import type { AssetClass } from '@/types/holding'

const { t } = useI18n()
const holdingStore = useHoldingStore()

// [WHAT] 计算各类资产的市值占比
const assetAllocation = computed(() => {
  const holdings = holdingStore.holdings.filter(fund => fund.source !== 'observe')
  const totalValue = holdings.reduce((sum, fund) => sum + (fund.marketValue || 0), 0)
  
  if (totalValue === 0) return []
  
  // 按资产类别分组
  const grouped: Record<string, number> = {}
  holdings.forEach(fund => {
    const assetClass = fund.assetClass || 'stock'
    if (!grouped[assetClass]) {
      grouped[assetClass] = 0
    }
    grouped[assetClass] += fund.marketValue || 0
  })
  
  // 转换为数组并计算百分比
  return Object.entries(grouped).map(([assetClass, value]) => ({
    assetClass: assetClass as AssetClass,
    value,
    percentage: (value / totalValue) * 100,
    label: ASSET_CLASS_CONFIG[assetClass as AssetClass]?.label || assetClass,
    color: ASSET_CLASS_CONFIG[assetClass as AssetClass]?.color || '#999'
  }))
})

// [WHAT] 是否显示组件（有持仓时才显示）
const shouldShow = computed(() => {
  return holdingStore.holdings.filter(fund => fund.source !== 'observe').length > 0
})
</script>

<template>
  <div v-if="shouldShow" class="asset-allocation-chart">
    <div class="section-header">
      <span class="section-title">{{ t('home.asset_allocation') || '资产分配' }}</span>
    </div>
    
    <div class="chart-container">
      <!-- 占位：后续可接入真实图表库（如 echarts、chart.js） -->
      <div class="chart-placeholder">
        <div class="pie-chart-placeholder">
          <div 
            v-for="(item, index) in assetAllocation" 
            :key="item.assetClass"
            class="pie-segment"
            :style="{
              backgroundColor: item.color,
              width: `${Math.max(item.percentage, 10)}%`,
              height: '30px'
            }"
          ></div>
        </div>
        
        <!-- 图例 -->
        <div class="chart-legend">
          <div 
            v-for="item in assetAllocation" 
            :key="item.assetClass"
            class="legend-item"
          >
            <span class="legend-color" :style="{ backgroundColor: item.color }"></span>
            <span class="legend-label">{{ item.label }}</span>
            <span class="legend-value">{{ item.percentage.toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 资产分配图样式 ========== */
.asset-allocation-chart {
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

.chart-container {
  width: 100%;
}

.chart-placeholder {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pie-chart-placeholder {
  display: flex;
  height: 30px;
  border-radius: 15px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.pie-segment {
  transition: width 0.3s ease;
  min-width: 10%;
}

.chart-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend-label {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
}

.legend-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: var(--font-number);
}
</style>
