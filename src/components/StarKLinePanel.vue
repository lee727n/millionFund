<script setup lang="ts">
// [WHY] 星标K线要同时出现在「独立星标页」和「全景大屏第二列」，逻辑不该写两份
// [WHAT] 本组件只负责：读星标列表 → 周期切换 → 用 MiniKLineChart 铺网格
// [WHAT] 估值/净值由 useFundValuation（或父层传入的 liveData）统一提供，本组件不做二次判定，
//        只把 { currentValue, dayChange, isNav } 透传给 MiniKLineChart

import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import MiniKLineChart from './MiniKLineChart.vue'
import { getStarredFunds, removeStarredFund } from '@/utils/storage'
import { showToast, showConfirmDialog } from 'vant'
import { useHoldingStore } from '@/stores/holding'
import { useFundValuation, type FundValuationData } from '@/composables/useFundValuation'

type Period = '1m' | '3m' | '6m' | '1y'

const props = withDefaults(defineProps<{
  /** 每行几个图：全景大屏 2 个，独立页 3 个 */
  columns?: number
  /** 当前周期（支持 v-model:period） */
  period?: Period
  /** 是否显示默认顶部工具条。父层要用自己的头部（全景大屏）就传 #toolbar 插槽 */
  showToolbar?: boolean
  /** 每个图右上角的「详情 / 移除」按钮 */
  showControls?: boolean
  /**
   * [WHAT] 是否显示「详情（放大）」按钮；关掉后只剩「移除」
   * [WHY] 手机版卡片只有 186px 宽，两个按钮吃掉 48px，把右上角挡得死死的；
   *       而且手机上点小图标容易误触，只留一个「移除」更符合触屏习惯
   */
  showDetail?: boolean
  /**
   * [WHAT] 默认工具条上的刷新按钮
   * [WHY] 全景大屏有自己的全局刷新按钮，这里再放一个就是两个入口，关掉
   */
  showRefresh?: boolean
  /** [WHAT] 图上是否画持仓市值；全景大屏列窄且左列已有市值，关掉 */
  showMarketValue?: boolean
  /** [WHAT] 点详情时新开窗口（全景大屏用，避免把大屏页面顶掉）；默认站内跳转 */
  openInNewTab?: boolean
  /** dark = 固定深色；auto = 跟随全局主题 */
  colorScheme?: 'dark' | 'auto'
  /** 单个图表的宽高比 */
  aspectRatio?: string
  /**
   * [WHAT] > 0 时改用 auto-fill 自适应列数（每个图至少这么宽），忽略 columns
   * [WHY] 独立星标页是全屏的，一行放几个应该随窗口宽度变化；全景大屏则是固定 2 个
   */
  minItemWidth?: number
  /**
   * [WHAT] 父层已加载好的实时数据（全景大屏复用自己的 liveFundData）
   * [WHY] 全景大屏每 60s 已经拉过一次全量估值，K线列不传就会再多一轮请求
   */
  liveData?: Map<string, FundValuationData> | null
}>(), {
  columns: 2,
  period: '3m',
  showToolbar: true,
  showControls: true,
  showDetail: true,
  showRefresh: true,
  showMarketValue: true,
  openInNewTab: false,
  colorScheme: 'dark',
  aspectRatio: '16 / 10',
  liveData: null,
  minItemWidth: 0,
})

const emit = defineEmits<{ 'update:period': [Period] }>()

const router = useRouter()
const holdingStore = useHoldingStore()
// [WHAT] 只有父层没给 liveData 时才自己拉一份（独立星标页就是这种用法）
const ownValuation = useFundValuation()

const periodTabs = [
  { key: '1m', label: '1月' },
  { key: '3m', label: '3月' },
  { key: '6m', label: '6月' },
  { key: '1y', label: '1年' },
] as const

// ========== 状态 ==========
const starredList = ref<string[]>([])
const activePeriod = ref<Period>(props.period)
const refreshing = ref(false)
const isReady = ref(false)
/** [WHAT] 递增它就能强制所有图表重挂载（手动刷新时用） */
const reloadTick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

