<template>
  <div class="alerts-page">
    <!-- 导航栏 -->
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">{{ t('alerts.title') }}</span>/span>
      <van-icon name="plus" size="22" @click="showAdd = true" />
    </div>

    <div class="scroll-content">
      <!-- 空状态 -->
      <div v-if="rules.length === 0" class="empty-state">
        <van-icon name="bell-o" size="48" :style="{ color: 'var(--van-text-color-3)' }" />
        <p class="empty-text">{{ t('alerts.no_rules') }}</p>/p>
        <p class="empty-hint">{{ t('alerts.add_hint') }}</p>/p>
      </div>

      <!-- 提醒规则列表 -->
      <div v-else class="rule-list">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="rule-card"
        >
          <div class="rule-header">
            <span class="rule-fund">{{ rule.fundName }} ({{ rule.fundCode }})</span>
            <van-switch v-model="rule.enabled" size="20" @change="onToggle(rule.id)" />
          </div>
          <div class="rule-body">
            <span class="rule-type">{{ typeLabel(rule) }}</span>
            <span class="rule-detail">{{ detailLabel(rule) }}</span>
          </div>
          <div class="rule-actions">
            <van-button size="mini" type="danger" plain round @click="onRemove(rule.id)">{{ t('alerts.delete') }}</van-button>/van-button>
          </div>
        </div>
      </div>

      <div class="bottom-spacer"></div>
    </div>

    <!-- 添加提醒弹窗 -->
    <van-popup
      v-model:show="showAdd"
      position="bottom"
      round
      :style="{ height: '80%' }"
    >
      <div class="popup-header">
        <span>{{ t('alerts.add_rule') }}</span>/span>
        <van-icon name="cross" @click="showAdd = false" />
      </div>
      <div class="popup-body">
        <van-form @submit="onSubmit">
          <!-- 选择基金 -->
          <van-field
            v-model="form.fundName"
            name="fund"
            :label="t('alerts.fund_label')"
            :placeholder="t('alerts.select_fund')"
            readonly
            is-link
            @click="showFundPicker = true"
            :rules="[{ required: true, message: t('alerts.select_fund') }]"
          />

          <!-- 提醒类型 -->
          <van-field
            v-model="form.typeLabel"
            name="type"
            :label="t('alerts.type_label')"
            :placeholder="t('alerts.select_type')"
            readonly
            is-link
            @click="showTypePicker = true"
            :rules="[{ required: true, message: t('alerts.select_type') }]"
          />

          <!-- 阈值提醒：净值阈值 -->
          <van-field
            v-if="form.type === 'threshold'"
            v-model="form.threshold"
            type="number"
            name="threshold"
            :label="t('alerts.threshold_label')"
            :placeholder="t('alerts.enter_threshold')"
            :rules="[{ required: true, message: t('alerts.enter_threshold') }]"
          />
          <van-field
            v-if="form.type === 'threshold'"
            v-model="form.directionLabel"
            name="direction"
            :label="t('alerts.direction_label')"
            :placeholder="t('alerts.select_direction')"
            readonly
            is-link
            @click="showDirectionPicker = true"
            :rules="[{ required: true, message: t('alerts.select_direction') }]"
          />

          <!-- 涨跌幅提醒 -->
          <van-field
            v-if="form.type === 'change'"
            v-model="form.changePercent"
            type="number"
            name="changePercent"
            label="涨跌幅阈值 (%)"
            placeholder="请输入涨跌幅阈值"
            :rules="[{ required: true, message: '请输入涨跌幅阈值' }]"
          />

          <!-- 定时提醒 -->
          <van-field
            v-if="form.type === 'scheduled'"
            v-model="form.scheduleTime"
            name="scheduleTime"
            label="推送时间"
            placeholder="如 14:50"
            :rules="[{ required: true, message: '请输入推送时间' }, { pattern: /^\d{2}:\d{2}$/, message: '格式：HH:mm' }]"
          />

          <div style="margin: 16px;">
            <van-button round block type="primary" native-type="submit">
              保存
            </van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <!-- 基金选择弹窗 -->
    <van-popup v-model:show="showFundPicker" position="bottom">
      <van-picker
        :columns="fundOptions"
        @confirm="onPickFund"
        @cancel="showFundPicker = false"
      />
    </van-popup>

    <!-- 提醒类型选择弹窗 -->
    <van-popup v-model:show="showTypePicker" position="bottom">
      <van-picker
        :columns="typeOptions"
        @confirm="onPickType"
        @cancel="showTypePicker = false"
      />
    </van-popup>

    <!-- 方向选择弹窗 -->
    <van-popup v-model:show="showDirectionPicker" position="bottom">
      <van-picker
        :columns="directionOptions"
        @confirm="onPickDirection"
        @cancel="showDirectionPicker = false"
      />
    </van-popup>

    <!-- 方向选择弹窗 -->
    
  </div>
