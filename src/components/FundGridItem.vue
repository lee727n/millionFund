<script setup lang="ts">
import eyeIcon from '@/assets/eye.png'
import { ref } from 'vue'

const props = defineProps<{
  fund: any
  uiMode: 'simple' | 'full'
  tradingSession?: string
}>()

const emit = defineEmits<{
  click: []
  openTopHoldings: [event: Event]
  openIntradayModal: [event: Event]
  longpress: [fund: any, position: { top: number; left: number; width: number; height: number }]
}>()

// 长按事件处理
const longpressTimer = ref<number | null>(null)
const isLongpressActive = ref(false)
const isLongpressTriggered = ref(false)

function startLongpressTimer(event: TouchEvent | MouseEvent) {
  console.log('Longpress timer started for fund:', props.fund?.code)
  // 重置状态
  isLongpressTriggered.value = false
  isLongpressActive.value = false

  // 开始长按计时
  longpressTimer.value = window.setTimeout(() => {
    console.log('Longpress triggered for fund:', props.fund?.code)
    isLongpressActive.value = true
    isLongpressTriggered.value = true
    // 触觉反馈
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }

    // 获取卡片的位置信息（相对于viewport）
    const target = event.target as HTMLElement
    // 查找最近的.index-item元素，确保获取整个卡片的位置
    const cardElement = target.closest('.index-item') as HTMLElement
    if (!cardElement) {
      console.warn('Cannot find index-item element')
      return
    }

    const rect = cardElement.getBoundingClientRect()
    const position = {
      top: rect.bottom, // 卡片底部相对于viewport的位置
      left: rect.left, // 卡片左边相对于viewport的位置
      width: rect.width,
      height: rect.height // 卡片高度
    }

    // 触发长按事件，传递基金信息和位置信息
    emit('longpress', props.fund, position)
  }, 500) // 500ms长按阈值
}

function endLongpressTimer() {
  // 清除长按计时
  if (longpressTimer.value) {
    clearTimeout(longpressTimer.value)
    longpressTimer.value = null
  }
  isLongpressActive.value = false
}

// 触摸事件处理
function handleTouchStart(event: TouchEvent) {
  startLongpressTimer(event)
}

function handleTouchEnd(event: TouchEvent) {
  endLongpressTimer()
  // 如果长按已触发，阻止click事件
  if (isLongpressTriggered.value) {
    event.preventDefault()
  }
}

function handleTouchMove() {
  // 移动时取消长按
  endLongpressTimer()
}

// 鼠标事件处理（浏览器测试用）
function handleMouseDown(event: MouseEvent) {
  startLongpressTimer(event)
}

function handleMouseUp(event: MouseEvent) {
  endLongpressTimer()
  // 如果长按已触发，阻止click事件
  if (isLongpressTriggered.value) {
    event.preventDefault()
  }
}

function handleMouseLeave() {
  // 鼠标离开时取消长按
  endLongpressTimer()
}

// 处理点击事件，如果长按已触发则阻止
function handleClick(event: MouseEvent | TouchEvent) {
  console.log('Click event for fund:', props.fund?.code, 'isLongpressTriggered:', isLongpressTriggered.value)
  if (isLongpressTriggered.value) {
    event.preventDefault()
    event.stopPropagation()
    isLongpressTriggered.value = false
    return
  }
  emit('click')
}

// 获取基金名称颜色类
function getFundNameClass(fund: any, tradingSession?: string) {
  const isInTrading = tradingSession === 'morning' || tradingSession === 'afternoon'

  if (isInTrading) {
    return 'fund-name-pending'  // 交易时间内显示灰色
  }
  if (!fund.isUpdated) {
    return 'fund-name-not-updated'  // 未更新显示绿色
  }
  return 'fund-name-updated'  // 已更新显示黄色
}

// 获取占比背景色样式
function getRatioStyle(ratio: number) {
  // 占占比越大，背景色越深
  // 统一使用蓝色背景，白色文字
  const intensity = Math.min(ratio / 30, 1) // 最大30%，超过30%也用最深色

  // 使用蓝色渐变：rgba(33, 150, 243, intensity)
  // intensity从0到1，背景色从浅蓝到深蓝
  const alpha = 0.2 + intensity * 0.6 // alpha从0.2到0.8

  return {
    backgroundColor: `rgba(33, 150, 243, ${alpha})`,
    color: '#fff' // 统一使用白色文字
  }
}
</script>