watch(() => props.period, v => { activePeriod.value = v })
watch(activePeriod, v => emit('update:period', v))

// ========== 实时数据（估值 / 净值）==========
const liveMap = computed(() => props.liveData ?? ownValuation.liveFundData.value)

function realtimeFor(code: string): { currentValue: number; dayChange: number; isNav: boolean } | null {
  const d = liveMap.value.get(code)
  if (!d || !(d.currentValue > 0)) return null
  return { currentValue: d.currentValue, dayChange: d.dayChange ?? 0, isNav: d.isNav }
}

/**
 * [WHAT] 当前这一屏用的到底是估值还是净值（给工具条显示用）
 * [WHY] 用户要能一眼看出延线点的数据来源；只要有任一只是估值就显示「估值」
 */
const valueBasis = computed(() => {
  let nav = 0
  let est = 0
  for (const code of starredList.value) {
    const d = liveMap.value.get(code)
    if (!d || !(d.currentValue > 0)) continue
    if (d.isNav) nav++
    else est++
  }
  if (nav === 0 && est === 0) return ''
  return est > 0 ? '估值' : '净值'
})

// ========== 持仓信息（名称 / 市值 / 收益率 / 成本净值）==========
const fundInfoMap = computed(() => {
  const m = new Map<string, { name: string; marketValue?: number; returnRate?: number; costNavValue?: number }>()
  const holdings = new Map<string, any>((holdingStore.holdings || []).map((h: any) => [h.code, h]))
  for (const code of starredList.value) {
    const h = holdings.get(code)
    m.set(code, h
      ? {
          name: h.name || h.code,
          marketValue: h.marketValue,
          returnRate: h.profitRate,
          costNavValue: h.buyNetValue,
        }
      : { name: '' })
  }
  return m
})

// ========== 列表 / 数据加载 ==========
// [WHAT] 账户分组顺序：支付宝 → 腾讯 → 京东 → 其他 → 量化观察
// [WHY] 默认按星标添加顺序会把不同账户的基金穿插在一起，扫一眼看不出哪只属于哪个账户；
//       改成按账户分组后，与左侧持仓列（PanoramaDashboard 的 aliHoldings / txHoldings /
//       jdHoldings / otherHoldings）同一口径，左右两列上下顺序能对齐
// [NOTE] source 取值见 PanoramaDashboard 的账户单选：ali=支付宝 / TX=腾讯 / JD=京东 / observe=量化观察
const ACCOUNT_RANK: Record<string, number> = { ali: 0, TX: 1, JD: 2, observe: 4 }
const RANK_OTHER = 3

function accountRank(source?: string): number {
  if (!source) return RANK_OTHER
  return ACCOUNT_RANK[source] ?? RANK_OTHER
}

function todayChangeOf(h: any): number {
  const v = parseFloat(h?.todayChange || '0')
  return Number.isFinite(v) ? v : 0
}

/**
 * [WHAT] 星标列表重排：先按账户分组，组内按当日涨幅降序（与左侧 sortByChange 同口径），
 *       涨幅相同则兜底保留星标添加顺序
 * [EDGE] 星标了但不在持仓里的基金没有 source，统一归到「其他」组
 */
function sortStarredByAccount(codes: string[]): string[] {
  const holdings = new Map<string, any>(
    (holdingStore.holdings || []).map((h: any) => [h.code, h])
  )
  return codes
    .map((code, i) => ({ code, i, h: holdings.get(code) }))
    .sort((a, b) => {
      const ra = accountRank(a.h?.source)
      const rb = accountRank(b.h?.source)
      if (ra !== rb) return ra - rb
      const d = todayChangeOf(b.h) - todayChangeOf(a.h)
      if (d !== 0) return d
      return a.i - b.i
    })
    .map(x => x.code)
}

function refreshList() {
  starredList.value = sortStarredByAccount([...getStarredFunds()])
}

