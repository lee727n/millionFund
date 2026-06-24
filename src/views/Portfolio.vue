<script setup lang="ts">
// [WHY] 资产总览页面 - 展示所有资产的汇总信息和分配情况
// [WHAT] 显示总资产、今日盈亏、累计盈亏、资产分配图、持仓列表

import { ref, onMounted, computed } from 'vue'
import { useHoldingStore } from '@/stores/holding'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import type { AssetClass } from '@/types/holding'
import { ASSET_CLASS_CONFIG } from '@/types/holding'

const router = useRouter()
const holdingStore = useHoldingStore()

// 是否正在刷新
const isRefreshing = ref(false)

// 资产分配视图模式：'pie' | 'bar'
const allocationViewMode = ref<'pie' | 'bar'>('pie')

// 资产汇总
const summary = computed(() => holdingStore.portfolioSummary)

// 持仓列表（按盈亏排序）
const sortedHoldings = computed(() => {
  return [...holdingStore.holdings].sort((a, b) => {
    const profitA = a.profit || 0
    const profitB = b.profit || 0
    return profitB - profitA // 降序：盈利多的在前
  })
})

// 加载数据
async function loadData() {
  isRefreshing.value = true
  try {
    await holdingStore.refreshEstimates()
    await holdingStore.fetchPortfolioSummary()
  } catch (err) {
    showToast('刷新失败')
    console.error('[Portfolio] 加载数据失败', err)
  } finally {
    isRefreshing.value = false
  }
}

// 下拉刷新
async function onRefresh() {
  await loadData()
  showToast('刷新成功')
}

// 跳转到持仓详情
function goToHoldingDetail(item: any) {
  router.push(`/detail/${item.code}`)
}

// 格式化金额
function formatMoney(value: number): string {
  if (Math.abs(value) >= 10000) {
    return (value / 10000).toFixed(2) + '万'
  }
  return value.toFixed(2)
}

// 格式化百分比
function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

// 获取资产类别标签
function getAssetClassLabel(assetClass: string): string {
  return ASSET_CLASS_CONFIG[assetClass as AssetClass]?.label || assetClass
}

// 获取资产类别颜色
function getAssetClassColor(assetClass: string): string {
  return ASSET_CLASS_CONFIG[assetClass as AssetClass]?.color || '#999'
}

// 切换资产分配视图
function toggleAllocationView() {
  allocationViewMode.value = allocationViewMode.value === 'pie' ? 'bar' : 'pie'
}

// 计算饼图的 conic-gradient
const pieChartGradient = computed(() => {
  if (!summary.value) return ''

  const slices: string[] = []
  let currentAngle = 0

  const assetClasses = Object.entries(summary.value.byAssetClass)
    .filter(([_, config]) => config.count > 0)
    .sort((a, b) => b[1].value - a[1].value)

  for (const [assetClass, config] of assetClasses) {
    const angle = config.weight * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle

    slices.push(`${getAssetClassColor(assetClass)} ${startAngle}deg ${endAngle}deg`)
    currentAngle = endAngle
  }

  return `conic-gradient(${slices.join(', ')})`
})

