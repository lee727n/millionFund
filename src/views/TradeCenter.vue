<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getTrades, removeTrade, getHoldings, updateTradesByCode, saveTrades } from '@/utils/storage'
import { fetchFundAccurateData, clearFundCache } from '@/api/fundFast'
import type { TradeRecord } from '@/types/fund'
// 账户图标 - 通过 import 让 Vite 正确处理资源路径
// @ts-ignore
import aliIcon from '@/assets/ali.jpg'
// @ts-ignore
import txIcon from '@/assets/TX.jpg'
// @ts-ignore
import jdIcon from '@/assets/JD.jpg'
// @ts-ignore
import eyeIcon from '@/assets/eye.png'

const router = useRouter()

const loading = ref(true)
const refreshing = ref(false)
const fundNavMap = ref<Map<string, number>>(new Map())
const calculatingReturns = ref(true) // 涨跌幅计算中

// [FIX] 保存每个基金的完整数据（估值、净值、数据源）
// 用于根据交易记录的类型选择合适的当前值进行涨跌幅计算
const fundDataMap = ref<Map<string, { estimate: number; nav: number; currentValue: number; dataSource: string }>>(new Map())

// 账户图标映射
const accountIcons: Record<string, string> = {
  ali: aliIcon,
  TX: txIcon,
  JD: jdIcon,
  observe: eyeIcon
}

// 当前账户筛选 (''=全部, 'ali', 'TX', 'JD')
const accountFilter = ref<string>('')

// 所有交易记录
const allTrades = ref<TradeRecord[]>([])

// 加载交易记录
// [FIX] 分两步加载：先显示基础数据，再异步加载涨跌幅
async function loadTrades() {
  // 第一步：立即显示本地存储的交易记录（不需要等待网络请求）
  const trades = getTrades()
  
  // 如果没有交易记录，不需要计算
  if (trades.length === 0) {
    calculatingReturns.value = false
    loading.value = false
    return
  }
  
  calculatingReturns.value = true  // 开始计算
  
  // 获取持仓中的基金来源信息，用于自动匹配
  const holdings = getHoldings()
  const fundSourceMap = new Map<string, string>()
  holdings.forEach(h => {
    if (h.source) {
      fundSourceMap.set(h.code, h.source)
    }
  })
  
  // 自动补全交易记录中的 source 字段
  const enrichedTrades = trades.map(t => {
    if (!t.source && fundSourceMap.has(t.code)) {
      return { ...t, source: fundSourceMap.get(t.code) as string }
    }
    return t
  })
  
  // 按基金分组排序
  allTrades.value = enrichedTrades.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code)
    return b.createdAt - a.createdAt
  })
  
  // 立即显示，不再等待网络请求
  loading.value = false
  
  // 第二步：异步加载需要计算的数据（估值检查、涨跌幅等）
  // 使用 Promise.allSettled 确保所有请求都完成
  loadTradeCalculations(enrichedTrades)
}

