<script setup lang="ts">
// [WHY] 星标K线页面：一行多个迷你走势图，方便对比
// [WHAT] 从 storage 读取星标列表，MiniKLineChart grid 布局展示
// [WHAT] 支持周期切换 + 单个移除

import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import MiniKLineChart from '@/components/MiniKLineChart.vue'
import { getStarredFunds, removeStarredFund } from '@/utils/storage'
import { showToast, showConfirmDialog } from 'vant'
import { useHoldingStore } from '@/stores/holding'

const router = useRouter()
const holdingStore = useHoldingStore()

// ========== 刷新状态 ==========
const refreshing = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function handleRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await holdingStore.refreshEstimates()
    showToast('已刷新')
  } catch (err) {
    console.error('[StarKLine] 刷新失败:', err)
  } finally {
    refreshing.value = false
  }
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshTimer = setInterval(() => {
    handleRefresh()
  }, 60000)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// ========== 状态 ==========
const starredList = ref<string[]>([])
const activePeriod = ref<'1m' | '3m' | '6m' | '1y'>('3m')
const periodTabs = [
  { key: '1m', label: '1月' },
  { key: '3m', label: '3月' },
  { key: '6m', label: '6月' },
  { key: '1y', label: '1年' },
] as const

// ========== 持仓数据（用于获取基金名称和市值） ==========
const holdingsMap = computed(() => {
  const m = new Map<string, any>()
  for (const h of holdingStore.holdings || []) {
    m.set(h.code, h)
  }
  return m
})

// [FIX] 缓存每个基金的展示信息，确保 props 响应式更新
const fundInfoMap = computed(() => {
  const m = new Map<string, { name: string; marketValue?: number; returnRate?: number; costNavValue?: number }>()
  for (const code of starredList.value) {
    const h = holdingsMap.value.get(code)
    if (!h) {
      m.set(code, { name: '', marketValue: undefined, returnRate: undefined, costNavValue: undefined })
    } else {
      m.set(code, {
        name: h.name || h.code,
        marketValue: h.marketValue,
        returnRate: h.profitRate,
        costNavValue: h.buyNetValue,
      })
    }
  }
  return m
})

// ========== 加载星标列表 ==========
function refresh() {
  starredList.value = [...getStarredFunds()]
}

// ========== 移除某个星标 ==========
async function handleRemove(code: string) {
  try {
    await showConfirmDialog({
      title: '移除星标',
      message: `确定将 ${code} 从星标K线中移除？`,
      confirmButtonText: '移除',
      confirmButtonColor: '#f6465d',
    })
    removeStarredFund(code)
    showToast('已移除')
    refresh()
  } catch { /* 取消 */ }
}

// ========== 跳转到 Detail ==========
function goDetail(code: string) {
  router.push(`/detail/${code}`)
}

// [FIX] 确保 holdingStore 初始化完成后再渲染图表
const isReady = ref(false)

onMounted(async () => {
  refresh()
  // 初始化持仓数据，否则刷新页面后 holdingStore 为空
  if (holdingStore.holdings.length === 0) {
    await holdingStore.initHoldings()
  }
  isReady.value = true
  startAutoRefresh()
})
onActivated(async () => {
  refresh()
  if (holdingStore.holdings.length === 0) {
    await holdingStore.initHoldings()
  }
  isReady.value = true
  startAutoRefresh()
})
onDeactivated(() => {
  stopAutoRefresh()
})
onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="star-kline-page">
    <!-- 单行顶栏：返回 | 标题+数量 | 周期切换分段 -->
    <div class="sk-header">
      <button class="sk-back" @click="router.back()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div class="sk-title-wrap">
        <span class="sk-title">K线全景</span>
        <span class="sk-count" v-if="starredList.length">{{ starredList.length }}</span>
      </div>
      <button class="sk-refresh-btn" :class="{ spinning: refreshing }" @click="handleRefresh" :disabled="refreshing">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
        </svg>
      </button>
      <div class="sk-seg">
        <button
          v-for="t in periodTabs"
          :key="t.key"
          class="sk-seg-btn"
          :class="{ active: activePeriod === t.key }"
          @click="activePeriod = t.key"
        >{{ t.label }}</button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="starredList.length === 0" class="sk-empty">
      <div class="sk-empty-icon">★</div>
      <div class="sk-empty-text">还没有星标基金</div>
      <div class="sk-empty-hint">在首页或全景面板长按基金卡片，点击"星标"即可添加</div>
      <button class="sk-empty-btn" @click="router.back()">去主页看看</button>
    </div>

    <!-- K线 grid -->
    <div v-else class="sk-grid">
      <div v-for="code in starredList" :key="code" class="sk-item">
        <!-- 右上角控制按钮 -->
        <div class="sk-item-controls">
          <button class="sk-ctrl-btn" @click="goDetail(code)" title="查看详情">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <button class="sk-ctrl-btn remove" @click="handleRemove(code)" title="移除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <!-- [FIX] 使用 fundInfoMap 确保响应式更新 -->
        <MiniKLineChart
          v-if="isReady"
          :fund-code="code"
          :period="activePeriod"
          :fund-name="fundInfoMap.get(code)?.name || ''"
          :market-value="fundInfoMap.get(code)?.marketValue"
          :return-rate="fundInfoMap.get(code)?.returnRate"
          :cost-nav-value="fundInfoMap.get(code)?.costNavValue"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.star-kline-page {
  min-height: 100vh;
  background: #1a1d24;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ========== 单行顶栏 ========== */
.sk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 42px;
  padding-top: calc(var(--status-bar-height, 0px));
  background: #1a1d24;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  position: sticky; top: 0; z-index: 100;
}

