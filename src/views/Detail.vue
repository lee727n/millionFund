<script setup lang="ts">
// [WHY] 基金详情页 - 专业基金APP风格
// [WHAT] 蓝色顶部、持仓数据、分时图、关联板块、底部操作栏
// [REF] 参考蚂蚁基金/天天基金的专业设计

import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useHoldingStore } from '@/stores/holding'
import { 
  fetchLatestNetValue,
  fetchFundAccurateData,
  fetchTopHoldings,
  fetchIndustryAllocation,
  fetchAssetAllocation,
  fetchFundRating,
} from '@/api/fundFast'
import type { FundEstimate } from '@/types/fund'
import type { IndustryAllocation, AssetAllocation, FundRating } from '@/api/fundFast'
import {
  type PeriodReturnExt,
  fetchPeriodReturnExt,
  fetchDividendRecords,
  fetchFundAnnouncements,
} from '@/api/tiantianApi'
import { fetchFundFees, type FundFeeInfo } from '@/api/tiantianApi'
import { sourceOptions as configSourceOptions, getSourceLabel } from '@/config/sources'
import { showToast, showConfirmDialog, showLoadingToast, closeToast } from 'vant'
import ProChart from '@/components/OKXChart.vue'
import { 
  predictTrend, calculateReturnAnalysis, calculateFundScore,
  type TrendPrediction, type ReturnAnalysis, type FundScore
} from '@/utils/statistics'
import { fetchNetValueHistoryFast } from '@/api/fundFast'
import { logger } from '@/utils/logger'
import TrendPredictionSection from '@/components/TrendPredictionSection.vue'
import DividendRecordsSection from '@/components/DividendRecordsSection.vue'
import FundAnnouncementsSection from '@/components/FundAnnouncementsSection.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()

// [WHAT] 基金代码
const fundCode = computed(() => route.params.code as string)

// 数据状态
const fundInfo = ref<(FundEstimate & { dataSource?: string }) | null>(null)
const isLoading = ref(true)

// [WHAT] 趋势预测
const trendPrediction = ref<TrendPrediction | null>(null)
const fundScore = ref<FundScore | null>(null)
const returnAnalysis = ref<ReturnAnalysis | null>(null)
const isTrendLoading = ref(false)

// [WHAT] 详情页各功能模块数据
const fundScale = ref<{
  scale: number; scaleDate: string; shareTotal: number
  institutionRatio: number; personalRatio: number
} | null>(null)
const fundFees = ref<FundFeeInfo | null>(null)
const stockHoldings = ref<{ stockCode: string; stockName: string; holdingRatio: number }[]>([])
const industryAllocation = ref<IndustryAllocation[]>([])
const assetAllocation = ref<AssetAllocation | null>(null)
const fundRating = ref<FundRating | null>(null)
const periodReturns = ref<PeriodReturnExt[]>([])
const sectorInfo = ref<{ name: string; dayReturn: number } | null>(null)
const similarFunds = ref<{ code: string; name: string; yearReturn: number }[]>([])
const dividendRecords = ref<{ date: string; amount: number; type: string }[]>([])
 
const announcements = ref<{ id: string; title: string; date: string; type: string; url: string }[]>([])

// [WHAT] 最佳周期回报（用于顶部核心指标展示）
const bestPeriodReturn = computed(() => {
  if (periodReturns.value.length === 0) return { label: t('detail.best_return'), value: 0 }
  const sorted = [...periodReturns.value].sort((a, b) => b.fundReturn - a.fundReturn)
  return { label: sorted[0]!.label, value: sorted[0]!.fundReturn }
})

// [WHAT] 行业配置饼图数据（转换为SVG stroke-dasharray格式）
const industryPieData = computed(() => {
  const total = industryAllocation.value.reduce((s, i) => s + i.ratio, 0)
  if (total === 0) return []
  const circumference = 2 * Math.PI * 40  // r=40
  let offset = 0
  return industryAllocation.value.map(item => {
    const ratio = item.ratio / total
    const dashArray = ratio * circumference
    const result = { ...item, dashArray: `${dashArray} ${circumference - dashArray}`, offset: -offset }
    offset += dashArray
    return result
  })
})

// [WHAT] 预估赎回费
const estimatedRedemptionFee = computed(() => {
  if (!fundFees.value || !holdingDetails.value) return null
  const holdDays = holdingDetails.value.holdDays
  const fee = fundFees.value.redemptionFees.find(f => holdDays >= f.minDays && holdDays < f.maxDays)
  if (!fee) return null
  return {
    rate: fee.rate,
    fee: holdingDetails.value.amount * (fee.rate / 100)
  }
})

// [WHAT] 累计分红
 
const totalDividend = computed(() => {
  return dividendRecords.value.reduce((s, r) => s + r.amount, 0)
})



// [WHAT] Tab切换
const activeTab = ref<'chart' | 'performance' | 'profit' | 'trend'>('chart')

// [WHAT] 持仓面板展开状态
const holdingExpanded = ref(true)

// ========== 调整成本弹窗 ==========
const showCostDialog = ref(false)
const costFormData = ref({
  code: '',
  name: '',
  amount: '',
  profit: ''
})

// [WHAT] 行业板块弹窗
const showSectorDialog = ref(false)
const sectorFormData = ref({
  sectors: ''
})

// [WHAT] 来源管理弹窗
const showSourceDialog = ref(false)
const sourceFormData = ref({
  source: '',
  isQDII: false
})

// [WHAT] 来源选项（从共享配置导入）
const sourceOptions = configSourceOptions

// [WHAT] 持仓信息（如果已持有）
const holdingInfo = computed(() => {
  return holdingStore.holdings.find(h => h.code === fundCode.value) || null
})

// [WHAT] 持仓详细计算
const holdingDetails = computed(() => {
  const holding = holdingInfo.value
  if (!holding) return null
  
  const currentPrice = parseFloat(fundInfo.value?.gsz || fundInfo.value?.dwjz || '0')
  const shares = holding.shares || 0
  const buyNetValue = holding.buyNetValue || 0
  const amount = holding.marketValue || 0
  
  // 当前市值
  const currentValue = shares * currentPrice
  // 持有收益 = (当前净值 - 成本净值) × 持有份额
  const profit = (currentPrice - buyNetValue) * shares
  // 收益率
  const profitRate = amount > 0 ? (profit / amount) * 100 : 0
  // 持仓占比（相对于总市值）
  const totalValue = holdingStore.summary.totalValue || 1
  const ratio = (currentValue / totalValue) * 100
  // 持有天数
  const buyDate = new Date(holding.buyDate || Date.now())
  const today = new Date()
  const holdDays = Math.floor((today.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24))
  // 当日收益
  const changePercent = parseFloat(fundInfo.value?.gszzl || '0')
  const todayProfit = currentValue * (changePercent / 100)
  // 昨日收益（模拟）
  const yesterdayProfit = profit - todayProfit
  
  return {
    amount: currentValue,
    shares,
    ratio,
    profit,
    profitRate,
    cost: buyNetValue,
    todayProfit,
    yesterdayProfit,
    holdDays
  }
})