// [FIX] 异步加载交易记录的计算数据（估值检查、涨跌幅等）
async function loadTradeCalculations(trades: TradeRecord[]) {
  const today = new Date().toLocaleDateString('en-CA')
  
  // 检查是否有估值交易记录（estimated: true），自动更新为净值
  const estimatedTrades = trades.filter(t => t.estimated)
  console.log('[TradeCenter.loadCalculations] 估值交易数量:', estimatedTrades.length)
  
  // 收集所有需要处理的基金代码
  const codesToUpdate = new Set<string>()
  
  if (estimatedTrades.length > 0) {
    estimatedTrades.forEach(t => codesToUpdate.add(t.code))
  }
  
  // 检查今天添加的、但被错误标记为 estimated: false 的交易记录
  const todayTradesNotEstimated = trades.filter(t => t.date === today && !t.estimated)
  if (todayTradesNotEstimated.length > 0) {
    todayTradesNotEstimated.forEach(t => codesToUpdate.add(t.code))
  }
  
  // 并发处理所有需要更新的基金
  const updateRequests = Array.from(codesToUpdate).map(async (code) => {
    try {
      const data = await fetchFundAccurateData(code, false, true)
      console.log('[TradeCenter.loadCalculations] 基金', code, 'nav:', data.nav, 'navDate:', data.navDate, 'dataSource:', data.dataSource)
      
      // [FIX] 关键逻辑：
      // 1. data.nav 是最新的净值（可能是昨天或更早的）
      // 2. data.navDate 是这个净值的日期
      // 3. 如果有交易的日期 <= data.navDate，说明这些交易应该用净值而不是估值
      if (data.nav > 0 && data.navDate) {
        const allTrades = getTrades()
        let needUpdate = false
        
        allTrades.forEach(t => {
          if (t.code === code && t.estimated && t.date <= data.navDate) {
            console.log('[TradeCenter.loadCalculations] 发现需要更新的交易:', {
              id: t.id,
              tradeDate: t.date,
              navDate: data.navDate,
              oldNetValue: t.netValue,
              newNetValue: data.nav
            })
            needUpdate = true
          }
        })
        
        if (needUpdate) {
          // 用最新的净值更新所有日期 <= navDate 的估值交易
          updateTradesByCode(code, data.nav, data.navDate)
        }
      }
      
      // 如果今天净值还没更新，恢复今天添加的记录为 estimated: true
      if (data.dataSource !== 'nav') {
        const allTrades = getTrades()
        let needSave = false
        allTrades.forEach(t => {
          if (t.code === code && t.date === today && !t.estimated) {
            console.log('[TradeCenter.loadCalculations] 修复交易记录:', t.id, '恢复为 estimated: true')
            t.estimated = true
            needSave = true
          }
        })
        if (needSave) {
          saveTrades(allTrades)
        }
      }
    } catch (e) {
      console.error('[TradeCenter.loadCalculations] 获取失败:', code, e)
    }
  })
  
  // 并发获取所有基金的涨跌幅数据
  const fundCodes = [...new Set(trades.map(t => t.code))] as string[]
  const navRequests = fundCodes.map(async (code) => {
    try {
      const data = await fetchFundAccurateData(code, false, true)
      fundDataMap.value.set(code, {
        estimate: data.estimate || 0,
        nav: data.nav || 0,
        currentValue: data.currentValue || 0,
        dataSource: data.dataSource
      })
    } catch (e) {
      // 静默失败
    }
  })

  // 等待所有请求完成
  await Promise.allSettled([...updateRequests, ...navRequests])
  
  // 重新获取更新后的交易记录并刷新显示
  const updatedTrades = getTrades()
  const holdings = getHoldings()
  const fundSourceMap = new Map<string, string>()
  holdings.forEach(h => {
    if (h.source) {
      fundSourceMap.set(h.code, h.source)
    }
  })
  
  const enrichedTrades = updatedTrades.map(t => {
    if (!t.source && fundSourceMap.has(t.code)) {
      return { ...t, source: fundSourceMap.get(t.code) as string }
    }
    return t
  })
  
  allTrades.value = enrichedTrades.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code)
    return b.createdAt - a.createdAt
  })
  
  // 计算完成
  calculatingReturns.value = false
}

// 刷新数据：清除缓存后重新获取最新估值
async function refreshData() {
  if (refreshing.value) return
  
  refreshing.value = true
  try {
    // 获取所有基金代码并清除缓存
    const trades = getTrades()
    const fundCodes = [...new Set(trades.map(t => t.code))] as string[]
    fundCodes.forEach(code => clearFundCache(code))
    
    // 重新加载数据
    await loadTrades()
    showToast('刷新成功')
  } catch (e) {
    showToast('刷新失败')
  } finally {
    refreshing.value = false
  }
}

