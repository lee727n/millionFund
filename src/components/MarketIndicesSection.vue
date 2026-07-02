<script setup lang="ts">
// [WHY] 市场指数概览组件 - 交易终端风格
// [WHAT] 展示大盘指数和全球指数行情，支持网页端和移动端不同布局

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { MarketIndexSimple } from '@/api/fundFast'

const props = defineProps<{
  indices: MarketIndexSimple[]
  tradingStatus: { text: string; subText: string; class: string }
}>()

const { t } = useI18n()
const router = useRouter()

// [WHAT] 网页端专用：显示所有指数
const combinedIndices = computed(() => props.indices)

// [WHAT] 移动端专用：只显示6个主要指数
const mobileIndices = computed(() => {
  const targetIndices = ['上证指数', '恒生指数', '日经225', '道琼斯', '标普500', '纳斯达克']
  return targetIndices.map(name => combinedIndices.value.find(idx => idx.name === name)).filter(Boolean) as MarketIndexSimple[]
})
</script>

<template>
  <div class="market-overview" v-if="indices.length > 0">
    <div class="overview-title">
      <div class="title-left">
        <span class="live-dot" :class="tradingStatus.class"></span>
        <span>{{ t("home.global_indices") }}</span>
      </div>
      <div class="trading-status" :class="tradingStatus.class">
        <span class="status-text">{{ tradingStatus.text }}</span>
        <span class="status-time">{{ tradingStatus.subText }}</span>
      </div>
    </div>
    <!-- 网页端：显示所有指数 -->
    <div class="index-grid market-index-grid web-only">
      <div 
        v-for="index in combinedIndices" 
        :key="index.code" 
        class="index-item market-index-item"
        :class="[index.changePercent >= 0 ? 'up' : 'down']"
        @click="router.push('/market')"
      >
        <div class="market-index-content">
          <div class="market-index-left">
            <div class="market-index-name">{{ index.name }}</div>
            <div class="market-index-value">
              <span class="market-index-value-num">{{ index.current.toFixed(2) }}</span>
            </div>
          </div>
          <div class="market-index-right">
            <div class="market-index-change">
              <van-icon :name="index.changePercent >= 0 ? 'arrow-up' : 'arrow-down'" size="14" />
              <span>{{ index.changePercent >= 0 ? '+' : '' }}{{ Math.abs(index.changePercent).toFixed(2) }}%</span>
            </div>
          </div>
        </div>
        <div class="market-index-bar"></div>
      </div>
    </div>
    
    <!-- 移动端：只显示6个主要指数 -->
    <div class="index-grid market-index-grid mobile-only">
      <div 
        v-for="index in mobileIndices" 
        :key="index.code" 
        class="index-item market-index-item"
        :class="[index.changePercent >= 0 ? 'up' : 'down']"
        @click="router.push('/market')"
      >
        <div class="mobile-market-layout">
          <!-- 第一行：指数名称 -->
          <div class="mobile-market-row mobile-market-row-1">
            <div class="market-index-name">{{ index.name }}</div>
          </div>
          
          <!-- 第二行：涨跌幅度 -->
          <div class="mobile-market-row mobile-market-row-2">
            <div class="market-index-change">
              <van-icon :name="index.changePercent >= 0 ? 'arrow-up' : 'arrow-down'" size="14" />
              <span>{{ index.changePercent >= 0 ? '+' : '' }}{{ Math.abs(index.changePercent).toFixed(2) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.status-time {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-number);
}

.index-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.index-item {
  padding: 4px 4px;
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

.market-index-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0;
  margin-bottom: 3px;
}

.market-index-left {
  flex: 0 0 40%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.market-index-right {
  flex: 0 0 60%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.market-index-name {
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

.market-index-value-num {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-number);
  letter-spacing: -0.2px;
  color: var(--color-primary);
  text-align: center;
}

.market-index-change {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-number);
  padding: 6px 10px;
  border-radius: 8px;
  width: 100%;
  text-align: center;
  margin-right: 11px;
}

.index-item.up .market-index-change {
  color: var(--color-up);
  background: rgba(255, 107, 107, 0.12);
}

.index-item.down .market-index-change {
  color: var(--color-down);
  background: rgba(81, 207, 102, 0.12);
}

.mobile-market-layout {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mobile-market-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mobile-market-row-1 {
  font-size: 12px;
}

.mobile-market-row-2 {
  font-size: 14px;
}

@media (max-width: 767px) {
  .index-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
