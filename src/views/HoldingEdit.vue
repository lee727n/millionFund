<script setup lang="ts">
// [WHY] 持仓录入/编辑页面 - 支持多资产类别
// [WHAT] 支持基金、A股、港股、美股、加密货币、可转债等全品种

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { useHoldingStore } from '@/stores/holding'
import { ASSET_CLASS_CONFIG, type AssetClass } from '@/types/holding'
import { fetchFundEstimate } from '@/api/fundFast'
import type { HoldingRecord } from '@/types/fund'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const holdingStore = useHoldingStore()

// [WHAT] 是否为编辑模式
const isEdit = computed(() => !!route.params.code)

// [WHAT] 资产类别选择器
const showAssetClassPicker = ref(false)

// [WHAT] 日期选择器
const showDatePicker = ref(false)

// [WHAT] 表单数据
const form = ref({
  assetClass: 'fund' as AssetClass,
  code: '',
  name: '',
  costPrice: '',
  shares: '',
  buyDate: new Date().toISOString().split('T')[0] || '',
  marketValue: '',
  profit: ''
})

// [WHAT] 搜索相关（基金专用）
const searchKeyword = ref('')
const searchResults = ref<{ code: string; name: string }[]>([])
const isSearching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

// [WHAT] 资产类别选项
const assetClassOptions = Object.entries(ASSET_CLASS_CONFIG).map(([value, config]) => ({
  text: config.label,
  value
}))

// [WHAT] 代码输入框的 placeholder
const codePlaceholder = computed(() => {
  const placeholders: Record<AssetClass, string> = {
    fund: '请输入基金代码（如：110011）',
    astock: '请输入A股代码（如：sh600000）',
    hkstock: '请输入港股代码（如：hk00700）',
    usstock: '请输入美股代码（如：AAPL）',
    crypto: '请输入加密货币代码（如：BTC）',
    convertible: '请输入可转债代码（如：128090）',
    reits: '请输入 REITs 代码',
    gold: '请输入黄金品种（如：黄金ETF）',
    commodity: '请输入大宗商品代码'
  }
  return placeholders.value[form.value.assetClass] || t('holding_edit.code_symbol_default')
})

// [WHAT] 名称输入框的 placeholder
const namePlaceholder = computed(() => {
  if (form.value.assetClass === 'fund') {
    return '选择基金后自动填充'
  }
  return '请输入品种名称'
})

// [WHAT] 成本价标签
const costPriceLabel = computed(() => {
  const labels: Record<AssetClass, string> = {
    fund: '买入净值',
    astock: '买入单价（元）',
    hkstock: '买入单价（港元）',
    usstock: '买入单价（美元）',
    crypto: '买入单价（USDT）',
    convertible: '买入单价（元）',
    reits: '买入单价（元）',
    gold: '买入单价（元/克）',
    commodity: '买入单价'
  }
  return labels[form.value.assetClass] || '买入单价'
})

// [WHAT] 数量标签
const sharesLabel = computed(() => {
  const labels: Record<AssetClass, string> = {
    fund: t('holding_edit.shares'),
    astock: '持有数量（股）',
    hkstock: '持有数量（股）',
    usstock: '持有数量（股）',
    crypto: '持有数量（个）',
    convertible: '持有数量（张）',
    reits: '持有数量（份）',
    gold: '持有数量（克）',
    commodity: '持有数量'
  }
  return labels[form.value.assetClass] || '持有数量'
})

