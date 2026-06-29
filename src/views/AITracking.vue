<template>
  <div class="ai-tracking-page">
    <div class="page-header">
      <h1 class="page-title">
        AI 追踪
        <span class="success-rate web-only" v-if="records.length > 0">{{ t('aitracking.success_rate', { rate: successRate }) }}</span>
        <span class="success-rate mobile-only" v-if="records.length > 0">{{ successRate }}%</span>
      </h1>
      <div class="header-actions">
        <div class="ui-mode-toggle">
          <span 
            class="ui-mode-btn" 
            :class="{ active: uiMode === 'simple' }"
            @click="uiMode = 'simple'"
          >{{ t('common.simple') }}</span>
          <span 
            class="ui-mode-btn" 
            :class="{ active: uiMode === 'full' }"
            @click="uiMode = 'full'"
          >{{ t('common.full') }}</span>
        </div>
        <van-icon name="replay" size="20" @click="refreshPrices" />
          <van-button size="small" type="primary" @click="showAddModal = true" style="margin-left: 8px;">
          <van-icon name="plus" /> {{ t('common.add') }}
        </van-button>
      </div>
    </div>

    <div class="records-list" v-if="records.length > 0">
      <div 
        v-for="(record, index) in records" 
        :key="record.id" 
        class="record-card"
        :class="{ 
          'simple-mode': uiMode === 'simple',
          'dragging': draggingIndex === index,
          'drag-over': dragOverIndex === index
        }"
        :draggable="uiMode === 'simple'"
        @click="selectRecord(record)"
        @dragstart="handleDragStart($event, index)"
        @dragover="handleDragOver($event, index)"
        @dragleave="handleDragLeave"
        @drop="handleDrop($event, index)"
        @dragend="handleDragEnd"
        @touchstart="handleTouchStart($event, index)"
        @touchmove="handleTouchMove($event)"
        @touchend="handleTouchEnd"
      >
        <!-- 简版UI -->
        <div v-if="uiMode === 'simple'" class="record-simple">
          <!-- 网页端简版UI -->
          <div class="record-simple-web">
            <span class="simple-date">{{ formatDate(record.date) }}</span>
            <span class="simple-status" :class="getStatusClass(record)">{{ getStatusText(record) }}</span>
            <div class="simple-funds">
              <div class="simple-fund-item">
                <span class="simple-label sell">{{ t('aitracking.sell') }}</span>
                <span class="simple-fund-name" :class="getStatusClass(record)">{{ record.sellName || record.sellCode }}</span>
                <span class="simple-change" :class="getChangeClass(record, 'sell')">{{ getChangeText(record, 'sell') }}</span>
              </div>
              <div class="simple-fund-item">
                <span class="simple-label buy">{{ t('aitracking.buy') }}</span>
                <span class="simple-fund-name" :class="getStatusClass(record)">{{ record.buyName || record.buyCode }}</span>
                <span class="simple-change" :class="getChangeClass(record, 'buy')">{{ getChangeText(record, 'buy') }}</span>
              </div>
            </div>
            <span class="simple-delete" @click.stop="deleteRecord(record.id)">
              <van-icon name="delete-o" />
            </span>
          </div>
          <!-- 移动端简版UI -->
          <div class="record-simple-mobile">
            <span class="simple-sell-name" :class="getStatusClass(record)">{{ record.sellName || record.sellCode }}</span>
            <span class="simple-change sell" :class="getChangeClass(record, 'sell')">{{ getChangeText(record, 'sell') }}</span>
            <span class="simple-arrow">→</span>
            <span class="simple-buy-name" :class="getStatusClass(record)">{{ record.buyName || record.buyCode }}</span>
            <span class="simple-change buy" :class="getChangeClass(record, 'buy')">{{ getChangeText(record, 'buy') }}</span>
          </div>
        </div>
        
        <!-- 全版UI -->
        <div v-else>
          <div class="record-header">
            <span class="record-date">{{ formatDate(record.date) }}</span>
            <span class="record-status" :class="getStatusClass(record)">{{ getStatusText(record) }}</span>
            <span class="record-calc">{{ getCalcProcessCombined(record) }}</span>
          </div>
          <div class="record-content">
            <div class="fund-item sell">
              <div class="fund-label">{{ t('aitracking.sell') }}</div>
              <div class="fund-info">
                <div class="fund-name">{{ record.sellName || record.sellCode }}</div>
                <div class="fund-row">
                  <span class="fund-code">{{ record.sellCode }}</span>
                  <span class="fund-change-mobile" :class="getChangeClass(record, 'sell')">
                    {{ getChangeText(record, 'sell') }}
                  </span>
                </div>
              </div>
              <div class="fund-change-right" :class="getChangeClass(record, 'sell')">
                {{ getChangeText(record, 'sell') }}
              </div>
            </div>
            <div class="fund-item buy">
              <div class="fund-label">{{ t('aitracking.buy') }}</div>
              <div class="fund-info">
                <div class="fund-name">{{ record.buyName || record.buyCode }}</div>
                <div class="fund-row">
                  <span class="fund-code">{{ record.buyCode }}</span>
                  <span class="fund-change-mobile" :class="getChangeClass(record, 'buy')">
                    {{ getChangeText(record, 'buy') }}
                  </span>
                </div>
              </div>
              <div class="fund-change-right" :class="getChangeClass(record, 'buy')">
                {{ getChangeText(record, 'buy') }}
              </div>
            </div>
          </div>
          <div class="record-actions">
            <van-icon name="delete-o" @click.stop="deleteRecord(record.id)" />
          </div>
        </div>
      </div>
    </div>

    <van-empty v-else ::description="t('aitracking.no_data')" />

    <van-dialog
      v-model:show="showAddModal"
      :title="t('aitracking.add_title')"
      show-cancel-button
      @confirm="confirmAddRecord"
    >
      <div class="add-form">
        <div class="form-item">
          <label>{{ t('aitracking.date_label') }}</label>
          <van-field
            v-model="newRecord.date"
            type="date"
            :placeholder="t('aitracking.date_placeholder')"
          />
        </div>
        <div class="form-item">
          <label>{{ t('aitracking.sell_code') }}</label>
          <van-field
            v-model="newRecord.sellCode"
            :placeholder="t('common.please_input')"
            @blur="fetchFundInfo('sell')"
          />
          <div class="fund-name-preview" v-if="newRecord.sellName">
            {{ newRecord.sellName }}
          </div>
        </div>
        <div class="form-item">
          <label>{{ t('aitracking.buy_code') }}</label>
          <van-field
            v-model="newRecord.buyCode"
            :placeholder="t('common.please_input')"
            @blur="fetchFundInfo('buy')"
          />
          <div class="fund-name-preview" v-if="newRecord.buyName">
            {{ newRecord.buyName }}
          </div>
        </div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">const { t } = useI18n()

