<script setup lang="ts">
// [WHY] 备份/恢复逻辑原本整段写在 Holding.vue 内部，全景大屏也要用同一套
// [WHAT] 抽成组件：本地备份 / 本地恢复 / 云备份 / 云恢复 + GitHub Token 配置弹窗
// [HOW] props 控制显示哪几个按钮；defineExpose 暴露方法给父级主动调用；emit('restored') 通知父级刷新
// [NOTE] 备份/恢复的字段清洗清单与原 Holding.vue 逐字一致，不要随意增删

import { ref } from 'vue'
import { useHoldingStore } from '@/stores/holding'
import { useAITrackingStore } from '@/stores/aiTracking'
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant'
import {
  saveHoldings,
  getTrades,
  saveTrades,
  getTTrades,
  saveTTrades,
  getFundNetValues,
  saveFundNetValues,
  getStarredFunds,
  saveStarredFunds,
  getWatchlist,
  saveWatchlist,
} from '@/utils/storage'
import { getBaiduOcrConfig, setBaiduOcrConfig } from '@/utils/ocr'
import { clearFundCache } from '@/api/fundFast'
import {
  saveToGist,
  restoreFromGist,
  validateGitHubToken,
  getGitHubToken,
  saveGitHubToken,
  hasGitHubToken,
} from '@/api/gist'

const props = withDefaults(defineProps<{
  /** 是否显示「本地备份」按钮 */
  showLocalBackup?: boolean
  /** 是否显示「本地恢复」按钮 */
  showLocalRestore?: boolean
  /** 是否显示「云备份」按钮 */
  showCloudBackup?: boolean
  /** 是否显示「云恢复」按钮 */
  showCloudRestore?: boolean
  /** 按钮尺寸，透传给 van-button */
  size?: 'large' | 'normal' | 'small' | 'mini'
  /** 追加到每个按钮上的 class（父级用来套自己的样式，如 nav-btn） */
  buttonClass?: string
}>(), {
  showLocalBackup: true,
  showLocalRestore: true,
  showCloudBackup: true,
  showCloudRestore: true,
  size: 'small',
  buttonClass: '',
})

const emit = defineEmits<{
  /** [WHAT] 任何一条恢复路径成功写入本地后触发，父级可据此刷新页面 */
  (e: 'restored'): void
}>()

const holdingStore = useHoldingStore()
const aiTrackingStore = useAITrackingStore()

// ============ 字段清洗 ============

/**
 * [WHAT] 备份时去掉运行时字段，只留恢复数据所需的关键字段
 * [WHY] 估值/盈亏这些字段是每次打开 App 重算的，备份它们反而会让恢复后显示旧数据
 */
function stripRuntimeFields(holding: any) {
  const {
    loading,
    currentValue,
    marketValue,
    profit,
    profitRate,
    todayChange,
    todayProfit,
    trendPrediction,
    dataSource,
    isNav,
    valueDate,
    isUpdated,
    ...rest
  } = holding
  return rest
}

/**
 * [WHAT] 恢复时二次清洗，比备份多去掉一批费用/份额派生字段
 * [WHY] 老版本备份文件里可能带这些字段，留着会干扰费用重算
 */
function normalizeForRestore(holding: any) {
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

  const industrySectors = Array.isArray(rest.industrySectors)
    ? rest.industrySectors.join(', ')
    : rest.industrySectors

  return { ...rest, industrySectors }
}

/** [WHAT] 组装备份 payload；withNetValues=true 时额外带上净值映射（云备份专用） */
function buildBackupPayload(withNetValues: boolean) {
  const holdingsForBackup = holdingStore.holdings.map(stripRuntimeFields)

  // [NOTE] 统一用「云备份」那套更全的字段（含 id / estimated 标记），本地备份一并受益
  const aiTrackingForBackup = aiTrackingStore.records.map((record: any) => ({
    id: record.id,
    sellCode: record.sellCode,
    sellName: record.sellName,
    sellNav: record.sellNav,
    sellNavEstimated: record.sellNavEstimated,
    buyCode: record.buyCode,
    buyName: record.buyName,
    buyNav: record.buyNav,
    buyNavEstimated: record.buyNavEstimated,
    date: record.date,
    createdAt: record.createdAt,
  }))

  const payload: Record<string, any> = {
    // [NOTE] 1.2 起新增 starredFunds / watchlist 两个代码清单；读旧文件时用「字段是否存在」判断，不用版本号
    version: '1.2',
    exportDate: new Date().toISOString(),
    holdings: holdingsForBackup,
    summary: holdingStore.summary,
    aiTracking: aiTrackingForBackup,
    baiduOcrConfig: getBaiduOcrConfig(),
    trades: getTrades(),
    tTrades: getTTrades(),
    // [WHAT] 星标K线列表 + 自选列表：和持仓同级的「用户圈选数据」，丢了就得一只只重新加回去
    starredFunds: getStarredFunds(),
    watchlist: getWatchlist(),
  }

  if (withNetValues) {
    payload.fundNetValues = getFundNetValues()
  }

  return payload
}

