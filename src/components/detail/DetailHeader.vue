<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

interface FundInfo {
  name?: string
  gsz?: string
  dwjz?: string
  gztime?: string
  dataSource?: string
}

interface HoldingDetail {
  amount: number
  profit: number
  ratio: number
}

interface BestPeriodReturn {
  label: string
  value: number
}

defineProps<{
  fundCode: string
  fundInfo: FundInfo | null
  holdingDetails?: HoldingDetail | null
  isLoading: boolean
  bestPeriodReturn: BestPeriodReturn
  priceChangePercent: number
  isUp: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

function formatMoney(num: number): string {
  const prefix = num >= 0 ? '' : '-'
  const absNum = Math.abs(num)
  if (absNum >= 10000) {
    return prefix + (absNum / 10000).toFixed(2) + '万'
  }
  return prefix + absNum.toFixed(2)
}

function formatPercent(num: number): string {
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}${num.toFixed(2)}%`
}
</script>

<template>
  <div class="top-header">
    <div class="nav-bar">
      <van-icon name="arrow-left" size="22" color="var(--text-primary)" @click="emit('back')" :data-test-id="'back-button'" />
      <div class="nav-title">
        <div class="fund-name" :data-test-id="'fund-name'">{{ fundInfo?.name || '加载中...' }}</div>
        <div class="fund-info-row">
          <span class="fund-code" :data-test-id="'fund-code'">{{ fundCode }}</span>
          <span class="info-divider">|</span>
          <span class="estimate-tag" :class="isUp ? 'up' : 'down'">
            {{ fundInfo?.dataSource === 'nav' ? '净值' : '估值' }}涨幅 {{ formatPercent(priceChangePercent) }}
          </span>
          <span class="info-divider">|</span>
          <span class="estimate-tag">
            {{ fundInfo?.dataSource === 'nav' ? '净值' : '估值' }} {{ fundInfo?.gsz ? parseFloat(fundInfo.gsz).toFixed(4) : '--' }}
          </span>
        </div>
        <div v-if="holdingDetails" class="fund-info-row holding-info-row">
          <span class="fund-code">市值 {{ formatMoney(holdingDetails.amount) }}</span>
          <span class="info-divider">|</span>
          <span class="estimate-tag">收益 {{ formatMoney(holdingDetails.profit) }}</span>
          <span class="info-divider">|</span>
          <span class="estimate-tag">占比 {{ holdingDetails.ratio.toFixed(2) }}%</span>
        </div>
      </div>
    </div>
    
    <div class="core-metrics" v-if="!isLoading" :data-test-id="'valuation-section'">
      <div class="main-change">
        <div class="change-label">当日涨幅 {{ fundInfo?.gztime?.slice(5, 10) || '--' }}</div>
        <div class="change-value" :class="isUp ? 'up' : 'down'" :data-test-id="'valuation-change'">
          {{ formatPercent(priceChangePercent) }}
        </div>
      </div>
      <div class="sub-metrics">
        <div class="metric-item">
          <div class="metric-label">{{ t('detail.estimate_nav') }}</div>
          <div class="metric-value" :data-test-id="'valuation'">{{ fundInfo?.gsz || '--' }}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">{{ t('detail.yesterday_nav') }}</div>
          <div class="metric-value">{{ fundInfo?.dwjz || '--' }}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">{{ bestPeriodReturn.label }}</div>
          <div class="metric-value" :class="bestPeriodReturn.value >= 0 ? 'up' : 'down'">
            {{ bestPeriodReturn.value !== 0 ? formatPercent(bestPeriodReturn.value) : '--' }}
          </div>
        </div>
      </div>
    </div>
    <div v-else class="core-metrics loading" :data-test-id="'loading'">
      <van-loading color="var(--text-secondary)" />
    </div>
  </div>
</template>

<style scoped>
.top-header {
  background: var(--bg-primary);
  padding: 12px 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.nav-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.nav-title {
  flex: 1;
}

.fund-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.fund-info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.fund-code {
  color: var(--text-secondary);
}

.info-divider {
  color: var(--border-color);
}

.estimate-tag {
  color: var(--text-secondary);
}

.estimate-tag.up {
  color: var(--price-up);
}

.estimate-tag.down {
  color: var(--price-down);
}

.holding-info-row {
  margin-top: 4px;
}

.core-metrics {
  display: flex;
  align-items: center;
  gap: 20px;
}

.core-metrics.loading {
  justify-content: center;
  padding: 30px 0;
}

.main-change {
  text-align: left;
}

.change-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.change-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

.change-value.up {
  color: var(--price-up);
}

.change-value.down {
  color: var(--price-down);
}

.sub-metrics {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.metric-item {
  text-align: center;
}

.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.metric-value.up {
  color: var(--price-up);
}

.metric-value.down {
  color: var(--price-down);
}
</style>