onMounted(async () => {
  await loadFundData()
})

// [WHY] 监听路由参数变化
watch(fundCode, async (newCode, oldCode) => {
  if (newCode && newCode !== oldCode) {
    fundInfo.value = null
    isLoading.value = true
    await loadFundData()
  }
})

onUnmounted(() => {
  // 清理工作
})

async function loadFundData() {
  isLoading.value = true
  
  try {
    // [WHAT] 获取QDII标识，从持仓信息或默认false
    const isQDII = holdingInfo.value?.isQDII || false
    const accurateData = await fetchFundAccurateData(fundCode.value, isQDII).catch(() => null)
    
    if (accurateData) {
      // 将 FundAccurateData 转换为 FundEstimate 格式
      fundInfo.value = {
        fundcode: accurateData.code,
        name: accurateData.name,
        dwjz: accurateData.nav.toString(),
        gsz: accurateData.currentValue.toString(),
        gszzl: accurateData.dayChange.toString(),
        gztime: accurateData.estimateTime || accurateData.navDate,
        dataSource: accurateData.dataSource
      }
    } else {
      const { searchFund } = await import('@/api/fundFast')
      const funds = await searchFund(fundCode.value, 1)
      if (funds.length > 0) {
        fundInfo.value = {
          fundcode: fundCode.value,
          name: funds[0]!.name,
          dwjz: '0',
          gsz: '0',
          gszzl: '0',
          gztime: '--'
        }
      } else {
        fundInfo.value = {
          fundcode: fundCode.value,
          name: `基金 ${fundCode.value}`,
          dwjz: '0',
          gsz: '0',
          gszzl: '0',
          gztime: '--'
        }
      }
    }
      
  } catch {
    showToast(t('common.load_failed'))
  } finally {
    isLoading.value = false
  }
  
  // [WHAT] 加载详情页各功能模块数据（不阻塞主流程）
  loadFundDetails()
}

async function loadFundDetails() {
  const code = fundCode.value
  if (!code) return

  try {
    // [WHAT] 并行加载不需要依赖顺序的数据
    const [holdingsResult, industryData, assetData, ratingResult, periodResult, feesResult, dividendResult, announcementResult] = await Promise.all([
      fetchTopHoldings(code).catch(() => []),
      fetchIndustryAllocation(code).catch(() => []),
      fetchAssetAllocation(code).catch(() => null),
      fetchFundRating(code).catch(() => null),
      fetchPeriodReturnExt(code).catch(() => []),
      fetchFundFees(code).catch(() => null),
      fetchDividendRecords(code).catch(() => []),
      fetchFundAnnouncements(code).catch(() => []),
    ])

    // [WHAT] 重仓股票 - 转换格式适配模板
    stockHoldings.value = holdingsResult
      .filter(h => h.weight && parseFloat(h.weight) > 0)
      .map(h => ({
        stockCode: h.code,
        stockName: h.name,
        holdingRatio: parseFloat(h.weight) || 0
      }))
      .sort((a, b) => b.holdingRatio - a.holdingRatio)

    // [WHAT] 行业配置
    const palette = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272']
    industryAllocation.value = (industryData as any[]).map((item: any, idx: number) => ({
      ...item,
      color: item.color || palette[idx % palette.length]
    })) as any[]

    // [WHAT] 资产配置
    assetAllocation.value = assetData

    // [WHAT] 基金评级
    fundRating.value = ratingResult

    // [WHAT] 阶段涨幅
    periodReturns.value = periodResult

    // [WHAT] 费率信息
    fundFees.value = feesResult

    // [WHAT] 分红记录
    dividendRecords.value = dividendResult

    // [WHAT] 基金公告
    announcements.value = announcementResult

  } catch (err) {
    // 单个模块加载失败不影响整体页面
    logger.error('加载详情页数据失败', err)
  }
}

// [WHAT] 计算涨跌 - 使用准确的涨跌幅数据
const priceChangePercent = computed(() => {
  return parseFloat(fundInfo.value?.gszzl || '0') || 0
})

const isUp = computed(() => priceChangePercent.value >= 0)

// [WHAT] 加载趋势预测
async function loadTrendPrediction() {
  if (trendPrediction.value || isTrendLoading.value) return
  
  isTrendLoading.value = true
  try {
    const historyResult = await fetchNetValueHistoryFast(fundCode.value, 90)
    const history = historyResult.records || []
    if (history.length > 0) {
      const data = history.map(item => ({
        date: item.date,
        value: item.netValue,
        change: item.changeRate
      }))
      
      trendPrediction.value = predictTrend(data)
      returnAnalysis.value = calculateReturnAnalysis(data)
      if (returnAnalysis.value) {
        fundScore.value = calculateFundScore(returnAnalysis.value)
      }
    }
  } catch (err) {
    logger.error('获取趋势预测失败', err)
  } finally {
    isTrendLoading.value = false
  }
}

// [WHAT] 页面加载时自动加载趋势预测（合并到上方 onMounted，避免覆盖）
watch(fundCode, async (newCode) => {
  if (newCode) {
    isTrendLoading.value = true
    try {
      const historyResult = await fetchNetValueHistoryFast(newCode, 90)
      const history = historyResult.records || []
      if (history.length > 0) {
        const data = history.map(item => ({
          date: item.date,
          value: item.netValue,
          change: item.changeRate
        }))
        trendPrediction.value = predictTrend(data)
        returnAnalysis.value = calculateReturnAnalysis(data)
        if (returnAnalysis.value) {
          fundScore.value = calculateFundScore(returnAnalysis.value)
        }
      }
    } catch (err) {
      logger.error('获取趋势预测失败', err)
    } finally {
      isTrendLoading.value = false
    }
  }
}, { immediate: true })

function goBack() {
  router.back()
}

