<script setup lang="ts">
// [WHY] 前10大重仓股弹窗组件 - 展示基金的重仓股票
// [WHAT] 显示基金名称、代码及前10只重仓股票的名称、涨跌幅、权重

import { ref, watch } from 'vue'
import { fetchTopHoldings, type HoldingStock } from '@/api/fundFast'
import { logger } from '@/utils/logger'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const props = defineProps<{
  show: boolean
  fund: { code: string; name: string } | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const loading = ref(false)
const stocks = ref<HoldingStock[]>([])

// 监听显示状态，打开时加载数据
watch(() => props.show, async (show) => {
  if (show && props.fund) {
    await loadData()
  } else {
    stocks.value = []
  }
})

async function loadData() {
  if (!props.fund) return
  loading.value = true
  stocks.value = []
  try {
    const result = await fetchTopHoldings(props.fund.code)
    stocks.value = result
  } catch (err) {
    logger.error('获取重仓股失败', err)
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:show', false)
}
</script>

<template>
  <van-popup 
    :show="show" 
    position="center" 
    round 
    :style="{ width: '88%', maxWidth: '420px', background: 'var(--bg-secondary)' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="top-holdings-popup">
      <div class="top-holdings-header">
        <div class="top-holdings-title-row">
          <span class="top-holdings-icon">📈</span>
          <span class="top-holdings-title">前10重仓股票</span>
        </div>
      </div>
      <div class="top-holdings-fund-info">
        <span class="top-holdings-fund-name">{{ fund?.name }}</span>
        <span class="top-holdings-fund-code">#{{ fund?.code }}</span>
      </div>
      <div class="top-holdings-grid" v-if="!loading">
        <div 
          v-for="(stock, idx) in stocks" 
          :key="stock.code || idx" 
          class="top-holdings-card"
        >
          <span class="thc-name">{{ stock.name }}</span>
          <div class="thc-bottom">
            <span 
              v-if="stock.change !== null" 
              class="thc-change" 
              :class="stock.change > 0 ? 'up' : stock.change < 0 ? 'down' : ''"
            >
              {{ stock.change > 0 ? '+' : '' }}{{ stock.change.toFixed(2) }}%
            </span>
            <span v-else class="thc-change">--</span>
            <span class="thc-weight">{{ stock.weight }}</span>
          </div>
        </div>
        <div v-if="stocks.length === 0" class="top-holdings-empty">
          暂无重仓股数据
        </div>
      </div>
      <div class="top-holdings-loading" v-else>
        <van-loading size="24px">{{ t('common.loading') }}</van-loading>
      </div>
      <button class="top-holdings-close-btn" @click="close">关闭</button>
    </div>
  </van-popup>
</template>

<style scoped>
.top-holdings-popup {
  padding: 20px;
}

.top-holdings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.top-holdings-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-holdings-icon {
  font-size: 18px;
}

.top-holdings-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.top-holdings-fund-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.top-holdings-fund-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.top-holdings-fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.top-holdings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  max-height: 55vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.top-holdings-card {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  overflow: hidden;
}

.thc-name {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  display: block;
  margin-bottom: 4px;
}

.thc-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thc-change {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--text-secondary);
}

.thc-change.up {
  color: var(--color-up);
  background: rgba(255, 107, 107, 0.12);
}

.thc-change.down {
  color: var(--color-down);
  background: rgba(81, 207, 102, 0.12);
}

.thc-weight {
  font-size: 11px;
  color: var(--text-secondary);
}

.top-holdings-close-btn {
  width: 100%;
  height: 40px;
  margin-top: 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.top-holdings-close-btn:hover {
  opacity: 0.9;
}

.top-holdings-close-btn:active {
  opacity: 0.8;
}

.top-holdings-empty {
  text-align: center;
  padding: 30px 0;
  color: #999;
  font-size: 14px;
}

.top-holdings-loading {
  display: flex;
  justify-content: center;
  padding: 30px 0;
}
</style>