<template>
  <div
    class="index-item"
    :class="[
      fund.todayChange && parseFloat(fund.todayChange) >= 0 ? 'up' : 'down',
      { 'longpress-active': isLongpressActive }
    ]"
    @click="handleClick"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @touchmove="handleTouchMove"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <div class="index-name web-only">
      <div class="fund-name-content">
        <div class="fund-name-left">
          <img v-if="fund.source === 'ali'" src="@/assets/ali.jpg" class="source-icon-small" alt="支付宝" />
          <img v-else-if="fund.source === 'TX'" src="@/assets/TX.jpg" class="source-icon-small" alt="腾讯" />
          <img v-else-if="fund.source === 'JD'" src="@/assets/JD.jpg" class="source-icon-small" alt="京东" />
          <img v-else-if="fund.source === 'observe'" :src="eyeIcon" class="source-icon-small" alt="观察" />
        </div>
        <div class="fund-name-middle">
          <span v-if="fund.isQDII" class="qdii-tag">QD</span>
        </div>
        <div class="fund-name-right" :class="getFundNameClass(fund, tradingSession)">{{ fund.name }}</div>
        <div class="fund-ratio-badge" v-if="fund.ratio && fund.ratio > 0" :style="getRatioStyle(fund.ratio)">
          {{ fund.ratio.toFixed(1) }}%
        </div>
      </div>
    </div>
    <div class="index-content web-only">
      <div class="index-left">
        <div class="fund-code-wrapper">
          <div class="fund-code">{{ fund.code }}</div>
          <span v-if="fund.fundScore" class="score-level" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
        </div>
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
            <img v-if="fund.source === 'ali'" src="@/assets/ali.jpg" class="source-icon-small" alt="支付宝" />
            <img v-else-if="fund.source === 'TX'" src="@/assets/TX.jpg" class="source-icon-small" alt="腾讯" />
            <img v-else-if="fund.source === 'JD'" src="@/assets/JD.jpg" class="source-icon-small" alt="京东" />
            <img v-else-if="fund.source === 'observe'" :src="eyeIcon" class="source-icon-small" alt="观察" />
          </div>
          <div class="fund-name-middle">
            <span v-if="fund.isQDII" class="qdii-tag">QD</span>
          </div>
          <div class="fund-name-right" :class="getFundNameClass(fund, tradingSession)">{{ fund.name }}</div>
          <div class="fund-ratio-badge" v-if="fund.ratio && fund.ratio > 0" :style="getRatioStyle(fund.ratio)">
            {{ fund.ratio.toFixed(1) }}%
          </div>
        </div>
      </div>
      <div class="mobile-item-row mobile-item-row-2">
        <div class="fund-code-wrapper">
          <div class="fund-code">{{ fund.code }}</div>
          <span v-if="fund.fundScore" class="score-level" :class="'level-' + fund.fundScore.level">{{ fund.fundScore.level }}</span>
        </div>
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
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.index-item:active {
  transform: scale(0.98);
}

.index-item.longpress-active {
  transform: scale(0.95);
  opacity: 0.8;
  box-shadow: 0 0 0 3px var(--primary-color);
  background: linear-gradient(135deg, var(--primary-color) 0%, rgba(33, 150, 243, 0.2) 100%);
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
  max-width: 180px; /* 限制基金名称宽度，为占比badge留出空间 */
}

/* 占比badge样式 */
.fund-ratio-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
  min-width: 32px;
  height: 16px;
  line-height: 16px;
  font-family: var(--font-number);
  transition: all 0.3s ease;
  white-space: nowrap;
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

.mobile-item-row-1 { min-height: 16px; padding: 0px 0; }
.mobile-item-row-1 .fund-name-content { gap: 1px; }
.mobile-item-row-1 .source-icon-small { width: 12px; height: 12px; }
.mobile-item-row-1 .qdii-tag { font-size: 8px; padding: 1px 3px; }
.mobile-item-row-1 .fund-name-right { font-size: 11px; line-height: 1.2; max-width: 120px; }
.mobile-item-row-1 .fund-ratio-badge {
  font-size: 9px;
  padding: 2px 3px;
  height: 16px;
  line-height: 16px;
  margin-left: 1px;
  white-space: nowrap;
}

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
  font-size: 10px; 
  font-weight: 600; 
  flex-shrink: 0; 
  line-height: 1; 
  margin-left: 4px; 
  vertical-align: middle;
  margin-bottom: 0;
}
.mobile-item-row-2 .fund-sectors {
  font-size: 9px;
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
  font-size: 15px;
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

/* 基金评分等级样式 */
.fund-code-wrapper {
  display: flex;
  align-items: center;
  gap: 0;
  justify-content: center;
}

.fund-code-wrapper .fund-code {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-number);
  letter-spacing: -0.2px;
  color: var(--color-primary);
  padding: 0;
  margin-bottom: 0;
}

.score-level {
  font-size: 11px;
  font-weight: 600;
  padding: 0;
  border-radius: 4px;
}

.score-level.level-S {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

.score-level.level-A {
  background: rgba(255, 167, 38, 0.1);
  color: #ffa726;
}

.score-level.level-B {
  background: rgba(102, 187, 106, 0.1);
  color: #66bb6a;
}

.score-level.level-C {
  background: rgba(66, 165, 245, 0.1);
  color: #42a5f5;
}

.score-level.level-D {
  background: rgba(120, 144, 156, 0.1);
  color: #78909c;
}

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
