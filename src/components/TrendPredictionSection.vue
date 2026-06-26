<!-- [WHY] 趋势预测区块，从 Detail.vue 提取
[WHAT] 展示趋势方向、支撑/阻力位、交易信号、综合评分
-->
<script setup lang="ts">
import type { TrendPrediction, FundScore } from '@/utils/statistics'

defineProps<{
  trendPrediction: TrendPrediction
  fundScore?: FundScore
  isTrendLoading: boolean
}>()
</script>

<template>
  <div class="trend-section">
    <van-loading v-if="isTrendLoading" size="24" vertical>加载中...</van-loading>

    <template v-else-if="trendPrediction">
      <!-- 趋势方向 -->
      <div class="trend-header">
        <div class="trend-direction" :class="trendPrediction.trend">
          <span class="trend-icon">
            {{ trendPrediction.trend === 'up' ? '📈' : trendPrediction.trend === 'down' ? '📉' : '📊' }}
          </span>
          <span class="trend-text">
            {{ trendPrediction.trend === 'up' ? '看涨' : trendPrediction.trend === 'down' ? '看跌' : '震荡' }}
          </span>
        </div>
        <div class="trend-confidence">
          <span class="label">置信度</span>
          <span class="value">{{ trendPrediction.confidence }}%</span>
        </div>
      </div>

      <!-- 技术指标 -->
      <div class="trend-levels">
        <div class="level-item">
          <span class="level-label">支撑位</span>
          <span class="level-value down">{{ trendPrediction.supportLevel }}</span>
        </div>
        <div class="level-item">
          <span class="level-label">阻力位</span>
          <span class="level-value up">{{ trendPrediction.resistanceLevel }}</span>
        </div>
      </div>

      <!-- 信号列表 -->
      <div class="signal-list">
        <div v-for="signal in trendPrediction.signals" :key="signal.name" class="signal-item">
          <span class="signal-type" :class="signal.type">
            {{ signal.type === 'buy' ? '买' : signal.type === 'sell' ? '卖' : '持' }}
          </span>
          <div class="signal-info">
            <span class="signal-name">{{ signal.name }}</span>
            <span class="signal-desc">{{ signal.description }}</span>
          </div>
        </div>
      </div>

      <!-- 基金评分 -->
      <div v-if="fundScore" class="fund-score-card">
        <div class="score-header">
          <span class="score-title">综合评分</span>
          <span class="score-level" :class="'level-' + fundScore.level">{{ fundScore.level }}级</span>
        </div>
        <div class="score-value">{{ fundScore.totalScore }}</div>
        <div class="score-desc">{{ fundScore.recommendation }}</div>
      </div>
    </template>

    <van-empty v-else description="暂无趋势数据" />
  </div>
</template>

<style scoped>
/* ========== 趋势预测 ========== */
.trend-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
  padding: 16px;
  min-height: 200px;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.trend-direction {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-icon {
  font-size: 24px;
}

.trend-text {
  font-size: 18px;
  font-weight: 600;
}

.trend-direction.up .trend-text {
  color: var(--color-up);
}

.trend-direction.down .trend-text {
  color: var(--color-down);
}

.trend-direction.sideways .trend-text {
  color: var(--text-secondary);
}

.trend-confidence .label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.trend-confidence .value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-primary);
}

.trend-levels {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.level-item {
  flex: 1;
  text-align: center;
}

.level-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.level-value {
  font-size: 16px;
  font-weight: 600;
}

.level-value.up {
  color: var(--color-up);
}

.level-value.down {
  color: var(--color-down);
}

.signal-list {
  margin-bottom: 16px;
}

.signal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.signal-item:last-child {
  border-bottom: none;
}

.signal-type {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.signal-type.buy {
  background: var(--color-up);
}

.signal-type.sell {
  background: var(--color-down);
}

.signal-type.hold {
  background: var(--text-secondary);
}

.signal-info {
  flex: 1;
}

.signal-name {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.signal-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.fund-score-card {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.score-header {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.score-title {
  font-size: 14px;
  color: var(--text-secondary);
}

.score-level {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
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

.fund-score-card .score-value {
  font-size: 36px;
  font-weight: bold;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.fund-score-card .score-desc {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
