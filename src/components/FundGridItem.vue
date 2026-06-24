<script setup lang="ts">
import aliIcon from '@/assets/ali.jpg'
import TXIcon from '@/assets/TX.jpg'
import JDIcon from '@/assets/JD.jpg'
import eyeIcon from '@/assets/eye.png'
import { getSourceLabel } from '@/config/sources'

defineProps<{
  fund: HoldingRecord
  uiMode: 'simple' | 'full'
  tradingSession?: string
}>()

const emit = defineEmits<{
  click: []
  openTopHoldings: [event: Event]
  openIntradayModal: [event: Event]
}>()

const sourceIconMap: Record<string, string> = {
  ali: aliIcon,
  TX: TXIcon,
  JD: JDIcon,
  observe: eyeIcon
}

// 获取基金名称颜色类
function getFundNameClass(fund: HoldingRecord, tradingSession?: string) {
  const isInTrading = tradingSession === 'morning' || tradingSession === 'afternoon'
  
  if (isInTrading) {
    return 'fund-name-pending'  // 交易时间内显示灰色
  }
  if (!fund.isUpdated) {
    return 'fund-name-not-updated'  // 未更新显示绿色
  }
  return 'fund-name-updated'  // 已更新显示黄色
}
</script>

<template>
  <div
    class="index-item"
    :class="[fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down']"
    @click="emit('click')"
  >
    <div class="index-name web-only">
      <div class="fund-name-content">
        <div class="fund-name-left">
          <img :src="sourceIconMap[fund.source]" class="source-icon-small" :alt="getSourceLabel(fund.source)" />
        </div>
        <div class="fund-name-middle">
          <span v-if="fund.isQDII" class="qdii-tag">QD</span>
        </div>
        <div class="fund-name-right" :class="getFundNameClass(fund, tradingSession)">{{ fund.name }}</div>
      </div>
    </div>
    <div class="index-content web-only">
      <div class="index-left">
        <div class="fund-code">{{ fund.code }}</div>
        <div class="fund-sectors">{{ fund.industrySectors || '未设置' }}</div>
      </div>
      <div class="index-right">
        <div class="index-change">
          <van-icon :name="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'arrow-up' : 'arrow-down'" size="14" />
          <span>{{ fund.todayChange ? (parseFloat(fund.todayChange) >= 0 ? '+' : '') + fund.todayChange + '%' : '--' }}</span>
        </div>
      </div>
    </div>
    <div class="index-trend web-only" v-if="uiMode === 'full' && fund.trendPrediction">
      <div class="trend-prediction">
        <div class="trend-column trend-column-1">
          <div class="trend-item">
            <span class="trend-text" :class="fund.trendPrediction.trend === 'up' ? 'up' : fund.trendPrediction.trend === 'down' ? 'down' : ''">
              {{ fund.trendPrediction.trend === 'up' ? '看涨' : fund.trendPrediction.trend === 'down' ? '看跌' : '震荡' }}
            </span>
          </div>
        </div>
        <div class="trend-column">
          <div class="trend-item">
            <span class="trend-label">{{ fund.dataSource === 'nav' ? '净值' : '估值' }}</span>
            <span class="trend-value" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'">
              {{ fund.currentValue?.toFixed(3) || '--' }}
            </span>
          </div>
        </div>
        <div class="trend-column">
          <div class="trend-item">
            <span class="trend-label">支撑</span>
            <span class="trend-value down">{{ fund.trendPrediction.supportLevel?.toFixed(2) || '--' }}</span>
          </div>
        </div>
        <div class="trend-column">
          <div class="trend-item">
            <span class="trend-label">阻力</span>
            <span class="trend-value up">{{ fund.trendPrediction.resistanceLevel?.toFixed(2) || '--' }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="index-bar web-only" v-if="uiMode === 'full'"></div>

    <div class="mobile-item-layout mobile-only">
      <div class="mobile-item-row mobile-item-row-1">
        <div class="fund-name-content">
          <div class="fund-name-left">
            <img :src="sourceIconMap[fund.source]" class="source-icon-small" :alt="getSourceLabel(fund.source)" />
          </div>
          <div class="fund-name-middle">
            <span v-if="fund.isQDII" class="qdii-tag">QD</span>
          </div>
          <div class="fund-name-right" :class="getFundNameClass(fund, tradingSession)">{{ fund.name }}</div>
        </div>
      </div>
      <div class="mobile-item-row mobile-item-row-2">
        <div class="fund-code">{{ fund.code }}</div>
        <div class="fund-sectors">{{ fund.industrySectors || '未设置' }}</div>
      </div>
      <div class="mobile-item-row mobile-item-row-3 mobile-item-row-3-4-container">
        <!-- 左边：涨跌幅（无箭头，带背景色） -->
        <div class="mobile-item-row-3-left" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : fund.todayChange && parseFloat(fund.todayChange) < 0 ? 'down' : ''">
          {{ fund.todayChange ? (parseFloat(fund.todayChange) >= 0 ? '+' : '') + fund.todayChange + '%' : '--' }}
        </div>
        <!-- 右边：添加后涨幅（无"累计"文字，正红色负蓝色） -->
        <div class="mobile-item-row-3-right added-gain-section" v-if="fund.addedGain !== undefined" :class="fund.addedGain >= 0 ? 'up' : 'down'">
          {{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(2) }}%
        </div>
      </div>
      <div class="mobile-item-row mobile-item-row-4" v-if="uiMode === 'full' && fund.trendPrediction">
        <div class="trend-prediction">
          <span class="trend-item trend-item-vertical">
            <span class="trend-text" :class="fund.trendPrediction.trend === 'up' ? 'up' : fund.trendPrediction.trend === 'down' ? 'down' : ''">
              {{ fund.trendPrediction.trend === 'up' ? '看涨' : fund.trendPrediction.trend === 'down' ? '看跌' : '震荡' }}
            </span>
            <span class="trend-value" :class="fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down'">
              {{ fund.currentValue?.toFixed(3) || '--' }}
            </span>
          </span>
          <span class="trend-item trend-item-vertical">
            <span class="trend-label">支撑</span>
            <span class="trend-value down">{{ fund.trendPrediction.supportLevel?.toFixed(2) || '--' }}</span>
          </span>
          <span class="trend-item trend-item-vertical">
            <span class="trend-label">阻力</span>
            <span class="trend-value up">{{ fund.trendPrediction.resistanceLevel?.toFixed(2) || '--' }}</span>
          </span>
        </div>
      </div>
      <div class="index-holdings mobile-only" v-if="uiMode === 'full'" @click.stop="emit('openTopHoldings', $event)">
        <span class="top-holdings-label">前十大重仓股</span>
      </div>
      <div class="intraday-section mobile-only" v-if="uiMode === 'full'" @click.stop="emit('openIntradayModal', $event)">
        <span class="intraday-label-mobile">
          <van-icon name="chart-trending-o" size="12" />
          当日分时图
        </span>
      </div>
    </div>
    <div class="index-holdings web-only" v-if="uiMode === 'full'" @click.stop="emit('openTopHoldings', $event)">
      <span class="top-holdings-label">前10大重仓股 <span class="top-holdings-arrow">›</span></span>
    </div>
    <div class="intraday-section web-only" v-if="uiMode === 'full'" @click.stop="emit('openIntradayModal', $event)">
      <span class="intraday-label">
        <van-icon name="chart-trending-o" size="12" />
        当日分时估值
      </span>
    </div>
    <div class="added-gain-section web-only" v-if="fund.addedGain !== undefined">
      <div class="added-gain-badge" :class="fund.addedGain >= 0 ? 'up' : 'down'">
        <van-icon :name="fund.addedGain >= 0 ? 'arrow-up' : 'arrow-down'" size="14" />
        <span>添加后涨跌幅{{ fund.addedGain >= 0 ? '+' : '' }}{{ fund.addedGain.toFixed(2) }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.index-item {
  padding: 0 2px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.index-item:active {
  transform: scale(0.98);
}

.index-item.up {
  border-color: rgba(255, 107, 107, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(255, 107, 107, 0.05) 100%);
}

.index-item.down {
  border-color: rgba(81, 207, 102, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(81, 207, 102, 0.05) 100%);
}

.index-name {
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  height: 16px;
  line-height: 16px;
}

.fund-name-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 6px;
}

.fund-name-left {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 100%;
}

.fund-name-middle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 100%;
}

.fund-name-right {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  display: flex;
  align-items: center;
  height: 100%;
}

/* 基金名称更新状态颜色 */
.fund-name-pending {
  color: var(--text-secondary) !important;
}

.fund-name-not-updated {
  color: #4caf50 !important;
}

.fund-name-updated {
  color: #ff9800 !important;
}

.source-icon-small {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  object-fit: contain;
}

.qdii-tag {
  display: inline-block;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 500;
  color: #ffffff;
  background-color: #9333ea;
  border-radius: 8px;
  vertical-align: middle;
}

.index-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0;
  margin-bottom: 3px;
}

