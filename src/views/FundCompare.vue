<script setup lang="ts">
// [WHY] 基金对比页 - 支持2-5只基金横向对比
// [WHAT] 收益对比表格、风险指标对比、持仓对比（重仓股交集/并集）
// [REF] Task #17 需求文档

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useFundComparison, type FundComparisonItem } from '@/composables/useFundComparison'
import { searchFund, type FundInfo } from '@/api/fundFast'
import { showToast, showDialog } from 'vant'
import { formatPercent, getReturnClass } from '@/composables/useFundComparison'

const route = useRoute()
const router = useRouter()
const fundStore = useFundStore()

// [WHAT] 初始化对比功能
const {
  comparisonList,
  isLoading,
  error,
  isMaxReached,
  canCompare,
  holdingsComparison,
  returnsComparisonTable,
  addFund,
  removeFund,
  clearAll
} = useFundComparison()

// [WHAT] 当前激活的标签页
type TabType = 'returns' | 'risk' | 'holdings'
const activeTab = ref<TabType>('returns')

// [WHAT] 添加基金相关
const showAddPanel = ref(false)
const searchKeyword = ref('')
const searchResults = ref<FundInfo[]>([])
const isSearching = ref(false)

// [WHAT] 从路由参数获取预设基金
const presetFunds = computed(() => {
  const codes = route.query.codes as string
  if (codes) {
    return codes.split(',').map(c => c.trim()).filter(Boolean)
  }
  return []
})

// [WHY] 页面加载时，如果有预设基金代码，自动添加
onMounted(async () => {
  if (presetFunds.value.length > 0) {
    isLoading.value = true
    try {
      await Promise.all(
        presetFunds.value.map(code =>
          addFund(code, getFundNameFromStore(code))
        )
      )
    } finally {
      isLoading.value = false
    }
  }
})

/**
 * 从 store 获取基金名称
 */
function getFundNameFromStore(code: string): string {
  const fund = fundStore.watchlist.find(f => f.code === code)
  return fund?.name || code
}

/**
 * 搜索基金
 */
async function doSearch(keyword: string) {
  if (!keyword.trim()) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  try {
    const results = await searchFund(keyword, 20)
    searchResults.value = results
  } catch {
    showToast('搜索失败')
  } finally {
    isSearching.value = false
  }
}

// [WHAT] 防抖搜索
let searchTimer: ReturnType<typeof setTimeout> | null = null

// [H1] 组件卸载时清理定时器，防止内存泄漏
onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

watch(() => searchKeyword.value, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!val.trim()) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(() => doSearch(val), 300)
})

/**
 * 添加基金到对比
 */
async function handleAddFund(fund: FundInfo) {
  const success = await addFund(fund.code, fund.name)
  if (success) {
    showToast('已添加')
    // 如果达到上限，关闭面板
    if (isMaxReached.value) {
      showAddPanel.value = false
    }
  }
}

/**
 * 从自选列表添加
 */
async function handleAddFromWatchlist(index: number) {
  if (index < 0 || index >= fundStore.watchlist.length) return

  const fund = fundStore.watchlist[index]
  const success = await addFund(fund.code, fund.name)
  if (success) {
    showToast('已添加')
    if (isMaxReached.value) {
      showAddPanel.value = false
    }
  }
}

/**
 * 移除基金
 */
function handleRemoveFund(code: string) {
  showDialog({
    title: '移除基金',
    message: `确定从对比中移除基金 ${code}？`,
  }).then(() => {
    removeFund(code)
  }).catch(() => {
    // 用户取消
  })
}

/**
 * 清空所有
 */
function handleClearAll() {
  showDialog({
    title: '清空对比',
    message: '确定清空所有对比基金？',
  }).then(() => {
    clearAll()
  }).catch(() => {
    // 用户取消
  })
}

/**
 * 返回上一页
 */
function goBack() {
  router.back()
}

/**
 * 获取风险指标的最优值（用于高亮）
 */
function getBestRiskValue(items: FundComparisonItem[], key: 'maxDrawdown' | 'volatility' | 'sharpe'): number | null {
  if (items.length === 0) return null

  if (key === 'sharpe') {
    // 夏普比率越大越好
    return Math.max(...items.map(i => i[key]))
  } else {
    // 最大回撤和波动率越小越好（绝对值）
    return Math.min(...items.map(i => Math.abs(i[key])))
  }
}

/**
 * 判断是否为最优值
 */
function isBestValue(item: FundComparisonItem, key: 'maxDrawdown' | 'volatility' | 'sharpe'): boolean {
  const best = getBestRiskValue(comparisonList.value, key)
  if (best === null) return false

  if (key === 'sharpe') {
    return item[key] === best
  } else {
    return Math.abs(item[key]) === best
  }
}
</script>

