<script setup lang="ts">
// [WHY] 持仓管理页 - 管理用户的基金持仓和收益
// [WHAT] 显示持仓列表、汇总统计，支持添加/编辑/删除持仓
// [WHAT] 支持 A类/C类基金费用计算

import { ref, onMounted, computed, watch, onErrorCaptured } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { useAITrackingStore } from '@/stores/aiTracking'
import { useNetworkStore } from '@/stores/network'
import { useFundStore } from '@/stores/fund'
import { searchFund, fetchFundEstimate } from '@/api/fundFast'
import { fetchLatestNetValue } from '@/api/fundFast'
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant'
import { getSourceLabel } from '@/config/sources'
import { formatMoney, formatPercent, getChangeStatus } from '@/utils/format'
import { saveHoldings, saveSourceFilter, getSourceFilter } from '@/utils/storage'
import { logger, copyLogsToClipboard } from '@/utils/logger'
import { isWeb, isMobile } from '@/utils/platform'
import type { FundInfo, HoldingRecord } from '@/types/fund'
import ScreenshotImport from '@/components/ScreenshotImport.vue'
import riseW from '@/assets/riseW.jpg'
import downW from '@/assets/downW.jpg'

const router = useRouter()
const { t } = useI18n()
const holdingStore = useHoldingStore()
const aiTrackingStore = useAITrackingStore()
const networkStore = useNetworkStore()
const fundStore = useFundStore()

// [WHY] 子组件错误捕获 - 防止整个页面白屏
const holdingHasError = ref(false)
const holdingErrorMsg = ref('')

onErrorCaptured((err) => {
  logger.error('[Holding.vue] 组件错误', err)
  holdingHasError.value = true
  holdingErrorMsg.value = err instanceof Error ? err.message : String(err)
  return false
})

// ========== 表单相关 ==========
const showAddDialog = ref(false)
const isEditing = ref(false)

// ========== 截图导入相关 ==========
const showImportDialog = ref(false)
const formData = ref({
  code: '',
  name: '',
  amount: ''
})

// ========== ActionSheet 相关 ==========
const showActionSheetDialog = ref(false)
const actionSheetTitle = ref('')
const actionSheetActions = ref<{ name: string; key: string }[]>([])
const pendingActionSheetCode = ref('')
const pendingActionSheetName = ref('')

// ========== 批量录入相关 ==========
const showBatchDialog = ref(false)
const batchItems = ref([
  { code: '', amount: '', profit: '', sectors: '', name: '', source: '', isQDII: false, loading: false, error: '' }
])
const isBatchImporting = ref(false)



// 基金搜索相关
const searchKeyword = ref('')
const searchResults = ref<FundInfo[]>([])
const isSearching = ref(false)
const selectedFund = ref<FundInfo | null>(null)
const currentNetValue = ref(0) // 当前基金净值

// ========== 调整成本相关 ==========
const showCostDialog = ref(false)
const costFormData = ref({
  code: '',
  name: '',
  amount: '',
  profit: ''
})

// [WHAT] 页面挂载时初始化数据
onMounted(() => {
  holdingStore.initHoldings()
  currentSourceFilter.value = getSourceFilter()
})

// [WHY] 网络恢复后自动刷新持仓数据
watch(
  () => networkStore.justRecovered,
  (recovered) => {
    if (recovered) {
      onRefresh()
    }
  }
)

// [WHAT] 排序方向
const sortDirection = ref<'up' | 'down' | 'none'>('none')

// [WHAT] 来源筛选
const currentSourceFilter = ref('')

// [WHAT] 按来源筛选基金
function filterBySource(source: string) {
  if (source === 'all') {
    currentSourceFilter.value = ''
    saveSourceFilter('')
    showToast(t('holding.all_funds'))
  } else if (source === 'qdii') {
    if (currentSourceFilter.value === 'qdii') {
      currentSourceFilter.value = ''
      saveSourceFilter('')
      showToast(t('holding.qdii_canceled'))
    } else {
      currentSourceFilter.value = 'qdii'
      saveSourceFilter('qdii')
      showToast(t('holding.qdii_filtered'))
    }
  } else {
    if (currentSourceFilter.value === source) {
      currentSourceFilter.value = ''
      saveSourceFilter('')
      showToast(t('holding.source_canceled', { source: getSourceLabel(source) }))
    } else {
      currentSourceFilter.value = source
      saveSourceFilter(source)
      showToast(t('holding.source_filtered', { source: getSourceLabel(source) }))
    }
  }
}

// [WHAT] 排序后的持仓基金
const sortedHoldings = computed(() => {
  let funds = [...(holdingStore.holdings || [])]
  
  // 来源筛选
  if (currentSourceFilter.value) {
    if (currentSourceFilter.value === 'qdii') {
      funds = funds.filter(f => f.isQDII)
    } else {
      funds = funds.filter(f => f.source === currentSourceFilter.value)
    }
  }
  
  if (sortDirection.value === 'up') {
    return funds.sort((a, b) => {
      const changeA = parseFloat(a.todayChange || '0')
      const changeB = parseFloat(b.todayChange || '0')
      return changeA - changeB
    })
  } else if (sortDirection.value === 'down') {
    return funds.sort((a, b) => {
      const changeA = parseFloat(a.todayChange || '0')
      const changeB = parseFloat(b.todayChange || '0')
      return changeB - changeA
    })
  }
  return funds
})

// [WHAT] 汇总统计样式
const summaryProfitClass = computed(() => {
  return getChangeStatus(holdingStore.summary.totalProfit)
})

const summaryTodayClass = computed(() => {
  return getChangeStatus(holdingStore.summary.todayProfit)
})

// 将持仓按每行两个分组，便于双列展示（仅 Web 端）
const groupedHoldings = computed(() => {
  const items = sortedHoldings.value
  
  // 移动端：每行显示一个基金
  if (isMobile()) {
    return items.map(item => [item])
  }
  
  // Web 端：每行显示两个基金
  const rows: typeof items[] = []
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2))
  }
  return rows
})

// [WHAT] 排序持仓基金
function handleSort(direction: 'up' | 'down' | 'none') {
  sortDirection.value = direction
}

async function onRefresh() {
  await holdingStore.refreshEstimates()
  holdingStore.updateHoldingDays()
  showToast(t('holding.refresh_success'))
}

// [WHAT] 跳转到基金详情

async function handleDelete(code: string) {
  try {
    await showConfirmDialog({
      title: t('holding.delete'),
      message: t('holding.delete_confirm')
    })
    holdingStore.removeHolding(code)
    showToast(t('common.delete') + '成功')
  } catch {
    // 用户取消
  }
}