.index-left {
  flex: 0 0 40%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.index-right {
  flex: 0 0 60%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fund-code {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-number);
  letter-spacing: -0.2px;
  color: var(--color-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.fund-sectors {
  font-size: 9px;
  color: var(--text-muted);
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  width: 100%;
}

.index-change {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-number);
  padding: 2px 4px;
  border-radius: 8px;
  width: 100%;
  text-align: center;
  margin-right: 11px;
}

.index-item.up .index-change {
  color: var(--color-up);
  background: rgba(255, 107, 107, 0.12);
}

.index-item.down .index-change {
  color: var(--color-down);
  background: rgba(81, 207, 102, 0.12);
}

.index-trend {
  padding: 8px 10px;
}

.index-trend .trend-prediction {
  display: flex;
  align-items: stretch;
  gap: 0;
  width: 100%;
}

.index-trend .trend-column {
  flex: 0 0 25%;
  width: 25%;
  max-width: 25%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.index-trend .trend-column-1 {
  flex: 0 0 25%;
  width: 25%;
  max-width: 25%;
  border-right: 1px solid var(--border-color);
  padding-right: 8px;
}

.index-trend .trend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  text-align: center;
}

.index-trend .trend-item-vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
}

.index-trend .trend-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.2;
}

.index-trend .trend-value {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

.index-trend .trend-text {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.index-trend .trend-text.up { color: var(--color-up); }
.index-trend .trend-text.down { color: var(--color-down); }
.index-trend .trend-value.up { color: var(--color-up); }
.index-trend .trend-value.down { color: var(--color-down); }

.index-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
}

.index-item.up .index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-up) 50%, transparent 100%);
}

