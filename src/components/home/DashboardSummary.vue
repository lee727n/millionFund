<script setup lang="ts">
// [WHY] 资产总览卡片 - 展示持仓趋势、当日盈亏、交易状态
// [WHAT] 包含排序、来源筛选、UI模式切换功能

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHoldingStore } from '@/stores/holding'
import { useHomeData } from '@/composables/useHomeData'
import { getSourceLabel } from '@/config/sources'
import { ASSET_CLASS_CONFIG } from '@/types/holding'
import type { AssetClass } from '@/types/holding'
import riseW from '@/assets/riseW.jpg'
import downW from '@/assets/downW.jpg'

const { t, locale } = useI18n()
const holdingStore = useHoldingStore()
const { tradingSession, currentTime, isRefreshing } = useHomeData()

// Props
const props = defineProps<{
  totalTodayProfit: number
  totalTodayProfitPercent: number
  observeTodayProfit: number
  observeTodayProfitPercent: number
  isWeekend: boolean
  sortDirection: 'up' | 'down' | 'none'
  uiMode: 'simple' | 'full'
  currentSourceFilter: string
  currentAssetClassFilter: string
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:sortDirection', value: 'up' | 'down' | 'none'): void
  (e: 'update:uiMode', value: 'simple' | 'full'): void
  (e: 'filter-by-source', source: string): void
  (e: 'filter-by-asset-class', assetClass: AssetClass | ''): void
}>()