import { ref, computed, onUnmounted, watch } from 'vue'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { useAITrackingStore, type AITrackingRecord } from '@/stores/aiTracking'
import { logger } from '@/utils/logger'
import { fetchFundAccurateData, fetchNetValueHistoryFast } from '@/api/fundFast'
import { useI18n } from 'vue-i18n'

const aiTrackingStore = useAITrackingStore()

const uiMode = ref<'simple' | 'full'>('simple')

const records = computed(() => aiTrackingStore.records)

const successRate = computed(() => {
  if (records.value.length === 0) return 0
  
  let successCount = 0
  for (const record of records.value) {
    const sellPrice = fundPrices.value[record.sellCode]
    const buyPrice = fundPrices.value[record.buyCode]
    
    if (!sellPrice || !buyPrice || !record.sellNav || !record.buyNav) continue
    
    const sellChange = ((sellPrice - record.sellNav) / record.sellNav) * 100
    const buyChange = ((buyPrice - record.buyNav) / record.buyNav) * 100
    
    if (buyChange >= sellChange) {
      successCount++
    }
  }
  
  return Math.round((successCount / records.value.length) * 100)
})

const showAddModal = ref(false)

interface NewRecord {
  date: string
  sellCode: string
  sellName: string
  buyCode: string
  buyName: string
}

