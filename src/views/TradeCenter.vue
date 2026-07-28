<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getTrades, removeTrade } from '@/utils/storage'
import { fetchFundAccurateData } from '@/api/fundFast'
import type { TradeRecord } from '@/types/fund'

const router = useRouter()

const loading = ref(true)
const fundNavMap = ref<Map<string, number>>(new Map())

// 所有交易记录
const allTrades = ref<TradeRecord[]>([])

// 加载交易记录
async function loadTrades() {
  loading.value = true
  const trades = getTrades()
  
  // 按基金分组排序
  allTrades.value = trades.sort((a, b) => {
    // 先按基金代码分组，组内按时间倒序
    if (a.code !== b.code) return a.code.localeCompare(b.code)
    return b.createdAt - a.createdAt
  })
  
  // 获取每个基金的当前净值用于计算涨跌幅
  const fundCodes = [...new Set(trades.map(t => t.code))]
  const requests = fundCodes.map(async (code) => {
    try {
      const data = await fetchFundAccurateData(code)
      fundNavMap.value.set(code, data.nav || data.estimate || 0)
    } catch (e) {
      // 静默失败
    }
  })
  
  await Promise.all(requests)
  loading.value = false
}

// 按基金分组的交易记录
const groupedTrades = computed(() => {
  const groups = new Map<string, {
    code: string
    name: string
    trades: (TradeRecord & { postReturn: number })[]
  }>()

  allTrades.value.forEach(trade => {
    if (!groups.has(trade.code)) {
      groups.set(trade.code, {
        code: trade.code,
        name: trade.name,
        trades: []
      })
    }
    const group = groups.get(trade.code)!
    const currentNav = fundNavMap.value.get(trade.code) || 0
    const postReturn = currentNav > 0 && trade.netValue > 0
      ? ((currentNav - trade.netValue) / trade.netValue) * 100
      : 0
    group.trades.push({ ...trade, postReturn })
  })

  return Array.from(groups.values())
})

// 跳转详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
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

onMounted(() => {
  loadTrades()
})
</script>

<template>
  <div class="trade-center">
    <!-- 顶部标题 -->
    <div class="header">
      <span class="title-icon">📊</span>
      <span>交易记录</span>
      <span class="trade-count">{{ allTrades.length }}条</span>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
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
      <div 
        v-for="group in groupedTrades" 
        :key="group.code" 
        class="fund-card"
      >
        <!-- 第一行：基金名称 + code -->
        <div class="fund-header" @click="goToDetail(group.code)">
          <span class="fund-name">{{ group.name }}</span>
          <span class="fund-code">{{ group.code }}</span>
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
              <span class="trade-return" :class="trade.postReturn >= 0 ? 'up' : 'down'">
                {{ trade.postReturn >= 0 ? '+' : '' }}{{ trade.postReturn.toFixed(2) }}%
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
  gap: 8px;
  padding: 14px 16px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.title-icon {
  font-size: 20px;
}

.trade-count {
  font-size: 13px;
  font-weight: normal;
  color: var(--text-secondary);
  margin-left: auto;
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
  padding: 8px 12px 80px;
}

/* 基金卡片 */
.fund-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}

.fund-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
}

.fund-header:active {
  opacity: 0.7;
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
