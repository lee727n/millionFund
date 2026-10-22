<script setup lang="ts">
// [WHAT] 账户头部的「当日收益曲线」小示意图：画在持仓进度条和市值之间
// [WHY] 用户想在每个账户里看到一条小曲线，展示当天账户收益率随时间的波动
// [DATA] 数据来自 utils/intradayReturn 的分钟级采样（仅在系统开启并刷新时记录）；
//        若某段交易时间没开系统，对应区间就没有采样点 —— 曲线左侧留白即代表该缺口。
import { computed, onMounted, ref, watch } from 'vue'
import { getIntradaySeries, intradayTick, todayKey } from '@/utils/intradayReturn'

const props = withDefaults(defineProps<{
  /** 账户 key：ali / TX / JD / other */
  accountKey: string
  width?: number
  height?: number
  /** 该账户昨日市值（= 当前市值 - 当日盈亏），用于由收益率反推盈亏金额；缺 a 字段的旧数据也能正确显示 */
  base?: number
}>(), { width: 72, height: 40, base: 0 })

const points = ref<{ t: number; v: number; a?: number }[]>([])

function load() {
  points.value = getIntradaySeries(todayKey(), props.accountKey)
}

onMounted(load)
// [WHAT] 每次采样后（intradayTick 自增）重读并重绘
watch(intradayTick, load)

// 交易时段对应的分钟范围，用于把 x 轴映射到真实时间（缺口会如实显示在左侧）
const T_START = 570 // 9:30
const T_END = 900   // 15:00

// 上下预留给「最高点 / 最低点」小字标签的高度
const LBL = 9

const hasData = computed(() => points.value.length >= 2)

const path = computed(() => {
  const pts = points.value
  if (pts.length < 2) return ''
  const ts = pts.map(p => p.t)
  const tLo = Math.min(...ts, T_START)
  const tHi = Math.max(...ts, T_END)
  const tSpan = tHi - tLo || 1
  const vs = pts.map(p => p.v)
  // y 轴把 0 基线包含进去，方便看穿越
  const vMin = Math.min(...vs, 0)
  const vMax = Math.max(...vs, 0)
  const vSpan = vMax - vMin || 1
  const W = props.width
  const H = props.height
  const xPad = 1.5
  const yTop = LBL
  const yBot = H - LBL
  return pts.map((p, i) => {
    const x = xPad + ((p.t - tLo) / tSpan) * (W - 2 * xPad)
    const y = yTop + (1 - (p.v - vMin) / vSpan) * (yBot - yTop)
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
  }).join(' ')
})

const baselineY = computed(() => {
  const pts = points.value
  if (pts.length < 2) return -1
  const vs = pts.map(p => p.v)
  const vMin = Math.min(...vs, 0)
  const vMax = Math.max(...vs, 0)
  const vSpan = vMax - vMin || 1
  const H = props.height
  const yTop = LBL
  const yBot = H - LBL
  return yTop + (1 - (0 - vMin) / vSpan) * (yBot - yTop)
})

// [WHAT] 采样点里的金额处理：
//   - 优先用采样点自带的 a 字段（精确记录的实际盈亏金额）
//   - 老数据没有 a 时（如本机今天盘中在加 a 字段之前就采的样），
//     用 base（昨日市值）× v/100 反推，效果一致，避免显示 0
//   - 既没 a 又没 base 才返回 null（不计入极值）
function toAmount(p: { t: number; v: number; a?: number }): number | null {
  if (typeof p.a === 'number') return p.a
  if (props.base > 0) return (p.v / 100) * props.base
  return null
}

// 当日收益曲线记录到的「最高 / 最低盈亏金额」（用于上下小字标签）
// [WHAT] 取采样点里的实际金额（a 或反推值），不再与 0 取上下限，所以全为负时也能正确显示 -几千
const maxAmt = computed(() => {
  const as = points.value.map(toAmount).filter((x): x is number => x !== null)
  return as.length ? Math.max(...as) : 0
})
const minAmt = computed(() => {
  const as = points.value.map(toAmount).filter((x): x is number => x !== null)
  return as.length ? Math.min(...as) : 0
})

// 金额格式化：带正负号 + 千分位 + 两位小数 + ¥
function fmtAmt(n: number): string {
  const sign = n < 0 ? '-' : n > 0 ? '+' : ''
  return `${sign}¥${Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const color = computed(() => {
  const pts = points.value
  if (!pts.length) return 'var(--text-muted)'
  // 末值 >= 0 视为涨（红），否则跌（绿）—— 与中国股市配色一致
  return pts[pts.length - 1].v >= 0 ? 'var(--color-up)' : 'var(--color-down)'
})
</script>

<template>
  <span
    class="account-return-curve"
    :title="hasData
      ? `今日收益曲线（${points.length} 个采样点 · 仅记录本机开启时段，未开启的区间留白）`
      : '今日收益曲线：开启系统并刷新后将开始记录'"
  >
    <svg v-if="hasData" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="arc-svg">
      <!-- 0 基线 -->
      <line
        v-if="baselineY >= 0"
        :x1="1"
        :y1="baselineY"
        :x2="width - 1"
        :y2="baselineY"
        stroke="var(--border-light)"
        stroke-width="0.5"
        stroke-dasharray="2 2"
      />
      <path :d="path" :stroke="color" fill="none" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" />
      <!-- 顶部 / 底部小字：记录到的最高 / 最低盈亏金额 -->
      <text class="arc-lbl" :x="width / 2" y="8" text-anchor="middle">{{ fmtAmt(maxAmt) }}</text>
      <text class="arc-lbl" :x="width / 2" :y="height - 2" text-anchor="middle">{{ fmtAmt(minAmt) }}</text>
    </svg>
    <span v-else class="arc-empty" :style="{ width: width + 'px', height: height + 'px' }"></span>
  </span>
</template>

<style scoped>
.account-return-curve {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  flex-shrink: 0;
}
.arc-svg {
  display: block;
}
.arc-lbl {
  fill: var(--text-muted);
  font-size: 7px;
  font-family: 'SF Mono', Consolas, monospace;
}
.arc-empty {
  display: inline-block;
  border-radius: 2px;
  background: var(--bg-tertiary);
  opacity: 0.35;
}
</style>