// 筛选后的交易记录
const filteredTrades = computed(() => {
  if (!accountFilter.value) return allTrades.value
  return allTrades.value.filter(t => t.source === accountFilter.value)
})

// 按基金分组的交易记录
const groupedTrades = computed(() => {
  // 获取当前持仓中的基金代码列表
  const holdings = getHoldings()
  const holdingCodes = new Set(holdings.map(h => h.code))
  
  const groups = new Map<string, {
    code: string
    name: string
    source?: string
    isCleared: boolean  // 是否已清仓
    trades: (TradeRecord & { postReturn: number })[]
  }>()

  filteredTrades.value.forEach(trade => {
    if (!groups.has(trade.code)) {
      // 判断是否已清仓：不在持仓列表中即为已清仓
      const isCleared = !holdingCodes.has(trade.code)
      groups.set(trade.code, {
        code: trade.code,
        name: trade.name,
        source: trade.source,
        isCleared,
        trades: []
      })
    }
    const group = groups.get(trade.code)!
    
    const fundData = fundDataMap.value.get(trade.code)
    let postReturn = 0
    
    if (fundData && trade.netValue > 0) {
      // [FIX] 简单逻辑：
      // 1. 最新值：今天净值更新了用净值，没更新用估值
      // 2. 交易成本：trade.netValue（已经保存了交易时的估值或净值）
      // 3. 涨跌幅 = (最新值 - 交易成本) / 交易成本
      
      let currentValue = 0
      if (fundData.dataSource === 'nav' && fundData.nav > 0) {
        // 今天净值已更新，用净值
        currentValue = fundData.nav
      } else if (fundData.estimate > 0) {
        // 今天净值没更新，用估值
        currentValue = fundData.estimate
      } else {
        // Fallback
        currentValue = fundData.currentValue
      }
      
      if (currentValue > 0) {
        postReturn = ((currentValue - trade.netValue) / trade.netValue) * 100
      }
    }
    
    group.trades.push({ ...trade, postReturn })
  })

  // [FIX] 排序：已清仓的放在后面
  return Array.from(groups.values()).sort((a, b) => {
    // 先按是否清仓排序（未清仓在前，已清仓在后）
    if (a.isCleared !== b.isCleared) {
      return a.isCleared ? 1 : -1
    }
    // 同状态下按基金代码排序
    return a.code.localeCompare(b.code)
  })
})

// 获取账户图标图片
function getSourceIconSrc(source?: string): string {
  if (!source) return ''
  return accountIcons[source] || ''
}

function getSourceName(source?: string): string {
  switch (source) {
    case 'ali': return '支付宝'
    case 'TX': return '腾讯'
    case 'JD': return '京东'
    case 'observe': return '观察'
    default: return ''
  }
}

// [FIX] 获取基金logo URL（东方财富）
function getFundLogoUrl(code: string): string {
  return `https://logo.eastmoney.com/${code}.png`
}

// [FIX] logo加载失败时隐藏
function onLogoError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img) {
    img.style.display = 'none'
  }
}

// 跳转详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

// 跳转AI追踪
function goToAITracking() {
  router.push('/ai-tracking')
}