const newRecord = ref<NewRecord>({
  date: '',
  sellCode: '',
  sellName: '',
  buyCode: '',
  buyName: ''
})

// 拖拽排序相关状态
const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

// 移动端拖拽相关状态
const touchDragging = ref(false)
const touchStartY = ref(0)
const touchCurrentY = ref(0)
const touchDragElement = ref<HTMLElement | null>(null)

// 移动端touch事件处理
function handleTouchStart(event: TouchEvent, index: number) {
  if (uiMode.value !== 'simple') return
  
  const touch = event.touches[0]!
  touchStartY.value = touch.clientY
  touchCurrentY.value = touch.clientY
  draggingIndex.value = index
  touchDragging.value = true
  
  // 获取当前元素
  const target = event.currentTarget as HTMLElement
  touchDragElement.value = target
  target.classList.add('dragging')
  
  showToast({ message: t('aitracking_toast.drag_start'), duration: 1500 })
}

function handleTouchMove(event: TouchEvent) {
  if (!touchDragging.value || uiMode.value !== 'simple') return
  
  event.preventDefault()
  
  const touch = event.touches[0]!
  touchCurrentY.value = touch.clientY
  
  // 计算移动距离，找到目标位置
  const cards = document.querySelectorAll('.record-card')
  let newOverIndex = null
  
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i] as HTMLElement
    const rect = card.getBoundingClientRect()
    const centerY = rect.top + rect.height / 2
    
    if (Math.abs(touchCurrentY.value - centerY) < rect.height / 2) {
      newOverIndex = i
      break
    }
  }
  
  dragOverIndex.value = newOverIndex
  
  // 更新视觉反馈
  cards.forEach((card, i) => {
    const el = card as HTMLElement
    if (i === dragOverIndex.value) {
      el.classList.add('drag-over')
    } else {
      el.classList.remove('drag-over')
    }
  })
}

function handleTouchEnd(_event: TouchEvent) {
  if (!touchDragging.value || uiMode.value !== 'simple') return
  
  // 执行排序
  if (draggingIndex.value !== null && dragOverIndex.value !== null && draggingIndex.value !== dragOverIndex.value) {
    aiTrackingStore.reorderRecords(draggingIndex.value, dragOverIndex.value)
    showToast({ message: t('aitracking_toast.sort_updated'), duration: 1000 })
  }
  
  // 清理状态
  touchDragging.value = false
  touchStartY.value = 0
  touchCurrentY.value = 0
  
  if (touchDragElement.value) {
    touchDragElement.value.classList.remove('dragging')
  }
  
  // 清理所有drag-over样式
  document.querySelectorAll('.record-card').forEach(card => {
    (card as HTMLElement).classList.remove('drag-over')
  })
  
  draggingIndex.value = null
  dragOverIndex.value = null
  touchDragElement.value = null
}

function resetNewRecord() {
  newRecord.value = {
    date: '',
    sellCode: '',
    sellName: '',
    buyCode: '',
    buyName: ''
  }
}

async function fetchFundInfo(type: 'sell' | 'buy') {
  const code = type === 'sell' ? newRecord.value.sellCode : newRecord.value.buyCode
  if (!code) return

  try {
    const fundInfo = await fetchFundAccurateData(code)
    if (fundInfo) {
      if (type === 'sell') {
        newRecord.value.sellName = fundInfo.name
      } else {
        newRecord.value.buyName = fundInfo.name
      }
    }
  } catch (e) {
    logger.error('Failed to fetch fund info', e)
  }
}