async function ensureHoldings() {
  if (holdingStore.holdings.length === 0) {
    await holdingStore.initHoldings()
  }
}

/** [WHAT] 拉取星标基金的实时数据；父层给了 liveData 就交给父层，不重复请求 */
async function loadRealtime(force = false) {
  if (props.liveData) return
  const codes = starredList.value
  if (codes.length === 0) return
  await ownValuation.loadFundData(codes, force)
}

async function boot() {
  refreshList()
  await ensureHoldings()
  // [FIX] 持仓是异步加载的：第一次 refreshList 时 holdings 还是空的，取不到 source，
  //       会全被当成「其他」组。加载完必须再排一次
  refreshList()
  await loadRealtime()
  isReady.value = true
}

/**
 * [WHAT] 重读星标列表 + 让所有图表重挂载（历史净值会重新拉）
 * [WHY] 供全景大屏的全局刷新按钮调用，做到「一个刷新入口，K线列跟着刷」
 * [EDGE] 不弹 toast：父层已经有自己的刷新反馈
 */
function reloadCharts() {
  refreshList()
  reloadTick.value++
}

async function handleRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    refreshList()
    await loadRealtime(true)
    reloadTick.value++
    showToast('已刷新')
  } catch (err) {
    console.error('[StarKLinePanel] 刷新失败:', err)
  } finally {
    refreshing.value = false
  }
}

function setPeriod(p: Period) {
  activePeriod.value = p
}

// [WHAT] 暴露给父层：全景大屏刷新时调用 refresh() 即可
defineExpose({ refresh: reloadCharts })

function startAutoRefresh() {
  stopAutoRefresh()
  if (props.liveData) return  // 父层有自己的刷新周期
  timer = setInterval(() => { loadRealtime(true) }, 60000)
}
function stopAutoRefresh() {
  if (timer) { clearInterval(timer); timer = null }
}

// [WHAT] 星标在别处（首页 / 全景持仓卡片）被增删时，这里要跟着变
function onStarredChanged() {
  refreshList()
  loadRealtime()
}

// [WHAT] 持仓的「账户归属 + 当日涨幅」指纹
// [WHY] 用户在别处改了某只基金的账户、或者估值刷新导致涨幅变化时，
//       排序要跟着变，否则会和左侧持仓列顺序对不上
// [NOTE] 只取排序用到的三个字段，避免持仓任何字段变动都触发重排
const orderSignature = computed(() =>
  (holdingStore.holdings || [])
    .map(h => `${h.code}:${h.source || ''}:${todayChangeOf(h)}`)
    .join('|')
)
watch(orderSignature, () => { refreshList() })

// ========== 操作 ==========
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
    refreshList()
  } catch { /* 取消 */ }
}

function goDetail(code: string) {
  // [WHAT] 全景大屏里用新窗口打开，避免把大屏页面顶掉；独立页仍是站内跳转
  if (props.openInNewTab) {
    window.open(`/detail/${code}`, '_blank')
    return
  }
  router.push(`/detail/${code}`)
}

// ========== 生命周期 ==========
onMounted(async () => {
  window.addEventListener('starred-funds-changed', onStarredChanged)
  await boot()
  startAutoRefresh()
})
onActivated(async () => {
  refreshList()
  await ensureHoldings()
  refreshList() // 同上：持仓加载完按账户重排
  isReady.value = true
  startAutoRefresh()
})
onDeactivated(() => stopAutoRefresh())
onUnmounted(() => {
  window.removeEventListener('starred-funds-changed', onStarredChanged)
  stopAutoRefresh()
})

// ========== 布局 ==========
/**
 * [WHAT] 右上角悬浮按钮实际占掉的宽度，传给 MiniKLineChart 让它把信息条和 Y 轴顶部刻度让开
 * [WHY] 按钮是绝对定位盖在 canvas 上的，canvas 自己量不到；父层按按钮数算好传下去，
 *       两边不会各算各的。改动按钮数量/尺寸时只动这一处。
 * [HOW] .skp-ctrl-btn 22px、间距 2px、容器 right:2px，再留 2px 呼吸
 */