// 删除交易记录
async function deleteTrade(trade: TradeRecord) {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定删除这笔${trade.type === 'buy' ? '加仓' : '减仓'}记录吗？\n${trade.name} ${trade.amount}元`,
    })
    
    removeTrade(trade.id)
    loadTrades()
    showToast('已删除')
  } catch {
    // 用户取消
  }
}

// 切换账户筛选（再次点击取消筛选）
function toggleAccountFilter(account: string) {
  accountFilter.value = accountFilter.value === account ? '' : account
}

onMounted(() => {
  loadTrades()
})
</script>

<template>
  <div class="trade-center">
    <!-- 顶部标题 + 筛选按钮 -->
    <div class="header">
      <div class="header-left">
        <span class="title-icon">📊</span>
        <span>交易记录</span>
        <span class="trade-count">{{ filteredTrades.length }}条</span>
        <!-- 账户筛选按钮 - 可切换 -->
        <button 
          class="filter-btn source-btn" 
          :class="{ active: accountFilter === 'ali' }"
          @click="toggleAccountFilter('ali')"
          title="支付宝"
        >
          <img src="@/assets/ali.jpg" class="source-icon" alt="支付宝" />
        </button>
        <button 
          class="filter-btn source-btn" 
          :class="{ active: accountFilter === 'TX' }"
          @click="toggleAccountFilter('TX')"
          title="腾讯"
        >
          <img src="@/assets/TX.jpg" class="source-icon" alt="腾讯" />
        </button>
        <button 
          class="filter-btn source-btn" 
          :class="{ active: accountFilter === 'JD' }"
          @click="toggleAccountFilter('JD')"
          title="京东"
        >
          <img src="@/assets/JD.jpg" class="source-icon" alt="京东" />
        </button>
      </div>
      <div class="header-right">
        <button 
          class="refresh-btn" 
          :class="{ 'is-refreshing': refreshing }"
          @click="refreshData"
          title="刷新估值"
          :disabled="refreshing"
        >
          <span class="refresh-icon">↻</span>
        </button>
        <button class="ai-entry-btn" @click="goToAITracking">
          <span>AI追踪</span>
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading && allTrades.length === 0" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="groupedTrades.length === 0" class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-text">暂无交易记录</div>
      <div class="empty-hint">在首页或详情页点击「交易」按钮开始记录</div>
    </div>

    <!-- 基金分组卡片 -->
    <div v-else class="fund-list">
      <!-- 涨跌幅计算中提示 -->
      <div v-if="calculatingReturns" class="calculating-hint">
        <span class="calculating-spinner"></span>
        <span>正在计算涨跌幅...</span>
      </div>
      
      <div 
        v-for="group in groupedTrades" 
        :key="group.code" 
        class="fund-card"
        :class="{ 'is-cleared': group.isCleared }"
      >
        <!-- 第一行：基金logo + 账户图标 + 基金名称 + code + 已清仓标签 -->
        <div class="fund-header" @click="goToDetail(group.code)">
          <!-- [FIX] 基金logo -->
          <img 
            :src="getFundLogoUrl(group.code)" 
            class="fund-logo"
            @error="onLogoError"
          />
          <!-- 账户图标 -->
          <img 
            v-if="group.source" 
            :src="getSourceIconSrc(group.source)" 
            class="fund-source-icon" 
            :title="getSourceName(group.source)"
          />
          <span class="fund-name">{{ group.name }}</span>
          <span class="fund-code">{{ group.code }}</span>
          <!-- [FIX] 已清仓的基金显示绿色标签 -->
          <span v-if="group.isCleared" class="cleared-tag">已清仓</span>
        </div>

        <!-- 第二行：交易记录 -->
        <div class="trade-records">
          <div
            v-for="trade in group.trades"
            :key="trade.id"
            class="trade-record-item"
            :class="trade.type"
          >
            <div class="trade-record-main">
              <span class="trade-type-badge" :class="trade.type">
                {{ trade.type === 'buy' ? '加仓' : '减仓' }}
              </span>
              <span class="trade-date">{{ trade.date }}</span>
              <span class="trade-amount">{{ trade.amount.toFixed(0) }}元</span>
              <span class="trade-nav" :class="{ 'is-estimate': trade.estimated }">
                {{ trade.netValue.toFixed(4) }}
                <span class="nav-tag">{{ trade.estimated ? '估' : '净' }}</span>
              </span>
              <!-- [FIX] 涨跌幅数据加载完成后显示，未完成时显示 "--" -->
              <span 
                class="trade-return" 
                :class="trade.postReturn >= 0 ? 'up' : 'down'"
              >
                <template v-if="calculatingReturns">
                  <span class="return-placeholder">--</span>
                </template>
                <template v-else>
                  {{ trade.postReturn >= 0 ? '+' : '' }}{{ trade.postReturn.toFixed(2) }}%
                </template>
              </span>
            </div>
            <button class="trade-delete-btn" @click.stop="deleteTrade(trade)">×</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trade-center {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* 顶部标题 */
.header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  flex-wrap: wrap;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 刷新按钮 */
.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.3s;
  color: var(--text-primary);
}

.refresh-btn:active {
  transform: scale(0.95);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-icon {
  font-size: 18px;
  font-weight: bold;
  transition: transform 0.5s;
}

.refresh-btn.is-refreshing .refresh-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.title-icon {
  font-size: 20px;
}

.ai-entry-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 20px;
  background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.4);
  transition: all 0.3s;
}

.ai-entry-btn:active {
  transform: scale(0.95);
}

.ai-entry-btn span {
  letter-spacing: 0.5px;
}

.trade-count {
  font-size: 13px;
  font-weight: normal;
  color: var(--text-secondary);
}

/* 筛选按钮 */
.filter-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn.source-btn {
  padding: 4px;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary);
}

.filter-btn.source-btn.active {
  border-color: var(--accent-color, #1890ff);
  box-shadow: 0 0 0 2px var(--accent-color, #1890ff);
}

.source-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
}

/* 加载和空状态 */
.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  margin-bottom: 6px;
}

.empty-hint {
  font-size: 12px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--bg-secondary);
  border-top-color: var(--accent-color, #1890ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 基金列表 */
.fund-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  padding: 8px 12px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}

/* 基金卡片 */
.fund-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}

/* 已清仓的基金卡片 - 视觉区分 */
.fund-card.is-cleared {
  opacity: 0.7;
  border: 1px dashed rgba(14, 203, 129, 0.3);
}

.fund-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
}

/* [FIX] 基金logo样式 */
.fund-logo {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.fund-header:active {
  opacity: 0.7;
}

.fund-source-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
}

.fund-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 已清仓标签 - 绿色 */
.cleared-tag {
  font-size: 10px;
  color: #0ecb81;
  background: rgba(14, 203, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
  font-weight: 500;
  border: 1px solid rgba(14, 203, 129, 0.3);
}

/* 交易记录 - 复用 Detail 样式 */
.trade-records {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.trade-record-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-primary);
  border-radius: 6px;
  border-left: 3px solid;
}

.trade-record-item.buy {
  border-left-color: #f6465d;
}

.trade-record-item.sell {
  border-left-color: #0ecb81;
}

.trade-record-main {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  white-space: nowrap;
}

.trade-type-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 500;
  flex-shrink: 0;
}

.trade-type-badge.buy {
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
}

.trade-type-badge.sell {
  background: rgba(14, 203, 129, 0.15);
  color: #0ecb81;
}

.trade-date {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.trade-amount {
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}

.trade-nav {
  color: var(--text-primary);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.trade-nav.is-estimate {
  color: var(--text-secondary);
  font-style: italic;
}

.nav-tag {
  font-size: 9px;
  padding: 0 2px;
  border-radius: 2px;
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
  flex-shrink: 0;
}

.trade-nav:not(.is-estimate) .nav-tag {
  background: rgba(14, 203, 129, 0.15);
  color: #0ecb81;
}

.trade-return {
  font-weight: 600;
  flex-shrink: 0;
}

.trade-return.up {
  color: #f6465d;
}

.trade-return.down {
  color: #0ecb81;
}

/* 涨跌幅占位符 */
.return-placeholder {
  color: var(--text-tertiary, #999);
  font-weight: 400;
}

/* 涨跌幅计算中提示 */
.calculating-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-tertiary, #999);
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 12px;
}

.calculating-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: var(--primary-color, #1890ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.trade-delete-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
}

.trade-delete-btn:hover {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}
</style>