// [WHAT] 重置表单
function resetForm() {
  formData.value = { code: '', name: '', amount: '' }
  searchKeyword.value = ''
  searchResults.value = []
  selectedFund.value = null
  currentNetValue.value = 0
}

// [WHAT] 搜索基金
let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  
  if (!searchKeyword.value.trim()) {
    searchResults.value = []
    return
  }
  
  searchTimer = setTimeout(async () => {
    isSearching.value = true
    try {
      searchResults.value = await searchFund(searchKeyword.value, 10)
    } finally {
      isSearching.value = false
    }
  }, 300)
}

// [WHAT] 选择基金
async function selectFund(fund: FundInfo) {
  selectedFund.value = fund
  formData.value.code = fund.code
  formData.value.name = fund.name
  searchKeyword.value = ''
  searchResults.value = []
  
  // [WHY] 获取最新净值（使用公布净值，非估值）
  showLoadingToast({ message: t('holding.fetching_nav'), forbidClick: true })
  try {
    const estimate = await fetchFundEstimate(fund.code)
    // [WHY] 优先使用 dwjz（最新公布净值），而非 gsz（实时估值）
    // [WHY] 交易时间内账户显示的收益是基于昨日净值计算的，使用估值会导致成本净值和份额计算不准确
    currentNetValue.value = parseFloat(estimate.dwjz) || parseFloat(estimate.gsz) || 1
    closeToast()
  } catch {
    closeToast()
    // [WHY] 估值API失败时（ETF联接等），尝试从历史净值获取
    try {
      const { fetchSimpleKLineData } = await import('@/api/fundFast')
      const klineData = await fetchSimpleKLineData(fund.code, 30)
      if (klineData && klineData.length > 0) {
        // [WHAT] 使用最新的历史净值
        currentNetValue.value = klineData[klineData.length - 1]!.value
        showToast(t('holding.got_history_nav'))
        return
      }
    } catch {
      // 历史数据也失败
    }
    currentNetValue.value = 1
    showToast(t('holding.enter_nav_manually'))
  }
}

// [WHAT] 计算持有份额
const calculatedShares = computed(() => {
  const amount = parseFloat(formData.value.amount) || 0
  if (amount <= 0 || currentNetValue.value <= 0) return 0
  return amount / currentNetValue.value
})



// 持仓天数改为基于服务器估值时自动计算，新增表单项为手工持有收益

// [WHAT] 提交表单
async function submitForm() {
  if (!formData.value.code) {
    showToast(t('holding.please_select_fund'))
    return
  }
  if (!formData.value.amount || parseFloat(formData.value.amount) <= 0) {
    showToast(t('holding.please_enter_amount'))
    return
  }
  // 持有收益为可选，若为空则视为 0
  
  const record: HoldingRecord = {
    code: formData.value.code,
    name: formData.value.name,
    buyNetValue: currentNetValue.value,
    shares: calculatedShares.value,
    buyDate: new Date().toISOString().split('T')[0]!,
    holdingDays: 0,
    createdAt: Date.now()
  }
  
  await holdingStore.addOrUpdateHolding(record)
  showToast(isEditing.value ? t('holding.save_edit') : t('holding.confirm_add'))
  showAddDialog.value = false
  resetForm()
}

// ========== 调整成本功能 ==========

// [WHAT] 打开调整成本弹窗
function openCostDialog(code: string) {
  const holding = holdingStore.getHoldingByCode(code)
  if (!holding) return
  
  costFormData.value = {
    code: holding.code,
    name: holding.name,
    amount: (holding.marketValue || 0).toString(),
    profit: (holding.profit || 0).toString()
  }
  
  showCostDialog.value = true
}

// [WHAT] 提交调整成本
async function submitCostAdjust() {
  const marketValue = parseFloat(costFormData.value.amount)
  const profit = parseFloat(costFormData.value.profit)
  
  if (!marketValue || marketValue <= 0) {
    showToast(t('holding.please_enter_amount'))
    return
  }
  if (isNaN(profit)) {
    showToast(t('holding.please_enter_amount'))
    return
  }
  
  const holding = holdingStore.getHoldingByCode(costFormData.value.code)
  if (!holding) return
  
  showLoadingToast('正在获取最新净值...')
  
  try {
    // 从网络获取最新净值
    const latestNetValue = await fetchLatestNetValue(holding.code)
    
    if (!latestNetValue || latestNetValue.netValue <= 0) {
      showToast('获取最新净值失败，请稍后重试')
      return
    }
    
    const newNetValue = latestNetValue.netValue
    const newShares = marketValue / newNetValue
    
    // [WHAT] 构建更新后的持仓记录，保留原有的其他字段
    const record: HoldingRecord = {
      ...holding,
      // 输入的持仓金额作为市值（marketValue 字段）
      marketValue: marketValue,
      // 输入的持仓收益
      profit: profit,
      // 使用新的买入净值和份额
      buyNetValue: newNetValue,
      shares: newShares
    }
    
    holdingStore.addOrUpdateHolding(record)
    showToast(t('holding.cost_adjust_success'))
  } catch (error) {
    showToast(t('holding.cost_adjust_failed'))
  } finally {
    closeToast()
    showCostDialog.value = false
  }
}

// [WHAT] 跳转到基金详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

// [WHY] 长按持仓卡片弹出快捷操作菜单
// [WHAT] 查看详情 / 调整成本 / 加入自选 / 删除
async function onHoldingLongPress(code: string, fundName: string) {
  pendingActionSheetCode.value = code
  pendingActionSheetName.value = fundName
  actionSheetTitle.value = `${fundName || '基金'} · 快捷操作`
  actionSheetActions.value = [
    { name: '查看详情', key: 'detail' },
    { name: '调整成本', key: 'cost' },
    { name: '加入自选', key: 'watchlist' },
    { name: '删除持仓', key: 'delete' }
  ]
  showActionSheetDialog.value = true
}

function onActionSheetSelect(index: number) {
  const action = actionSheetActions.value[index]
  const code = pendingActionSheetCode.value
  const fundName = pendingActionSheetName.value
  
  if (!action || !code) return
  
  showActionSheetDialog.value = false
  
  if (action.key === 'detail') {
    goToDetail(code)
  } else if (action.key === 'cost') {
    openCostDialog(code)
  } else   if (action.key === 'watchlist') {
    const alreadyInWatchlist = fundStore.watchlist.some(f => f.code === code)
    if (alreadyInWatchlist) {
      showToast(t('detail.already_in_watchlist'))
    } else {
      fundStore.addFund(code, fundName || '')
      showToast(t('detail.added_to_watchlist'))
    }
  } else if (action.key === 'delete') {
    handleDelete(code)
  }
}