const controlReserve = computed(() => {
  if (!props.showControls) return 0
  const n = (props.showDetail ? 1 : 0) + 1 // 详情（可选）+ 移除
  return 2 + n * 22 + (n - 1) * 2 + 2
})

const gridStyle = computed(() => ({
  gridTemplateColumns: props.minItemWidth > 0
    ? `repeat(auto-fill, minmax(${props.minItemWidth}px, 1fr))`
    : `repeat(${Math.max(1, props.columns)}, minmax(0, 1fr))`,
}))
const itemStyle = computed(() => ({ aspectRatio: props.aspectRatio }))
</script>

<template>
  <div class="skp" :class="{ 'skp-dark': colorScheme === 'dark' }">
    <!--
      头部：默认渲染自带工具条；父层（全景大屏）可以传 #toolbar 换成自己的一行头部，
      作用域参数给到周期、数量、估值/净值基准，避免父层再写一套状态
    -->
    <slot
      name="toolbar"
      :period="activePeriod"
      :set-period="setPeriod"
      :count="starredList.length"
      :value-basis="valueBasis"
      :refresh="reloadCharts"
      :force-refresh="handleRefresh"
    >
      <div v-if="showToolbar" class="skp-toolbar">
        <span class="skp-count">★ {{ starredList.length }}</span>
        <span v-if="valueBasis" class="skp-basis" :class="valueBasis === '估值' ? 'est' : 'nav'">{{ valueBasis }}</span>
        <span class="skp-spacer"></span>
        <button
          v-if="showRefresh"
          class="skp-btn"
          :class="{ spinning: refreshing }"
          @click="handleRefresh"
          :disabled="refreshing"
          title="刷新"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        </button>
        <div class="skp-seg">
          <button
            v-for="t in periodTabs"
            :key="t.key"
            class="skp-seg-btn"
            :class="{ active: activePeriod === t.key }"
            @click="activePeriod = t.key"
          >{{ t.label }}</button>
        </div>
      </div>
    </slot>

    <!-- 图表区 -->
    <div class="skp-body">
      <div v-if="starredList.length === 0" class="skp-empty">
        <div class="skp-empty-icon">★</div>
        <div class="skp-empty-text">还没有星标基金</div>
        <div class="skp-empty-hint">长按基金卡片，点击"星标"即可添加</div>
      </div>

      <div v-else class="skp-grid" :style="gridStyle">
        <div v-for="code in starredList" :key="code" class="skp-item" :style="itemStyle">
          <div v-if="showControls" class="skp-item-controls">
            <button v-if="showDetail" class="skp-ctrl-btn" @click="goDetail(code)" title="查看详情">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
            <button class="skp-ctrl-btn remove" @click="handleRemove(code)" title="移除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <MiniKLineChart
            v-if="isReady"
            :key="code + '-' + reloadTick"
            :fund-code="code"
            :period="activePeriod"
            :fund-name="fundInfoMap.get(code)?.name || ''"
            :market-value="showMarketValue ? fundInfoMap.get(code)?.marketValue : undefined"
            :return-rate="fundInfoMap.get(code)?.returnRate"
            :cost-nav-value="fundInfoMap.get(code)?.costNavValue"
            :realtime="realtimeFor(code)"
            :color-scheme="colorScheme"
            :top-right-reserve="controlReserve"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* [WHAT] 两套配色：dark 给独立星标页（深底），默认走主题变量给全景大屏 */
