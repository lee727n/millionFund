<template>
  <div class="ai-tracking-detail-page">
    <!-- 顶部导航 -->
    <van-nav-bar 
      :title="sellName || buyName || '调仓详情'" 
      left-arrow 
      @click-left="goBack"
    />
    
    <!-- 详情内容 -->
    <div class="detail-content" v-if="!loading">
      <!-- 第一行：日期、调仓状态、幅度 -->
      <div class="detail-header">
        <div class="detail-header-row1">
          <span class="detail-date">{{ formatDate(date) }}</span>
          <span class="detail-status" :class="getStatusClass()">{{ getStatusText() }}</span>
          <span class="detail-diff" :class="getStatusClass()">{{ getDiffText() }}</span>
        </div>
        <!-- 第二行：完整计算公式（与record-calc一致） -->
        <span class="record-calc" v-html="getCalcProcessCombined()"></span>
      </div>
      
      <!-- 卖出基金信息 -->
      <div class="fund-section">
        <div class="section-title">
          <span class="title-label sell">卖</span>
          <span>卖出基金</span>
        </div>
        <div class="fund-card">
          <div class="fund-main">
            <div class="fund-name">{{ sellName || sellCode }}</div>
            <div class="fund-code">{{ sellCode }}</div>
          </div>
          <div class="fund-change-wrapper" :class="getDailyChangeClass('sell')">
            <span class="fund-change">{{ getDailyChangeText('sell') }}</span>
          </div>
        </div>
        
        <!-- 净值成本信息 -->
        <div class="cost-info">
          <div class="cost-item">
            <span class="cost-label">卖出净值成本</span>
            <span class="cost-value">{{ formatPrice(sellNav) }}</span>
          </div>
          <div class="cost-item change-row" :class="getTotalChangeClass('sell')">
            <span class="cost-label">卖出后累计涨幅</span>
            <span class="cost-value" :class="getTotalChangeClass('sell')">
              {{ getTotalChangeText('sell') }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- 向下箭头虚线 -->
      <div class="arrow-divider">
        <div class="dashed-line"></div>
        <van-icon name="arrow-down" class="arrow-icon" />
        <div class="dashed-line"></div>
        <div class="diff-badge" :class="getStatusClass()">
          {{ getDiffText() }}
        </div>
      </div>
      
      <!-- 买入基金信息 -->
      <div class="fund-section">
        <div class="section-title">
          <span class="title-label buy">买</span>
          <span>买入基金</span>
        </div>
        <div class="fund-card">
          <div class="fund-main">
            <div class="fund-name">{{ buyName || buyCode }}</div>
            <div class="fund-code">{{ buyCode }}</div>
          </div>
          <div class="fund-change-wrapper" :class="getDailyChangeClass('buy')">
            <span class="fund-change">{{ getDailyChangeText('buy') }}</span>
          </div>
        </div>
        
        <!-- 净值成本信息 -->
        <div class="cost-info">
          <div class="cost-item">
            <span class="cost-label">买入净值成本</span>
            <span class="cost-value">{{ formatPrice(buyNav) }}</span>
          </div>
          <div class="cost-item change-row" :class="getTotalChangeClass('buy')">
            <span class="cost-label">买入后累计涨幅</span>
            <span class="cost-value" :class="getTotalChangeClass('buy')">
              {{ getTotalChangeText('buy') }}
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <van-loading v-else class="loading-box" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'

const route = useRoute()
const router = useRouter()

const sellCode = ref('')
const buyCode = ref('')
const sellNav = ref(0)
const buyNav = ref(0)
const sellPrice = ref(0)
const buyPrice = ref(0)
const sellChange = ref(0)  // 今日估值涨幅
const buyChange = ref(0)   // 今日估值涨幅
const date = ref('')
const sellName = ref('')
const buyName = ref('')
const sellNavEstimated = ref(false)  // 卖出净值是否是估值
const buyNavEstimated = ref(false)   // 买入净值是否是估值
const loading = ref(true)

onMounted(() => {
  sellCode.value = route.params.sellCode as string
  sellName.value = decodeURIComponent(route.params.sellName as string)
  buyCode.value = route.params.buyCode as string
  buyName.value = decodeURIComponent(route.params.buyName as string)
  sellNav.value = parseFloat(route.params.sellNav as string)
  buyNav.value = parseFloat(route.params.buyNav as string)
  sellPrice.value = parseFloat(route.params.sellPrice as string)
  buyPrice.value = parseFloat(route.params.buyPrice as string)
  sellChange.value = parseFloat(route.params.sellChange as string)
  buyChange.value = parseFloat(route.params.buyChange as string)
  date.value = route.params.date as string
  sellNavEstimated.value = route.params.sellNavEstimated === '1'
  buyNavEstimated.value = route.params.buyNavEstimated === '1'
  loading.value = false
})

function goBack() {
  router.back()
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  // 与列表页一致，显示年月日格式
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatPrice(price: number): string {
  if (!price) return '--'
  return price.toFixed(4)
}

// [WHY] 当天新增的转换：成本基准=当天净值，「累计」应为 0（当天真实涨跌由「今日」字段展示）
function isConversionSameDay(): boolean {
  if (!date.value) return false
  const d = new Date(date.value + 'T00:00:00')
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate()
}

function getStatusClass(): string {
  if (isConversionSameDay()) return ''
  if (!sellNav.value || !buyNav.value || !sellPrice.value || !buyPrice.value) return ''
  // 使用累计涨幅判断：买入涨幅 >= 卖出涨幅 = 调仓成功
  const sellChangePercent = ((sellPrice.value - sellNav.value) / sellNav.value) * 100
  const buyChangePercent = ((buyPrice.value - buyNav.value) / buyNav.value) * 100
  return buyChangePercent >= sellChangePercent ? 'success' : 'fail'
}

function getStatusText(): string {
  if (isConversionSameDay()) return '今日'
  if (!sellNav.value || !buyNav.value || !sellPrice.value || !buyPrice.value) return '--'
  // 使用累计涨幅判断：买入涨幅 >= 卖出涨幅 = 调仓成功
  const sellChangePercent = ((sellPrice.value - sellNav.value) / sellNav.value) * 100
  const buyChangePercent = ((buyPrice.value - buyNav.value) / buyNav.value) * 100
  return buyChangePercent >= sellChangePercent ? '调仓成功' : '调仓失败'
}

function getChangeClass(type: 'sell' | 'buy'): string {
  const nav = type === 'sell' ? sellNav.value : buyNav.value
  if (!nav) return ''
  return nav >= 0 ? 'up' : 'down'
}

function getChangeText(type: 'sell' | 'buy'): string {
  const nav = type === 'sell' ? sellNav.value : buyNav.value
  if (!nav) return '--'
  const sign = nav >= 0 ? '+' : ''
  return `${sign}${nav}%`
}

// 今日估值涨幅相关
function getDailyChangeClass(type: 'sell' | 'buy'): string {
  const change = type === 'sell' ? sellChange.value : buyChange.value
  if (!change) return ''
  return change >= 0 ? 'up' : 'down'
}

function getDailyChangeText(type: 'sell' | 'buy'): string {
  const change = type === 'sell' ? sellChange.value : buyChange.value
  if (!change) return '--'
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

// 累计涨幅相关（与 record-calc 一致）
function getTotalChangeClass(type: 'sell' | 'buy'): string {
  if (isConversionSameDay()) return ''
  const nav = type === 'sell' ? sellNav.value : buyNav.value
  const price = type === 'sell' ? sellPrice.value : buyPrice.value
  
  if (!nav || !price) return ''
  const change = ((price - nav) / nav) * 100
  return change >= 0 ? 'up' : 'down'
}

function getTotalChangeText(type: 'sell' | 'buy'): string {
  if (isConversionSameDay()) return '+0.00%'
  const nav = type === 'sell' ? sellNav.value : buyNav.value
  const price = type === 'sell' ? sellPrice.value : buyPrice.value
  
  if (!nav || !price) return '--'
  const change = ((price - nav) / nav) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

function getDiffText(): string {
  if (isConversionSameDay()) return '+0.00%'
  if (!sellNav.value || !buyNav.value || !sellPrice.value || !buyPrice.value) return '--'
  
  // 计算买入和卖出的累计涨幅
  const sellChange = ((sellPrice.value - sellNav.value) / sellNav.value) * 100
  const buyChange = ((buyPrice.value - buyNav.value) / buyNav.value) * 100
  
  // 调仓幅度 = 买入累计涨幅 - 卖出累计涨幅
  const diff = buyChange - sellChange
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(2)}%`
}

// 与 record-calc 一致的计算公式
function getCalcProcessCombined(): string {
  if (isConversionSameDay()) return '今日转换，累计 0.00%'
  if (!sellPrice.value || !buyPrice.value || !sellNav.value || !buyNav.value) return '--'
  
  const sellChange = ((sellPrice.value - sellNav.value) / sellNav.value) * 100
  const buyChange = ((buyPrice.value - buyNav.value) / buyNav.value) * 100
  
  const sellNavTag = sellNavEstimated.value ? ' <span style="color:#ff976a">(估值)</span>' : ''
  const buyNavTag = buyNavEstimated.value ? ' <span style="color:#ff976a">(估值)</span>' : ''
  
  const sellStr = `卖出: ${sellPrice.value.toFixed(4)} - <span style="color:#1989fa">${sellNav.value.toFixed(4)}</span>${sellNavTag} = ${sellChange >= 0 ? '+' : ''}${sellChange.toFixed(2)}%`
  const buyStr = `买入: ${buyPrice.value.toFixed(4)} - <span style="color:#1989fa">${buyNav.value.toFixed(4)}</span>${buyNavTag} = ${buyChange >= 0 ? '+' : ''}${buyChange.toFixed(2)}%`
  
  return `<div class="calc-sell">${sellStr}</div><div class="calc-buy">${buyStr}</div>`
}
</script>

<style lang="scss" scoped>
.ai-tracking-detail-page {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-top: env(safe-area-inset-top);
}

.detail-content {
  padding: 12px;
}

.detail-header {
  padding: 12px;
  background: var(--bg-card);
  border-radius: 8px;
  margin-bottom: 12px;
}

.detail-header-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-date {
  font-size: 14px;
  color: var(--text-muted);
}

.detail-status {
  font-size: 14px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  
  &.success {
    color: #ee0a24;
    background: rgba(238, 10, 36, 0.1);
  }
  
  &.fail {
    color: #07c160;
    background: rgba(7, 193, 96, 0.1);
  }
}

.detail-diff {
  font-size: 16px;
  font-weight: 700;
  
  &.success {
    color: #ee0a24;
  }
  
  &.fail {
    color: #07c160;
  }
}

/* 与 record-calc 一致的样式 */
.record-calc {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-number);
  display: block;
  margin-top: 4px;
}

.calc-sell,
.calc-buy {
  display: block;
  margin-bottom: 2px;
}

@media (min-width: 768px) {
  .calc-sell,
  .calc-buy {
    display: inline;
    margin-bottom: 0;
  }
  
  .calc-buy {
    margin-left: 12px;
  }
}

.fund-section {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.title-label {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  
  &.sell {
    background: rgba(238, 10, 36, 0.1);
    color: #ee0a24;
  }
  
  &.buy {
    background: rgba(7, 193, 96, 0.1);
    color: #07c160;
  }
}

.fund-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.fund-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fund-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.fund-code {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-number);
}

.fund-change-wrapper {
  padding: 4px 12px;
  border-radius: 4px;
  
  &.up {
    background: rgba(238, 10, 36, 0.1);
  }
  
  &.down {
    background: rgba(7, 193, 96, 0.1);
  }
}

.fund-change {
  font-size: 15px;
  font-weight: 600;
  
  &.up {
    color: #ee0a24;
  }
  
  &.down {
    color: #07c160;
  }
}

.cost-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.cost-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  &.change-row {
    padding: 6px 12px;
    border-radius: 6px;
    
    &.up {
      background: linear-gradient(135deg, rgba(238, 10, 36, 0.15) 0%, rgba(238, 10, 36, 0.08) 100%);
    }
    
    &.down {
      background: linear-gradient(135deg, rgba(7, 193, 96, 0.15) 0%, rgba(7, 193, 96, 0.08) 100%);
    }
  }
}

.cost-label {
  font-size: 13px;
  color: var(--text-muted);
}

.cost-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-number);
  
  &.up {
    color: #ee0a24;
  }
  
  &.down {
    color: #07c160;
  }
}

.arrow-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
  position: relative;
}

.dashed-line {
  flex: 1;
  height: 1px;
  border-top: 1px dashed var(--border-color);
}

.arrow-icon {
  font-size: 16px;
  color: var(--text-muted);
  margin: 0 8px;
}

.diff-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  background: var(--bg-card);
  
  &.success {
    color: #ee0a24;
    border: 1px solid rgba(238, 10, 36, 0.3);
  }
  
  &.fail {
    color: #07c160;
    border: 1px solid rgba(7, 193, 96, 0.3);
  }
}

.loading-box {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

@media (max-width: 768px) {
  .detail-content {
    padding: 8px;
  }
}
</style>