/**
 * [WHAT] 把备份数据写回本地并刷新：持仓 / AI追踪 / 交易 / 做T归档 / 净值映射 / OCR 配置
 * [RETURN] true 表示写入成功，false 表示格式不对（已弹 toast）
 */
function applyBackupData(jsonData: any): boolean {
  if (!jsonData || !jsonData.holdings || !Array.isArray(jsonData.holdings)) {
    showToast('备份文件格式错误')
    return false
  }

  const processedHoldings = jsonData.holdings.map(normalizeForRestore)
  saveHoldings(processedHoldings)

  // [FIX] 清除所有基金的净值/估值缓存，防止恢复后沿用旧缓存算出错误市值
  processedHoldings.forEach((h: any) => {
    if (h.code) clearFundCache(h.code)
  })

  holdingStore.initHoldings()

  if (jsonData.aiTracking && Array.isArray(jsonData.aiTracking)) {
    aiTrackingStore.importRecords(jsonData.aiTracking)
  }
  if (jsonData.trades && Array.isArray(jsonData.trades)) {
    saveTrades(jsonData.trades)
  }
  if (jsonData.tTrades && Array.isArray(jsonData.tTrades)) {
    saveTTrades(jsonData.tTrades)
  }
  if (jsonData.fundNetValues && typeof jsonData.fundNetValues === 'object') {
    saveFundNetValues(jsonData.fundNetValues)
  }
  if (jsonData.baiduOcrConfig && jsonData.baiduOcrConfig.apiKey && jsonData.baiduOcrConfig.secretKey) {
    setBaiduOcrConfig(jsonData.baiduOcrConfig)
  }

  // [WHY] 老版本备份文件里没有这两个字段，此时必须「跳过」而不是写空数组——
  //       否则用户恢复一次旧备份，当前手机上已经星标/自选的基金会被无声清空。
  //       saveStarredFunds 内部会广播 starred-funds-changed，已挂载的星标K线面板会立刻跟着刷新。
  if (Array.isArray(jsonData.starredFunds)) {
    saveStarredFunds(jsonData.starredFunds.filter((c: unknown) => typeof c === 'string'))
  }
  if (Array.isArray(jsonData.watchlist)) {
    saveWatchlist(jsonData.watchlist.filter((c: unknown) => typeof c === 'string'))
  }

  emit('restored')
  return true
}

// ============ 本地备份 / 恢复 ============

/** [WHAT] 本地备份：导出 JSON 文件下载 */
async function backupLocal() {
  if (holdingStore.holdings.length === 0 && aiTrackingStore.records.length === 0) {
    showToast('暂无数据可备份')
    return
  }

  const jsonData = JSON.stringify(buildBackupPayload(false), null, 2)
  const fileName = `fund-holdings-backup-${new Date().toISOString().split('T')[0]}.json`

  const blob = new Blob([jsonData], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showToast('备份成功！')
}

/** [WHAT] 本地恢复：选一个备份 JSON 文件读回来 */
function restoreLocal() {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.json'

  fileInput.onchange = (event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target?.result as string)
        if (applyBackupData(jsonData)) {
          showToast('恢复成功')
        }
      } catch {
        showToast('解析备份文件失败')
      }
    }
    reader.onerror = () => {
      showToast('读取文件失败')
    }
    reader.readAsText(file)
  }

  fileInput.click()
}

// ============ GitHub Token 配置 ============

const showGitHubConfigDialog = ref(false)
const githubToken = ref('')
const isTokenValidating = ref(false)

/** [WHAT] 保存并验证 GitHub Token */
async function saveGitHubConfig() {
  const token = githubToken.value.trim()

  if (!token) {
    showToast('请输入 GitHub Token')
    return
  }

  isTokenValidating.value = true

  try {
    const isValid = await validateGitHubToken(token)
    if (isValid) {
      saveGitHubToken(token)
      showToast('配置成功！')
      showGitHubConfigDialog.value = false
      githubToken.value = ''
    } else {
      showToast('Token 无效，请检查权限设置')
    }
  } catch {
    showToast('验证失败，请检查网络')
  } finally {
    isTokenValidating.value = false
  }
}

// ============ 云备份 / 云恢复 ============

