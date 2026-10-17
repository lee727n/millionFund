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
}>(), { width: 58, height: 18 })

const points = ref<{ t: number; v: number }[]>([])

function load() {
  points.value = getIntradaySeries(todayKey(), props.accountKey)
}

onMounted(load)
// [WHAT] 每次采样后（intradayTick 自增）重读并重绘
watch(intradayTick, load)

// 交易时段对应的分钟范围，用于把 x 轴映射到真实时间（缺口会如实显示在左侧）
const T_START = 570 // 9:30
const T_END = 900   // 15:00

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
  const pad = 1.5
  return pts.map((p, i) => {
    const x = pad + ((p.t - tLo) / tSpan) * (W - 2 * pad)
    const y = pad + (1 - (p.v - vMin) / vSpan) * (H - 2 * pad)
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
  const pad = 1.5
  return pad + (1 - (0 - vMin) / vSpan) * (H - 2 * pad)
})

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
.arc-empty {
  display: inline-block;
  border-radius: 2px;
  background: var(--bg-tertiary);
  opacity: 0.35;
}
</style>
