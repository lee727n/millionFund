<script setup lang="ts">
// [WHY] 定投计算器页面 - 模拟定投收益
// [WHAT] 输入基金代码、每期金额、频率、期限，计算定投收益，可视化收益曲线
// [REF] Task #19 需求文档

import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDCASimulation, type DCASimulationInput, type DCAFrequency } from '@/composables/useDCASimulation'
import { searchFund, type FundInfo } from '@/api/fundSearch'
import { showToast } from 'vant'
import { formatMoney, formatPercent } from '@/composables/useDCASimulation'

const router = useRouter()
const { t } = useI18n()

// [WHAT] 定投输入表单
const form = reactive<{
  fundCode: string
  fundName: string
  amountPerPeriod: string
  frequency: DCAFrequency
  durationMonths: string
}>({
  fundCode: '',
  fundName: '',
  amountPerPeriod: '1000',
  frequency: 'monthly',
  durationMonths: '12'
})

// [WHAT] 基金搜索
const searchKeyword = ref('')
const searchResults = ref<FundInfo[]>([])
const showFundSelector = ref(false)

// [WHAT] 定投模拟
const { isLoading, error, simulationResult, runSimulation, reset } = useDCASimulation()

// [WHAT] 频率选项
const frequencyOptions = [
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' }
]

// [WHAT] 期限选项
const durationOptions = [
  { label: '6个月', value: '6' },
  { label: '1年', value: '12' },
  { label: '2年', value: '24' },
  { label: '3年', value: '36' },
  { label: '5年', value: '60' }
]

// [WHAT] 弹出层控制
const showFrequencyPicker = ref(false)

// [WHAT] 是否已执行模拟
const hasResult = computed(() => simulationResult.value !== null)

/**
 * 搜索基金
 */
async function doSearch(keyword: string) {
  if (!keyword.trim()) {
    searchResults.value = []
    return
  }

  try {
    const results = await searchFund(keyword, 10)
    searchResults.value = results
  } catch (err) {
    showToast('搜索失败')
  }
}

// [WHAT] 防抖搜索
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(() => searchKeyword.value, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!val.trim()) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(() => doSearch(val), 300)
})

/**
 * 选择基金
 */
function selectFund(fund: FundInfo) {
  form.fundCode = fund.code
  form.fundName = fund.name
  showFundSelector.value = false
  searchKeyword.value = ''
  searchResults.value = []
}

/**
 * 执行定投模拟
 */
async function handleSimulate() {
  // 验证输入
  if (!form.fundCode) {
    showToast('请输入基金代码')
    return
  }

  const amount = parseFloat(form.amountPerPeriod)
  if (isNaN(amount) || amount <= 0) {
    showToast('请输入有效的每期金额')
    return
  }

  const duration = parseInt(form.durationMonths)
  if (isNaN(duration) || duration <= 0) {
    showToast('请输入有效的定投期限')
    return
  }

  // 执行模拟
  const input: DCASimulationInput = {
    fundCode: form.fundCode,
    fundName: form.fundName,
    amountPerPeriod: amount,
    frequency: form.frequency,
    durationMonths: duration
  }

  await runSimulation(input)
}

/**
 * 重置表单
 */
function handleReset() {
  form.fundCode = ''
  form.fundName = ''
  form.amountPerPeriod = '1000'
  form.frequency = 'monthly'
  form.durationMonths = '12'
  reset()
}

/**
 * 返回上一页
 */
function goBack() {
  router.back()
}

/**
 * 获取收益率颜色类名
 */
function getReturnColorClass(value: number): string {
  if (value > 0) return 'text-red-500'
  if (value < 0) return 'text-green-500'
  return 'text-gray-500'
}

/**
 * 确认频率选择
 */
function onFrequencyConfirm(value: string) {
  form.frequency = value as DCAFrequency
  showFrequencyPicker.value = false
}
</script>