async function confirmAddRecord() {
  if (!newRecord.value.sellCode || !newRecord.value.buyCode) {
    showToast({ message: t('aitracking_toast.please_fill_code'), duration: 2000 })
    return
  }

  showLoadingToast('添加中...')

  try {
    let sellName = newRecord.value.sellName
    let buyName = newRecord.value.buyName
    let sellNav = 0
    let buyNav = 0
    let sellNavEstimated = false
    let buyNavEstimated = false
    const targetDate = newRecord.value.date || new Date().toISOString().split('T')[0]!

    if (newRecord.value.date) {
      const historyDays = Math.ceil((new Date().getTime() - new Date(newRecord.value.date).getTime()) / (1000 * 60 * 60 * 24)) + 10
      
      const [sellHistory, buyHistory] = await Promise.all([
        fetchNetValueHistoryFast(newRecord.value.sellCode, historyDays),
        fetchNetValueHistoryFast(newRecord.value.buyCode, historyDays)
      ])

      const sellRecord = sellHistory.records?.find(r => r.date === newRecord.value.date)
      const buyRecord = buyHistory.records?.find(r => r.date === newRecord.value.date)

      if (sellRecord && buyRecord) {
        sellName = sellName || newRecord.value.sellCode
        buyName = buyName || newRecord.value.buyCode
        sellNav = sellRecord.netValue
        buyNav = buyRecord.netValue
      } else {
        sellNavEstimated = true
        buyNavEstimated = true
        const [sellInfo, buyInfo] = await Promise.all([
          fetchFundAccurateData(newRecord.value.sellCode),
          fetchFundAccurateData(newRecord.value.buyCode)
        ])
        if (sellInfo && sellInfo.currentValue > 0) {
          sellName = sellInfo.name
          sellNav = sellInfo.currentValue
        } else {
          showToast({ message: t('aitracking_toast.fetch_sell_failed'), duration: 2000 })
          closeToast()
          return
        }
        if (buyInfo && buyInfo.currentValue > 0) {
          buyName = buyInfo.name
          buyNav = buyInfo.currentValue
        } else {
          showToast({ message: t('aitracking_toast.fetch_buy_failed'), duration: 2000 })
          closeToast()
          return
        }
      }
    } else {
      sellNavEstimated = true
      buyNavEstimated = true
      const [sellInfo, buyInfo] = await Promise.all([
        fetchFundAccurateData(newRecord.value.sellCode),
        fetchFundAccurateData(newRecord.value.buyCode)
      ])
      if (sellInfo && sellInfo.currentValue > 0) {
        sellName = sellInfo.name
        sellNav = sellInfo.currentValue
      } else {
        showToast({ message: t('aitracking_toast.fetch_sell_nav_failed'), duration: 2000 })
        closeToast()
        return
      }
      if (buyInfo && buyInfo.currentValue > 0) {
        buyName = buyInfo.name
        buyNav = buyInfo.currentValue
      } else {
        showToast({ message: t('aitracking_toast.fetch_buy_nav_failed'), duration: 2000 })
        closeToast()
        return
      }
    }

    aiTrackingStore.addRecord({
      sellCode: newRecord.value.sellCode,
      sellName: sellName,
      sellNav: sellNav,
      sellNavEstimated: sellNavEstimated,
      buyCode: newRecord.value.buyCode,
      buyName: buyName,
      buyNav: buyNav,
      buyNavEstimated: buyNavEstimated,
      date: targetDate
    })

    showToast({ message: t('aitracking_toast.add_success'), duration: 2000 })
    resetNewRecord()
    showAddModal.value = false
  } catch (e) {
    showToast({ message: t('aitracking_toast.add_failed'), duration: 2000 })
    logger.error('添加调仓记录失败', e)
  }
}

function deleteRecord(id: string) {
  aiTrackingStore.removeRecord(id)
  showToast({ message: t('aitracking_toast.delete_success'), duration: 2000 })
}

function selectRecord(_record: AITrackingRecord) {
  // 可以跳转到详情页或者显示更多信息
}

function formatDate(dateStr: string) {
  return dateStr
}

const fundPrices = ref<Record<string, number>>({})
const isRefreshing = ref(false)
const autoRefreshEnabled = ref(false)
let autoRefreshInterval: number | null = null

async function refreshPrices() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  showLoadingToast('刷新中...')
  
  try {
    await fetchCurrentPrices()
    showToast({ message: t('aitracking_toast.refresh_success'), duration: 2000 })
  } catch (e) {
    showToast({ message: t('aitracking_toast.refresh_failed'), duration: 2000 })
  } finally {
    isRefreshing.value = false
    closeToast()
  }
}