// [WHAT] 500ms 长按检测（避免每次点击都触发）
let holdingPressTimer: ReturnType<typeof setTimeout> | null = null
let pendingLongPressCode = ''
let pendingLongPressName = ''

function startHoldLongPress(code: string, name: string) {
  pendingLongPressCode = code
  pendingLongPressName = name
  holdingPressTimer = setTimeout(() => {
    onHoldingLongPress(pendingLongPressCode, pendingLongPressName)
    holdingPressTimer = null
  }, 500)
}

function stopHoldLongPress() {
  if (holdingPressTimer) {
    clearTimeout(holdingPressTimer)
    holdingPressTimer = null
  }
}

// [WHAT] 截图导入完成回调
function onImported(_count: number) {
  // [WHAT] 导入完成后刷新持仓列表
  holdingStore.refreshEstimates()
}

// [WHAT] 备份持仓数据
async function backupHoldings() {
  if (holdingStore.holdings.length === 0 && aiTrackingStore.records.length === 0) {
    showToast(t('holding.no_data_backup'))
    return
  }
  
  // 过滤掉运行时字段，只保留恢复数据所需的关键字段
  const holdingsForBackup = holdingStore.holdings.map(holding => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { 
      // 运行时字段（不备份）
      loading, 
      currentValue, 
      marketValue, 
      profit, 
      profitRate, 
      todayChange, 
      todayProfit,
      trendPrediction,
      dataSource,
      valueDate,
      isUpdated,
      // 保留的字段
      ...rest 
    } = holding
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return rest
  })
  
  // AI追踪数据备份（只保留基金代码和调仓净值）
  const aiTrackingForBackup = aiTrackingStore.records.map(record => ({
    sellCode: record.sellCode,
    sellName: record.sellName,
    sellNav: record.sellNav,
    buyCode: record.buyCode,
    buyName: record.buyName,
    buyNav: record.buyNav,
    date: record.date,
    createdAt: record.createdAt
  }))
  
  const backupData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    holdings: holdingsForBackup,
    summary: holdingStore.summary,
    aiTracking: aiTrackingForBackup
  }
  
  // 转换为 JSON 字符串
  const jsonData = JSON.stringify(backupData, null, 2)
  const fileName = `fund-holdings-backup-${new Date().toISOString().split('T')[0]}.json`
  
  // 创建下载链接
  const blob = new Blob([jsonData], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  showToast(t('holding.backup_success'))
}

// [WHAT] 导出持仓数据为 CSV
function exportCSV() {
  if (holdingStore.holdings.length === 0) {
    showToast(t('holding.no_holdings'))
    return
  }

  try {
    // CSV 表头
    const headers = [
      '基金代码',
      '基金名称',
      '持仓金额(元)',
      '持有收益(元)',
      '收益率(%)',
      '当日收益(元)',
      '当日涨幅(%)',
      '持有份额',
      '成本价',
      '来源',
      '是否QDII'
    ]

    // 构建 CSV 行数据
    const rows = holdingStore.holdings.map(h => [
      h.code || '',
      h.name || '',
      (h.marketValue ?? h.currentValue ?? 0).toFixed(2),
      (h.profit ?? 0).toFixed(2),
      (h.profitRate ?? 0).toFixed(2),
      (h.todayProfit ?? 0).toFixed(2),
      (h.todayChange ?? 0).toFixed(2),
      (h.shares ?? 0).toFixed(2),
      (h.buyNetValue ?? 0).toFixed(4),
      h.source || '',
      h.isQDII ? '是' : '否'
    ])

    // 转换为 CSV 格式（处理字段中的逗号）
    const csvRows = [
      headers.join(','),
      ...rows.map(row => 
        row.map(field => {
          // 如果字段包含逗号、引号或换行，用双引号包裹
          const str = String(field)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"'
          }
          return str
        }).join(',')
      )
    ]

    const csvContent = csvRows.join('\n')

    // 添加 BOM（Byte Order Mark）以支持 Excel 正确显示中文
    const BOM = '\uFEFF'
    const csvWithBOM = BOM + csvContent

    // 生成文件名（包含日期）
    const today = new Date().toISOString().split('T')[0]
    const fileName = `持仓数据_${today}.csv`

    // 创建 Blob 并下载
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showToast(t('holding.export_success'))
  } catch (error) {
    logger.error('[Holding] CSV 导出失败', error)
    showToast(t('holding.export_failed'))
  }
}

// [WHAT] 恢复持仓数据
function restoreHoldings() {
  // 创建文件输入元素
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.json'
  
  // 监听文件选择
  fileInput.onchange = async (event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    
    if (!file) {
      return
    }
    
    try {
      // 读取文件内容
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string)
          
          // 验证备份数据格式
          if (!jsonData.holdings || !Array.isArray(jsonData.holdings)) {
            showToast(t('holding.backup_format_error'))
            return
          }
          
          // 处理持仓数据，移除运行时字段
          const processedHoldings = jsonData.holdings.map((holding: any) => {
            /* eslint-disable @typescript-eslint/no-unused-vars */
            const { 
              marketValue, 
              profit, 
              originProfit, 
              lastUpdateDate, 
              todayProfit, 
              lastTodayProfit, 
              profitRate,
              loading,
              currentValue,
              todayChange,
              shareClass,
              manualProfitRate,
              serviceFeeRate,
              serviceFeeDeducted,
              lastFeeDate,
              ...rest 
            } = holding
            /* eslint-enable @typescript-eslint/no-unused-vars */
            
            const industrySectors = Array.isArray(rest.industrySectors) 
              ? rest.industrySectors.join(', ') 
              : rest.industrySectors
            
            return {
              ...rest,
              industrySectors
            }
          })
          
          // 保存处理后的持仓数据到本地存储
          saveHoldings(processedHoldings)
          
          // 刷新持仓状态
          holdingStore.initHoldings()
          
          // 恢复AI追踪数据
          if (jsonData.aiTracking && Array.isArray(jsonData.aiTracking)) {
            aiTrackingStore.importRecords(jsonData.aiTracking)
          }
          
          showToast(t('holding.restore_success'))
        } catch (error) {
          showToast(t('holding.parse_backup_failed'))
        }
      }
      reader.onerror = () => {
        showToast(t('holding.read_file_failed'))
      }
      reader.readAsText(file)
    } catch (error) {
      showToast(t('holding.restore_failed'))
    }
  }
  
  // 触发文件选择对话框
  fileInput.click()
}

