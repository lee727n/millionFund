<!-- [WHY] 分红记录区块，从 Detail.vue 提取
[WHAT] 展示基金历史分红记录
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

defineProps<{
  dividendRecords: Array<{
    date: string
    amount: number
    type: string
  }>
  totalDividend: number
}>()
</script>

<template>
  <div class="info-section" v-if="dividendRecords.length > 0">
    <div class="section-header">
      <span>{{ t('dividend_records.title') }}</span>
      <span class="section-tip">
        累计{{ dividendRecords.length }}次，共{{ totalDividend.toFixed(4) }}元/份
      </span>
    </div>
    <div class="dividend-list">
      <div
        v-for="(record, idx) in dividendRecords.slice(0, 5)"
        :key="idx"
        class="dividend-item"
      >
        <div class="dividend-date">{{ record.date }}</div>
        <div class="dividend-amount">每份派{{ record.amount.toFixed(4) }}元</div>
        <div class="dividend-type">{{ record.type }}</div>
      </div>
      <div v-if="dividendRecords.length > 5" class="more-hint">
        还有{{ dividendRecords.length - 5 }}条记录...
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.info-section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header span:first-child {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-tip {
  font-size: 12px;
  color: var(--text-secondary);
}

.dividend-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dividend-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.dividend-item:last-child {
  margin-bottom: 0;
}

.dividend-date {
  font-size: 13px;
  color: var(--text-secondary);
  width: 100px;
  flex-shrink: 0;
}

.dividend-amount {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.dividend-type {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 2px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.more-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 8px;
}
</style>