// 获取有持仓的资产类别列表
const activeAssetClasses = computed(() => {
  if (!summary.value) return []
  return Object.entries(summary.value.byAssetClass)
    .filter(([_, config]) => config.count > 0)
    .sort((a, b) => b[1].value - a[1].value)
})

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <div class="portfolio-page">
    <!-- 顶部汇总卡片 -->
    <div class="summary-card">
      <h2 class="page-title">百万实盘 - 资产总览</h2>

      <div class="summary-item">
        <span class="label">总资产</span>
        <span class="value">¥{{ summary ? formatMoney(summary.totalValueCNY) : '0.00' }}</span>
      </div>

      <div class="summary-row">
        <div class="summary-item-small">
          <span class="label">今日盈亏</span>
          <span :class="['value-small', (summary?.todayChangeCNY || 0) >= 0 ? 'profit' : 'loss']">
            {{ summary ? ((summary.todayChangeCNY >= 0 ? '+' : '') + formatMoney(summary.todayChangeCNY)) : '0.00' }}
            ({{ summary ? formatPercent(summary.todayChangeRate) : '0.00%' }})
          </span>
        </div>

        <div class="summary-item-small">
          <span class="label">累计盈亏</span>
          <span :class="['value-small', (summary?.totalProfitCNY || 0) >= 0 ? 'profit' : 'loss']">
            {{ summary ? ((summary.totalProfitCNY >= 0 ? '+' : '') + formatMoney(summary.totalProfitCNY)) : '0.00' }}
            ({{ summary ? formatPercent(summary.totalProfitRate) : '0.00%' }})
          </span>
        </div>
      </div>
    </div>

    <!-- 资产分配 -->
    <div class="section-card" v-if="summary">
      <div class="section-header">
        <h3 class="section-title">📊 资产分配</h3>
        <van-button
          size="small"
          plain
          @click="toggleAllocationView"
          class="toggle-btn"
        >
          {{ allocationViewMode === 'pie' ? '条形图' : '饼图' }}
        </van-button>
      </div>

      <!-- 饼图视图 -->
      <div v-if="allocationViewMode === 'pie'" class="pie-chart-container">
        <div class="pie-chart" :style="{ background: pieChartGradient }">
          <div class="pie-chart-inner">
            <div class="pie-total">{{ formatMoney(summary.totalValueCNY) }}</div>
            <div class="pie-label">总资产(元)</div>
          </div>
        </div>

        <!-- 图例 -->
        <div class="pie-legend">
          <div
            v-for="[assetClass, config] in activeAssetClasses"
            :key="assetClass"
            class="legend-item"
          >
            <span class="legend-dot" :style="{ backgroundColor: getAssetClassColor(assetClass) }"></span>
            <span class="legend-label">{{ getAssetClassLabel(assetClass) }}</span>
            <span class="legend-value">{{ (config.weight * 100).toFixed(1) }}%</span>
            <span class="legend-amount">¥{{ formatMoney(config.value) }}</span>
          </div>
        </div>
      </div>

      <!-- 条形图视图 -->
      <div v-else class="asset-allocation">
        <div
          v-for="[assetClass, config] in activeAssetClasses"
          :key="assetClass"
          class="asset-row"
        >
          <div class="asset-label">
            <span class="asset-dot" :style="{ backgroundColor: getAssetClassColor(assetClass) }"></span>
            <span>{{ getAssetClassLabel(assetClass) }}</span>
            <span class="asset-weight">{{ (config.weight * 100).toFixed(0) }}%</span>
          </div>
          <div class="asset-bar-bg">
            <div
              class="asset-bar"
              :style="{ width: (config.weight * 100) + '%', backgroundColor: getAssetClassColor(assetClass) }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 持仓列表 -->
    <div class="section-card">
      <h3 class="section-title">💼 持仓列表（按盈亏排序）</h3>

      <van-pull-refresh v-model="isRefreshing" @refresh="onRefresh">
        <van-list>
          <div
            v-for="item in sortedHoldings"
            :key="item.code"
            class="holding-item"
            @click="goToHoldingDetail(item)"
          >
            <div class="holding-header">
              <span class="holding-name">{{ item.name }}</span>
              <span
                class="holding-profit"
                :class="(item.profit || 0) >= 0 ? 'profit' : 'loss'"
              >
                {{ (item.profit || 0) >= 0 ? '+' : '' }}{{ formatMoney(item.profit || 0) }}
              </span>
            </div>

            <div class="holding-footer">
              <span class="holding-class" :style="{ color: getAssetClassColor(item.assetClass || 'fund') }">
                {{ getAssetClassLabel(item.assetClass || 'fund') }}
              </span>
              <span
                class="holding-rate"
                :class="(item.profitRate || 0) >= 0 ? 'profit' : 'loss'"
              >
                {{ formatPercent(item.profitRate || 0) }}
              </span>
            </div>
          </div>

          <van-empty v-if="sortedHoldings.length === 0" description="暂无持仓" />
        </van-list>
      </van-pull-refresh>
    </div>
  </div>
</template>

<style scoped>
.portfolio-page {
  padding: 16px;
  padding-bottom: 80px;
  background: #f5f5f5;
  min-height: 100vh;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 16px;
  color: #333;
}

/* 汇总卡片 */
.summary-card {
  background: linear-gradient(135deg, #1989fa, #4fa0fb);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  color: white;
}

.summary-card .page-title {
  color: white;
  margin-bottom: 20px;
}

.summary-item {
  margin-bottom: 16px;
}

.summary-item .label {
  font-size: 14px;
  opacity: 0.9;
  display: block;
  margin-bottom: 4px;
}

.summary-item .value {
  font-size: 28px;
  font-weight: bold;
}

.summary-row {
  display: flex;
  gap: 24px;
}

.summary-item-small {
  flex: 1;
}

.summary-item-small .label {
  font-size: 12px;
  opacity: 0.8;
  display: block;
  margin-bottom: 4px;
}

.summary-item-small .value-small {
  font-size: 14px;
  font-weight: 600;
}

.value-small.profit {
  color: #ff6b6b;
}

.value-small.loss {
  color: #5bde7d;
}

/* 分区卡片 */
.section-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.toggle-btn {
  font-size: 12px;
  padding: 4px 12px;
  height: 28px;
}

/* 资产分配 */
.asset-allocation {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.asset-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #333;
}

.asset-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.asset-weight {
  margin-left: auto;
  font-weight: 600;
  color: #666;
}

.asset-bar-bg {
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.asset-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* 饼图 */
.pie-chart-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pie-chart {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  position: relative;
  margin-bottom: 20px;
}

.pie-chart-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.pie-total {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.pie-label {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

/* 图例 */
.pie-legend {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  color: #333;
  min-width: 60px;
}

.legend-value {
  font-weight: 600;
  color: #666;
  min-width: 50px;
}

.legend-amount {
  margin-left: auto;
  color: #999;
  font-size: 13px;
}

/* 持仓列表 */
.holding-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}

.holding-item:last-child {
  border-bottom: none;
}

.holding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.holding-name {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.holding-profit {
  font-size: 15px;
  font-weight: 600;
}

.holding-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.holding-class {
  font-size: 12px;
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
}

.holding-rate {
  font-size: 14px;
  font-weight: 500;
}

.profit {
  color: #ff6b6b;
}

.loss {
  color: #5bde7d;
}
</style>
