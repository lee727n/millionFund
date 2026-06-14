import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AITrackingRecord {
  id: string
  sellCode: string
  sellName: string
  sellNav: number
  sellNavEstimated?: boolean
  buyCode: string
  buyName: string
  buyNav: number
  buyNavEstimated?: boolean
  date: string
  createdAt: string
}

export const useAITrackingStore = defineStore('aiTracking', () => {
  const records = ref<AITrackingRecord[]>([])

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

  function saveToLocalStorage() {
    localStorage.setItem('ai-tracking-records', JSON.stringify(records.value))
  }

  function loadFromLocalStorage() {
    const data = localStorage.getItem('ai-tracking-records')
    if (data) {
      try {
        records.value = JSON.parse(data)
      } catch (e) {
        console.error('Failed to load AI tracking records:', e)
        records.value = []
      }
    }
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

    records.value.splice(adjustedToIndex, 0, movedRecord!)
    saveToLocalStorage()
  }

  loadFromLocalStorage()

  return {
    records,
    recordCount,
    addRecord,
    removeRecord,
    updateRecordNav,
    confirmRecordNav,
    importRecords,
    clearAll,
    reorderRecords,
    loadFromLocalStorage
  }
})
