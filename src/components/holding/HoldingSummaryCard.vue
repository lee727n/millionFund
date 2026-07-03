<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

interface Summary {
  totalValue: number
  todayProfit: number
  totalProfit: number
  totalProfitRate: number
}

const props = defineProps<{
  summary: Summary
}>()

function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

function formatMoney(num: number, prefix = '', mobile = false): string {
  const absNum = Math.abs(num)
  const sign = num >= 0 ? '' : '-'
  if (absNum >= 100000000) {
    return mobile ? `${sign}${(absNum / 100000000).toFixed(2)}亿` : `${prefix}${sign}${(absNum / 100000000).toFixed(2)}亿`
  }
  if (absNum >= 10000) {
    return mobile ? `${sign}${(absNum / 10000).toFixed(2)}万` : `${prefix}${sign}${(absNum / 10000).toFixed(2)}万`
  }
  return mobile ? `${sign}${absNum.toFixed(2)}` : `${prefix}${sign}${absNum.toFixed(2)}`
}

function formatPercent(num: number, mobile = false): string {
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}${num.toFixed(2)}%`
}

const summaryTodayClass = computed(() => 
  props.summary.todayProfit >= 0 ? 'up' : 'down'
)

const summaryProfitClass = computed(() => 
  props.summary.totalProfit >= 0 ? 'up' : 'down'
)
</script>

<template>
  <div v-if="summary" class="summary-card">
    <div class="summary-row summary-row-single">
      <div class="summary-item">
        <div class="summary-label">{{ t('holding.account_assets') }}</div>
        <div class="summary-value">{{ formatMoney(summary.totalValue, '', isMobile()) }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">{{ t('holding.today_profit_label') }}</div>
        <div class="summary-value" :class="summaryTodayClass">
          {{ isMobile() ? '' : (summary.todayProfit >= 0 ? '+' : '') }}{{ formatMoney(summary.todayProfit, '', isMobile()) }}
        </div>
      </div>
      <div class="summary-item">
        <div class="summary-label">{{ t('holding.holding_profit') }}</div>
        <div class="summary-value" :class="summaryProfitClass">
          {{ isMobile() ? '' : (summary.totalProfit >= 0 ? '+' : '') }}{{ formatMoney(summary.totalProfit, '', isMobile()) }}
        </div>
      </div>
      <div class="summary-item">
        <div class="summary-label">{{ t("holding.profit_rate_label") }}</div>
        <div class="summary-value" :class="summaryProfitClass">
          {{ isMobile() ? '' : '' }}{{ formatPercent(summary.totalProfitRate, isMobile()) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-card {
  background: var(--bg-primary);
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.summary-row {
  display: flex;
  justify-content: space-between;
}

.summary-item {
  flex: 1;
  text-align: center;
}

.summary-label {
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

@media (max-width: 768px) {
  .summary-value {
    font-size: 14px;
  }
}
</style>