.sk-back {
  background: none; border: none; cursor: pointer;
  color: #eaecef; padding: 4px;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  border-radius: 6px;
}
.sk-back:hover { background: rgba(255,255,255,0.08); }

.sk-title-wrap {
  display: flex; align-items: baseline; gap: 8px;
  flex: 1; justify-content: center;
  min-width: 0;
}
.sk-title {
  font-size: 15px; font-weight: 600;
  color: #eaecef;
  letter-spacing: 0.5px;
}
.sk-count {
  font-size: 11px; color: #4d8bff; font-weight: 600;
  background: rgba(77,139,255,0.18);
  padding: 1px 7px; border-radius: 8px;
}

/* ========== 周期分段控件 ========== */
.sk-seg {
  display: flex;
  background: rgba(255,255,255,0.06);
  border-radius: 6px;
  padding: 2px;
  gap: 1px;
  height: 26px;
  flex-shrink: 0;
}
.sk-seg-btn {
  padding: 0 10px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #848e9c;
  cursor: pointer;
  border-radius: 4px;
  line-height: 22px;
  transition: all 0.15s;
}
.sk-seg-btn:hover { color: #c0c6d0; }
.sk-seg-btn.active {
  background: #2a2f38;
  color: #4d8bff;
  font-weight: 600;
}

/* ========== 刷新按钮 ========== */
.sk-refresh-btn {
  background: none; border: none; cursor: pointer;
  color: #848e9c; padding: 4px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  border-radius: 6px;
  transition: color 0.2s;
}
.sk-refresh-btn:hover { color: #4d8bff; }
.sk-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sk-refresh-btn.spinning {
  animation: sk-spin 1s linear infinite;
}
@keyframes sk-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ========== 空状态 ========== */
.sk-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 20px; text-align: center;
}
.sk-empty-icon {
  font-size: 48px; color: #3a3f4b; margin-bottom: 12px;
}
.sk-empty-text {
  font-size: 15px; color: #eaecef; margin-bottom: 6px;
}
.sk-empty-hint {
  font-size: 12px; color: #848e9c;
  max-width: 260px; line-height: 1.6; margin-bottom: 16px;
}
.sk-empty-btn {
  padding: 7px 20px;
  background: #4d8bff; color: #fff; border: none; border-radius: 16px;
  font-size: 13px; cursor: pointer;
}

/* ========== Grid ========== */
.sk-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
  align-content: start;
}
@media (max-width: 900px) {
  .sk-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .sk-grid { grid-template-columns: 1fr; }
}

.sk-item {
  position: relative;
  aspect-ratio: 16 / 9;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #22262f;
  border: 1px solid rgba(255,255,255,0.06);
}

.sk-item :deep(.mini-kline) {
  min-height: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}

.sk-item :deep(.mini-kline-canvas-wrap) {
  min-height: 0 !important;
}

.sk-item-controls {
  position: absolute;
  top: 2px; right: 42px;
  display: flex; gap: 2px; z-index: 5;
  opacity: 0;
  transition: opacity 0.2s;
}
.sk-item:hover .sk-item-controls,
.sk-item:focus-within .sk-item-controls { opacity: 1; }

.sk-ctrl-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(26,29,36,0.85);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px; cursor: pointer;
  color: #c0c6d0; padding: 0;
}
.sk-ctrl-btn:hover { background: #1a1d24; color: #eaecef; }
.sk-ctrl-btn.remove:hover { color: #f6465d; border-color: #f6465d; }

.sk-item :deep(.mini-kline-header) { display: none; }
</style>
