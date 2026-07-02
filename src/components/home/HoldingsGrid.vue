<script setup lang="ts">
// [WHY] 持仓列表组件 - 展示正常持仓和观察账户持仓
// [WHAT] 包含 FundGridItem 网格布局、观察账户分割线

import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import FundGridItem from '@/components/FundGridItem.vue'
import type { HoldingWithProfit } from '@/stores/holding'

const { t } = useI18n()
const router = useRouter()

// Props
defineProps<{
  normalHoldings: HoldingWithProfit[]
  observeHoldings: HoldingWithProfit[]
  uiMode: 'simple' | 'full'
  tradingSession: string
  isWeekend: boolean
  observeTodayProfitPercent: number
}>()

// Emits
const emit = defineEmits<{
  (e: 'open-top-holdings', fund: HoldingWithProfit, event: Event): void
  (e: 'open-intraday-modal', fund: HoldingWithProfit, event: Event): void
}>()

function openTopHoldings(fund: HoldingWithProfit, event: Event) {
  emit('open-top-holdings', fund, event)
}

function openIntradayModal(fund: HoldingWithProfit, event: Event) {
  emit('open-intraday-modal', fund, event)
}
</script>

<template>
  <div class="index-grid">
    <FundGridItem
      v-for="fund in normalHoldings"
      :key="fund.code"
      :fund="fund"
      :ui-mode="uiMode"
      :trading-session="tradingSession"
      @click="router.push(`/detail/${fund.code}`)"
      @open-top-holdings="openTopHoldings(fund, $event)"
      @open-intraday-modal="openIntradayModal(fund, $event)"
    />
    <div v-if="observeHoldings.length > 0" class="observe-divider">
      <div class="observe-divider-line"></div>
      <span class="observe-divider-text">{{ t("home.quant_observe") }}</span>
      <span 
        class="observe-profit-badge" 
        :class="isWeekend ? 'closed' : (observeTodayProfitPercent >= 0 ? 'up' : 'down')"
        v-if="observeHoldings.length > 0"
      >
        {{ isWeekend ? '休市' : ((observeTodayProfitPercent >= 0 ? '+' : '') + observeTodayProfitPercent.toFixed(2) + '%') }}
      </span>
      <div class="observe-divider-line"></div>
    </div>
    <FundGridItem
      v-for="fund in observeHoldings"
      :key="fund.code"
      :fund="fund"
      :ui-mode="uiMode"
      :trading-session="tradingSession"
      @click="router.push(`/detail/${fund.code}`)"
      @open-top-holdings="openTopHoldings(fund, $event)"
      @open-intraday-modal="openIntradayModal(fund, $event)"
    />
  </div>
</template>

<style scoped>
/* ========== 持仓列表样式 ========== */
.index-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

/* ========== 观察基金分割线 ========== */
.observe-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  margin: 4px 0;
  grid-column: 1 / -1;
}

.observe-divider-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    to right,
    var(--border-color) 0px,
    var(--border-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

.observe-divider-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  font-weight: 500;
}

.observe-profit-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  white-space: nowrap;
  margin-left: 8px;
}

.observe-profit-badge.up {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.observe-profit-badge.down {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.observe-profit-badge.closed {
  background: rgba(153, 153, 153, 0.1);
  color: #999;
}

@media (max-width: 767px) {
  .observe-divider {
    padding: 8px 4px;
    margin: 2px 0;
  }
  
  .observe-divider-text {
    font-size: 11px;
  }
}
</style>