// [WHAT] 底部操作
function editHolding() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast(t('detail.not_holding'))
    return
  }
  
  // [WHAT] 填充当前持仓数据（优先使用保存的市值和收益）
  costFormData.value = {
    code: holding.code,
    name: holding.name,
    amount: (holding.marketValue || holding.shares * holding.currentValue! || 0).toString(),
    profit: (holding.profit !== undefined ? holding.profit : (holding.currentValue && holding.buyNetValue ? (holding.currentValue - holding.buyNetValue) * holding.shares : 0)).toString()
  }
  showCostDialog.value = true
}

// [WHAT] 提交调整成本
async function submitCostAdjust() {
  const marketValue = parseFloat(costFormData.value.amount)
  const profit = parseFloat(costFormData.value.profit)
  
  if (!marketValue || marketValue <= 0) {
    showToast(t('detail.invalid_amount'))
    return
  }
  if (isNaN(profit)) {
    showToast(t('detail.invalid_profit'))
    return
  }
  
  const holding = holdingInfo.value
  if (!holding) {
    return
  }
  
  showLoadingToast('正在获取最新净值...')
  
  try {
    const latestNetValue = await fetchLatestNetValue(holding.code)
    
    if (!latestNetValue || latestNetValue.netValue <= 0) {
      showToast(t('detail.fetch_nav_failed'))
      return
    }
    
    const currentNetValue = latestNetValue.netValue
    
    const newShares = marketValue / currentNetValue
    
    const costMarketValue = marketValue - profit
    const costNetValue = newShares > 0 ? costMarketValue / newShares : currentNetValue
    
    const addedGain = ((currentNetValue - costNetValue) / currentNetValue) * 100

    const record = {
      code: holding.code,
      name: holding.name,
      buyNetValue: costNetValue,
      shares: newShares,
      buyDate: holding.buyDate,
      holdingDays: holding.holdingDays,
      industrySectors: holding.industrySectors,
      source: holding.source,
      isQDII: holding.isQDII,
      createdAt: holding.createdAt,
      currentValue: currentNetValue,
      addedGain: addedGain,
      marketValue: marketValue,
      profit: profit
    }
    
    holdingStore.addOrUpdateHolding(record)
    showToast(t('holding.cost_adjust_success'))
    router.back()
  } catch (error) {
    showToast(t('holding.cost_adjust_failed'))
  } finally {
    closeToast()
    showCostDialog.value = false
  }
}

// [WHAT] 删除持仓
async function handleDelete() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast(t('detail.not_holding'))
    return
  }
  
  try {
    await showConfirmDialog({
      title: t('common.confirm_delete'),
      message: t('detail.delete_confirm')
    })
    await holdingStore.removeHolding(fundCode.value)
    showToast(t('common.deleted'))
    router.back()
  } catch {
    // 用户取消
  }
}

function showTransactions() {
  router.push(`/trades/${fundCode.value}`)
}

async function removeFromWatchlist() {
  if (!fundStore.isFundInWatchlist(fundCode.value)) {
    showToast(t('detail.not_in_watchlist'))
    return
  }
  
  try {
    await showConfirmDialog({
      title: t('detail.delete_watchlist'),
      message: `确定将 ${fundInfo.value?.name || '该基金'} 从自选中删除？`
    })
    await fundStore.removeFund(fundCode.value)
    showToast(t('common.deleted'))
  } catch {
    // 取消
  }
}

async function addToWatchlist() {
  if (fundStore.isFundInWatchlist(fundCode.value)) {
    showToast(t('detail.already_in_watchlist'))
    return
  }
  await fundStore.addFund(fundCode.value, fundInfo.value?.name || '')
  showToast(t('common.add_success'))
}

function showMore() {
  router.push('/about')
}

// [WHAT] 打开行业板块管理弹窗
function manageSectors() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast(t('detail.not_holding'))
    return
  }
  
  // 填充当前行业板块数据
  sectorFormData.value.sectors = holding.industrySectors || ''
  showSectorDialog.value = true
}

async function submitSectorAdjust() {
  const sectors = sectorFormData.value.sectors.trim() || undefined
  
  const holding = holdingInfo.value
  if (!holding) return
  
  const record = {
    ...holding,
    industrySectors: sectors
  }
  
  await holdingStore.addOrUpdateHolding(record)
  showToast(t('detail.sectors_updated'))
  showSectorDialog.value = false
}

// [WHAT] 打开来源管理弹窗
function manageSource() {
  const holding = holdingInfo.value
  if (!holding) {
    showToast(t('detail.not_holding'))
    return
  }
  
  // 填充当前来源数据
  sourceFormData.value.source = holding.source || ''
  sourceFormData.value.isQDII = holding.isQDII || false
  showSourceDialog.value = true
}

// [WHAT] 提交来源修改
async function submitSourceAdjust() {
  const source = sourceFormData.value.source.trim()
  const isQDII = sourceFormData.value.isQDII
  
  const holding = holdingInfo.value
  if (!holding) return
  
  // 更新持仓记录
  const record = {
    ...holding,
    source: source,
    isQDII: isQDII
  }
  
  await holdingStore.addOrUpdateHolding(record)
  showToast(t('detail.source_updated'))
  showSourceDialog.value = false
}

// [WHAT] 跳转同类基金
function goToSimilarFund(code: string) {
  if (code === fundCode.value) {
    showToast(t('detail.already_in_this_fund'))
    return
  }
  router.push(`/detail/${code}`)
}

// [WHAT] 搜索同类基金
function searchSimilarFunds() {
  // 已移除，不再使用
}

// [WHAT] 打开公告链接
 
function openAnnouncement(url: string) {
  if (url) {
    window.open(url, '_blank')
  } else {
    showToast(t('detail.no_detail_link'))
  }
}

// [WHAT] 格式化数字
function formatNum(num: number, decimals = 2): string {
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toFixed(decimals)
}

function formatMoney(num: number): string {
  const prefix = num >= 0 ? '' : '-'
  const absNum = Math.abs(num)
  if (absNum >= 10000) {
    return prefix + (absNum / 10000).toFixed(2) + '万'
  }
  return prefix + absNum.toFixed(2)
}

