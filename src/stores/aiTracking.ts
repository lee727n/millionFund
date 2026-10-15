import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchNetValueHistoryFast } from '@/api/fundFast'

export interface AITrackingRecord {
  id: string
  sellCode: string
  sellName: string
  sellNav: number
  sellNavEstimated?: boolean
  /** sellNav 对应的净值日期（估值快照属于哪一天），用于之后校正为当日真实净值 */
  sellNavDate?: string
  buyCode: string
  buyName: string
  buyNav: number
  buyNavEstimated?: boolean
  /** buyNav 对应的净值日期 */
  buyNavDate?: string
  date: string
  createdAt: string
}

export const useAITrackingStore = defineStore('aiTracking', () => {
  const records = ref<AITrackingRecord[]>([])
  const uiMode = ref<'simple' | 'full'>('simple')

  const recordCount = computed(() => records.value.length)

  function addRecord(record: Omit<AITrackingRecord, 'id' | 'createdAt'>) {
    const newRecord: AITrackingRecord = {
      ...record,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    }
    records.value.push(newRecord)
    saveToLocalStorage()
    return newRecord
  }

  function removeRecord(id: string) {
    const index = records.value.findIndex(r => r.id === id)
    if (index > -1) {
      records.value.splice(index, 1)
      saveToLocalStorage()
    }
  }

  function updateRecordNav(id: string, sellNav: number, buyNav: number) {
    const record = records.value.find(r => r.id === id)
    if (record) {
      record.sellNav = sellNav
      record.buyNav = buyNav
      saveToLocalStorage()
    }
  }

  function confirmRecordNav(id: string, sellNav: number, buyNav: number) {
    const record = records.value.find(r => r.id === id)
    if (record) {
      record.sellNav = sellNav
      record.buyNav = buyNav
      record.sellNavEstimated = false
      record.buyNavEstimated = false
      saveToLocalStorage()
    }
  }

  // [WHY] 转换时记录的成本基准（sellNav/buyNav）是在「添加那一刻」抓的估值快照，可能属于昨天/前天的净值。
  //       这里把它校正成快照当天（sellNavDate/buyNavDate）已公布的真实净值，避免长期沿用旧快照导致「累计」偏大。
  // [WHAT] 任何一次刷新（晚间/次日/onActivated）都调用；无 estimated 标记的 record 直接跳过，开销极低。
  async function confirmEstimatedNavs() {
    const pending = records.value.filter(r => r.sellNavEstimated || r.buyNavEstimated)
    if (pending.length === 0) return
    for (const record of pending) {
      try {
        const historyDays = 15
        const [sellHistory, buyHistory] = await Promise.all([
          // 强制刷新历史净值：估值转净值的校正不能命中白天的旧缓存，尤其是晚间刚公布净值时。
          record.sellNavEstimated ? fetchNetValueHistoryFast(record.sellCode, historyDays, true) : Promise.resolve(null),
          record.buyNavEstimated ? fetchNetValueHistoryFast(record.buyCode, historyDays, true) : Promise.resolve(null)
        ])
        let updated = false
        if (record.sellNavEstimated && sellHistory?.records) {
          const target = record.sellNavDate || record.date
          const sr = sellHistory.records.find(h => h.date === target)
          if (sr && sr.netValue > 0) {
            record.sellNav = sr.netValue
            record.sellNavEstimated = false
            updated = true
          }
        }
        if (record.buyNavEstimated && buyHistory?.records) {
          const target = record.buyNavDate || record.date
          const br = buyHistory.records.find(h => h.date === target)
          if (br && br.netValue > 0) {
            record.buyNav = br.netValue
            record.buyNavEstimated = false
            updated = true
          }
        }
        if (updated) saveToLocalStorage()
      } catch (e) {
        console.error('[aiTracking] confirmEstimatedNavs failed for', record.id, e)
      }
    }
  }

  function saveToLocalStorage() {
    localStorage.setItem('ai-tracking-records', JSON.stringify(records.value))
  }

  function loadFromLocalStorage() {
    const data = localStorage.getItem('ai-tracking-records')
    if (data) {
      try {
        const parsed = JSON.parse(data)
        // 为没有id的旧数据生成id
        records.value = parsed.map((record: any, index: number) => ({
          ...record,
          id: record.id || Date.now().toString() + index,
          createdAt: record.createdAt || new Date().toISOString()
        }))
      } catch (e) {
        console.error('Failed to load AI tracking records:', e)
        records.value = []
      }
    }
  }

  function reloadRecords() {
    loadFromLocalStorage()
  }

  function setUiMode(mode: 'simple' | 'full') {
    uiMode.value = mode
  }

  function importRecords(importedRecords: AITrackingRecord[]) {
    records.value = importedRecords
    saveToLocalStorage()
  }

  function clearAll() {
    records.value = []
    saveToLocalStorage()
  }

  function reorderRecords(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= records.value.length || toIndex >= records.value.length) return

    const [movedRecord] = records.value.splice(fromIndex, 1)

    // 如果 fromIndex < toIndex，移除元素后 toIndex 需要减 1
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex

    records.value.splice(adjustedToIndex, 0, movedRecord)
    saveToLocalStorage()
  }

  loadFromLocalStorage()

  return {
    records,
    recordCount,
    uiMode,
    addRecord,
    removeRecord,
    updateRecordNav,
    confirmRecordNav,
    confirmEstimatedNavs,
    importRecords,
    clearAll,
    reorderRecords,
    loadFromLocalStorage,
    reloadRecords,
    setUiMode
  }
})
