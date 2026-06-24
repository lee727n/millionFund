<template>
  <div class="market-page">
    <!-- 导航栏 -->
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">市场概览</span>
      <van-icon name="replay" size="20" :class="{ refreshing: isRefreshing }" @click="refreshData" />
    </div>

    <!-- Tab 切换 -->
    <div class="market-tabs">
      <div
        class="market-tab"
        :class="{ active: activeTab === 'index' }"
        @click="activeTab = 'index'"
      >指数</div>
      <div
        class="market-tab"
        :class="{ active: activeTab === 'future' }"
        @click="activeTab = 'future'"
      >期货</div>
    </div>

    <div class="scroll-content">
      <!-- 指数 Tab 内容 -->
      <template v-if="activeTab === 'index'">
        <!-- 交易状态 -->
        <div class="trading-status-bar">
          <span class="status-dot" :class="tradingSession"></span>
          <span class="status-text">{{ sessionLabel }}</span>
          <span class="status-time">{{ currentTimeText }}</span>
        </div>

        <!-- A股指数 -->
        <div class="section">
          <div class="section-header">
            <span class="section-title">A股指数</span>
          </div>
          <div class="index-grid">
            <div
              v-for="idx in indices"
              :key="idx.code"
              class="index-card"
              :class="[idx.changePercent >= 0 ? 'up' : 'down']"
            >
              <div class="index-name">{{ idx.name }}</div>
              <div class="index-price">{{ idx.current.toFixed(2) }}</div>
              <div class="index-change">
                <span>{{ idx.changePercent >= 0 ? '+' : '' }}{{ idx.changePercent.toFixed(2) }}%</span>
                <span class="index-points">{{ idx.change >= 0 ? '+' : '' }}{{ idx.change.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 全球指数 -->
        <div class="section">
          <div class="section-header">
            <span class="section-title">全球指数</span>
            <span class="section-tip" v-if="globalIndices.length > 0">{{ globalIndices.length }}个市场</span>
          </div>
          <div class="index-grid">
            <div
              v-for="idx in globalIndices"
              :key="idx.code"
              class="index-card"
              :class="[idx.changePercent >= 0 ? 'up' : 'down']"
            >
              <div class="index-name">{{ idx.name }}</div>
              <div class="index-region" v-if="idx.region">{{ idx.region }}</div>
              <div class="index-price">{{ idx.price.toFixed(2) }}</div>
              <div class="index-change">
                <span>{{ idx.changePercent >= 0 ? '+' : '' }}{{ idx.changePercent.toFixed(2) }}%</span>
                <span class="index-points">{{ idx.change >= 0 ? '+' : '' }}{{ idx.change.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 期货 Tab 内容 -->
      <template v-else-if="activeTab === 'future'">
        <div class="section">
          <div class="section-header">
            <span class="section-title">期货行情</span>
            <span class="section-tip" v-if="futures.length > 0">{{ futures.length }}个合约</span>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoadingFutures" class="loading-state">
            <van-loading size="24">加载期货数据...</van-loading>
          </div>

          <!-- 期货列表 -->
          <div v-else class="future-list">
            <div
              v-for="future in futures"
              :key="future.symbol"
              class="future-card"
              :class="[future.changeRate >= 0 ? 'up' : 'down']"
            >
              <div class="future-header">
                <div class="future-name">{{ future.name }}</div>
                <div class="future-symbol">{{ future.symbol }}</div>
              </div>
              <div class="future-price">{{ future.price.toFixed(2) }}</div>
              <div class="future-change">
                <span>{{ future.changeRate >= 0 ? '+' : '' }}{{ future.changeRate.toFixed(2) }}%</span>
                <span class="future-points">{{ future.change >= 0 ? '+' : '' }}{{ future.change.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 加载/错误状态 -->
      <div v-if="isLoading && activeTab === 'index'" class="loading-state">
        <van-loading size="24">加载市场数据...</van-loading>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMarketIndicesFast, fetchGlobalIndices, type MarketIndexSimple, type GlobalIndex } from '@/api/fundFast'
import { fetchFutureBatch, type FutureQuote } from '@/api/future'
import { getTradingSession, type TradingSession } from '@/api/tiantianApi'
import { logger } from '@/utils/logger'

const router = useRouter()

// Tab 切换
const activeTab = ref<'index' | 'future'>('index')

// 指数数据
const indices = ref<MarketIndexSimple[]>([])
const globalIndices = ref<GlobalIndex[]>([])
const isLoading = ref(true)
const isRefreshing = ref(false)
const tradingSession = ref<TradingSession>('closed')
const currentTime = ref(new Date())

// 期货数据
const futures = ref<FutureQuote[]>([])
const isLoadingFutures = ref(false)

let timer: number | undefined

const sessionLabel = computed(() => {
  const map: Record<string, string> = {
    morning: '⏳ 上午交易中 (09:30-11:30)',
    afternoon: '⏳ 下午交易中 (13:00-15:00)',
    noon_break: '☕ 午间休市 (11:30-13:00)',
    pre_market: '🔔 等待开盘',
    post_market: '🔒 已收盘',
    closed: '🔒 非交易日',
  }
  return map[tradingSession.value] || '未知'
})

const currentTimeText = computed(() => {
  return currentTime.value.toLocaleTimeString('zh-CN', { hour12: false })
})

function updateSession() {
  tradingSession.value = getTradingSession()
  currentTime.value = new Date()
}

// ========== 指数数据加载 ==========

async function refreshData() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    const [idxRes, globalRes] = await Promise.all([
      fetchMarketIndicesFast(),
      fetchGlobalIndices(),
    ])
    indices.value = idxRes
    globalIndices.value = globalRes
    logger.info('[Market] 数据刷新成功', { indices: idxRes.length, global: globalRes.length })
  } catch (err) {
    logger.error('[Market] 刷新失败', err)
  } finally {
    isRefreshing.value = false
    isLoading.value = false
  }
}

// ========== 期货数据加载 ==========

async function loadFutures() {
  if (isLoadingFutures.value) return
  isLoadingFutures.value = true
  try {
    // 默认加载常用期货品种
    const symbols = ['GC2506', 'CL2506', 'HG2506', 'ZS2506', 'T2506']
    const results = await fetchFutureBatch(symbols)
    futures.value = results
    logger.info('[Market] 期货数据加载成功', { count: results.length })
  } catch (err) {
    logger.error('[Market] 期货数据加载失败', err)
    // 使用兜底数据
    futures.value = [
      {
        symbol: 'GC2506',
        name: '黄金2506',
        price: 2350.50,
        change: 10.50,
        changeRate: 0.45,
        open: 2340.00,
        high: 2355.00,
        low: 2335.00,
        volume: 100000,
        openInterest: 500000,
        updatedAt: new Date().toISOString()
      },
      {
        symbol: 'CL2506',
        name: '原油2506',
        price: 78.50,
        change: 0.85,
        changeRate: 1.09,
        open: 77.50,
        high: 79.00,
        low: 77.00,
        volume: 50000,
        openInterest: 200000,
        updatedAt: new Date().toISOString()
      }
    ]
  } finally {
    isLoadingFutures.value = false
  }
}

// 监听 Tab 切换，首次切换到期货时加载数据
watch(activeTab, (newTab) => {
  if (newTab === 'future' && futures.value.length === 0) {
    loadFutures()
  }
})

onMounted(() => {
  updateSession()
  timer = window.setInterval(updateSession, 1000)
  refreshData()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.market-page {
  min-height: 100vh;
  background: var(--bg-primary, #f5f5f5);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--van-background-2, #fff);
  border-bottom: 1px solid var(--van-border-color, #eee);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--van-text-color, #333);
}

.refreshing {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.scroll-content {
  padding: 12px 16px;
  padding-bottom: 40px;
}

.trading-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--van-background-2, #fff);
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--van-text-color-2, #666);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.morning,
.status-dot.afternoon {
  background: #07c160;
  box-shadow: 0 0 6px rgba(7, 193, 96, 0.5);
}

.status-dot.noon_break {
  background: #ff9800;
}

.status-dot.pre_market {
  background: #1989fa;
}

.status-dot.post_market,
.status-dot.closed {
  background: #999;
}

.status-time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--van-text-color, #333);
}

.section-tip {
  font-size: 12px;
  color: var(--van-text-color-3, #999);
}

.index-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.index-card {
  background: var(--van-background-2, #fff);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s;
}

.index-card:active {
  transform: scale(0.97);
}

.index-card.up {
  border-left: 3px solid #e4393c;
}

.index-card.down {
  border-left: 3px solid #1db82c;
}

.index-name {
  font-size: 13px;
  color: var(--van-text-color-2, #666);
  margin-bottom: 6px;
}

.index-region {
  font-size: 11px;
  color: var(--van-text-color-3, #999);
  margin-top: -4px;
  margin-bottom: 6px;
}

.index-price {
  font-size: 20px;
  font-weight: 700;
  color: var(--van-text-color, #333);
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}

.index-change {
  font-size: 13px;
  font-weight: 500;
}

.index-card.up .index-change {
  color: #e4393c;
}

.index-card.down .index-change {
  color: #1db82c;
}

.index-points {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.7;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.empty-text {
  margin: 12px 0 20px;
  font-size: 14px;
  color: var(--van-text-color-3, #999);
}

/* 市场 Tab */
.market-tabs {
  display: flex;
  background: var(--van-background-2, #fff);
  padding: 8px 16px;
  gap: 8px;
  border-bottom: 1px solid var(--van-border-color, #eee);
}

.market-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--van-text-color-2, #666);
  background: var(--van-background, #f5f5f5);
  transition: all 0.2s;
  cursor: pointer;
}

.market-tab.active {
  color: #fff;
  background: #1677ff;
  font-weight: 600;
}

/* 期货列表 */
.future-list {
  padding: 0 16px;
}

.future-card {
  display: flex;
  align-items: center;
  padding: 16px;
  margin-bottom: 12px;
  background: var(--van-background-2, #fff);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s;
}

.future-card:active {
  transform: scale(0.97);
}

.future-card.up {
  border-left: 3px solid #e4393c;
}

.future-card.down {
  border-left: 3px solid #1db82c;
}

.future-header {
  flex: 1;
  min-width: 0;
}

.future-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--van-text-color, #333);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.future-symbol {
  font-size: 12px;
  color: var(--van-text-color-3, #999);
}

.future-price {
  font-size: 20px;
  font-weight: 700;
  color: var(--van-text-color, #333);
  font-variant-numeric: tabular-nums;
  margin: 0 16px;
  min-width: 80px;
  text-align: right;
}

.future-change {
  font-size: 14px;
  font-weight: 500;
  min-width: 90px;
  text-align: right;
}

.future-card.up .future-change {
  color: #e4393c;
}

.future-card.down .future-change {
  color: #1db82c;
}

.future-points {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.7;
}
</style>