<template>
  <div class="dca-calculator-page">
    <!-- 导航栏 -->
    <van-nav-bar
      title="定投计算器"
      left-arrow
      @click-left="goBack"
    />

    <!-- 输入表单 -->
    <div class="input-form">
      <div class="form-section">
        <div class="section-title">基金选择</div>

        <!-- 基金代码输入 -->
        <van-field
          v-model="form.fundCode"
          label="基金代码"
          placeholder="输入基金代码"
          clearable
          @click-right-icon="showFundSelector = true"
        >
          <template #right-icon>
            <van-icon name="search" @click="showFundSelector = true" />
          </template>
        </van-field>

        <!-- 基金名称显示 -->
        <div v-if="form.fundName" class="selected-fund">
          已选择: {{ form.fundName }} ({{ form.fundCode }})
        </div>

        <!-- 基金搜索按钮 -->
        <van-button
          type="primary"
          size="small"
          plain
          block
          @click="showFundSelector = true"
          style="margin-top: 8px"
        >
          搜索基金
        </van-button>
      </div>

      <div class="form-section">
        <div class="section-title">定投参数</div>

        <!-- 每期金额 -->
        <van-field
          v-model="form.amountPerPeriod"
          label="每期金额"
          placeholder="请输入每期定投金额"
          type="number"
          clearable
        >
          <template #extra>
            <span>元</span>
          </template>
        </van-field>

        <!-- 定投频率 -->
        <van-field
          v-model="form.frequency"
          label="定投频率"
          is-link
          readonly
          @click="showFrequencyPicker = true"
        />
        <van-popup v-model:show="showFrequencyPicker" position="bottom">
          <van-picker
            :columns="frequencyOptions"
            @confirm="onFrequencyConfirm"
            @cancel="showFrequencyPicker = false"
          />
        </van-popup>

        <!-- 定投期限 -->
        <van-field
          v-model="form.durationMonths"
          label="定投期限"
          placeholder="请输入定投月数"
          type="number"
          clearable
        >
          <template #extra>
            <span>月</span>
          </template>
        </van-field>

        <!-- 快捷期限选择 -->
        <div class="duration-shortcuts">
          <van-tag
            v-for="opt in durationOptions"
            :key="opt.value"
            :class="{ active: form.durationMonths === opt.value }"
            round
            @click="form.durationMonths = opt.value"
          >
            {{ opt.label }}
          </van-tag>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="form-actions">
        <van-button
          type="default"
          block
          @click="handleReset"
        >
          重置
        </van-button>
        <van-button
          type="primary"
          block
          :loading="isLoading"
          @click="handleSimulate"
        >
          开始模拟
        </van-button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-banner">
      <van-icon name="warning-o" size="16" />
      <span>{{ error }}</span>
    </div>

    <!-- 模拟结果 -->
    <div v-if="hasResult && simulationResult" class="simulation-result">
      <div class="result-section">
        <div class="section-title">模拟结果</div>

        <!-- 汇总数据 -->
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">总投入</div>
            <div class="summary-value">{{ formatMoney(simulationResult.summary.totalInvested) }} 元</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">当前市值</div>
            <div class="summary-value">{{ formatMoney(simulationResult.summary.totalValue) }} 元</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">总收益</div>
            <div class="summary-value" :class="getReturnColorClass(simulationResult.summary.totalReturn)">
              {{ formatMoney(simulationResult.summary.totalReturn) }} 元
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">总收益率</div>
            <div class="summary-value" :class="getReturnColorClass(simulationResult.summary.totalReturnRate)">
              {{ formatPercent(simulationResult.summary.totalReturnRate) }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">年化收益率</div>
            <div class="summary-value" :class="getReturnColorClass(simulationResult.summary.annualizedReturn)">
              {{ formatPercent(simulationResult.summary.annualizedReturn) }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">定投次数</div>
            <div class="summary-value">{{ simulationResult.summary.monthsInvested }} 次</div>
          </div>
        </div>
      </div>

      <!-- 收益曲线图（简化版：表格展示） -->
      <div class="result-section">
        <div class="section-title">定投明细</div>
        <div class="records-table">
          <div class="table-header">
            <span class="col-date">日期</span>
            <span class="col-nav">净值</span>
            <span class="col-shares">份额</span>
            <span class="col-value">市值</span>
          </div>
          <div
            v-for="(record, index) in simulationResult.records.slice(-10)"
            :key="record.date"
            class="table-row"
          >
            <span class="col-date">{{ record.date }}</span>
            <span class="col-nav">{{ record.nav.toFixed(4) }}</span>
            <span class="col-shares">{{ record.shares.toFixed(2) }}</span>
            <span class="col-value">{{ formatMoney(record.portfolioValue) }}</span>
          </div>
          <div v-if="simulationResult.records.length > 10" class="table-footer">
            仅显示最近10条记录，共 {{ simulationResult.records.length }} 条
          </div>
        </div>
      </div>
    </div>

    <!-- 基金选择器弹出层 -->
    <van-popup
      v-model:show="showFundSelector"
      position="bottom"
      :style="{ height: '60%' }"
      round
    >
      <div class="fund-selector">
        <div class="selector-header">
          <span class="selector-title">选择基金</span>
          <van-icon name="cross" size="20" @click="showFundSelector = false" />
        </div>

        <van-search
          v-model="searchKeyword"
          placeholder="搜索基金代码或名称"
          shape="round"
        />

        <div class="selector-results">
          <div
            v-for="fund in searchResults"
            :key="fund.code"
            class="fund-item"
            @click="selectFund(fund)"
          >
            <div class="fund-info">
              <span class="fund-name">{{ fund.name }}</span>
              <span class="fund-code">{{ fund.code }}</span>
            </div>
            <van-icon name="plus" color="#1989fa" />
          </div>

          <van-empty
            v-if="searchKeyword && searchResults.length === 0"
            image="search"
            description="没有找到基金"
          />
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.dca-calculator-page {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-bottom: 20px;
}

/* ========== 输入表单 ========== */
.input-form {
  padding: 16px;
}

.form-section {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.selected-fund {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary);
}

.duration-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.duration-shortcuts .van-tag {
  cursor: pointer;
  padding: 4px 12px;
}

.duration-shortcuts .van-tag.active {
  background: #1989fa;
  color: white;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

/* ========== 错误提示 ========== */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #fff3f3;
  color: #f56c6c;
  font-size: 13px;
  margin: 0 16px;
  border-radius: 8px;
}

/* ========== 模拟结果 ========== */
.simulation-result {
  padding: 0 16px;
}

.result-section {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.text-red-500 {
  color: #f56c6c;
}

.text-green-500 {
  color: #67c23a;
}

.text-gray-500 {
  color: #909399;
}

/* ========== 定投明细表格 ========== */
.records-table {
  border: 1px solid var(--border-color, #ebedf0);
  border-radius: 4px;
  overflow: hidden;
}

.table-header,
.table-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.table-header {
  background: var(--bg-tertiary);
  font-weight: 600;
  font-size: 12px;
}

.table-row:last-child {
  border-bottom: none;
}

.col-date {
  flex: 1.2;
  font-size: 12px;
}

.col-nav,
.col-shares,
.col-value {
  flex: 1;
  font-size: 12px;
  text-align: right;
}

.table-footer {
  padding: 8px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
}

/* ========== 基金选择器 ========== */
.fund-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.selector-title {
  font-size: 16px;
  font-weight: 600;
}

.selector-results {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
}

.fund-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color, #ebedf0);
  cursor: pointer;
}

.fund-item:active {
  background: var(--bg-active, #f2f3f5);
}

.fund-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fund-name {
  font-size: 14px;
  font-weight: 500;
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
