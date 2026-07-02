<script setup lang="ts">
// [WHY] 市场概览组件 - 展示大盘指数和全球指数
// [WHAT] 包含网页端和移动端两种布局

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useHomeData } from '@/composables/useHomeData'
import type { MarketIndexSimple } from '@/api/fundFast'

const { t } = useI18n()
const router = useRouter()
const { tradingSession, currentTime, isRefreshing, indices, globalIndices } = useHomeData()

// Props
defineProps<{
  combinedIndices: MarketIndexSimple[]
  mobileIndices: MarketIndexSimple[]
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
</script>

<template>
  <div class="market-overview">
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
/* ========== 市场概览样式 ========== */
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

.status-time {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-number);
}

/* 全球主要指数样式 */
.index-grid.market-index-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.market-index-item {
  padding: 8px 6px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.market-index-item:active {
  transform: scale(0.98);
}

.market-index-item.up {
  border-color: rgba(255, 107, 107, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(255, 107, 107, 0.05) 100%);
}

.market-index-item.down {
  border-color: rgba(81, 207, 102, 0.25);
  background: linear-gradient(135deg, var(--bg-primary) 0%, rgba(81, 207, 102, 0.05) 100%);
}

.market-index-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.market-index-left {
  flex: 0 0 40%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
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
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  height: 14px;
  line-height: 14px;
  margin-bottom: 2px;
}

.market-index-value-num {
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-number);
  color: var(--text-primary);
}

.market-index-change {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-number);
  text-align: center;
  padding: 4px 8px;
  border-radius: 6px;
  width: 100%;
  justify-content: center;
}

.market-index-item.up .market-index-change {
  color: var(--color-up);
}

.market-index-item.down .market-index-change {
  color: var(--color-down);
}

.market-index-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  margin-top: 4px;
}

.market-index-item.up .market-index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-up) 50%, transparent 100%);
}

.market-index-item.down .market-index-bar {
  background: linear-gradient(90deg, transparent 0%, var(--color-down) 50%, transparent 100%);
}

/* 移动端：全球主要指数布局 */
@media (max-width: 767px) {
  .index-grid.market-index-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 0px;
  }
  
  .mobile-market-layout {
    display: flex;
    flex-direction: column;
    gap: 0px;
    padding: 0px;
  }
  
  .mobile-market-row {
    display: flex;
    align-items: center;
    width: 100%;
  }
  
  .mobile-market-row-1 {
    min-height: 16px;
    padding: 0px 0;
  }
  
  .mobile-market-row-1 .market-index-name {
    font-size: 10px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }
  
  .mobile-market-row-2 {
    justify-content: center;
    min-height: 18px;
    padding: 0px 0;
  }
  
  .mobile-market-row-2 .market-index-change {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
  }
}

@media (min-width: 768px) {
  .mobile-only {
    display: none !important;
  }
  
  .web-only {
    display: grid !important;
  }
}

@media (max-width: 767px) {
  .web-only {
    display: none !important;
  }
  
  .mobile-only {
    display: grid !important;
  }
}
</style>