watch(autoRefreshEnabled, (newValue) => {
  if (newValue) {
    autoRefreshInterval = window.setInterval(() => {
      fetchCurrentPrices()
    }, 60000)
    showToast({ message: t('aitracking_toast.auto_refresh_on'), duration: 2000 })
  } else {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval)
      autoRefreshInterval = null
    }
    showToast({ message: t('aitracking_toast.auto_refresh_off'), duration: 2000 })
  }
})

async function fetchCurrentPrices() {
  const codes = new Set<string>()
  records.value.forEach(r => {
    codes.add(r.sellCode)
    codes.add(r.buyCode)
  })

  for (const code of codes) {
    try {
      const info = await fetchFundAccurateData(code)
      fundPrices.value[code] = info?.currentValue || 0
    } catch (e) {
      logger.error(`Failed to fetch price for ${code}`, e)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const record of records.value) {
    const recordDate = new Date(record.date)
    recordDate.setHours(0, 0, 0, 0)

    const needUpdateSell = record.sellNavEstimated
    const needUpdateBuy = record.buyNavEstimated

    if (needUpdateSell || needUpdateBuy) {
      const historyDays = Math.ceil((today.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24)) + 5
      try {
        const [sellHistory, buyHistory] = await Promise.all([
          fetchNetValueHistoryFast(record.sellCode, historyDays),
          fetchNetValueHistoryFast(record.buyCode, historyDays)
        ])

        const sellRecord = sellHistory.records?.find(h => h.date === record.date)
        const buyRecord = buyHistory.records?.find(h => h.date === record.date)

        let newSellNav = record.sellNav
        let newBuyNav = record.buyNav
        let updated = false

        if (needUpdateSell && sellRecord) {
          newSellNav = sellRecord.netValue
          updated = true
        }
        if (needUpdateBuy && buyRecord) {
          newBuyNav = buyRecord.netValue
          updated = true
        }

        if (updated) {
          aiTrackingStore.confirmRecordNav(record.id, newSellNav, newBuyNav)
        }
      } catch (e) {
        logger.error(`Failed to fetch history for record ${record.id}`, e)
      }
    }
  }
}

function getChangeText(record: AITrackingRecord, type: 'sell' | 'buy') {
  const code = type === 'sell' ? record.sellCode : record.buyCode
  const nav = type === 'sell' ? record.sellNav : record.buyNav
  const currentPrice = fundPrices.value[code]
  
  if (!currentPrice || !nav) return '--'
  const change = ((currentPrice - nav) / nav) * 100
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
}

function getCalcProcessCombined(record: AITrackingRecord) {
  const sellCode = record.sellCode
  const buyCode = record.buyCode
  const sellNav = record.sellNav
  const buyNav = record.buyNav
  const sellPrice = fundPrices.value[sellCode]
  const buyPrice = fundPrices.value[buyCode]
  
  if (!sellPrice || !buyPrice || !sellNav || !buyNav) return '--'
  
  const sellChange = ((sellPrice - sellNav) / sellNav) * 100
  const buyChange = ((buyPrice - buyNav) / buyNav) * 100
  const sellChangeStr = `${sellChange >= 0 ? '+' : ''}${sellChange.toFixed(2)}%`
  const buyChangeStr = `${buyChange >= 0 ? '+' : ''}${buyChange.toFixed(2)}%`
  const sellEstimated = record.sellNavEstimated ? '(估值)' : ''
  const buyEstimated = record.buyNavEstimated ? '(估值)' : ''
  
  return `卖出: ${sellPrice.toFixed(4)} - ${sellNav.toFixed(4)}${sellEstimated} = ${sellChangeStr} 买入: ${buyPrice.toFixed(4)} - ${buyNav.toFixed(4)}${buyEstimated} = ${buyChangeStr}`
}

function getStatusText(record: AITrackingRecord): string {
  const sellPrice = fundPrices.value[record.sellCode]
  const buyPrice = fundPrices.value[record.buyCode]
  
  if (!sellPrice || !buyPrice || !record.sellNav || !record.buyNav) return '--'
  
  const sellChange = ((sellPrice - record.sellNav) / record.sellNav) * 100
  const buyChange = ((buyPrice - record.buyNav) / record.buyNav) * 100
  
  return buyChange >= sellChange ? '调仓成功' : '调仓失败'
}

// 拖拽排序相关函数
function handleDragStart(event: DragEvent, index: number) {
  if (uiMode.value !== 'simple') return
  
  draggingIndex.value = index
  event.dataTransfer?.setData('text/plain', index.toString())
  
  // 添加拖拽效果样式
  if (event.target) {
    (event.target as HTMLElement).classList.add('dragging')
  }
  
  showToast({ message: t('aitracking_toast.drag_start'), duration: 1500 })
}

function handleDragOver(event: DragEvent, index: number) {
  if (uiMode.value !== 'simple') return
  
  event.preventDefault()
  dragOverIndex.value = index
}

function handleDragLeave() {
  // 不立即清除，让视觉反馈更持久
}

function handleDrop(event: DragEvent, targetIndex: number) {
  if (uiMode.value !== 'simple') return
  
  event.preventDefault()
  
  if (draggingIndex.value !== null && draggingIndex.value !== targetIndex) {
    aiTrackingStore.reorderRecords(draggingIndex.value, targetIndex)
    showToast({ message: t('aitracking_toast.sort_updated'), duration: 1000 })
  }
  
  draggingIndex.value = null
  dragOverIndex.value = null
}

function handleDragEnd(event: DragEvent) {
  // 移除拖拽样式
  if (event.target) {
    (event.target as HTMLElement).classList.remove('dragging')
  }
  
  // 如果有目标位置，执行排序（fallback）
  if (draggingIndex.value !== null && dragOverIndex.value !== null && draggingIndex.value !== dragOverIndex.value) {
    aiTrackingStore.reorderRecords(draggingIndex.value, dragOverIndex.value)
    showToast({ message: t('aitracking_toast.sort_updated'), duration: 1000 })
  }
  
  draggingIndex.value = null
  dragOverIndex.value = null
}

function getStatusClass(record: AITrackingRecord): string {
  const sellPrice = fundPrices.value[record.sellCode]
  const buyPrice = fundPrices.value[record.buyCode]
  
  if (!sellPrice || !buyPrice || !record.sellNav || !record.buyNav) return ''
  
  const sellChange = ((sellPrice - record.sellNav) / record.sellNav) * 100
  const buyChange = ((buyPrice - record.buyNav) / record.buyNav) * 100
  
  return buyChange >= sellChange ? 'success' : 'fail'
}

function getChangeClass(record: AITrackingRecord, type: 'sell' | 'buy') {
  const code = type === 'sell' ? record.sellCode : record.buyCode
  const nav = type === 'sell' ? record.sellNav : record.buyNav
  const currentPrice = fundPrices.value[code]
  
  if (!currentPrice || !nav) return ''
  return currentPrice > nav ? 'up' : 'down'
}

fetchCurrentPrices()

onUnmounted(() => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval)
  }
})
</script>

