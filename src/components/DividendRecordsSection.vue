<!-- [WHY] 分红记录区块，从 Detail.vue 提取
[WHAT] 展示基金历史分红记录
-->
<script setup lang="ts">
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
      <span>分红记录</span>
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
/* ========== 分红记录 ========== */
.dividend-list {
  padding: 8px 16px 12px;
}

.dividend-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.dividend-item:last-child {
  border-bottom: none;
}

.dividend-date {
  font-size: 13px;
  color: var(--text-secondary);
  width: 90px;
}

.dividend-amount {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.dividend-type {
  font-size: 11px;
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.more-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 8px 0;
}

.empty-hint {
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  padding: 20px;
}
</style>