/** [WHAT] 云端备份：上传到 GitHub Gist（会覆盖云端旧数据） */
async function backupCloud() {
  if (holdingStore.holdings.length === 0 && aiTrackingStore.records.length === 0) {
    showToast('暂无数据可备份')
    return
  }

  if (!hasGitHubToken()) {
    showGitHubConfigDialog.value = true
    return
  }

  // [FIX] 确认弹窗，避免误操作覆盖云端数据
  try {
    await showConfirmDialog({
      title: '确认云备份',
      message: '备份将覆盖云端已有的数据，确认要备份吗？',
    })
  } catch {
    return
  }

  showLoadingToast({ message: '备份中...' })

  try {
    const jsonData = JSON.stringify(buildBackupPayload(true), null, 2)
    const result = await saveToGist(jsonData, getGitHubToken())
    closeToast()
    showToast(result.message)
  } catch {
    closeToast()
    showToast('云端备份失败')
  }
}

/** [WHAT] 云端恢复：从 GitHub Gist 拉回数据 */
async function restoreCloud() {
  if (!hasGitHubToken()) {
    showGitHubConfigDialog.value = true
    return
  }

  showLoadingToast({ message: '恢复中...' })

  try {
    const result = await restoreFromGist(getGitHubToken())
    closeToast()

    if (!result.success) {
      showToast(result.message)
      return
    }
    if (!result.content) {
      showToast('备份数据为空')
      return
    }

    try {
      const jsonData = JSON.parse(result.content)
      if (applyBackupData(jsonData)) {
        showToast('云端恢复成功')
      }
    } catch {
      showToast('解析备份数据失败')
    }
  } catch {
    closeToast()
    showToast('云端恢复失败')
  }
}

// [WHAT] 暴露给父级主动调用（比如父级想用图标按钮触发）
defineExpose({ backupLocal, restoreLocal, backupCloud, restoreCloud })
</script>

<template>
  <div class="backup-actions">
    <van-button
      v-if="props.showLocalBackup"
      :size="props.size"
      :class="props.buttonClass"
      @click="backupLocal"
    >备份</van-button>

    <van-button
      v-if="props.showCloudBackup"
      :size="props.size"
      :class="props.buttonClass"
      @click="backupCloud"
    >云备份</van-button>

    <van-button
      v-if="props.showLocalRestore"
      :size="props.size"
      :class="props.buttonClass"
      @click="restoreLocal"
    >恢复</van-button>

    <van-button
      v-if="props.showCloudRestore"
      :size="props.size"
      :class="props.buttonClass"
      @click="restoreCloud"
    >云恢复</van-button>

    <!-- GitHub Token 配置对话框 -->
    <van-popup
      v-model:show="showGitHubConfigDialog"
      position="center"
      round
      :style="{ width: '85%', maxWidth: '400px', background: 'var(--bg-secondary)' }"
    >
      <div class="github-config-popup">
        <div class="github-config-header">
          <span class="github-config-icon">☁️</span>
          <span class="github-config-title">云端备份配置</span>
        </div>
        <div class="github-config-desc">
          <p>请配置 GitHub Token 以使用云端备份功能：</p>
          <p class="github-config-tip">
            Token 获取方式：登录 GitHub → Settings → Developer settings → Personal access tokens → Generate new token<br/>
            勾选权限：gist
          </p>
        </div>
        <div class="github-config-form">
          <van-field
            v-model="githubToken"
            type="text"
            label="GitHub Token"
            placeholder="请输入 GitHub Personal Access Token"
            :disabled="isTokenValidating"
            clearable
          />
        </div>
        <div class="github-config-actions">
          <van-button
            size="small"
            @click="showGitHubConfigDialog = false"
            class="github-config-btn-cancel"
          >
            取消
          </van-button>
          <van-button
            size="small"
            type="primary"
            @click="saveGitHubConfig"
            :loading="isTokenValidating"
            class="github-config-btn-save"
          >
            {{ isTokenValidating ? '验证中...' : '保存并验证' }}
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.backup-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}

/* ============ GitHub 配置弹窗（样式从 Holding.vue 原样搬来） ============ */
.github-config-popup {
  padding: 20px;
}

.github-config-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.github-config-icon {
  font-size: 28px;
}

.github-config-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.github-config-desc {
  margin-bottom: 16px;
}

.github-config-desc p {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 8px 0;
}

.github-config-tip {
  font-size: 12px !important;
  color: var(--text-tertiary) !important;
  background: var(--bg-tertiary);
  padding: 10px 12px;
  border-radius: 8px;
  margin-top: 8px !important;
  word-break: break-all;
}

.github-config-form {
  margin-bottom: 20px;
}

.github-config-form :deep(.van-field__label) {
  font-size: 14px;
  color: var(--text-primary);
}

.github-config-form :deep(.van-field__control) {
  font-size: 13px;
}

.github-config-actions {
  display: flex;
  gap: 12px;
}

.github-config-btn-cancel {
  flex: 1;
}

.github-config-btn-save {
  flex: 1;
}

@media (max-width: 767px) {
  .github-config-popup {
    padding: 16px;
  }

  .github-config-header {
    margin-bottom: 12px;
  }

  .github-config-title {
    font-size: 16px;
  }
}
</style>
