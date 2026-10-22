<template>
  <div class="its-chart" :class="{ 'is-compact': isCompact }" ref="containerRef">
    <svg v-if="hasData" :viewBox="`0 0 ${w} ${h}`" class="its-svg">
      <!-- 昨收基准线 (0%) -->
      <line class="its-zero" :x1="padL" :y1="yZero" :x2="w - padR" :y2="yZero" />
      <!-- 均价线 -->
      <polyline v-if="avgPath" class="its-avg" :points="avgPath" />
      <!-- 价格分时主线 -->
      <polyline class="its-price" :class="up ? 'up' : 'down'" :points="pricePath" />
      <!-- 最新点 -->
      <circle class="its-dot" :class="up ? 'up' : 'down'" :cx="lastX" :cy="lastY" r="3.5" />

      <!-- Y 轴百分比标签（右侧，仅完整模式） -->
      <template v-if="!isCompact">
        <text class="its-y" :x="w - padR + 6" :y="padT + 4">{{ maxPct.toFixed(2) }}%</text>
        <text class="its-y its-y-zero" :x="w - padR + 6" :y="yZero + 3">0.00%</text>
        <text class="its-y" :x="w - padR + 6" :y="h - padB + 2">{{ minPct.toFixed(2) }}%</text>

        <!-- X 轴时间标签 -->
        <text class="its-x" :x="padL" :y="h - 4" text-anchor="start">09:30</text>
        <text class="its-x" :x="gapX" :y="h - 4" text-anchor="middle">11:30 / 13:00</text>
        <text class="its-x" :x="w - padR" :y="h - 4" text-anchor="end">15:00</text>
      </template>
    </svg>
    <div v-else class="its-empty">
      <span v-if="loading && !isCompact">加载分时数据中…</span>
      <span v-else-if="!isCompact">暂无分时数据（可能未开盘或非交易日）</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'

interface Point { time: string; price: number; avgPrice: number }

const props = withDefaults(defineProps<{
  points: Point[]
  preClose: number
  loading?: boolean
  compact?: boolean
}>(), { loading: false, compact: false })

const containerRef = ref<HTMLElement | null>(null)
const size = reactive({ w: 600, h: 150 })
let ro: ResizeObserver | null = null

onMounted(() => {
  const el = containerRef.value
  if (el) {
    size.w = el.clientWidth || 600
    size.h = el.clientHeight || 150
    // 容器尺寸确定后再读一次，避免首帧 clientWidth 为 0
    nextTick(() => { if (el) { size.w = el.clientWidth || size.w; size.h = el.clientHeight || size.h } })
    ro = new ResizeObserver(entries => {
      for (const e of entries) {
        size.w = e.contentRect.width
        size.h = e.contentRect.height
      }
    })
    ro.observe(el)
  }
})
onUnmounted(() => ro?.disconnect())

const isCompact = computed(() => props.compact)
const padL = computed(() => isCompact.value ? 3 : 10)
const padR = computed(() => isCompact.value ? 3 : 56)
const padT = computed(() => isCompact.value ? 4 : 12)
const padB = computed(() => isCompact.value ? 4 : 22)

const w = computed(() => size.w)
const h = computed(() => size.h)
const plotW = computed(() => Math.max(10, w.value - padL.value - padR.value))
const plotH = computed(() => Math.max(10, h.value - padT.value - padB.value))
const gapX = computed(() => padL.value + 0.5 * plotW.value)

const hasData = computed(() => props.points.length > 1)
const lastPrice = computed(() =>
  props.points.length ? props.points[props.points.length - 1].price : props.preClose
)
// 当日涨跌决定整条线颜色（涨红跌绿，中国习惯）
const up = computed(() => lastPrice.value >= props.preClose)

function toPct(v: number): number {
  return (v - props.preClose) / (props.preClose || 1) * 100
}

// 百分比区间（含 0 基准与均价），用于 Y 轴缩放
const maxPct = computed(() => {
  let m = 0
  for (const p of props.points) {
    m = Math.max(m, toPct(p.price), p.avgPrice > 0 ? toPct(p.avgPrice) : -Infinity)
  }
  return m
})
const minPct = computed(() => {
  let m = 0
  for (const p of props.points) {
    m = Math.min(m, toPct(p.price), p.avgPrice > 0 ? toPct(p.avgPrice) : Infinity)
  }
  return m
})
const span = computed(() => Math.max(maxPct.value - minPct.value, 0.02))
const topPct = computed(() => maxPct.value + span.value * 0.15)
const botPct = computed(() => minPct.value - span.value * 0.15)

function xOf(time: string): number {
  const [hh, mm] = time.split(':').map(Number)
  let mt: number
  if (hh < 12) mt = (hh - 9) * 60 + (mm - 30)        // 09:30 -> 0
  else mt = 120 + (hh - 13) * 60 + mm                // 13:00 -> 120
  if (mt < 0) mt = 0
  if (mt > 240) mt = 240
      // 上午占左侧 48%，下午占右侧 48%，中间留 4% 表现午休断层
  const frac = mt <= 120 ? (mt / 120) * 0.48 : 0.52 + ((mt - 120) / 120) * 0.48
  return padL.value + frac * plotW.value
}

function yOf(pct: number): number {
  const t = (topPct.value - pct) / (topPct.value - botPct.value)
  return padT.value + t * plotH.value
}

const pricePath = computed(() => props.points
  .map(p => `${xOf(p.time).toFixed(1)},${yOf(toPct(p.price)).toFixed(1)}`)
  .join(' '))

const avgPath = computed(() => {
  const pts = props.points.filter(p => p.avgPrice > 0)
  if (pts.length < 2) return ''
  return pts.map(p => `${xOf(p.time).toFixed(1)},${yOf(toPct(p.avgPrice)).toFixed(1)}`).join(' ')
})

const yZero = computed(() => yOf(0))
const lastX = computed(() =>
  props.points.length ? xOf(props.points[props.points.length - 1].time) : padL.value)
const lastY = computed(() => yOf(toPct(lastPrice.value)))
</script>

<style scoped>
.its-chart { width: 100%; height: 100%; position: relative; }
.its-svg { width: 100%; height: 100%; display: block; }
.its-zero { stroke: var(--border-light); stroke-dasharray: 4 4; stroke-width: 1; }
.its-avg { stroke: var(--text-secondary, #8a8f99); stroke-width: 1; stroke-dasharray: 3 3; fill: none; opacity: 0.7; }
.its-price { stroke-width: 1.6; fill: none; }
.its-price.up { stroke: var(--color-up); }
.its-price.down { stroke: var(--color-down); }
.its-dot { stroke: #fff; stroke-width: 1; }
.its-dot.up { fill: var(--color-up); }
.its-dot.down { fill: var(--color-down); }
.its-y { fill: var(--text-muted); font-size: 10px; font-family: 'SF Mono', Consolas, monospace; }
.its-y-zero { fill: var(--text-secondary, #8a8f99); }
.its-x { fill: var(--text-muted); font-size: 10px; font-family: 'SF Mono', Consolas, monospace; }
.its-empty {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted); font-size: 12px;
}
.its-chart.is-compact .its-empty { font-size: 10px; }
</style>