function formatPercent(num: number): string {
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}${num.toFixed(2)}%`
}
</script>

<template>
  <div class="detail-page">
    <!-- 顶部区域 -->
    <div class="top-header">
      <!-- 导航栏 -->
      <div class="nav-bar">
        <van-icon name="arrow-left" size="22" color="var(--text-primary)" @click="goBack" :data-test-id="'back-button'" />
        <div class="nav-title">
          <div class="fund-name" :data-test-id="'fund-name'">{{ fundInfo?.name || '加载中...' }}</div>
          <div class="fund-info-row">
            <span class="fund-code" :data-test-id="'fund-code'">{{ fundCode }}</span>
            <span class="info-divider">|</span>
            <span class="estimate-tag" :class="isUp ? 'up' : 'down'">
              {{ fundInfo?.dataSource === 'nav' ? '净值' : '估值' }}涨幅 {{ formatPercent(priceChangePercent) }}
            </span>
            <span class="info-divider">|</span>
            <span class="estimate-tag">
              {{ fundInfo?.dataSource === 'nav' ? '净值' : '估值' }} {{ fundInfo?.gsz ? parseFloat(fundInfo.gsz).toFixed(4) : '--' }}
            </span>
          </div>
          <div v-if="holdingDetails" class="fund-info-row holding-info-row">
            <span class="fund-code">市值 {{ formatMoney(holdingDetails.amount) }}</span>
            <span class="info-divider">|</span>
            <span class="estimate-tag">收益 {{ formatMoney(holdingDetails.profit) }}</span>
            <span class="info-divider">|</span>
            <span class="estimate-tag">占比 {{ holdingDetails.ratio.toFixed(2) }}%</span>
          </div>
        </div>
      </div>
      
      <!-- 核心指标 -->
      <div class="core-metrics" v-if="!isLoading" :data-test-id="'valuation-section'">
        <div class="main-change">
          <div class="change-label">当日涨幅 {{ fundInfo?.gztime?.slice(5, 10) || '--' }}</div>
          <div class="change-value" :class="isUp ? 'up' : 'down'" :data-test-id="'valuation-change'">
            {{ formatPercent(priceChangePercent) }}
          </div>
        </div>
        <div class="sub-metrics">
          <div class="metric-item">
            <div class="metric-label">{{ t('detail.estimate_nav') }}</div>
            <div class="metric-value" :data-test-id="'valuation'">{{ fundInfo?.gsz || '--' }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">{{ t('detail.yesterday_nav') }}</div>
            <div class="metric-value">{{ fundInfo?.dwjz || '--' }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">{{ bestPeriodReturn.label }}</div>
            <div class="metric-value" :class="bestPeriodReturn.value >= 0 ? 'up' : 'down'">
              {{ bestPeriodReturn.value !== 0 ? formatPercent(bestPeriodReturn.value) : '--' }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="core-metrics loading" :data-test-id="'loading'">
        <van-loading color="var(--text-secondary)" />
      </div>
    </div>
    
    <!-- 持仓数据区 -->
    <div v-if="holdingDetails" class="holding-panel" :class="{ collapsed: !holdingExpanded }">
      <div class="holding-summary" @click="holdingExpanded = !holdingExpanded">
        <div class="summary-item">
          <span class="summary-label">{{ t('detail.hold_amount') }}</span>
          <span class="summary-value">{{ formatNum(holdingDetails.amount) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ t('detail.hold_profit') }}</span>
          <span class="summary-value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
            {{ formatNum(holdingDetails.profit) }}
          </span>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ t('holding.profit_rate_label') }}</span>
          <span class="summary-value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
            {{ formatPercent(holdingDetails.profitRate) }}
          </span>
        </div>
        <van-icon 
          :name="holdingExpanded ? 'arrow-up' : 'arrow-down'" 
          class="expand-icon"
        />
      </div>
      
      <transition name="slide">
        <div v-show="holdingExpanded" class="holding-grid">
          <div class="holding-item">
            <div class="item-label">{{ t('detail.hold_amount') }}</div>
            <div class="item-value">{{ formatNum(holdingDetails.amount) }}</div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.hold_shares') }}</div>
            <div class="item-value">{{ formatNum(holdingDetails.shares) }}</div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.holding_ratio') }}</div>
            <div class="item-value">{{ holdingDetails.ratio.toFixed(2) }}%</div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.hold_profit') }}</div>
            <div class="item-value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.profit) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.hold_profit_rate') }}</div>
            <div class="item-value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
              {{ formatPercent(holdingDetails.profitRate) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.holding_cost') }}</div>
            <div class="item-value">{{ holdingDetails.cost.toFixed(4) }}</div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.today_profit') }}</div>
            <div class="item-value" :class="holdingDetails.todayProfit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.todayProfit) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.yesterday_profit') }}</div>
            <div class="item-value" :class="holdingDetails.yesterdayProfit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.yesterdayProfit) }}
            </div>
          </div>
          <div class="holding-item">
            <div class="item-label">{{ t('detail.hold_days') }}</div>
            <div class="item-value">{{ holdingDetails.holdDays }}</div>
          </div>
        </div>
      </transition>
    </div>

    <!-- 图表区域 -->
    <div class="chart-section" :data-test-id="'chart-container'">

      
      <ProChart
        :fund-code="fundCode"
        :realtime-value="fundInfo?.gsz ? parseFloat(fundInfo.gsz) : 0"
        :realtime-change="priceChangePercent"
        :last-close="fundInfo?.dwjz ? parseFloat(fundInfo.dwjz) : 0"
      />
      
    </div>

    <!-- 业绩走势 -->
    <div class="performance-section" v-show="activeTab === 'performance'">
      <div v-if="periodReturns.length > 0" class="period-grid">
        <div 
          v-for="item in periodReturns.slice(0, 6)" 
          :key="item.period"
          class="period-item"
        >
          <div class="period-label">{{ item.label }}</div>
          <div class="period-return" :class="item.fundReturn >= 0 ? 'up' : 'down'">
            {{ formatPercent(item.fundReturn) }}
          </div>
          <div class="period-rank" v-if="item.rank > 0">
            <span class="rank-num">{{ item.rank }}</span>/{{ item.totalCount }}
          </div>
        </div>
      </div>
      <van-empty v-else description="暂无业绩数据" />
    </div>

    <!-- 我的收益 -->
    <div class="profit-section" v-show="activeTab === 'profit'">
      <div v-if="holdingDetails" class="profit-chart">
        <div class="profit-summary">
          <div class="profit-total">
            <span class="label">{{ t('detail.total_profit') }}</span>
            <span class="value" :class="holdingDetails.profit >= 0 ? 'up' : 'down'">
              {{ formatNum(holdingDetails.profit) }}
            </span>
          </div>
          <div class="profit-rate">
            <span class="label">{{ t('holding.profit_rate_label') }}</span>
            <span class="value" :class="holdingDetails.profitRate >= 0 ? 'up' : 'down'">
              {{ formatPercent(holdingDetails.profitRate) }}
            </span>
          </div>
        </div>
      </div>
      <van-empty v-else description="暂未持有该基金" />
    </div>

    <!-- 趋势预测 -->
    <TrendPredictionSection
      :trend-prediction="trendPrediction"
      :fund-score="fundScore"
      :is-trend-loading="isTrendLoading"
    />

    <!-- 关联板块 -->
    <div v-if="sectorInfo" class="sector-section" @click="searchSimilarFunds">
      <div class="sector-info">
        <span class="sector-label">{{ t('detail.related_sectors') }}</span>
        <span class="sector-name">{{ sectorInfo.name }}</span>
        <span class="sector-change" :class="sectorInfo.dayReturn >= 0 ? 'up' : 'down'">
          {{ formatPercent(sectorInfo.dayReturn) }}
        </span>
      </div>
      <div class="sector-link">
        {{ similarFunds.length }}只同类基金
        <van-icon name="arrow" />
      </div>
    </div>

    <!-- 自定义行业板块 -->
    <div v-if="holdingInfo?.industrySectors?.length" class="info-section">
      <div class="section-header">
        <span>{{ t('detail.custom_sectors') }}</span>
      </div>
      <div class="sector-tags">
        <span class="sector-tag">
          {{ holdingInfo.industrySectors || '未设置' }}
        </span>
      </div>
    </div>

    <!-- 来源信息 -->
    <div v-if="holdingInfo?.source || holdingInfo?.isQDII" class="info-section">
      <div class="section-header">
        <span>{{ t('detail.fund_source') }}</span>
      </div>
      <div class="source-info">
        <van-icon name="shop-o" size="16" />
        <span>{{ getSourceLabel(holdingInfo.source || '') }}</span>
        <span v-if="holdingInfo.isQDII" class="qdii-badge">QDII</span>
      </div>
    </div>

    <!-- 同类基金 -->
    <div v-if="similarFunds.length > 0" class="similar-section">
      <div class="section-header">
        <span>{{ t('detail.similar_funds') }}</span>
        <span class="section-tip">{{ t('detail.year_up_top5') }}</span>
      </div>
      <div class="similar-list">
        <div 
          v-for="fund in similarFunds.slice(0, 5)" 
          :key="fund.code"
          class="similar-item"
          @click="goToSimilarFund(fund.code)"
        >
          <div class="similar-info">
            <div class="similar-name">{{ fund.name }}</div>
            <div class="similar-code">{{ fund.code }}</div>
          </div>
          <div class="similar-return" :class="fund.yearReturn >= 0 ? 'up' : 'down'">
            {{ formatPercent(fund.yearReturn) }}
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 基金规模 ========== -->
    <div v-if="fundScale && fundScale.scale > 0" class="info-section">
      <div class="section-header">
        <span>{{ t('detail.fund_scale') }}</span>
        <span class="section-tip">{{ fundScale.scaleDate }}</span>
      </div>
      <div class="scale-grid">
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.scale.toFixed(2) }}亿</div>
          <div class="scale-label">{{ t('detail.asset_scale') }}</div>
        </div>
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.shareTotal.toFixed(2) }}亿份</div>
          <div class="scale-label">{{ t('detail.total_shares') }}</div>
        </div>
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.institutionRatio.toFixed(1) }}%</div>
          <div class="scale-label">{{ t('detail.inst_hold') }}</div>
        </div>
        <div class="scale-item">
          <div class="scale-value">{{ fundScale.personalRatio.toFixed(1) }}%</div>
          <div class="scale-label">{{ t('detail.personal_hold') }}</div>
        </div>
      </div>
    </div>

    <!-- ========== 费率信息 ========== -->
    <div v-if="fundFees" class="info-section">
      <div class="section-header">
        <span>{{ t('detail.fee_info') }}</span>
      </div>
      <div class="fee-grid">
        <div class="fee-item">
          <div class="fee-label">{{ t('detail.management_fee') }}</div>
          <div class="fee-value">{{ fundFees.managementFee.toFixed(2) }}%/年</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">{{ t('detail.custodian_fee') }}</div>
          <div class="fee-value">{{ fundFees.custodianFee.toFixed(2) }}%/年</div>
        </div>
        <div class="fee-item" v-if="fundFees.salesServiceFee > 0">
          <div class="fee-label">{{ t('detail.sales_service_fee') }}</div>
          <div class="fee-value">{{ fundFees.salesServiceFee.toFixed(2) }}%/年</div>
        </div>
      </div>
      
     
      <div class="fee-table">
        <div class="table-title">{{ t('detail.purchase_rate') }}</div>
        <div class="table-row header">
          <span>{{ t('detail.amount') }}</span>
          <span>{{ t('detail.original_rate') }}</span>
          <span>{{ t('detail.discounted_rate') }}</span>
        </div>
        <div 
          v-for="(fee, idx) in fundFees.purchaseFees.slice(0, 4)" 
          :key="'p' + idx"
          class="table-row"
        >
          <span>
            {{ fee.minAmount === 0 && fee.maxAmount === Infinity 
              ? '全部金额'
              : fee.maxAmount === Infinity 
                ? `≥${fee.minAmount}万` 
                : fee.minAmount === 0
                  ? `<${fee.maxAmount}万`
                  : `${fee.minAmount}-${fee.maxAmount}万` }}
          </span>
          <span>{{ fee.rate >= 1000 ? `${fee.rate}元` : fee.rate === 0 ? '免费' : `${fee.rate}%` }}</span>
          <span class="discount">{{ fee.discountRate >= 1000 ? `${fee.discountRate}元` : fee.discountRate === 0 ? '免费' : `${fee.discountRate}%` }}</span>
        </div>
      </div>
      
     
      <div class="fee-table">
        <div class="table-title">{{ t('detail.redemption_fee') }}</div>
        <div class="table-row header">
          <span>{{ t('detail.hold_days') }}</span>
          <span>{{ t('detail.rate') }}</span>
        </div>
        <div 
          v-for="(fee, idx) in fundFees.redemptionFees" 
          :key="'r' + idx"
          class="table-row"
        >
          <span>
            {{ fee.maxDays === Infinity 
              ? `≥${fee.minDays}天` 
              : fee.minDays === 0 
                ? `<${fee.maxDays}天`
                : `${fee.minDays}-${fee.maxDays}天` }}
          </span>
          <span :class="{ free: fee.rate === 0 }">{{ fee.rate === 0 ? '免费' : `${fee.rate}%` }}</span>
        </div>
      </div>
      
     
      <div v-if="estimatedRedemptionFee && holdingDetails" class="redemption-estimate">
        <div class="estimate-info">
          <span>当前持有 {{ holdingDetails.holdDays }} 天，赎回费率 {{ estimatedRedemptionFee.rate }}%</span>
        </div>
        <div class="estimate-fee">
          预估赎回费: <span class="fee-amount">¥{{ estimatedRedemptionFee.fee.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <!-- ========== 重仓股票 ========== -->
    <div class="info-section">
      <div class="section-header">
        <span>{{ t('detail.top_stocks') }}</span>
        <span class="section-tip" v-if="stockHoldings.length > 0">
          TOP{{ stockHoldings.length }}
        </span>
      </div>
      <div v-if="stockHoldings.length > 0" class="holdings-list">
        <div 
          v-for="(stock, idx) in stockHoldings" 
          :key="idx"
          class="holding-item"
        >
          <div class="holding-rank">{{ idx + 1 }}</div>
          <div class="holding-info">
            <div class="holding-name">{{ stock.stockName }}</div>
            <div class="holding-code">{{ stock.stockCode }}</div>
          </div>
          <div class="holding-ratio">
            <div class="ratio-value">{{ stock.holdingRatio.toFixed(2) }}%</div>
            <div class="ratio-label">{{ t('detail.hold_ratio') }}</div>
          </div>
        </div>
      </div>
      <div v-else class="empty-hint">{{ t('detail.no_holding_data') }}</div>
    </div>

    <!-- ========== 行业配置 ========== -->
    <div class="info-section" v-if="industryAllocation.length > 0">
      <div class="section-header">
        <span>{{ t('detail.industry_alloc') }}</span>
      </div>
      <div class="industry-chart">
     
        <div class="pie-container">
          <svg viewBox="0 0 100 100" class="pie-svg">
            <circle 
              v-for="(item, idx) in industryPieData" 
              :key="idx"
              cx="50" cy="50" r="40"
              fill="transparent"
              :stroke="item.color"
              stroke-width="20"
              :stroke-dasharray="item.dashArray"
              :stroke-dashoffset="item.offset"
              :style="{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }"
            />
          </svg>
        </div>
        <div class="industry-legend">
          <div 
            v-for="item in industryAllocation.slice(0, 6)" 
            :key="item.name"
            class="legend-item"
          >
            <span class="legend-color" :style="{ background: item.color }"></span>
            <span class="legend-name">{{ item.name }}</span>
            <span class="legend-value">{{ item.ratio }}%</span>
          </div>
        </div>
      </div>
    </div>

   
    <div class="info-section" v-if="assetAllocation">
      <div class="section-header">
        <span>{{ t('detail.asset_alloc') }}</span>
      </div>
      <div class="asset-bars">
        <div class="asset-item" v-if="assetAllocation.stock > 0">
          <span class="asset-label">{{ t('detail.stock_label') }}</span>
          <div class="asset-bar">
            <div class="bar-fill stock" :style="{ width: assetAllocation.stock + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.stock }}%</span>
        </div>
        <div class="asset-item" v-if="assetAllocation.bond > 0">
          <span class="asset-label">{{ t('detail.bond_label') }}</span>
          <div class="asset-bar">
            <div class="bar-fill bond" :style="{ width: assetAllocation.bond + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.bond }}%</span>
        </div>
        <div class="asset-item" v-if="assetAllocation.cash > 0">
          <span class="asset-label">{{ t('detail.cash_label') }}</span>
          <div class="asset-bar">
            <div class="bar-fill cash" :style="{ width: assetAllocation.cash + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.cash }}%</span>
        </div>
        <div class="asset-item" v-if="assetAllocation.other > 0">
          <span class="asset-label">{{ t('detail.other_label') }}</span>
          <div class="asset-bar">
            <div class="bar-fill other" :style="{ width: assetAllocation.other + '%' }"></div>
          </div>
          <span class="asset-value">{{ assetAllocation.other }}%</span>
        </div>
      </div>
    </div>

    <div class="info-section" v-if="fundRating">
      <div class="section-header">
        <span>{{ t('detail.fund_rating') }}</span>
        <span class="section-tip">{{ fundRating.riskLevel }}</span>
      </div>
      <div class="rating-content">
        <div class="rating-stars">
          <van-icon 
            v-for="i in 5" 
            :key="i" 
            :name="i <= fundRating.rating ? 'star' : 'star-o'" 
            :color="i <= fundRating.rating ? '#f59e0b' : '#d1d5db'"
            size="20"
          />
          <span class="rating-text">{{ fundRating.rating }}星</span>
        </div>
        <div class="rating-metrics">
          <div class="metric-item">
            <div class="metric-value">{{ fundRating.sharpeRatio || '--' }}</div>
            <div class="metric-label">{{ t('detail.sharpe_ratio') }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-value danger">{{ fundRating.maxDrawdown ? fundRating.maxDrawdown + '%' : '--' }}</div>
            <div class="metric-label">{{ t('detail.max_drawdown') }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-value">{{ fundRating.volatility ? fundRating.volatility + '%' : '--' }}</div>
            <div class="metric-label">{{ t('detail.volatility') }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-value primary">{{ fundRating.rankInSimilar }}</div>
            <div class="metric-label">{{ t('detail.peer_rank') }}</div>
          </div>
        </div>
      </div>
    </div>

   
    <!-- ========== 分红记录 ========== -->
    <DividendRecordsSection
      v-if="dividendRecords.length > 0"
      :dividend-records="dividendRecords"
      :total-dividend="totalDividend"
    />

    <!-- ========== 基金公告 ========== -->
    <FundAnnouncementsSection
      v-if="announcements.length > 0"
      :announcements="announcements"
      @open-announcement="openAnnouncement"
    />

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <div class="bar-item" @click="editHolding">
        <van-icon name="edit" size="20" />
        <span>{{ t('detail.edit_holding') }}</span>
      </div>
      <div class="bar-item" v-if="holdingInfo" @click="handleDelete">
        <van-icon name="delete" size="20" />
        <span>{{ t('detail.remove_from_holdings') }}</span>
      </div>
      <div class="bar-item" @click="manageSource">
        <van-icon name="shop-o" size="20" />
        <span>{{ t('news.source') }}</span>
      </div>
      <div class="bar-item" @click="showTransactions">
        <van-icon name="orders-o" size="20" />
        <span>{{ t('detail.trade_record') }}</span>
      </div>
      <div class="bar-item" @click="fundStore.isFundInWatchlist(fundCode) ? removeFromWatchlist() : addToWatchlist()">
        <van-icon :name="fundStore.isFundInWatchlist(fundCode) ? 'star' : 'star-o'" size="20" />
        <span>{{ fundStore.isFundInWatchlist(fundCode) ? '删自选' : '加自选' }}</span>
      </div>
      <div class="bar-item" @click="manageSectors">
        <van-icon name="cluster-o" size="20" />
        <span>{{ t('detail.industry_sector') }}</span>
      </div>
      <div class="bar-item" @click="showMore">
        <van-icon name="ellipsis" size="20" />
        <span>{{ t('detail.more') }}</span>
      </div>
    </div>

    <!-- 调整成本弹窗 -->
    <van-popup
      v-model:show="showCostDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '360px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>{{ t('detail.adjust_cost') }}</span>
          <van-icon name="cross" @click="showCostDialog = false" />
        </div>

        <div class="dialog-content">
          <van-field
            :model-value="`${costFormData.name} (${costFormData.code})`"
            :label="t('基金')"
            readonly
          />
          <van-field
            v-model="costFormData.amount"
            type="number"
            :label="t('持仓金额')"
            :placeholder="t('调整后的持仓金额（元）')"
          />
          <van-field
            v-model="costFormData.profit"
            type="number"
            :label="t('持仓收益')"
            :placeholder="t('调整后的持仓收益（元）')"
          />
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>{{ t('detail.cost_desc') }}</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showCostDialog = false">{{ t('common.cancel') }}</van-button>
          <van-button type="primary" @click="submitCostAdjust">{{ t('common.confirm') }}</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 行业板块管理弹窗 -->
    <van-popup
      v-model:show="showSectorDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '360px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>{{ t('detail.manage_sectors') }}</span>
          <van-icon name="cross" @click="showSectorDialog = false" />
        </div>

        <div class="dialog-content">
          <van-field
            :model-value="`${holdingInfo?.name} (${holdingInfo?.code})`"
            :label="t('基金')"
            readonly
          />
          <van-field
            v-model="sectorFormData.sectors"
            type="textarea"
            :label="t('行业板块')"
            placeholder="每行输入一个行业板块，例如：\n新能源\n半导体\n医药"
            :rows="5"
          />
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>{{ t('detail.sectors_desc') }}</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showSectorDialog = false">{{ t('common.cancel') }}</van-button>
          <van-button type="primary" @click="submitSectorAdjust">{{ t('common.confirm') }}</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 来源管理弹窗 -->
    <van-popup
      v-model:show="showSourceDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '360px' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>{{ t('detail.manage_source') }}</span>
          <van-icon name="cross" @click="showSourceDialog = false" />
        </div>

        <div class="dialog-content">
          <van-field
            :model-value="`${holdingInfo?.name} (${holdingInfo?.code})`"
            :label="t('基金')"
            readonly
          />
          <div class="form-item">
            <label class="form-label">{{ t('news.source') }}</label>
            <van-radio-group v-model="sourceFormData.source" class="source-radio-group">
              <van-radio 
                v-for="option in sourceOptions" 
                :key="option.value" 
                :name="option.value"
                class="source-radio"
              >
                {{ option.text }}
              </van-radio>
            </van-radio-group>
          </div>
          <div class="form-item">
            <div class="qdii-toggle">
              <span class="qdii-label">{{ t('detail.is_qdii') }}</span>
              <van-switch v-model="sourceFormData.isQDII" size="24" />
            </div>
          </div>
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>{{ t('detail.source_desc') }}</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button @click="showSourceDialog = false">{{ t('common.cancel') }}</van-button>
          <van-button type="primary" @click="submitSourceAdjust">{{ t('common.confirm') }}</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.detail-page {
  /* [WHY] 使用 100% 高度适配 flex 布局 */
  height: 100%;
  background: var(--bg-primary);
  /* [WHY] 允许页面整体滚动 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  /* [WHY] 底部留白给操作栏 */
  padding-bottom: 70px;
  /* [WHY] 顶部留白给固定导航栏和安全区（导航栏高度 55px + 安全区 + 额外 16px 间距） */
  padding-top: calc(55px + env(safe-area-inset-top, 0px) + 16px);
}

/* ========== 顶部区域 ========== */
.top-header {
  background: var(--bg-primary);
  padding-top: calc(env(safe-area-inset-top, 0px) + 4px);
  border-bottom: 1px solid var(--border-color);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
}

.nav-bar {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 4px);
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  background: var(--bg-primary);
  z-index: 1000;
}

.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
}

.fund-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* 基金信息行 */
.fund-info-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.info-divider {
  font-size: 10px;
  color: var(--border-color);
  opacity: 0.5;
}

.fund-info-row span {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.estimate-tag {
  font-weight: 600;
  font-size: 13px;
}

.holding-info-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.estimate-tag.up {
  color: var(--color-up);
}

.estimate-tag.down {
  color: var(--color-down);
}

.core-metrics {
  padding: 16px 20px 24px;
}

.core-metrics.loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.main-change {
  margin-bottom: 16px;
}

.change-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.change-value {
  font-size: 42px;
  font-weight: 700;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.change-value.up {
  color: #f56c6c;
}

.change-value.down {
  color: #67c23a;
}

.sub-metrics {
  display: flex;
  gap: 40px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.metric-value.up {
  color: #f56c6c;
}

.metric-value.down {
  color: #67c23a;
}

/* ========== 持仓数据区 ========== */
.holding-panel {
  background: var(--bg-secondary);
  margin: 0 12px;
  margin-top: -12px;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
}

/* 简要信息（收起时显示） */
.holding-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.holding-panel.collapsed .holding-summary {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.summary-item {
  flex: 1;
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.summary-value {
  font-size: 15px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.summary-value.up { color: #f56c6c; }
.summary-value.down { color: #67c23a; }

.expand-icon {
  color: var(--text-secondary);
  transition: transform 0.3s;
}

.holding-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.holding-item {
  text-align: center;
}

.item-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.item-value {
  font-size: 16px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  color: var(--text-primary);
}

.item-value.up { color: #f56c6c; }
.item-value.down { color: #67c23a; }

/* 展开/收起动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  max-height: 300px;
  opacity: 1;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ========== Tab切换 ========== */
.tab-bar {
  display: flex;
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: 8px;
  padding: 4px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 10px;
  font-size: 14px;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-item.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 500;
}

/* ========== 图表区域 ========== */
.chart-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
  overflow: hidden;
  padding-top: 20px;
}

.chart-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  gap: 12px;
}

.estimate-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.estimate-tag.up {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.estimate-tag.down {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.data-source {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ========== 业绩走势 ========== */
.performance-section, .profit-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
  padding: 16px;
  min-height: 200px;
}

.period-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.period-item {
  text-align: center;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.period-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.period-return {
  font-size: 16px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.period-return.up { color: #f56c6c; }
.period-return.down { color: #67c23a; }

.period-rank {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.period-rank .rank-num {
  color: var(--color-primary);
}

/* ========== 我的收益 ========== */
.profit-summary {
  display: flex;
  justify-content: space-around;
  padding: 24px 0;
}

.profit-total, .profit-rate {
  text-align: center;
}

.profit-total .label, .profit-rate .label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: block;
}

.profit-total .value, .profit-rate .value {
  font-size: 24px;
  font-weight: 700;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.profit-total .value.up, .profit-rate .value.up { color: #f56c6c; }
.profit-total .value.down, .profit-rate .value.down { color: #67c23a; }

/* ========== 关联板块 ========== */
.sector-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
}

.sector-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.sector-label {
  color: var(--text-secondary);
}

.sector-name {
  color: var(--text-primary);
  font-weight: 500;
}

.sector-change {
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.sector-change.up { color: #f56c6c; }
.sector-change.down { color: #67c23a; }

.sector-link {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ========== 同类基金 ========== */
.similar-section {
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}

.section-tip {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}

.similar-list {
  padding: 8px 16px;
}

.similar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.similar-item:last-child {
  border-bottom: none;
}

.similar-item:active {
  opacity: 0.7;
}

.similar-info {
  flex: 1;
  overflow: hidden;
}

.similar-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar-code {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.similar-return {
  font-size: 14px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.similar-return.up { color: #f56c6c; }
.similar-return.down { color: #67c23a; }

/* ========== 信息区块通用样式 ========== */
.info-section {
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: 12px;
  overflow: hidden;
}

/* ========== 基金规模 ========== */
.scale-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 12px 8px;
  gap: 8px;
}

.scale-item {
  text-align: center;
}

.scale-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.scale-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* ========== 费率信息 ========== */
.fee-grid {
  display: flex;
  padding: 12px 16px;
  gap: 24px;
  border-bottom: 1px solid var(--border-color);
}

.fee-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fee-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.fee-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.fee-table {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.fee-table:last-of-type {
  border-bottom: none;
}

.table-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.table-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.table-row.header {
  color: var(--text-tertiary);
  font-size: 11px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  margin-bottom: 4px;
}

.table-row span {
  flex: 1;
  text-align: center;
}

.table-row span:first-child {
  text-align: left;
}

.table-row .discount {
  color: #f56c6c;
  font-weight: 500;
}

.table-row .free {
  color: #67c23a;
  font-weight: 500;
}

.redemption-estimate {
  padding: 12px 16px;
  background: var(--bg-tertiary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.estimate-info {
  font-size: 12px;
  color: var(--text-secondary);
}

.estimate-fee {
  font-size: 13px;
  color: var(--text-primary);
}

.fee-amount {
  font-weight: 600;
  color: #f56c6c;
}

/* ========== 重仓股票 ========== */
.holdings-list {
  padding: 8px 16px 12px;
}

.holding-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.holding-item:last-child {
  border-bottom: none;
}

.holding-rank {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
}

.holding-item:nth-child(1) .holding-rank {
  background: #ff6b6b;
  color: white;
}

.holding-item:nth-child(2) .holding-rank {
  background: #ffa726;
  color: white;
}

.holding-item:nth-child(3) .holding-rank {
  background: #ffca28;
  color: white;
}

.holding-info {
  flex: 1;
  min-width: 0;
}

.holding-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.holding-code {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.holding-ratio {
  text-align: right;
}

.ratio-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-primary);
}

.ratio-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ========== 行业配置 ========== */
.industry-chart {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 20px;
}

.pie-container {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.pie-svg {
  width: 100%;
  height: 100%;
}

.industry-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-value {
  font-weight: 500;
  color: var(--text-primary);
}

/* ========== 资产配置 ========== */
.asset-bars {
  padding: 12px 16px;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.asset-item:last-child {
  margin-bottom: 0;
}

.asset-label {
  width: 36px;
  font-size: 12px;
  color: var(--text-secondary);
}

.asset-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.bar-fill.stock { background: #3b82f6; }
.bar-fill.bond { background: #22c55e; }
.bar-fill.cash { background: #f59e0b; }
.bar-fill.other { background: #8b5cf6; }

.asset-value {
  width: 45px;
  text-align: right;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

/* ========== 基金评级 ========== */
.rating-content {
  padding: 16px;
}

.rating-stars {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
}

.rating-text {
  margin-left: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #f59e0b;
}

.rating-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.metric-item {
  text-align: center;
  padding: 12px 4px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.metric-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.metric-value.danger {
  color: var(--color-down);
}

.metric-value.primary {
  color: var(--color-primary);
}

.metric-label {
  font-size: 10px;
  color: var(--text-secondary);
}

/* ========== 行业板块标签 ========== */
.sector-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
}

.sector-tag {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  white-space: nowrap;
}

/* ========== 来源信息 ========== */
.source-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* ========== 底部操作栏 ========== */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  padding: 8px 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  z-index: 100;
}

.bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 0;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.bar-item:active {
  opacity: 0.7;
}

/* ========== 调整成本弹窗 ========== */
.cost-dialog {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.cost-dialog .dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
}

.cost-dialog .dialog-content {
  padding: 8px 0 16px;
}

.cost-dialog .dialog-footer {
  padding: 12px 16px 16px;
}

.form-item {
  margin: 12px 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
  font-weight: 500;
}

.source-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.source-radio {
  flex: 1;
  min-width: 80px;
  padding: 8px 0;
  font-size: 14px;
  text-align: center;
}

.qdii-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.qdii-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.qdii-badge {
  display: inline-block;
  background: #1989fa;
  color: white;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 8px;
  font-weight: 500;
}

.cost-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
  margin-top: 8px;
}
</style>