</template>
<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAlertsStore } from '@/stores/alerts'
import { useHoldingStore } from '@/stores/holding'
import { showToast } from 'vant'
import type { HoldingRecord } from '@/types/fund'
import type { AlertRule } from '@/stores/alerts'

const router = useRouter()
const { t } = useI18n()
const alertsStore = useAlertsStore()
const holdingStore = useHoldingStore()

const { rules } = alertsStore
const { holdings: holdingFunds } = holdingStore

const showAdd = ref(false)
const showFundPicker = ref(false)
const showTypePicker = ref(false)
const showDirectionPicker = ref(false)

const form = reactive({
  fundCode: '',
  fundName: '',
  type: '' as 'threshold' | 'change' | 'scheduled',
  typeLabel: '',
  threshold: '',
  direction: '' as 'above' | 'below',
  directionLabel: '',
  changePercent: '',
  scheduleTime: '',
  scheduleTimeValue: '',
})

const fundOptions = computed(() => {
  return holdingFunds.map((f: HoldingRecord) => ({
    text: `${f.name} (${f.code})`,
    value: f.code,
  }))
})

const typeOptions = [
  { text: t('alerts.threshold_text'), value: 'threshold' },
  { text: t('alerts.change_text'), value: 'change' },
  { text: t('alerts.scheduled_text'), value: 'scheduled' },
]

const directionOptions = [
  { text: t('alerts.above_text'), value: 'above' },
  { text: t('alerts.below_text'), value: 'below' },
]

function onPickFund(item: any) {
  form.fundCode = item.selectedValues[0]
  form.fundName = item.selectedOptions[0].text
  showFundPicker.value = false
}

function onPickType(item: any) {
  form.type = item.selectedValues[0]
  form.typeLabel = item.selectedOptions[0].text
  showTypePicker.value = false
}

function onPickDirection(item: any) {
  form.direction = item.selectedValues[0]
  form.directionLabel = item.selectedOptions[0].text
  showDirectionPicker.value = false
}

function typeLabel(rule: AlertRule) {
  if (rule.type === 'threshold') return '净值阈值提醒'
  if (rule.type === 'change') return '涨跌幅提醒'
  if (rule.type === 'scheduled') return '定时推送'
  return ''
}

function detailLabel(rule: AlertRule) {
  if (rule.type === 'threshold') return `${rule.direction === 'above' ? '≥' : '≤'} ${rule.threshold}`
  if (rule.type === 'change') return `±${rule.changePercent}%`
  if (rule.type === 'scheduled') return `每日 ${rule.scheduleTime}`
  return ''
}

function onToggle(id: string) {
  alertsStore.toggleRule(id)
}

function onRemove(id: string) {
  alertsStore.removeRule(id)
  showToast(t('alerts.rule_deleted'))
}

function onSubmit() {
  alertsStore.addRule({
    fundCode: form.fundCode,
    fundName: form.fundName,
    type: form.type,
    threshold: form.type === 'threshold' ? parseFloat(form.threshold) : undefined,
    direction: form.type === 'threshold' ? form.direction : undefined,
    changePercent: form.type === 'change' ? parseFloat(form.changePercent) : undefined,
    scheduleTime: form.type === 'scheduled' ? form.scheduleTime : undefined,
    enabled: true,
  })
  showToast(t('alerts.rule_added'))
  showAdd.value = false
  resetForm()
}

function resetForm() {
  form.fundCode = ''
  form.fundName = ''
  form.type = '' as any
  form.typeLabel = ''
  form.threshold = ''
  form.direction = '' as any
  form.directionLabel = ''
  form.changePercent = ''
  form.scheduleTime = ''
  form.scheduleTimeValue = ''
}

onMounted(() => {
  // 持仓数据由 Holding.vue 加载，这里无需重复加载
})
</script>

<style scoped>
.alerts-page {
  height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding-top: max(12px, env(safe-area-inset-top, 0px));
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.scroll-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 32px;
  text-align: center;
}

.empty-text {
  font-size: 16px;
  color: var(--text-primary);
  margin-top: 16px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 8px;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rule-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.rule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.rule-fund {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.rule-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.rule-type {
  font-size: 13px;
  color: var(--text-secondary);
}

.rule-detail {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.rule-actions {
  display: flex;
  justify-content: flex-end;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}

.popup-body {
  padding: 16px;
  overflow-y: auto;
}

.bottom-spacer {
  height: 40px;
}
</style>
