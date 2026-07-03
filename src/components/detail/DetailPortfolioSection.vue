<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

interface StockHolding {
  stockCode: string
  stockName: string
  holdingRatio: number
}

interface IndustryAllocation {
  name: string
  ratio: number
  color: string
}

interface AssetAllocation {
  stock: number
  bond: number
  cash: number
  other: number
}

interface FundRating {
  rating: number
  riskLevel: string
  sharpeRatio: string
  maxDrawdown: string
  volatility: string
  rankInSimilar: string
}

const props = defineProps<{
  stockHoldings: StockHolding[]
  industryAllocation: IndustryAllocation[]
  assetAllocation: AssetAllocation | null
  fundRating: FundRating | null
}>()

const industryPieData = computed(() => {
  const total = props.industryAllocation.reduce((s, i) => s + i.ratio, 0)
  if (total === 0) return []
  const circumference = 2 * Math.PI * 40
  let offset = 0
  return props.industryAllocation.map(item => {
    const ratio = item.ratio / total
    const dashArray = ratio * circumference
    const result = { ...item, dashArray: `${dashArray} ${circumference - dashArray}`, offset: -offset }
    offset += dashArray
    return result
  })
})
</script>

<template>
  <!-- ========== 重仓股票 ========== -->
  <div class="info-section">
    <div class="section-header">
      <span>{{ t('detail.top_stocks') }}</span>
      <span class="section-tip" v-if="stockHoldings.length > 0">
        TOP{{ stockHoldings.length }}
      </span>
    </div>
    <div v-if="stockHoldings.length > 0" class="holdings-list">
      <div 
        v-for="(stock, idx) in stockHoldings" 
        :key="idx"
        class="holding-item"
      >
        <div class="holding-rank">{{ idx + 1 }}</div>
        <div class="holding-info">
          <div class="holding-name">{{ stock.stockName }}</div>
          <div class="holding-code">{{ stock.stockCode }}</div>
        </div>
        <div class="holding-ratio">
          <div class="ratio-value">{{ stock.holdingRatio.toFixed(2) }}%</div>
          <div class="ratio-label">{{ t('detail.hold_ratio') }}</div>
        </div>
      </div>
    </div>
    <div v-else class="empty-hint">{{ t('detail.no_holding_data') }}</div>
  </div>

  <!-- ========== 行业配置 ========== -->
  <div class="info-section" v-if="industryAllocation.length > 0">
    <div class="section-header">
      <span>{{ t('detail.industry_alloc') }}</span>
    </div>
    <div class="industry-chart">
   
      <div class="pie-container">
        <svg viewBox="0 0 100 100" class="pie-svg">
          <circle 
            v-for="(item, idx) in industryPieData" 
            :key="idx"
            cx="50" cy="50" r="40"
            fill="transparent"
            :stroke="item.color"
            stroke-width="20"
            :stroke-dasharray="item.dashArray"
            :stroke-dashoffset="item.offset"
            :style="{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }"
          />
        </svg>
      </div>
      <div class="industry-legend">
        <div 
          v-for="item in industryAllocation.slice(0, 6)" 
          :key="item.name"
          class="legend-item"
        >
          <span class="legend-color" :style="{ background: item.color }"></span>
          <span class="legend-name">{{ item.name }}</span>
          <span class="legend-value">{{ item.ratio }}%</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ========== 资产配置 ========== -->
  <div class="info-section" v-if="assetAllocation">
    <div class="section-header">
      <span>{{ t('detail.asset_alloc') }}</span>
    </div>
    <div class="asset-bars">
      <div class="asset-item" v-if="assetAllocation.stock > 0">
        <span class="asset-label">{{ t('detail.stock_label') }}</span>
        <div class="asset-bar">
          <div class="bar-fill stock" :style="{ width: assetAllocation.stock + '%' }"></div>
        </div>
        <span class="asset-value">{{ assetAllocation.stock }}%</span>
      </div>
      <div class="asset-item" v-if="assetAllocation.bond > 0">
        <span class="asset-label">{{ t('detail.bond_label') }}</span>
        <div class="asset-bar">
          <div class="bar-fill bond" :style="{ width: assetAllocation.bond + '%' }"></div>
        </div>
        <span class="asset-value">{{ assetAllocation.bond }}%</span>
      </div>
      <div class="asset-item" v-if="assetAllocation.cash > 0">
        <span class="asset-label">{{ t('detail.cash_label') }}</span>
        <div class="asset-bar">
          <div class="bar-fill cash" :style="{ width: assetAllocation.cash + '%' }"></div>
        </div>
        <span class="asset-value">{{ assetAllocation.cash }}%</span>
      </div>
      <div class="asset-item" v-if="assetAllocation.other > 0">
        <span class="asset-label">{{ t('detail.other_label') }}</span>
        <div class="asset-bar">
          <div class="bar-fill other" :style="{ width: assetAllocation.other + '%' }"></div>
        </div>
        <span class="asset-value">{{ assetAllocation.other }}%</span>
      </div>
    </div>
  </div>

  <!-- ========== 基金评级 ========== -->
  <div class="info-section" v-if="fundRating">
    <div class="section-header">
      <span>{{ t('detail.fund_rating') }}</span>
      <span class="section-tip">{{ fundRating.riskLevel }}</span>
    </div>
    <div class="rating-content">
      <div class="rating-stars">
        <van-icon 
          v-for="i in 5" 
          :key="i" 
          :name="i <= fundRating.rating ? 'star' : 'star-o'" 
          :color="i <= fundRating.rating ? '#f59e0b' : '#d1d5db'"
          size="20"
        />
        <span class="rating-text">{{ fundRating.rating }}星</span>
      </div>
      <div class="rating-metrics">
        <div class="metric-item">
          <div class="metric-value">{{ fundRating.sharpeRatio || '--' }}</div>
          <div class="metric-label">{{ t('detail.sharpe_ratio') }}</div>
        </div>
        <div class="metric-item">
          <div class="metric-value danger">{{ fundRating.maxDrawdown ? fundRating.maxDrawdown + '%' : '--' }}</div>
          <div class="metric-label">{{ t('detail.max_drawdown') }}</div>
        </div>
        <div class="metric-item">
          <div class="metric-value">{{ fundRating.volatility ? fundRating.volatility + '%' : '--' }}</div>
          <div class="metric-label">{{ t('detail.volatility') }}</div>
        </div>
        <div class="metric-item">
          <div class="metric-value primary">{{ fundRating.rankInSimilar }}</div>
          <div class="metric-label">{{ t('detail.peer_rank') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.info-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header span:first-child {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-tip {
  font-size: 12px;
  color: var(--text-secondary);
}

.holdings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.holding-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.holding-rank {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.holding-info {
  flex: 1;
}

.holding-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.holding-code {
  font-size: 12px;
  color: var(--text-tertiary);
}

.holding-ratio {
  text-align: right;
}

.ratio-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.ratio-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.industry-chart {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pie-container {
  width: 100px;
  height: 100px;
  flex-shrink: 0;
}

.pie-svg {
  width: 100%;
  height: 100%;
}

.industry-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.legend-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  color: var(--text-primary);
}

.legend-value {
  color: var(--text-secondary);
  font-weight: 500;
}

.asset-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.asset-label {
  width: 60px;
  font-size: 13px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.asset-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-fill.stock {
  background: #ef4444;
}

.bar-fill.bond {
  background: #3b82f6;
}

.bar-fill.cash {
  background: #10b981;
}

.bar-fill.other {
  background: #f59e0b;
}

.asset-value {
  width: 50px;
  text-align: right;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.rating-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rating-stars {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rating-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.rating-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.rating-metrics .metric-item {
  text-align: center;
}

.rating-metrics .metric-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.rating-metrics .metric-value.danger {
  color: #ef4444;
}

.rating-metrics .metric-value.primary {
  color: #3b82f6;
}

.rating-metrics .metric-label {
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