// ========== 批量录入相关函数 ==========

// [WHAT] 来源选项
const sourceOptions = computed(() => [
  { value: 'ali', text: t('holding.source_ali') },
  { value: 'TX', text: t('holding.source_tx') },
  { value: 'JD', text: t('holding.source_jd') },
  { value: 'observe', text: t('holding.source_observe') }
])

// [WHAT] 打开批量录入弹窗
function openBatchDialog() {
  batchItems.value = [
    { code: '', amount: '', profit: '', sectors: '', name: '', source: '', isQDII: false, loading: false, error: '' }
  ]
  showBatchDialog.value = true
}

function addBatchItem() {
  batchItems.value.push({
    code: '', amount: '', profit: '', sectors: '', name: '', source: '', isQDII: false, loading: false, error: ''
  })
}

// [WHAT] 删除批量录入项
function removeBatchItem(index: number) {
  if (batchItems.value.length > 1) {
    batchItems.value.splice(index, 1)
  }
}

// [WHAT] 批量导入基金
async function batchImport() {
  // 验证输入
  const validItems = batchItems.value.filter(item => {
    return item.code && item.amount && !isNaN(parseFloat(item.amount))
  })
  
  if (validItems.length === 0) {
    showToast(t('holding.please_enter_valid_fund'))
    return
  }
  
  isBatchImporting.value = true
  showLoadingToast({ message: t('holding.importing'), forbidClick: true })
  
  try {
    const validIndices = batchItems.value.map((item, index) => {
      return item.code && item.amount && !isNaN(parseFloat(item.amount)) ? index : -1
    }).filter(index => index !== -1)
    
    const results = []
    
    for (const index of validIndices) {
      const item = batchItems.value[index]!
      
      batchItems.value[index]!.loading = true
      batchItems.value[index]!.error = ''
      
      try {
          if (holdingStore.hasHolding(item.code)) {
          batchItems.value[index]!.error = t('holding.already_exists')
          results.push(null)
          continue
        }
        
        const searchResults = await searchFund(item.code, 1)
        if (searchResults.length === 0) {
          batchItems.value[index]!.error = t('holding.fund_not_found')
          results.push(null)
          continue
        }
        
        const fund = searchResults[0]!
        batchItems.value[index]!.name = fund.name
        
        let netValue = 1
        try {
          const latestNetValue = await fetchLatestNetValue(fund.code)
          if (latestNetValue && latestNetValue.netValue > 0) {
            netValue = latestNetValue.netValue
          }
        } catch (error) {
          logger.warn('获取净值失败，使用默认值', error)
        }
        
        const marketValue = parseFloat(item.amount)
        const profit = parseFloat(item.profit) || 0
        
        const shares = marketValue / netValue
        
        let buyNetValue = netValue
        if (profit !== 0 && shares > 0) {
          buyNetValue = (marketValue - profit) / shares
        }
        
        const industrySectors = item.sectors?.trim() || undefined
        
        const record: HoldingRecord = {
          code: fund.code,
          name: fund.name,
          buyNetValue: buyNetValue,
          shares: shares,
          buyDate: new Date().toISOString().split('T')[0]!,
          holdingDays: 0,
          industrySectors: industrySectors,
          source: item.source,
          isQDII: item.isQDII,
          createdAt: Date.now()
        }
        
        await holdingStore.addOrUpdateHolding(record)
        results.push(fund.code)
        } catch (error) {
        batchItems.value[index]!.error = t('holding.import_failed')
        logger.error('批量导入失败', error)
        results.push(null)
      } finally {
        batchItems.value[index]!.loading = false
      }
      
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    
    // 统计成功导入的数量
    const successCount = results.filter(Boolean).length
    if (successCount > 0) {
      showToast(t('holding.import_success', { count: successCount }))
      // 刷新持仓列表
      await holdingStore.refreshEstimates()
      showBatchDialog.value = false
    } else {
      showToast(t('holding.import_failed_check_code'))
    }
  } finally {
    closeToast()
    isBatchImporting.value = false
  }
}

// 日期选择器已移除（不再收集买入日期）

// 刷新持仓数据
async function refreshHoldings() {
  showLoadingToast({ message: t('holding.fetching_nav'), forbidClick: true })
  
  try {
    await holdingStore.refreshEstimates()
    showToast(t('holding.refresh_success'))
  } catch (error) {
    logger.error('刷新失败', error)
    showToast(t('holding.refresh_failed'))
  } finally {
    closeToast()
  }
}

// [WHAT] 一键复制日志
async function onCopyLogs(): Promise<void> {
  const ok = await copyLogsToClipboard()
  if (ok) {
    showToast(t('common.copy_success', { count: logger.getAll().length }))
  } else {
    showToast(t('common.copy_failed'))
  }
}
</script>

<template>
  <div class="holding-page">
    <!-- 顶部导航栏 -->
    <div class="custom-nav-bar">
      <div class="nav-title">{{ t('holding.title') }}</div>
      <div class="nav-actions">
        <!-- 网页端按钮 -->
        <div class="web-actions web-only">
          <van-icon name="replay" size="20" @click="refreshHoldings" class="refresh-icon" />
          <van-icon name="description-o" size="20" @click="onCopyLogs" :title="t('holding.copy_logs')" />
          <van-button size="small" @click="showImportDialog = true" class="nav-btn">{{ t('holding.import_screenshot') }}</van-button>
          <van-button size="small" @click="openBatchDialog" class="nav-btn">{{ t('holding.batch') }}</van-button>
          <van-button size="small" @click="exportCSV" class="nav-btn">{{ t('holding.export_csv') }}</van-button>
          <van-button size="small" @click="backupHoldings" class="nav-btn">{{ t('holding.backup') }}</van-button>
          <van-button size="small" @click="restoreHoldings" class="nav-btn">{{ t('holding.restore') }}</van-button>
        </div>
        
        <!-- 移动端按钮 -->
        <div class="mobile-actions mobile-only">
          <img 
            :src="riseW" 
            class="sort-mobile-icon"
            :class="{ active: sortDirection === 'up' }"
            @click="handleSort('up')"
            :alt="t('holding.sort_asc')" 
          />
          <img 
            :src="downW" 
            class="sort-mobile-icon"
            :class="{ active: sortDirection === 'down' }"
            @click="handleSort('down')"
            :alt="t('holding.sort_desc')" 
          />
          <van-icon name="description-o" size="20" @click="onCopyLogs" :title="t('holding.copy_logs')" />
          <van-button size="small" @click="showImportDialog = true">{{ t('holding.import_screenshot') }}</van-button>
          <van-button size="small" @click="openBatchDialog">{{ t('holding.batch') }}</van-button>
          <van-button size="small" @click="exportCSV">{{ t('holding.export_csv') }}</van-button>
          <van-button size="small" @click="restoreHoldings">{{ t('holding.restore') }}</van-button>
        </div>
      </div>
    </div>

    <!-- 汇总统计卡片 -->
    <div v-if="holdingStore.holdings.length > 0" class="summary-card">
      <div class="summary-row summary-row-single">
        <div class="summary-item">
          <div class="summary-label">{{ t('holding.account_assets') }}</div>
          <div class="summary-value">{{ formatMoney(holdingStore.summary.totalValue, '', isMobile()) }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">{{ t('holding.today_profit_label') }}</div>
          <div class="summary-value" :class="summaryTodayClass">
            {{ isMobile() ? '' : (holdingStore.summary.todayProfit >= 0 ? '+' : '') }}{{ formatMoney(holdingStore.summary.todayProfit, '', isMobile()) }}
          </div>
        </div>
        <div class="summary-item">
          <div class="summary-label">{{ t('holding.holding_profit') }}</div>
          <div class="summary-value" :class="summaryProfitClass">
            {{ isMobile() ? '' : (holdingStore.summary.totalProfit >= 0 ? '+' : '') }}{{ formatMoney(holdingStore.summary.totalProfit, '', isMobile()) }}
          </div>
        </div>
        <div class="summary-item">
          <div class="summary-label">{{ t("holding.profit_rate_label") }}</div>
          <div class="summary-value" :class="summaryProfitClass">
            {{ isMobile() ? '' : '' }}{{ formatPercent(holdingStore.summary.totalProfitRate, isMobile()) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 持仓列表表头 -->
    <div v-if="holdingStore.holdings.length > 0" class="list-header">
      <div class="list-header-block">
        <div class="header-left">
          <span class="col-name">{{ t("holding.fund_name") }}</span>
          <div class="sort-buttons">
            <van-button 
              size="small" 
              @click="handleSort('none')"
              :type="sortDirection === 'none' ? 'primary' : 'default'"
            >
              {{ t('holding.sort_default') }}
            </van-button>
            <img 
              :src="riseW" 
              class="sort-web-icon"
              :class="{ active: sortDirection === 'up' }"
              @click="handleSort('up')"
              :alt="t('holding.sort_asc')" 
            />
            <img 
              :src="downW" 
              class="sort-web-icon"
              :class="{ active: sortDirection === 'down' }"
              @click="handleSort('down')"
              :alt="t('holding.sort_desc')" 
            />
            <van-button 
              size="small" 
              class="source-button"
              @click="filterBySource('ali')"
              :type="currentSourceFilter === 'ali' ? 'primary' : 'default'"
            >
              <img src="@/assets/ali.jpg" class="source-icon" :alt="t('holding.source_ali')" />
            </van-button>
            <van-button 
              size="small" 
              class="source-button"
              @click="filterBySource('TX')"
              :type="currentSourceFilter === 'TX' ? 'primary' : 'default'"
            >
              <img src="@/assets/TX.jpg" class="source-icon" :alt="t('holding.source_tx')" />
            </van-button>
            <van-button 
              size="small" 
              class="source-button"
              @click="filterBySource('JD')"
              :type="currentSourceFilter === 'JD' ? 'primary' : 'default'"
            >
              <img src="@/assets/JD.jpg" class="source-icon" :alt="t('holding.source_jd')" />
            </van-button>
          </div>
        </div>
        <span class="col-change">{{ t("holding.today_change") }}</span>
        <span class="col-today">{{ t("holding.today_profit_col") }}</span>
        <span class="col-profit">{{ t("holding.holding_profit_col") }}</span>
      </div>
    </div>

    <!-- 持仓列表 -->
    <van-pull-refresh
      v-model="holdingStore.isRefreshing"
      @refresh="onRefresh"
      class="holding-list-container"
    >
      <template v-if="holdingStore.holdings.length > 0">
        <div v-for="(row, rowIndex) in groupedHoldings" :key="rowIndex" class="holding-row">
          <div v-for="holding in row" :key="holding.code" class="holding-item">
            <div class="col-name">
              <div
                class="fund-name-wrapper"
                @click="goToDetail(holding.code)"
                @touchstart.passive="startHoldLongPress(holding.code, holding.name)"
                @touchend="stopHoldLongPress"
                @touchmove.passive="stopHoldLongPress"
              >
                <div class="fund-name-line">
                  <span v-if="holding.isQDII" class="qdii-tag">QD</span>
                  <div class="fund-name">
                    {{ holding.name || t("holding.loading") }}
                  </div>
                </div>
              </div>
              <div class="fund-meta">
                <span class="update-status-tag" :class="holding.isUpdated ? 'updated' : 'not-updated'">
                  {{ holding.isUpdated ? t("holding.updated") : t("holding.not_updated") }}
                </span>
                <span class="amount">¥{{ formatMoney(holding.marketValue ?? 0) }}</span>
              </div>
              <div class="item-actions">
              </div>
            </div>
            <div class="col-change" :class="getChangeStatus(holding.todayChange || 0)">
              {{ formatPercent(holding.todayChange || 0) }}
            </div>
            <div class="col-today" :class="getChangeStatus(holding.todayProfit || 0)">
              {{ holding.todayProfit !== undefined ? (holding.todayProfit >= 0 ? '+' : '') + formatMoney(holding.todayProfit) : '--' }}
            </div>
            <div class="col-profit" :class="getChangeStatus(holding.profit || 0)">
              <div class="profit-amount">
                {{ holding.profit !== undefined ? (holding.profit >= 0 ? '+' : '') + formatMoney(holding.profit) : '--' }}
              </div>
              <div class="profit-rate">
                {{ holding.profitRate !== undefined ? formatPercent(holding.profitRate) : '--' }}
              </div>
            </div>
          </div>
          <!-- Web 端：如果该行只有一个元素，插入占位保证两列等宽 -->
          <div v-if="row.length === 1 && isWeb()" class="holding-item placeholder"></div>
        </div>
      </template>

      <!-- 空状态 -->
      <van-empty v-else :description="t('holding.no_holdings')" />
      
      <!-- 底部占位，避免被导航栏遮挡 -->
      <div class="bottom-spacer"></div>
    </van-pull-refresh>

    <!-- 添加/编辑持仓弹窗 -->
    <van-popup
      v-model:show="showAddDialog"
      position="bottom"
      round
      :style="{ height: '75%' }"
    >
      <div class="add-dialog">
        <div class="dialog-header">
          <span>{{ isEditing ? t("holding.edit_holding") : t("holding.add_holding") }}</span>
          <van-icon name="cross" @click="showAddDialog = false" />
        </div>

        <div class="dialog-content">
          <!-- 基金选择（非编辑模式） -->
          <template v-if="!isEditing">
            <van-field
              v-if="!selectedFund"
              v-model="searchKeyword"
              :label="t('holding.select_fund')"
              :placeholder="t('holding.search_placeholder')"
              @input="onSearchInput"
            />
            
            <!-- 搜索结果 -->
            <div v-if="searchResults.length > 0" class="search-results">
              <van-cell
                v-for="fund in searchResults"
                :key="fund.code"
                :title="fund.name"
                :label="fund.code"
                clickable
                @click="selectFund(fund)"
              />
            </div>

            <!-- 已选择的基金 -->
            <van-field
              v-if="selectedFund"
              :model-value="`${selectedFund.name} (${selectedFund.code})`"
              :label="t('holding.selected_fund')"
              readonly
            >
              <template #button>
                <van-button size="small" @click="selectedFund = null; currentNetValue = 0">{{ t("holding.reselect") }}</van-button>
              </template>
            </van-field>
          </template>

          <!-- 编辑模式显示基金信息 -->
          <van-field
            v-else
            :model-value="`${formData.name} (${formData.code})`"
            label="基金"
            readonly
          />

          <!-- 当前净值显示 -->
          <van-field
            v-if="currentNetValue > 0"
            :model-value="currentNetValue.toFixed(4)"
            :label="t('holding.current_nav')"
            readonly
          />

          <!-- 持仓金额 -->
          <van-field
            v-model="formData.amount"
            type="number"
            :label="t('holding.holding_amount')"
            :placeholder="t('holding.holding_amount_placeholder')"
          />

          <!-- 计算结果展示 -->
          <div v-if="calculatedShares > 0" class="calc-result">
            <div class="calc-item">
              <span class="calc-label">{{ t('holding.estimated_shares') }}</span>
              <span class="calc-value">{{ calculatedShares.toFixed(2) }} {{ t("holding.shares_unit") }}</span>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button block type="primary" @click="submitForm">
            {{ isEditing ? t('holding.save_edit') : t('holding.confirm_add') }}
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- 日期选择器 已移除（使用手工持有收益） -->

    <!-- 调整成本弹窗 -->
    <van-popup
      v-model:show="showCostDialog"
      position="bottom"
      round
      :style="{ height: '45%' }"
    >
      <div class="cost-dialog">
        <div class="dialog-header">
          <span>{{ t("holding.adjust_cost") }}</span>
          <van-icon name="cross" @click="showCostDialog = false" />
        </div>

        <div class="dialog-content">
          <!-- 基金信息 -->
          <van-field
            :model-value="`${costFormData.name} (${costFormData.code})`"
            label="基金"
            readonly
          />

          <!-- 持仓金额 -->
          <van-field
            v-model="costFormData.amount"
            type="number"
            :label="t('holding.market_value')"
            :placeholder="t('holding.market_value_placeholder')"
          />

          <!-- 提示信息 -->
          <div class="cost-tip">
            <van-icon name="info-o" />
            <span>调整成本可用于分红再投、补仓摊薄等场景，修改后收益率将重新计算</span>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button block type="primary" @click="submitCostAdjust">
            确认调整
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- ActionSheet 快捷操作菜单 -->
    <van-action-sheet
      v-model:show="showActionSheetDialog"
      :title="actionSheetTitle"
      :actions="actionSheetActions"
      @select="onActionSheetSelect"
    />

    <!-- 截图导入弹窗 -->
    <ScreenshotImport 
      v-model:show="showImportDialog"
      @imported="onImported"
    />

    <!-- 批量录入弹窗 -->
    <van-popup
      v-model:show="showBatchDialog"
      position="bottom"
      round
      :style="{ height: '80%' }"
    >
      <div class="batch-dialog">
        <div class="dialog-header">
          <span>{{ t("holding.batch_import") }}</span>
          <van-icon name="cross" @click="showBatchDialog = false" />
        </div>

        <div class="dialog-content">
          <div class="batch-tip">
            <van-icon name="info-o" />
            <span>{{ t("holding.batch_tip") }}</span>
          </div>

          <div class="batch-list">
            <div 
              v-for="(item, index) in batchItems" 
              :key="index" 
              class="batch-item"
            >
              <div class="batch-item-header">
                <span class="item-index">{{ index + 1 }}</span>
                <van-icon 
                  v-if="batchItems.length > 1" 
                  name="delete" 
                  size="16" 
                  class="delete-btn"
                  @click="removeBatchItem(index)"
                />
              </div>

              <div class="batch-item-content">
                <van-field
                  v-model="item.code"
                  :label="t('holding.fund_code')"
                  :placeholder="t('holding.fund_code_placeholder')"
                  :disabled="item.loading"
                />
                
                <van-field
                  v-model="item.amount"
                  type="number"
                  :label="t('holding.holding_amount')"
                  :placeholder="t('holding.holding_amount_placeholder')"
                  :disabled="item.loading"
                />
                
                <van-field
                  v-model="item.profit"
                  type="number"
                  :label="t('holding.profit')"
                  :placeholder="t('holding.holding_profit_placeholder')"
                  :disabled="item.loading"
                />
                
                <van-field
                  v-model="item.sectors"
                  type="text"
                  :label="t('holding.industry_sector')"
                  :placeholder="t('holding.industry_sector_placeholder')"
                  :disabled="item.loading"
                />
                
                <div class="form-item">
                  <label class="form-label">来源</label>
                  <van-radio-group v-model="item.source" class="source-radio-group">
                    <van-radio 
                      v-for="option in sourceOptions" 
                      :key="option.value" 
                      :name="option.value"
                      class="source-radio"
                      :disabled="item.loading"
                    >
                      {{ option.text }}
                    </van-radio>
                  </van-radio-group>
                </div>
                <div class="form-item">
                  <div class="qdii-toggle">
                    <span class="qdii-label">{{ t("holding.is_qdii") }}</span>
                    <van-switch v-model="item.isQDII" size="24" :disabled="item.loading" />
                  </div>
                </div>
                
                <div v-if="item.name" class="fund-info">
                  <span class="fund-name">{{ item.name }}</span>
                </div>
                
                <div v-if="item.error" class="error-message">
                  {{ item.error }}
                </div>
                
                <van-loading v-if="item.loading" size="small" />
              </div>
            </div>

            <div class="add-more-btn">
              <van-button type="default" plain @click="addBatchItem">
                <van-icon name="add" /> 添加一行
              </van-button>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <van-button 
            block 
            type="primary" 
            @click="batchImport"
            :loading="isBatchImporting"
            :disabled="isBatchImporting"
          >
            批量导入
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.holding-page {
  /* [WHY] 使用 100% 高度适配 flex 布局 */
  height: 100%;
  background: var(--bg-primary);
  transition: background-color 0.3s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 双列布局 */
.holding-row {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
}

/* 移动端：单列布局 */
@media (max-width: 767px) {
  .holding-row {
    flex-direction: column;
    gap: 0;
    padding: 0;
  }
  
  .holding-item {
    width: 100%;
    flex: none;
    margin-bottom: 8px;
    padding: 14px 16px;
  }
  
  .holding-item.placeholder {
    display: none;
  }
}

.holding-item {
  flex: 1 1 0;
  background: var(--bg-card);
  border-radius: 8px;
  padding: 12px;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  align-items: center;
  gap: 8px;
}

.holding-item.placeholder {
  visibility: hidden;
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 0;
  margin-top: 2px;
}

/* 自定义导航栏 */
.custom-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding-top: max(12px, env(safe-area-inset-top, 0px));
}

.nav-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 导航栏右侧按钮容器 */
.nav-actions {
  display: flex;
  align-items: center;
}

/* 网页端按钮容器 */
.web-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-icon {
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.2s ease;
}

.refresh-icon:hover {
  color: var(--text-primary);
}

.nav-btn {
  font-size: 13px !important;
  padding: 6px 12px !important;
  min-width: auto !important;
  width: auto !important;
  flex: none !important;
  white-space: nowrap !important;
  display: inline-flex !important;
  justify-content: center !important;
}

.nav-btn .van-button__content {
  padding: 0 !important;
  min-width: auto !important;
  width: auto !important;
  white-space: nowrap !important;
}

/* 移动端按钮容器 */
.mobile-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 移动端：导航栏两行布局 */
@media (max-width: 767px) {
  .custom-nav-bar {
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    padding-top: max(10px, env(safe-area-inset-top, 0px));
  }
  
  .nav-title {
    font-size: 20px;
    font-weight: 700;
  }
  
  .nav-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .mobile-actions {
    width: 100%;
    justify-content: flex-end;
    gap: 8px;
  }
  
  /* 移动端：隐藏网页端按钮 */
  .web-only {
    display: none;
  }
  
  /* 移动端：显示移动端按钮 */
  .mobile-only {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .mobile-actions .van-icon {
    font-size: 18px;
  }
  
  .mobile-actions .van-button {
    font-size: 12px;
    padding: 6px 12px;
    flex: none;
    min-width: auto;
    width: auto;
    white-space: nowrap;
  }
  
  .sort-mobile-icon {
    width: 28px !important;
    height: 28px !important;
    max-width: 28px !important;
    max-height: 28px !important;
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.2s ease;
    border-radius: 4px;
    object-fit: contain;
    flex-shrink: 0;
  }
  
  .sort-mobile-icon.active {
    opacity: 1;
    background: rgba(59, 130, 246, 0.1);
  }
}

/* 网页端：显示网页端按钮 */
@media (min-width: 768px) {
  .web-only {
    display: flex;
  }
  
  .mobile-only {
    display: none;
  }
  
  .source-buttons {
    display: flex;
    gap: 8px;
    margin-left: 12px;
    align-items: center;
  }
  
  .source-button {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    overflow: hidden;
    padding: 4px 8px;
    height: auto;
  }
  
  .all-button,
  .qdii-button {
    padding: 0 8px;
    min-width: 40px;
    height: 24px;
    font-size: 11px;
  }
  
  .source-button:not(.all-button):not(.qdii-button) {
    padding: 0;
    min-width: 24px;
    height: 24px;
  }
  
  .source-icon {
    width: 16px;
    height: 16px;
  }
  
  .sort-web-icon {
    width: 36px !important;
    height: 36px !important;
    max-width: 36px !important;
    max-height: 36px !important;
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.2s ease;
    border-radius: 4px;
    object-fit: contain;
    flex-shrink: 0;
  }
  
  .sort-web-icon:hover {
    opacity: 0.8;
  }
  
  .sort-web-icon.active {
    opacity: 1;
    background: rgba(59, 130, 246, 0.1);
  }
}

/* 汇总卡片 - 交易终端风格 */
.summary-card {
  background: linear-gradient(135deg, #1a1f2e 0%, var(--bg-secondary) 50%, #1a2420 100%);
  margin: 12px;
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
}

.summary-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, var(--color-primary) 0%, transparent 70%);
  opacity: 0.06;
  transform: translate(30%, -30%);
}

.summary-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, var(--color-down) 0%, transparent 70%);
  opacity: 0.04;
  transform: translate(-30%, 30%);
}


.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.summary-row:last-child {
  margin-bottom: 0;
}

/* 单行四项统计卡片样式 */
.summary-row-single {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 12px;
}

/* 移动端：汇总统计分一行显示 */
@media (max-width: 767px) {
  .summary-card {
    margin: 2px;
    padding: 2px 12px;
  }
  
  .summary-row-single {
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 0;
  }
  
  /* 账户资产：分配更多空间（40%） */
  .summary-row-single .summary-item:nth-child(1) {
    flex: 0 0 40%;
    width: 40%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    border-right: none;
    border-bottom: none;
  }
  
  /* 其他三个项目：各分配20% */
  .summary-row-single .summary-item:nth-child(2),
  .summary-row-single .summary-item:nth-child(3),
  .summary-row-single .summary-item:nth-child(4) {
    flex: 0 0 20%;
    width: 20%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    border-right: none;
    border-bottom: none;
  }
  
  .summary-row-single .summary-label {
    font-size: 12px;
    margin-bottom: 4px;
  }
  
  /* 所有项目的数值字体统一 */
  .summary-row-single .summary-value {
    font-size: 16px;
  }
}

.summary-row-single .summary-item {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1px solid var(--border-color);
}
.summary-row-single .summary-item:last-child {
  border-right: none;
}

.summary-item {
  flex: 1;
  position: relative;
  z-index: 1;
}

.summary-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  font-family: var(--font-number);
  color: var(--text-highlight);
  letter-spacing: -0.5px;
}

.summary-value.up {
  color: var(--color-up);
}

.summary-value.down {
  color: var(--color-down);
}

/* [WHY] 标准涨跌颜色 */
.summary-value.up {
  color: #f56c6c;  /* 红涨 */
}

.summary-value.down {
  color: #67c23a;  /* 绿跌 */
}

/* 列表表头 */
.list-header {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
}

/* 移动端：隐藏表头中的排序按钮 */
@media (max-width: 767px) {
  .list-header .sort-buttons {
    display: none;
  }
  
  .list-header .header-left {
    display: block;
  }
  
  /* 移动端：基金名称样式优化 */
  .col-name .fund-name {
    font-size: 13px;
    line-height: 1.3;
    max-height: 2.6em;
  }
  
  .col-name .fund-name-line {
    gap: 4px;
  }
  
  .col-name .fund-meta .qdii-tag {
    padding: 1px 4px;
    font-size: 9px;
  }
  
  /* 移动端：当日涨幅字体比累计涨幅大 */
  .col-change {
    font-size: 15px;
    font-weight: 600;
  }
  
  .col-profit .profit-amount {
    font-size: 13px;
  }
  
  .col-profit .profit-rate {
    font-size: 11px;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sort-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sort-buttons .van-button {
  font-size: 11px;
  padding: 4px 12px;
  min-width: 60px;
  white-space: nowrap;
}

.list-header-block {
  flex: 1 1 0;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

/* 网页端：表头包含排序按钮 */
@media (min-width: 768px) {
  .list-header-block {
    grid-template-columns: 3fr 1fr 1fr 1fr;
  }
}

/* 持仓列表 */
.holding-list-container {
  /* [WHY] 使用 flex: 1 自动撑满剩余空间 */
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  /* [WHY] Android WebView 需要明确的触摸行为 */
  touch-action: pan-y;
}

/* [WHY] 底部占位，确保最后一项不被底部导航栏遮挡 */
.bottom-spacer {
  height: calc(70px + env(safe-area-inset-bottom, 0px));
  flex-shrink: 0;
}

.holding-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: background 0.2s;
}

.holding-item:active {
  background: var(--bg-hover);
}

.holding-item:active::before {
  background: var(--color-primary);
}

.col-name .fund-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.col-name .fund-name-line .qdii-tag {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  color: #ffffff;
  background-color: #9333ea;
  border-radius: 8px;
  vertical-align: middle;
  flex-shrink: 0;
}

.col-name .fund-name {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  max-height: 2.8em;
}

.col-name .fund-name-wrapper {
  cursor: pointer;
}

.col-name .fund-meta .qdii-tag {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  color: #ffffff;
  background-color: #9333ea;
  border-radius: 8px;
  vertical-align: middle;
  flex-shrink: 0;
}

.col-name .fund-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.col-name .tag {
  font-size: 10px;
  padding: 1px 4px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: 2px;
}

/* 更新状态标签 */
.col-name .update-status-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.col-name .update-status-tag.updated {
  color: #ff9800;
  background: rgba(255, 152, 0, 0.1);
}

.col-name .update-status-tag.not-updated {
  color: var(--text-secondary);
  background: rgba(158, 158, 158, 0.1);
}

.col-name .amount {
  font-size: 12px;
  color: var(--text-secondary);
}

.col-change, .col-today, .col-profit {
  text-align: center;
  font-size: 14px;
}

.col-profit .profit-amount {
  font-size: 14px;
}

.col-profit .profit-rate {
  font-size: 12px;
  opacity: 0.8;
}

.up { color: var(--color-up); }
.down { color: var(--color-down); }
.flat { color: var(--text-secondary); }

.action-btn {
  height: 100%;
}

/* 添加弹窗样式 */
.add-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

/* 来源和QDII样式 */
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
  gap: 16px;
  flex-wrap: wrap;
}

.source-radio {
  flex: 1;
  min-width: 80px;
}

.qdii-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.qdii-label {
  font-size: 14px;
  color: var(--text-primary);
}

/* 批量录入弹窗样式 */
.batch-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.batch-item {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.batch-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.item-index {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
}

.delete-btn {
  color: var(--color-down);
  cursor: pointer;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}

.dialog-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-results {
  max-height: 200px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border-color);
}

.calc-result {
  padding: 16px;
  background: var(--bg-tertiary);
  margin: 16px;
  border-radius: 8px;
}

.calc-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.calc-label {
  color: var(--text-secondary);
}

.calc-value {
  color: var(--text-primary);
  font-weight: 500;
}

.dialog-footer {
  padding: 16px;
}

/* A/C 类份额标签 */
.share-class-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-class-tag {
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 4px;
  font-weight: 500;
}

.share-class-tag.a {
  background: rgba(255, 193, 7, 0.2);
  color: #f59e0b;
}

.share-class-tag.c {
  background: rgba(25, 137, 250, 0.2);
  color: #1989fa;
}

.share-class-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 费用选项 */
.fee-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.fee-rate {
  font-size: 13px;
  color: var(--text-secondary);
}

.fee-rate-input {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.fee-input {
  width: 50px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  text-align: center;
}

.fee-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin: 0 16px;
  background: var(--color-primary-bg);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary);
}

/* 调整成本弹窗 */
.cost-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
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
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.cost-dialog .dialog-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.cost-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 16px;
  margin: 12px 16px;
  background: var(--color-warning-bg, #fffbe6);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-warning, #faad14);
  line-height: 1.5;
}

/* 批量录入弹窗样式 */
.batch-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.batch-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  margin: 12px 16px;
  background: var(--color-primary-bg);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-primary);
  line-height: 1.5;
}

.batch-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 16px;
  -webkit-overflow-scrolling: touch;
}

.batch-item {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.batch-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.item-index {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.delete-btn {
  color: var(--color-danger);
  cursor: pointer;
}

.batch-item-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fund-info {
  margin-top: 8px;
  padding: 8px;
  background: var(--color-success-bg);
  border-radius: 4px;
  font-size: 13px;
}

.fund-name {
  color: var(--color-success);
  font-weight: 500;
}

.error-message {
  margin-top: 8px;
  padding: 8px;
  background: var(--color-danger-bg);
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-danger);
}

.add-more-btn {
  padding: 16px;
  text-align: center;
}

.batch-dialog .dialog-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
}
</style>
