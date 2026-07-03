<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

interface HoldingDetail {
  amount: number
  shares: number
  ratio: number
  profit: number
  profitRate: number
  cost: number
  todayProfit: number
  yesterdayProfit: number
  holdDays: number
}

defineProps<{
  holdingDetails: HoldingDetail
}>()

const holdingExpanded = ref(true)

function formatNum(num: number, decimals = 2): string {
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toFixed(decimals)
}

function formatPercent(num: number): string {
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}${num.toFixed(2)}%`
}
</script>

<template>
  <div v-if="holdingDetails" class="holding-panel" :class="{ collapsed: !holdingExpanded }">
    <div class="holding-summary" @click="holdingExpanded = !holdingExpanded">
      <div class="summary-item">
        <span class="summary-label">{{ t('detail.hold_amount') }}</span>
        <span class="summary-value">{{ formatNum(holdingDetails.amount) }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{{ t('detail.hold_profit') }}</span>
        <span class="summary-value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
          {{ formatNum(holdingDetails.profit) }}
        </span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{{ t('holding.profit_rate_label') }}</span>
        <span class="summary-value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
          {{ formatPercent(holdingDetails.profitRate) }}
        </span>
      </div>
      <van-icon 
        :name="holdingExpanded ? 'arrow-up' : 'arrow-down'" 
        class="expand-icon"
      />
    </div>
    
    <transition name="slide">
      <div v-show="holdingExpanded" class="holding-grid">
        <div class="holding-item">
          <div class="item-label">{{ t('detail.hold_amount') }}</div>
          <div class="item-value">{{ formatNum(holdingDetails.amount) }}</div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.hold_shares') }}</div>
          <div class="item-value">{{ formatNum(holdingDetails.shares) }}</div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.holding_ratio') }}</div>
          <div class="item-value">{{ holdingDetails.ratio.toFixed(2) }}%</div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.hold_profit') }}</div>
          <div class="item-value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
            {{ formatNum(holdingDetails.profit) }}
          </div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.hold_profit_rate') }}</div>
          <div class="item-value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
            {{ formatPercent(holdingDetails.profitRate) }}
          </div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.holding_cost') }}</div>
          <div class="item-value">{{ holdingDetails.cost.toFixed(4) }}</div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.today_profit') }}</div>
          <div class="item-value" :class="holdingDetails.todayProfit >= 0 ? 'up' : 'down'">
            {{ formatNum(holdingDetails.todayProfit) }}
          </div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.yesterday_profit') }}</div>
          <div class="item-value" :class="holdingDetails.yesterdayProfit >= 0 ? 'up' : 'down'">
            {{ formatNum(holdingDetails.yesterdayProfit) }}
          </div>
        </div>
        <div class="holding-item">
          <div class="item-label">{{ t('detail.hold_days') }}</div>
          <div class="item-value">{{ holdingDetails.holdDays }}</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.holding-panel {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 16px;
}

.holding-panel.collapsed .holding-grid {
  display: none;
}

.holding-summary {
  display: flex;
  align-items: center;
  padding: 12px 0;
  cursor: pointer;
}

.summary-item {
  flex: 1;
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.summary-value.up {
  color: var(--price-up);
}

.summary-value.down {
  color: var(--price-down);
}

.expand-icon {
  color: var(--text-tertiary);
  margin-left: 8px;
}

.holding-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 12px 0 16px;
}

.holding-item {
  text-align: center;
}

.item-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.item-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.item-value.up {
  color: var(--price-up);
}

.item-value.down {
  color: var(--price-down);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 300px;
}
</style>
