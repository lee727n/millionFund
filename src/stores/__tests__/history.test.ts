import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHistoryStore } from '../history'

describe('history store', () => {
  beforeEach(() => {
    // 每个测试前创建新的 Pinia 实例
    const pinia = createPinia()
    setActivePinia(pinia)

    // 清空 localStorage
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('loadHistory', () => {
    it('should return empty array when no data in localStorage', () => {
      const store = useHistoryStore()
      const result = store.loadHistory()
      expect(result).toEqual([])
    })

    it('should return data from localStorage', () => {
      const mockData = [
        {
          date: '2026-06-20',
          totalValueCNY: 100000,
          totalCostCNY: 90000,
          totalProfitCNY: 10000,
          byAssetClass: { fund: { value: 100000 } }
        }
      ]
      localStorage.setItem('portfolio_history', JSON.stringify(mockData))

      const store = useHistoryStore()
      const result = store.loadHistory()
      expect(result).toEqual(mockData)
    })

    it('should return empty array when localStorage data is invalid', () => {
      localStorage.setItem('portfolio_history', 'invalid json')

      const store = useHistoryStore()
      const result = store.loadHistory()
      expect(result).toEqual([])
    })
  })

  describe('saveSnapshot', () => {
    it('should save snapshot to localStorage', () => {
      const store = useHistoryStore()
      const snapshot = {
        date: '2026-06-24',
        totalValueCNY: 100000,
        totalCostCNY: 90000,
        totalProfitCNY: 10000,
        byAssetClass: { fund: { value: 100000 } }
      }

      store.saveSnapshot(snapshot)

      const saved = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
      expect(saved).toHaveLength(1)
      expect(saved[0].date).toBe('2026-06-24')
      expect(saved[0].totalValueCNY).toBe(100000)
    })

    it('should update existing snapshot for same date', () => {
      const store = useHistoryStore()

      // 保存第一份快照
      store.saveSnapshot({
        date: '2026-06-24',
        totalValueCNY: 100000,
        totalCostCNY: 90000,
        totalProfitCNY: 10000,
        byAssetClass: { fund: { value: 100000 } }
      })

      // 保存同一天的另一份快照
      store.saveSnapshot({
        date: '2026-06-24',
        totalValueCNY: 110000,
        totalCostCNY: 90000,
        totalProfitCNY: 20000,
        byAssetClass: { fund: { value: 110000 } }
      })

      const saved = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
      expect(saved).toHaveLength(1)
      expect(saved[0].totalValueCNY).toBe(110000)
    })

    it('should keep only latest 90 days', () => {
      const store = useHistoryStore()

      // 保存 91 天的数据
      for (let i = 0; i < 91; i++) {
        const date = new Date('2026-06-24')
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]

        store.saveSnapshot({
          date: dateStr,
          totalValueCNY: 100000 + i,
          totalCostCNY: 90000,
          totalProfitCNY: 10000 + i,
          byAssetClass: { fund: { value: 100000 + i } }
        })
      }

      const saved = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
      expect(saved).toHaveLength(90)
    })

    it('should sort snapshots by date', () => {
      const store = useHistoryStore()

      store.saveSnapshot({
        date: '2026-06-24',
        totalValueCNY: 100000,
        totalCostCNY: 90000,
        totalProfitCNY: 10000,
        byAssetClass: { fund: { value: 100000 } }
      })

      store.saveSnapshot({
        date: '2026-06-20',
        totalValueCNY: 90000,
        totalCostCNY: 85000,
        totalProfitCNY: 5000,
        byAssetClass: { fund: { value: 90000 } }
      })

      const saved = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
      expect(saved[0].date).toBe('2026-06-20')
      expect(saved[1].date).toBe('2026-06-24')
    })
  })

  describe('getTrend', () => {
    it('should return trend data for specified days', () => {
      const store = useHistoryStore()

      // 保存 30 天的数据
      for (let i = 0; i < 30; i++) {
        const date = new Date('2026-06-24')
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]

        store.saveSnapshot({
          date: dateStr,
          totalValueCNY: 100000 + i * 1000,
          totalCostCNY: 90000,
          totalProfitCNY: 10000 + i * 1000,
          byAssetClass: { fund: { value: 100000 + i * 1000 } }
        })
      }

      const trend = store.getTrend(7)
      expect(trend.dates).toHaveLength(7)
      expect(trend.values).toHaveLength(7)
    })

    it('should return formatted date labels', () => {
      const store = useHistoryStore()

      store.saveSnapshot({
        date: '2026-06-24',
        totalValueCNY: 100000,
        totalCostCNY: 90000,
        totalProfitCNY: 10000,
        byAssetClass: { fund: { value: 100000 } }
      })

      const trend = store.getTrend(30)
      // 日期格式应该是 '6/24' 而不是 '2026-06-24'
      expect(trend.dates[0]).toBe('6/24')
    })
  })

  describe('hasTodaySnapshot', () => {
    it('should return true when today snapshot exists', () => {
      const store = useHistoryStore()
      const today = new Date().toISOString().split('T')[0]

      store.saveSnapshot({
        date: today,
        totalValueCNY: 100000,
        totalCostCNY: 90000,
        totalProfitCNY: 10000,
        byAssetClass: { fund: { value: 100000 } }
      })

      expect(store.hasTodaySnapshot()).toBe(true)
    })

    it('should return false when today snapshot does not exist', () => {
      const store = useHistoryStore()
      expect(store.hasTodaySnapshot()).toBe(false)
    })
  })

  describe('saveCurrentSnapshot', () => {
    it('should save snapshot from portfolio summary', () => {
      const store = useHistoryStore()

      const summary = {
        totalValueCNY: 100000,
        totalCostCNY: 90000,
        totalProfitCNY: 10000,
        byAssetClass: { fund: { value: 100000 } }
      }

      store.saveCurrentSnapshot(summary)

      const saved = JSON.parse(localStorage.getItem('portfolio_history') || '[]')
      expect(saved).toHaveLength(1)
      expect(saved[0].totalValueCNY).toBe(100000)
      expect(saved[0].date).toBe(new Date().toISOString().split('T')[0])
    })
  })
})
