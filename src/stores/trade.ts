import { defineStore } from 'pinia'
import { getTrades, addTrade, deleteTrade } from '@/utils/storage'
import type { TradeRecord } from '@/types/fund'

export const useTradeStore = defineStore('trade', {
  state: () => ({
    trades: [] as TradeRecord[],
  }),
  actions: {
    async loadTrades() {
      this.trades = await getTrades()
    },
    async addTrade(trade: TradeRecord) {
      await addTrade(trade)
      await this.loadTrades()
    },
    async deleteTrade(id: string) {
      await deleteTrade(id)
      await this.loadTrades()
    },
  },
})