// [WHAT] 交易状态文本和样式
const tradingStatus = computed(() => {
  if (isRefreshing.value) {
    return { text: '刷新中...', subText: '正在获取最新数据', class: 'refreshing', icon: 'replay' }
  }
  const session = tradingSession.value
  const now = currentTime.value
  const hour = now.getHours()
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`
  
  switch (session) {
    case 'morning':
      return { text: '交易中', subText: `上午盘 ${timeStr}`, class: 'trading', icon: 'live' }
    case 'noon_break':
      return { text: '午休中', subText: `13:00 开盘`, class: 'break', icon: 'pause' }
    case 'afternoon':
      return { text: '交易中', subText: `下午盘 ${timeStr}`, class: 'trading', icon: 'live' }
    case 'pre_market':
      return { text: '等待开盘', subText: `09:30 开盘 ${timeStr}`, class: 'pre-market', icon: 'clock' }
    case 'post_market':
      return { text: '已收盘', subText: `下次 09:30 开盘`, class: 'closed', icon: 'clock' }
    case 'weekend':
      return { text: '周末休市', subText: '下周一会开盘', class: 'closed', icon: 'calendar-o' }
    case 'holiday':
      return { text: '节假日休市', subText: '节后恢复交易', class: 'closed', icon: 'calendar-o' }
    default:
      return { text: '已收盘', subText: '09:30 开盘', class: 'closed', icon: 'clock' }
  }
})

// [WHAT] 京东账户更新状态
const jdUpdateStatus = computed(() => {
  const allHoldings = holdingStore.holdings
  if (allHoldings.length === 0) return null

  const totalCount = allHoldings.length
  const updatedCount = allHoldings.filter(fund => fund.isUpdated).length
  const isInTrading = tradingSession.value === 'morning' || tradingSession.value === 'afternoon'

  if (isInTrading) {
    return { text: '未更新', class: 'not-updated' }
  }
  if (updatedCount === 0) {
    return { text: '未更新', class: 'not-updated' }
  }
  if (updatedCount < totalCount) {
    return { text: `更新中${updatedCount}/${totalCount}`, class: 'updating' }
  }
  return { text: '已更新', class: 'updated' }
})

function handleSort(direction: 'up' | 'down') {
  emit('update:sortDirection', direction)
}

function filterBySource(source: string) {
  emit('filter-by-source', source)
}

function filterByAssetClass(assetClass: AssetClass | '') {
  emit('filter-by-asset-class', assetClass)
}
</script>

<template>
  <div class="market-overview" data-testid="dashboard-summary">
    <div class="overview-title">
      <div class="title-left">
        <span class="live-dot" :class="tradingStatus.class"></span>
        <span>{{ t('home.holding_trend') }}</span>
        <div class="mobile-profit-summary mobile-only">
          <span :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
            {{ isWeekend ? t('home.market_closed_short') : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
          </span>
          <span :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
            {{ isWeekend ? '' : t('home.profit_short') + Math.round(totalTodayProfit) }}
          </span>
        </div>
        <!-- 网页端：按钮在第一行 -->
        <div class="sort-buttons web-only">
          <img 
            :src="riseW" 
            class="sort-web-icon"
            :class="{ active: sortDirection === 'up' }"
            @click="handleSort('up')"
            alt="升序" 
          />
          <img 
            :src="downW" 
            class="sort-web-icon"
            :class="{ active: sortDirection === 'down' }"
            @click="handleSort('down')"
            alt="降序" 
          />
        </div>
        <div class="source-buttons web-only">
          <div class="ui-mode-toggle">
            <span 
              class="ui-mode-btn" 
              :class="{ active: uiMode === 'simple' }"
              @click="emit('update:uiMode', 'simple')"
            >{{ t("common.simple") }}</span>
            <span 
              class="ui-mode-btn" 
              :class="{ active: uiMode === 'full' }"
              @click="emit('update:uiMode', 'full')"
            >{{ t("common.full") }}</span>
          </div>
          <van-button 
            size="small" 
            class="source-button"
            :class="{ active: currentSourceFilter === 'ali' }"
            @click="filterBySource('ali')"
          >
            <img src="@/assets/ali.jpg" class="source-icon" alt="支付宝" />
          </van-button>
          <van-button 
            size="small" 
            class="source-button"
            :class="{ active: currentSourceFilter === 'TX' }"
            @click="filterBySource('TX')"
          >
            <img src="@/assets/TX.jpg" class="source-icon" alt="腾讯" />
          </van-button>
          <van-button 
            size="small" 
            class="source-button"
            :class="{ active: currentSourceFilter === 'JD' }"
            @click="filterBySource('JD')"
          >
            <img src="@/assets/JD.jpg" class="source-icon" alt="京东" />
          </van-button>
          <span v-if="jdUpdateStatus" class="jd-update-status" :class="jdUpdateStatus.class">
            {{ jdUpdateStatus.text }}
          </span>
        </div>
      </div>
      <div class="holding-stats">
        <div class="profit-section">
          <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
            <span class="profit-label">{{ t('home.profit_rate') }}</span>
            <span class="profit-percent" :class="isWeekend ? 'closed' : (totalTodayProfitPercent >= 0 ? 'up' : 'down')">
              {{ isWeekend ? t('home.market_closed') : ((totalTodayProfitPercent >= 0 ? '+' : '') + totalTodayProfitPercent.toFixed(2) + '%') }}
            </span>
          </div>
          <div class="profit-divider"></div>
          <div class="profit-item" :class="isWeekend ? 'closed' : (totalTodayProfit >= 0 ? 'up' : 'down')">
            <span class="profit-label">{{ t('home.today_profit') }}</span>
            <span class="profit-value">{{ isWeekend ? t('home.market_closed') : ((totalTodayProfit >= 0 ? '+' : '') + totalTodayProfit.toFixed(2) + '元') }}</span>
          </div>
        </div>
        <div class="trading-status" :class="tradingStatus.class">
          <span class="status-text">{{ tradingStatus.text }}</span>
          <span class="status-time">{{ tradingStatus.subText }}</span>
        </div>
      </div>
    </div>
    <!-- 移动端：第二行按钮 -->
    <div class="overview-buttons mobile-only">
      <div class="sort-buttons">
        <div 
          class="sort-icon-button"
          :class="{ active: sortDirection === 'up' }"
          @click="handleSort('up')"
        >
          <img 
            :src="riseW" 
            class="sort-icon" 
            alt="升序" 
          />
        </div>
        <div 
          class="sort-icon-button"
          :class="{ active: sortDirection === 'down' }"
          @click="handleSort('down')"
        >
          <img 
            :src="downW" 
            class="sort-icon" 
            alt="降序" 
          />
        </div>
      </div>
      <div class="source-buttons">
        <div class="ui-mode-toggle">
          <span 
            class="ui-mode-btn" 
            :class="{ active: uiMode === 'simple' }"
            @click="emit('update:uiMode', 'simple')"
          >{{ t("common.simple") }}</span>
          <span 
            class="ui-mode-btn" 
            :class="{ active: uiMode === 'full' }"
            @click="emit('update:uiMode', 'full')"
          >{{ t("common.full") }}</span>
        </div>
        <van-button 
          size="small" 
          class="source-button"
          :class="{ active: currentSourceFilter === 'ali' }"
          @click="filterBySource('ali')"
        >
          <img src="@/assets/ali.jpg" class="source-icon" alt="支付宝" />
        </van-button>
        <van-button 
          size="small" 
          class="source-button"
          :class="{ active: currentSourceFilter === 'TX' }"
          @click="filterBySource('TX')"
        >
          <img src="@/assets/TX.jpg" class="source-icon" alt="腾讯" />
        </van-button>
        <van-button 
          size="small" 
          class="source-button"
          :class="{ active: currentSourceFilter === 'JD' }"
          @click="filterBySource('JD')"
        >
          <img src="@/assets/JD.jpg" class="source-icon" alt="京东" />
        </van-button>
        <span v-if="jdUpdateStatus" class="jd-update-status" :class="jdUpdateStatus.class">
          {{ jdUpdateStatus.text }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 资产总览样式 ========== */
.market-overview {
  padding: 16px;
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.overview-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  flex-wrap: nowrap;
  white-space: nowrap;
}

.mobile-profit-summary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  white-space: nowrap;
  flex-wrap: nowrap;
}

.mobile-profit-summary span {
  margin-right: 10px;
}

.mobile-profit-summary span:last-child {
  margin-right: 0;
}

.mobile-profit-summary .up {
  color: var(--color-up);
}

.mobile-profit-summary .down {
  color: var(--color-down);
}

.mobile-profit-summary .closed {
  color: #999;
}

.sort-buttons {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.sort-web-icon {
  width: 36px;
  height: 36px;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.2s ease;
  border-radius: 6px;
  padding: 4px;
}

.sort-web-icon:hover {
  opacity: 0.8;
}

.sort-web-icon.active {
  opacity: 1;
  background: rgba(59, 130, 246, 0.1);
}

.source-buttons {
  display: flex;
  gap: 8px;
  margin-left: 12px;
  align-items: center;
}

.ui-mode-toggle {
  display: flex;
  align-items: center;
  background: var(--bg-primary, #f5f5f5);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-light, #e0e0e0);
  margin-right: 4px;
}

.ui-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #999);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.ui-mode-btn:first-child {
  border-right: 1px solid var(--border-light, #e0e0e0);
}

.ui-mode-btn.active {
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-weight: 600;
}

.ui-mode-btn:hover:not(.active) {
  background: var(--bg-secondary, #eee);
}

.source-button {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  overflow: hidden;
}

.source-button.active {
  box-shadow: 0 0 0 2px #0ea5e9;
}

.source-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 3px;
}

.jd-update-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.jd-update-status.updated {
  color: #ff9800;
  background: rgba(255, 152, 0, 0.1);
}

.jd-update-status.updating {
  color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.jd-update-status.not-updated {
  color: var(--text-secondary);
  background: rgba(158, 158, 158, 0.1);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all 0.3s;
}

.live-dot.trading {
  background: var(--color-down);
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 8px var(--color-down);
}

.live-dot.break {
  background: var(--color-primary);
  animation: pulse 3s ease-in-out infinite;
  box-shadow: 0 0 6px var(--color-primary);
}

.live-dot.closed {
  background: var(--text-muted);
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.trading-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.status-text {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.trading-status.trading .status-text {
  background: rgba(81, 207, 102, 0.15);
  color: var(--color-down);
}

.trading-status.break .status-text {
  background: rgba(255, 193, 7, 0.15);
  color: var(--color-primary);
}

.trading-status.closed .status-text {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.trading-status.refreshing .status-text {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
}

.status-time {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-number);
}

.holding-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overview-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

@media (max-width: 767px) {
  .title-left .web-only {
    display: none;
  }

  .jd-update-status {
    margin-left: 4px;
    font-size: 11px;
    padding: 2px 6px;
  }
  
  .overview-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  
  .overview-buttons .sort-buttons {
    display: flex;
    gap: 8px;
  }
  
  .sort-icon-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .sort-icon-button.active {
    background: linear-gradient(180deg, #0ea5e9, #22d3ee);
    border-color: transparent;
  }
  
  .sort-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    padding: 4px;
  }
  
  .holding-stats .profit-section {
    display: none;
  }
  
  .holding-stats {
    margin-left: auto;
  }
}

@media (min-width: 768px) {
  .overview-buttons {
    display: none;
  }
  
  .title-left .web-only {
    display: flex;
  }
  
  .title-left .web-only.sort-buttons {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }
  
  .title-left .web-only.source-buttons {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }
}

.profit-section {
  display: flex;
  gap: 16px;
  align-items: baseline;
}

.profit-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 70px;
}

.profit-divider {
  width: 1px;
  background: var(--border-color);
  align-self: stretch;
}

.profit-item.up .profit-value,
.profit-item.up .profit-percent {
  color: var(--color-up);
}

.profit-item.down .profit-value,
.profit-item.down .profit-percent {
  color: var(--color-down);
}

.profit-item.closed .profit-value,
.profit-item.closed .profit-percent {
  color: #999;
}

.profit-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.profit-value,
.profit-percent {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-number);
  white-space: nowrap;
}
</style>