.skp {
  --skp-bg: var(--bg-secondary, #fff);
  --skp-surface: var(--bg-tertiary, #f5f6f8);
  --skp-text: var(--text-primary, #1f2329);
  --skp-muted: var(--text-secondary, #8b939e);
  --skp-border: var(--border-light, #e5e7eb);
  --skp-active: var(--color-primary, #3b82f6);

  display: flex;
  flex-direction: column;
  /* [WHAT] 撑满父容器并让内部 .skp-body 自己滚动：全景大屏列高固定，独立页是全屏 */
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.skp-dark {
  --skp-bg: #1a1d24;
  --skp-surface: rgba(255, 255, 255, 0.06);
  --skp-text: #eaecef;
  --skp-muted: #848e9c;
  --skp-border: rgba(255, 255, 255, 0.08);
  --skp-active: #4d8bff;
}

/* ========== 工具条 ========== */
.skp-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--skp-border);
  flex-shrink: 0;
}

.skp-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--skp-active);
  background: var(--skp-surface);
  padding: 1px 7px;
  border-radius: 8px;
}

.skp-basis {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--skp-border);
  color: var(--skp-muted);
}
/* [WHAT] 直接写死 rgba，不用 color-mix —— Android WebView 的老版本不认 */
.skp-basis.est { color: #f0a020; border-color: rgba(240, 160, 32, 0.4); }
.skp-basis.nav { color: #12b886; border-color: rgba(18, 184, 134, 0.4); }

.skp-spacer { flex: 1; }

.skp-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  color: var(--skp-muted);
  padding: 0;
}
.skp-btn:hover { color: var(--skp-active); background: var(--skp-surface); }
.skp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.skp-btn.spinning { animation: skp-spin 1s linear infinite; }
@keyframes skp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.skp-seg {
  display: flex;
  background: var(--skp-surface);
  border-radius: 6px;
  padding: 2px;
  gap: 1px;
  height: 22px;
}
.skp-seg-btn {
  padding: 0 8px;
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--skp-muted);
  cursor: pointer;
  border-radius: 4px;
  line-height: 18px;
  transition: all 0.15s;
}
.skp-seg-btn:hover { color: var(--skp-text); }
.skp-seg-btn.active {
  background: var(--skp-bg);
  color: var(--skp-active);
  font-weight: 600;
}

/* ========== 图表区 ========== */
.skp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.skp-grid {
  display: grid;
  gap: 8px;
  align-content: start;
}

.skp-item {
  position: relative;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--skp-surface);
  border: 1px solid var(--skp-border);
  /* [WHAT] 小图不需要 MiniKLineChart 默认的 220px，交给外层宽高比决定 */
  --mini-kline-min-height: 0px;
  --mini-kline-canvas-min-height: 0px;
}

.skp-item :deep(.mini-kline) {
  border: none;
  border-radius: 0;
}
/* [WHAT] MiniKLineChart 自带的 header 与工具条重复，隐藏掉 */
.skp-item :deep(.mini-kline-header) { display: none; }

.skp-item-controls {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 2px;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.2s;
}
.skp-item:hover .skp-item-controls,
.skp-item:focus-within .skp-item-controls { opacity: 1; }

/* [WHY] 触屏没有 hover，上面的规则在手机上永远不成立 → 「详情 / 移除」按钮点不到。
        hover: none 直接常显，顺带让手机版星标页也能删星标。 */
@media (hover: none) {
  .skp-item-controls { opacity: 1; }
}

.skp-ctrl-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  cursor: pointer;
  color: #eaecef;
  padding: 0;
}
.skp-ctrl-btn:hover { color: #fff; background: rgba(0, 0, 0, 0.75); }
.skp-ctrl-btn.remove:hover { color: #f6465d; border-color: #f6465d; }

/* ========== 空状态 ========== */
.skp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  text-align: center;
}
.skp-empty-icon { font-size: 36px; color: var(--skp-border); margin-bottom: 10px; }
.skp-empty-text { font-size: 14px; color: var(--skp-text); margin-bottom: 6px; }
.skp-empty-hint { font-size: 12px; color: var(--skp-muted); line-height: 1.6; }

/* 滚动条 */
.skp-body::-webkit-scrollbar { width: 6px; }
.skp-body::-webkit-scrollbar-track { background: transparent; }
.skp-body::-webkit-scrollbar-thumb { background: var(--skp-border); border-radius: 3px; }
</style>
