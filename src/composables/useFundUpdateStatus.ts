import { ref, onMounted, onUnmounted } from 'vue'
import { getTradingSession, type TradingSession } from '@/api/tiantianApi'
import { useHoldingStore } from '@/stores/holding'

export type FundUpdateState = 'pending' | 'updated' | 'not-updated'

export interface LiveIsNavEntry {
  isNav?: boolean
}

/**
 * [WHAT] 基金「净值是否已更新」状态的共享组合式（组件化复用核心）。
 *        交易时间内=灰(pending) / 已更新=柔白(updated，比纯白暗、不刺眼) / 未更新=灰(not-updated，与交易中同色)。
 * [WHY] 原逻辑分散在 StarKLinePanel.fundUpdateStatus 与 PanoramaDashboard.getFundNameClass 两处各自实现、
 *        各自起定时器，改动容易不同步。抽到此处后：星标K线 / 持仓 / 量化观察 / AI追踪 全部复用同一套判断。
 * [HOW] tradingSession 用模块级单例 + 引用计数共享一个 30s 定时器，避免每个组件各起一个 interval；
 *       判定优先级：交易中→pending；否则优先看持仓 holding.isUpdated，无持仓再回退到 liveMap.isNav。
 */
const tradingSession = ref<TradingSession>('closed')
let sessionTimer: ReturnType<typeof setInterval> | null = null
let refCount = 0

function refreshSession() {
  tradingSession.value = getTradingSession()
}

function acquireSession() {
  refCount++
  if (sessionTimer == null) {
    refreshSession()
    sessionTimer = setInterval(refreshSession, 30000)
  }
}

function releaseSession() {
  refCount = Math.max(0, refCount - 1)
  if (refCount === 0 && sessionTimer != null) {
    clearInterval(sessionTimer)
    sessionTimer = null
  }
}

export function useFundUpdateStatus() {
  const holdingStore = useHoldingStore()

  onMounted(() => acquireSession())
  onUnmounted(() => releaseSession())

  function inTrading(): boolean {
    return tradingSession.value === 'morning' || tradingSession.value === 'afternoon'
  }

  function fundUpdateStatus(code: string, liveIsNavMap?: Map<string, LiveIsNavEntry>): FundUpdateState {
    if (inTrading()) return 'pending'
    const h = (holdingStore.holdings || []).find((x: any) => x.code === code)
    if (h && typeof h.isUpdated === 'boolean') return h.isUpdated ? 'updated' : 'not-updated'
    const d = liveIsNavMap?.get(code)
    if (d && typeof d.isNav === 'boolean') return d.isNav ? 'updated' : 'not-updated'
    return 'not-updated'
  }

  function fundNameClass(code: string, liveIsNavMap?: Map<string, LiveIsNavEntry>): Record<string, boolean> {
    const s = fundUpdateStatus(code, liveIsNavMap)
    return {
      'fm-updated': s === 'updated',
      'fm-pending': s === 'not-updated',
      'fm-in-trading': s === 'pending'
    }
  }

  return { tradingSession, inTrading, fundUpdateStatus, fundNameClass }
}