// [WHAT] 搜索基金（基金类别专用）
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  
  if (!searchKeyword.value.trim() || form.value.assetClass !== 'fund') {
    searchResults.value = []
    return
  }
  
  searchTimer = setTimeout(async () => {
    isSearching.value = true
    try {
      const { searchFund } = await import('@/api/fundFast')
      const results = await searchFund(searchKeyword.value, 10)
      searchResults.value = results.map(r => ({ code: r.code, name: r.name }))
    } catch {
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 300)
}

// [WHAT] 选择基金（基金类别专用）
async function selectFund(code: string, name: string) {
  form.value.code = code
  form.value.name = name
  searchKeyword.value = ''
  searchResults.value = []
  
  // 自动获取最新净值
  try {
    const data = await fetchFundEstimate(code)
    const nav = parseFloat(data.dwjz) || parseFloat(data.gsz) || 0
    if (nav > 0) {
      form.value.costPrice = nav.toFixed(4)
      updateSharesFromMarketValue()
    }
  } catch {
    showToast('获取净值失败，请手动输入')
  }
}

// [WHAT] 根据市值反推份额
function updateSharesFromMarketValue() {
  const costPrice = parseFloat(form.value.costPrice) || 0
  const marketValue = parseFloat(form.value.marketValue) || 0
  if (costPrice > 0 && marketValue > 0) {
    form.value.shares = (marketValue / costPrice).toFixed(2)
  }
}

// [WHAT] 根据市值和收益反推成本价
function updateCostPriceFromProfit() {
  const marketValue = parseFloat(form.value.marketValue) || 0
  const profit = parseFloat(form.value.profit) || 0
  const shares = parseFloat(form.value.shares) || 0
  
  if (shares > 0 && marketValue > 0) {
    const costValue = marketValue - profit
    const costPrice = costValue / shares
    form.value.costPrice = costPrice.toFixed(4)
  }
}

// [WHAT] 监听市值变化，自动计算份额
watch(() => form.value.marketValue, () => {
  if (form.value.assetClass === 'fund' && form.value.costPrice) {
    updateSharesFromMarketValue()
  }
})

// [WHAT] 监听收益变化，反推成本价
watch(() => form.value.profit, () => {
  if (form.value.assetClass !== 'fund' && form.value.marketValue && form.value.shares) {
    updateCostPriceFromProfit()
  }
})

// [WHAT] 资产类别确认
function onAssetClassConfirm(value: any) {
  form.value.assetClass = value.selectedValues[0] as AssetClass
  showAssetClassPicker.value = false
  // 切换类别时清空表单
  form.value.code = ''
  form.value.name = ''
  searchKeyword.value = ''
  searchResults.value = []
}

// [WHAT] 表单验证
function validateForm(): boolean {
  if (!form.value.code.trim()) {
    showToast('请输入代码/符号')
    return false
  }
  if (!form.value.name.trim()) {
    showToast('请输入名称')
    return false
  }
  if (!form.value.costPrice || parseFloat(form.value.costPrice) <= 0) {
    showToast('请输入有效的买入价格')
    return false
  }
  if (!form.value.shares || parseFloat(form.value.shares) <= 0) {
    showToast('请输入有效的持有数量')
    return false
  }
  if (!form.value.buyDate) {
    showToast('请选择买入日期')
    return false
  }
  return true
}

// [WHAT] 提交表单
async function onSubmit() {
  if (!validateForm()) return
  
  const record: HoldingRecord = {
    code: form.value.code.trim(),
    name: form.value.name.trim(),
    buyNetValue: parseFloat(form.value.costPrice) || 0,
    shares: parseFloat(form.value.shares) || 0,
    buyDate: form.value.buyDate,
    holdingDays: 0,
    createdAt: Date.now(),
    assetClass: form.value.assetClass,
    marketValue: form.value.marketValue ? parseFloat(form.value.marketValue) : undefined,
    profit: form.value.profit ? parseFloat(form.value.profit) : undefined
  }
  
  showLoadingToast({ message: t('common.saving'), forbidClick: true })
  try {
    holdingStore.addOrUpdateHolding(record)
    closeToast()
    showToast({ message: t(isEdit.value ? 'holding_edit.save_success' : 'aitracking_toast.add_success'), duration: 2000 })
    // 保存成功后跳转回资产总览页面
    router.push('/portfolio')
  } catch (err) {
    closeToast()
    showToast({ message: t('common.save_failed'), duration: 2000 })
    console.error('[HoldingEdit] 保存失败', err)
  }
}

// [WHAT] 取消编辑
function onCancel() {
  router.back()
}

// [WHAT] 加载编辑数据
function loadEditData() {
  if (!isEdit.value) return
  
  const code = route.params.code as string
  const existing = holdingStore.getHoldingByCode(code)
  if (!existing) {
    showToast('持仓记录不存在')
    router.back()
    return
  }
  
  form.value = {
    assetClass: (existing.assetClass || 'fund') as AssetClass,
    code: existing.code,
    name: existing.name,
    costPrice: (existing.buyNetValue || 0).toString(),
    shares: (existing.shares || 0).toString(),
    buyDate: existing.buyDate || new Date().toISOString().split('T')[0] || '',
    marketValue: (existing.marketValue || 0).toString(),
    profit: (existing.profit || 0).toString()
  }
}

onMounted(() => {
  loadEditData()
})
</script>

<template>
  <div class="holding-edit-page">
    <van-nav-bar
      :title="isEdit ? t('holding_edit.edit') : t('holding_edit.add')"
      :left-text="t('common.back')"
      @click-left="onCancel"
    />
    
    <div class="form-container">
      <!-- 资产类别选择 -->
      <van-field
        v-model="form.assetClass"
        is-link
        readonly
        :label="t('holding_edit.asset_class')"
        :placeholder="assetClassOptions.find(o => o.value === form.assetClass)?.text || '请选择'"
        @click="showAssetClassPicker = true"
      />
      <van-popup v-model:show="showAssetClassPicker" position="bottom">
        <van-picker
          :columns="assetClassOptions"
          @confirm="onAssetClassConfirm"
          @cancel="showAssetClassPicker = false"
        />
      </van-popup>
      
      <!-- 代码/符号输入（基金类别专用搜索） -->
      <template v-if="form.assetClass === 'fund'">
        <van-field
          v-model="searchKeyword"
          :label="t('holding_edit.fund_code')"
          :placeholder="t('holding_edit.search_placeholder')"
          @input="onSearchInput"
        />
        
        <!-- 搜索结果 -->
        <div v-if="searchResults.length > 0" class="search-results">
          <van-cell
            v-for="item in searchResults"
            :key="item.code"
            :title="item.name"
            :label="item.code"
            clickable
            @click="selectFund(item.code, item.name)"
          />
        </div>
        
        <!-- 已选择的基金 -->
        <van-field
          v-if="form.code"
          :model-value="`${form.name} (${form.code})`"
          :label="t('holding_edit.selected_fund')"
          readonly
        >
          <template #button>
            <van-button size="small" @click="form.code = ''; form.name = ''; searchKeyword = ''">{{ t('holding_edit.reselect') }}</van-button>
          </template>
        </van-field>
      </template>
      
      <!-- 非基金类别：手动输入代码和名称 -->
      <template v-else>
        <van-field
          v-model="form.code"
          :label="t('holding_edit.code_symbol')"
          :placeholder="codePlaceholder"
        />
        <van-field
          v-model="form.name"
          :label="t('holding_edit.name')"
          :placeholder="namePlaceholder"
        />
      </template>
      
      <!-- 买入价格 -->
      <van-field
        v-model="form.costPrice"
        type="number"
        :label="costPriceLabel"
        :placeholder="t('common.please_input')"
      />
      
      <!-- 持有数量 -->
      <van-field
        v-model="form.shares"
        type="number"
        :label="sharesLabel"
        :placeholder="t('common.please_input')"
      />
      
      <!-- 买入日期 -->
      <van-field
        v-model="form.buyDate"
        is-link
        readonly
        :label="t('holding_edit.buy_date')"
        :placeholder="t('common.please_select')"
        @click="showDatePicker = true"
      />
      <van-popup v-model:show="showDatePicker" position="bottom">
        <van-date-picker
          v-model="form.buyDate"
          @confirm="showDatePicker = false"
          @cancel="showDatePicker = false"
        />
      </van-popup>
      
      <!-- 持仓市值（可选，用于反推份额） -->
      <van-field
        v-model="form.marketValue"
        type="number"
        :label="t('holding_edit.market_value')"
        :placeholder="t('holding_edit.market_value_ph')"
      />
      
      <!-- 持仓收益（可选，用于反推成本价） -->
      <van-field
        v-model="form.profit"
        type="number"
        :label="t('holding_edit.profit')"
        :placeholder="t('holding_edit.profit_ph')"
      />
    </div>
    
    <!-- 提交按钮 -->
    <div class="submit-bar">
      <van-button block type="primary" @click="onSubmit">
        {{ isEdit ? t('holding_edit.save') : t('holding_edit.confirm_add') }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.holding-edit-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.form-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.search-results {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin: 0 16px;
}

.submit-bar {
  padding: 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}
</style>
