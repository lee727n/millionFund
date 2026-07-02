// [WHY] 首页弹窗状态管理 composable
// [WHAT] 管理前10大重仓股弹窗和当日分时估值弹窗

import { ref } from 'vue'
import type { HoldingWithProfit } from '@/stores/holding'

export interface FundInfo {
  code: string
  name: string
}

export function useHomePopups() {
  // [WHAT] 前10大重仓股弹窗状态
  const showTopHoldingsPopup = ref(false)
  const topHoldingsFund = ref<FundInfo | null>(null)

  function openTopHoldings(fund: HoldingWithProfit, event: Event) {
    event.stopPropagation()
    topHoldingsFund.value = { code: fund.code, name: fund.name }
    showTopHoldingsPopup.value = true
  }

  // [WHAT] 当日分时估值弹窗状态
  const showIntradayPopup = ref(false)
  const intradayFund = ref<FundInfo | null>(null)

  function openIntradayModal(fund: HoldingWithProfit, event: Event) {
    event.stopPropagation()
    intradayFund.value = { code: fund.code, name: fund.name }
    showIntradayPopup.value = true
  }

  return {
    // Top holdings popup
    showTopHoldingsPopup,
    topHoldingsFund,
    openTopHoldings,
    // Intraday popup
    showIntradayPopup,
    intradayFund,
    openIntradayModal,
  }
}