<style scoped>
.ai-tracking-page {
  height: 100%;
  background: var(--bg-primary);
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 16px 16px;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
  flex-shrink: 0;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.success-rate-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 16px;
}

.success-rate {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-refresh-label {
  font-size: 12px;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .web-only {
    display: none;
  }
  .mobile-only {
    display: inline;
  }
}

@media (min-width: 769px) {
  .web-only {
    display: inline;
  }
  .mobile-only {
    display: none;
  }
}

.ui-mode-toggle {
  display: flex;
  align-items: center;
  background: var(--bg-primary, #f5f5f5);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-light, #e0e0e0);
  margin-right: 8px;
}

.ui-mode-btn {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.ui-mode-btn.active {
  background: var(--primary-color);
  color: #fff;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
}

.record-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 12px;
  position: relative;
  transition: all 0.2s ease;
}

.record-card.simple-mode {
  padding: 8px 12px;
}

/* 拖拽状态样式 */
.record-card.dragging {
  opacity: 0.5;
  background: var(--bg-card);
  transform: scale(1.02);
}

.record-card.dragging::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed var(--primary-color);
  border-radius: 12px;
  pointer-events: none;
}

.record-card.drag-over {
  border: 2px solid var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
}

/* 简版UI - 默认隐藏移动端，显示网页端 */
.record-simple-mobile {
  display: none;
}

.record-simple-web {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.simple-date {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 60px;
}

.simple-status {
  font-size: 12px;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
}

.simple-status.success {
  color: #ee0a24;
}

.simple-status.fail {
  color: #07c160;
}

.simple-status.pending {
  color: #999;
}

.simple-funds {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 16px;
}

.simple-fund-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.simple-label {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.simple-label.sell {
  background: #ee0a24;
}

.simple-label.buy {
  background: #07c160;
}

.simple-fund-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.simple-fund-name.success {
  color: #ee0a24;
}

.simple-fund-name.fail {
  color: #07c160;
}

.simple-change {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  min-width: 55px;
  text-align: right;
}

.simple-change.up {
  color: #ee0a24;
  background: rgba(238, 10, 36, 0.1);
}

.simple-change.down {
  color: #07c160;
  background: rgba(7, 193, 96, 0.1);
}

.simple-arrow {
  color: var(--text-muted);
  font-size: 12px;
}

.simple-delete {
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}

.simple-delete:hover {
  color: #ee0a24;
}

/* 移动端样式 */
@media (max-width: 768px) {
  .record-simple-mobile {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
  }

  .record-simple-web {
    display: none;
  }

  .simple-sell-name,
  .simple-buy-name {
    flex-shrink: 0;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary);
  }
  
  .simple-sell-name.success,
  .simple-buy-name.success {
    color: #ee0a24;
  }
  
  .simple-sell-name.fail,
  .simple-buy-name.fail {
    color: #07c160;
  }
}

.record-date {
  font-size: 12px;
  color: var(--text-muted);
}

.record-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.record-status {
  font-size: 12px;
  font-weight: 500;
}

.record-calc {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-number);
  display: block;
  margin-top: 4px;
}

.record-status.success {
  color: #ee0a24;
}

.record-status.fail {
  color: #07c160;
}

.record-content {
  display: flex;
  gap: 8px;
}

.fund-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-tertiary);
}