.index-item.down .index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-down) 50%, transparent 100%);
}

.mobile-item-layout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0px;
}

.mobile-item-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.mobile-item-row-1 { min-height: 14px; padding: 0px 0; }
.mobile-item-row-1 .fund-name-content { gap: 3px; }
.mobile-item-row-1 .source-icon-small { width: 10px; height: 10px; }
.mobile-item-row-1 .qdii-tag { font-size: 7px; padding: 1px 2px; }
.mobile-item-row-1 .fund-name-right { font-size: 10px; line-height: 1.2; }

.mobile-item-row-2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3px;
  min-height: 0;
  height: auto;
  padding: 0;
}
.mobile-item-row-2 .fund-code { 
  font-size: 9px; 
  font-weight: 600; 
  flex-shrink: 0; 
  line-height: 1; 
  margin-left: 4px; 
  vertical-align: middle;
  margin-bottom: 0;
}
.mobile-item-row-2 .fund-sectors {
  font-size: 8px;
  color: var(--text-secondary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  vertical-align: middle;
  margin-bottom: 0;
}

.mobile-item-row-3 { justify-content: center; min-height: 14px; padding: 0px 0; }
.mobile-item-row-3 .index-change {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  margin-right: 0;
}

/* 第三行：涨跌幅和添加后涨幅横向排列 */
.mobile-item-row-3-4-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 28px;
  padding: 0;
}

.mobile-item-row-3-left {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}

.mobile-item-row-3-left.up {
  background: rgba(255, 107, 107, 0.12);
  color: #ff6b6b;
}

.mobile-item-row-3-left.down {
  background: rgba(7, 193, 96, 0.12);
  color: #07c160;
}

.mobile-item-row-3-right.added-gain-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.mobile-item-row-3-right.added-gain-section.up {
  color: var(--up-color);
}

.mobile-item-row-3-right.added-gain-section.down {
  color: #1989fa;
}

.mobile-item-row-4 { justify-content: space-between; min-height: 12px; padding: 0px 4px; }
.mobile-item-row-4 .trend-prediction {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 4px;
}
.mobile-item-row-4 .trend-item { display: flex; align-items: center; gap: 2px; flex: 1; }
.mobile-item-row-4 .trend-item-vertical { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; }
.mobile-item-row-4 .trend-label { font-size: 8px; color: var(--text-secondary); flex-shrink: 0; }
.mobile-item-row-4 .trend-value { font-size: 8px; font-weight: 600; }
.mobile-item-row-4 .trend-value.up { color: var(--up-color); }
.mobile-item-row-4 .trend-value.down { color: var(--down-color); }
.mobile-item-row-4 .trend-text { font-size: 8px; font-weight: 500; }
.mobile-item-row-4 .trend-text.up { color: var(--up-color); }
.mobile-item-row-4 .trend-text.down { color: var(--down-color); }

.index-holdings {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: 2px;
  width: 100%;
}

.top-holdings-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  padding: 3px 8px;
  border-radius: 6px;
  width: 100%;
  color: #05263b;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
}

.top-holdings-arrow { color: #05263b; }

.intraday-section {
  margin-top: 2px;
  overflow: hidden;
  width: 100%;
}

.intraday-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  color: #05263b;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  border-radius: 6px;
  padding: 3px 8px;
  width: 100%;
  text-align: center;
}

.intraday-label-mobile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  color: #05263b;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  border-radius: 6px;
  padding: 3px 8px;
  text-align: center;
  width: 100%;
}

.added-gain-section {
  margin-top: 2px;
  overflow: hidden;
  width: 100%;
}

.added-gain-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  padding: 3px 8px;
  border-radius: 6px;
  width: 100%;
}

.added-gain-badge.up { color: var(--color-up); background: rgba(255, 107, 107, 0.12); }
.added-gain-badge.down { color: var(--color-down); background: rgba(81, 207, 102, 0.12); }

.mobile-added-gain { font-size: 10px; gap: 0; }

@media (max-width: 767px) {
  .added-gain-badge.up,
  .added-gain-badge.down {
    background: transparent;
  }
}

@media (min-width: 768px) {
  .mobile-only { display: none !important; }
}

@media (max-width: 767px) {
  .web-only { display: none !important; }
}
</style>
