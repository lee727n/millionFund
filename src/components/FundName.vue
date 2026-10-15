<template>
  <span class="fm-name" :class="nameClass" :title="title">{{ displayName }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFundUpdateStatus, type LiveIsNavEntry } from '@/composables/useFundUpdateStatus'

/**
 * [WHAT] 带「净值更新状态色」的基金名称展示组件（柔白=已更新 / 灰=未更新 / 灰=交易中）。
 * [WHY] 星标K线、持仓、量化观察、AI追踪 到处都要渲染「状态色的基金名」，抽成组件避免重复 markup + class 计算。
 * [HOW] 状态色由 useFundUpdateStatus.fundNameClass 计算；@click 等透传到根 span；
 *       class / style 等属性自动合并（如量化观察用的 .observe-name）。
 */
const props = withDefaults(defineProps<{
  code: string
  name?: string
  /** 名称截断长度，默认 8 */
  slice?: number
  /** 兜底实时数据（持仓已删、只剩星标快照的基金用它判断 isNav） */
  liveIsNavMap?: Map<string, LiveIsNavEntry>
}>(), {
  slice: 8
})

const { fundNameClass } = useFundUpdateStatus()

const nameClass = computed(() => fundNameClass(props.code, props.liveIsNavMap))
const displayName = computed(() => (props.name ?? props.code).slice(0, props.slice))
const title = computed(() => props.name ?? props.code)
</script>