.fund-item.sell {
  border-left: 3px solid var(--color-down);
}

.fund-item.buy {
  border-left: 3px solid var(--color-up);
}

.fund-label {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.sell .fund-label {
  background: var(--color-down);
}

.buy .fund-label {
  background: var(--color-up);
}

.fund-info {
  flex: 1;
  min-width: 0;
}

.fund-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  margin-bottom: 4px;
}

.fund-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fund-code {
  font-size: 10px;
  color: var(--text-muted);
}

.fund-change {
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-number);
  flex-shrink: 0;
}

.fund-change.up,
.fund-change-mobile.up,
.fund-change-right.up {
  color: var(--color-up);
}

.fund-change.down,
.fund-change-mobile.down,
.fund-change-right.down {
  color: var(--color-down);
}

@media (min-width: 768px) {
  .fund-item {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 16px;
  }

  .fund-label {
    width: 24px;
    height: 24px;
    font-size: 13px;
    align-self: center;
    flex-shrink: 0;
  }

  .fund-info {
    flex: 1;
    min-width: 0;
  }

  .fund-name {
    font-size: 14px;
    max-width: 160px;
  }

  .fund-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .fund-change-mobile {
    display: none;
  }

  .fund-change-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    font-size: 28px;
    font-weight: 600;
    flex-shrink: 0;
    min-width: 100px;
  }
}

.fund-change-mobile {
  display: inline;
}

.fund-change-right {
  display: none;
}

.calc-process {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
  font-family: var(--font-number);
}

.fund-nav {
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-number);
  color: #1989fa;
  margin: 0 6px;
}

.record-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--text-muted);
  font-size: 18px;
}

.add-form {
  padding: 16px;
}

.form-item {
  margin-bottom: 16px;
}

.form-item label {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.fund-name-preview {
  font-size: 12px;
  color: var(--color-primary);
  margin-top: 4px;
}

@media (max-width: 767px) {
  .record-calc {
    display: none;
  }
}
</style>