<template>
  <div class="fund-compare-page" data-testid="fund-compare-page">
    <!-- 导航栏 -->
    <van-nav-bar
      title="基金对比"
      left-arrow
      @click-left="goBack"
    >
      <template #right>
        <van-icon
          v-if="comparisonList.length > 0"
          name="delete-o"
          size="18"
          @click="handleClearAll"
        />
      </template>
    </van-nav-bar>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-container">
      <van-loading type="spinner" color="#1989fa" />
      <span class="loading-text">正在获取基金数据...</span>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-banner">
      <van-icon name="warning-o" size="16" />
      <span>{{ error }}</span>
    </div>

    <!-- 添加基金区域 -->
    <div class="add-section" data-testid="add-fund-section">
      <div class="added-funds">
        <div
          v-for="fund in comparisonList"
          :key="fund.code"
          class="fund-tag"
          data-testid="fund-tag"
        >
          <span class="fund-tag-name">{{ fund.name }}</span>
          <van-icon
            name="cross"
            size="14"
            class="fund-tag-remove"
            @click="handleRemoveFund(fund.code)"
          />
        </div>

      <van-button
        v-if="!isMaxReached"
        type="primary"
        plain
        size="small"
        class="add-btn"
        data-testid="add-fund-button"
        @click="showAddPanel = true"
      >
          <van-icon name="plus" /> 添加基金
        </van-button>
      </div>
      <div class="fund-count">{{ comparisonList.length }}/5</div>
    </div>

    <!-- 对比内容 -->
    <div v-if="canCompare" class="compare-content">
      <!-- 标签页切换 -->
      <van-tabs v-model:active="activeTab" sticky data-testid="compare-tabs">
        <van-tab title="收益对比" name="returns" />
        <van-tab title="风险指标" name="risk" />
        <van-tab title="持仓对比" name="holdings" />
      </van-tabs>

      <!-- 收益对比表格 -->
      <div v-if="activeTab === 'returns'" class="returns-table-container" data-testid="returns-tab">
        <table class="returns-table" data-testid="returns-table">
          <thead>
            <tr>
              <th class="period-header">阶段</th>
              <th v-for="fund in comparisonList" :key="fund.code" class="fund-header">
                {{ fund.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in returnsComparisonTable" :key="row.period">
              <td class="period-cell">{{ row.period }}</td>
              <td
                v-for="item in row.values"
                :key="item.code"
                class="return-cell"
                :class="getReturnClass(item.value)"
              >
                {{ formatPercent(item.value) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 风险指标对比 -->
      <div v-if="activeTab === 'risk'" class="risk-table-container" data-testid="risk-tab">
        <table class="risk-table" data-testid="risk-table">
          <thead>
            <tr>
              <th class="metric-header">指标</th>
              <th v-for="fund in comparisonList" :key="fund.code" class="fund-header">
                {{ fund.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="metric-cell">最大回撤</td>
              <td
                v-for="fund in comparisonList"
                :key="fund.code"
                class="value-cell"
                :class="{ 'best-value': isBestValue(fund, 'maxDrawdown') }"
              >
                {{ formatPercent(fund.maxDrawdown) }}
              </td>
            </tr>
            <tr>
              <td class="metric-cell">波动率</td>
              <td
                v-for="fund in comparisonList"
                :key="fund.code"
                class="value-cell"
                :class="{ 'best-value': isBestValue(fund, 'volatility') }"
              >
                {{ formatPercent(fund.volatility) }}
              </td>
            </tr>
            <tr>
              <td class="metric-cell">夏普比率</td>
              <td
                v-for="fund in comparisonList"
                :key="fund.code"
                class="value-cell"
                :class="{ 'best-value': isBestValue(fund, 'sharpe') }"
              >
                {{ fund.sharpe.toFixed(2) }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="risk-tip">* 最大回撤和波动率越小越好，夏普比率越大越好</div>
      </div>

      <!-- 持仓对比 -->
      <div v-if="activeTab === 'holdings'" class="holdings-container" data-testid="holdings-tab">
        <!-- 重仓股交集 -->
        <div v-if="holdingsComparison.intersection.length > 0" class="holdings-section">
          <div class="section-title">共同持有（交集）</div>
          <div class="holdings-list">
            <div
              v-for="stock in holdingsComparison.intersection"
              :key="stock.codes[0]"
              class="stock-item"
            >
              <span class="stock-name">{{ stock.name }}</span>
              <span class="stock-funds">{{ stock.codes.length }}只基金持有</span>
            </div>
          </div>
        </div>

        <!-- 重仓股并集 -->
        <div class="holdings-section">
          <div class="section-title">全部重仓股（按平均权重排序）</div>
          <div class="holdings-list">
            <div
              v-for="stock in holdingsComparison.union.slice(0, 20)"
              :key="stock.name"
              class="stock-item"
            >
              <span class="stock-name">{{ stock.name }}</span>
              <span class="stock-weight">平均占比 {{ stock.avgWeight.toFixed(2) }}%</span>
              <span class="stock-funds">{{ stock.fundCodes.length }}只基金</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!canCompare" class="empty-state">
      <van-empty image="search" description="请添加至少2只基金开始对比">
        <van-button type="primary" @click="showAddPanel = true">
          添加基金
        </van-button>
      </van-empty>
    </div>

    <!-- 添加基金面板（弹出层） -->
    <van-popup
      v-model:show="showAddPanel"
      position="bottom"
      :style="{ height: '70%' }"
      round
    >
      <div class="add-panel">
        <div class="panel-header">
          <span class="panel-title">添加对比基金</span>
          <van-icon name="cross" size="20" @click="showAddPanel = false" />
        </div>

        <!-- 搜索框 -->
        <van-search
          v-model="searchKeyword"
          placeholder="搜索基金代码或名称"
          shape="round"
          data-testid="fund-search-input"
        />

        <!-- 自选列表快捷添加 -->
        <div v-if="fundStore.watchlist.length > 0" class="watchlist-section">
          <div class="sub-title">从自选添加</div>
          <div class="watchlist-grid">
            <div
              v-for="(fund, index) in fundStore.watchlist"
              :key="fund.code"
              class="watchlist-item"
              @click="handleAddFromWatchlist(index)"
            >
              <span class="wl-name">{{ fund.name }}</span>
              <span class="wl-code">{{ fund.code }}</span>
            </div>
          </div>
        </div>

        <!-- 搜索结果 -->
        <div v-if="searchResults.length > 0" class="search-results">
          <div
            v-for="fund in searchResults"
            :key="fund.code"
            class="search-item"
            @click="handleAddFund(fund)"
          >
            <div class="search-item-info">
              <span class="search-item-name">{{ fund.name }}</span>
              <span class="search-item-code">{{ fund.code }}</span>
            </div>
            <van-icon name="plus" color="#1989fa" />
          </div>
        </div>

        <!-- 搜索提示 -->
        <div v-if="!searchKeyword && searchResults.length === 0" class="search-tip">
          输入基金代码或名称搜索，或从自选列表快速添加
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.fund-compare-page {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-bottom: 20px;
}

/* ========== 加载状态 ========== */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* ========== 错误提示 ========== */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #fff3f3;
  color: #f56c6c;
  font-size: 13px;
}

/* ========== 添加基金区域 ========== */
.add-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.added-funds {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.fund-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 12px;
}

.fund-tag-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fund-tag-remove {
  cursor: pointer;
  color: var(--text-tertiary);
}

.fund-tag-remove:active {
  color: #f56c6c;
}

.add-btn {
  border-radius: 4px;
}

.fund-count {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 12px;
}

/* ========== 对比内容 ========== */
.compare-content {
  margin-top: 12px;
}

/* ========== 收益对比表格 ========== */
.returns-table-container {
  overflow-x: auto;
  padding: 12px;
}

.returns-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.period-header,
.fund-header {
  padding: 10px 8px;
  text-align: center;
  background: var(--bg-tertiary);
  font-weight: 600;
  position: sticky;
  left: 0;
}

.fund-header {
  min-width: 80px;
}

.period-cell {
  padding: 8px;
  font-weight: 500;
  background: var(--bg-secondary);
  position: sticky;
  left: 0;
}

.return-cell {
  padding: 8px;
  text-align: center;
  font-family: 'DIN Alternate', 'Roboto Mono', monospace;
  font-weight: 500;
}

.text-red-500 {
  color: #f56c6c;
}

.text-green-500 {
  color: #67c23a;
}

.text-gray-500 {
  color: #909399;
}

/* ========== 风险指标对比 ========== */
.risk-table-container {
  padding: 12px;
}

.risk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.metric-header,
.fund-header {
  padding: 10px 8px;
  text-align: center;
  background: var(--bg-tertiary);
  font-weight: 600;
}

.metric-cell {
  padding: 10px 8px;
  font-weight: 500;
  background: var(--bg-secondary);
}

.value-cell {
  padding: 10px 8px;
  text-align: center;
  font-family: 'DIN Alternate', 'Roboto Mono', monospace;
}

.best-value {
  background: #e8f5e9;
  font-weight: 600;
  color: #67c23a;
}

.risk-tip {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
}

/* ========== 持仓对比 ========== */
.holdings-container {
  padding: 12px;
}

.holdings-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.holdings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stock-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  gap: 12px;
}

.stock-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.stock-weight,
.stock-funds {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ========== 空状态 ========== */
.empty-state {
  padding: 40px 20px;
}

/* ========== 添加面板 ========== */
.add-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
}

.panel-header .van-icon {
  cursor: pointer;
}

/* ========== 自选列表 ========== */
.watchlist-section {
  padding: 12px 16px;
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.watchlist-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.watchlist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  cursor: pointer;
}

.watchlist-item:active {
  background: var(--bg-active, #f2f3f5);
}

.wl-name {
  font-size: 14px;
  font-weight: 500;
}

.wl-code {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ========== 搜索结果 ========== */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
}

.search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-color, #ebedf0);
  cursor: pointer;
}

.search-item:active {
  background: var(--bg-active, #f2f3f5);
}

.search-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-item-name {
  font-size: 14px;
  font-weight: 500;
}

.search-item-code {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ========== 搜索提示 ========== */
.search-tip {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
