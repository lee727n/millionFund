// [WHY] Home.vue 测试共享状态
// [WHAT] 为 useHomeData mock 提供可修改的响应式状态

import { ref } from 'vue'
import type { MarketIndexSimple } from '@/api/fundFast'
import type { GlobalIndex } from '@/api/fundFast'
import type { TradingSession } from '@/api/tiantianApi'

export const indices = ref<MarketIndexSimple[]>([
  { code: '000001', name: '上证指数', current: 3200, change: 20, changePercent: 0.63 },
  { code: '399006', name: '创业板指', current: 2100, change: -10, changePercent: -0.48 },
])

export const globalIndices = ref<GlobalIndex[]>([
  { code: 'IXIC', name: '纳斯达克', price: 18000, changePercent: 1.2 },
])

export const tradingSession = ref<TradingSession>('closed')

export const currentTime = ref(new Date('2026-06-27T14:30:00'))

export const isRefreshing = ref(false)

export const loadIndices = () => {}

export const loadGlobalIndices = () => {}
