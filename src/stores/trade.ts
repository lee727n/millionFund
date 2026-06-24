import { defineStore } from 'pinia'
import { getTrades, addTrade, deleteTrade } from '@/utils/storage'
import type { TradeRecord } from '@/types/fund'

export const useTradeStore = defineStore('trade', {
  state: () => ({
    trades: [] as TradeRecord[],
  }),
  actions: {
    loadTrades() {
      this.trades = getTrades()
    },
    addTrade(trade: TradeRecord) {
      addTrade(trade)
      this.loadTrades()
    },
    deleteTrade(id: string) {
      deleteTrade(id)
      this.loadTrades()
    },
  },
})
