<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

interface FundScale {
  scale: number
  scaleDate: string
  shareTotal: number
  institutionRatio: number
  personalRatio: number
}

interface PurchaseFee {
  minAmount: number
  maxAmount: number
  rate: number
  discountRate: number
}

interface RedemptionFee {
  minDays: number
  maxDays: number
  rate: number
}

interface FundFees {
  managementFee: number
  custodianFee: number
  salesServiceFee: number
  purchaseFees: PurchaseFee[]
  redemptionFees: RedemptionFee[]
}

interface HoldingDetail {
  holdDays: number
  amount: number
}

const props = defineProps<{
  fundScale: FundScale | null
  fundFees: FundFees | null
  holdingDetails?: HoldingDetail | null
}>()

const estimatedRedemptionFee = computed(() => {
  if (!props.fundFees || !props.holdingDetails) return null
  const holdDays = props.holdingDetails.holdDays
  const fee = props.fundFees.redemptionFees.find(f => holdDays >= f.minDays && holdDays < f.maxDays)
  if (!fee) return null
  const estimatedFee = props.holdingDetails.amount * (fee.rate / 100)
  return { rate: fee.rate, fee: estimatedFee }
})

function formatFeeAmount(amount: number): string {
  return amount >= 1000 ? `${amount}元` : amount === 0 ? '免费' : `${amount}%`
}

function formatAmountRange(fee: PurchaseFee): string {
  if (fee.minAmount === 0 && fee.maxAmount === Infinity) return '全部金额'
  if (fee.maxAmount === Infinity) return `≥${fee.minAmount}万`
  if (fee.minAmount === 0) return `<${fee.maxAmount}万`
  return `${fee.minAmount}-${fee.maxAmount}万`
}

function formatDaysRange(fee: RedemptionFee): string {
  if (fee.maxDays === Infinity) return `≥${fee.minDays}天`
  if (fee.minDays === 0) return `<${fee.maxDays}天`
  return `${fee.minDays}-${fee.maxDays}天`
}
</script>

<template>
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
        <span>{{ formatAmountRange(fee) }}</span>
        <span>{{ formatFeeAmount(fee.rate) }}</span>
        <span class="discount">{{ formatFeeAmount(fee.discountRate) }}</span>
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
        <span>{{ formatDaysRange(fee) }}</span>
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
</template>

<style scoped>
.info-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
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

.scale-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.scale-item {
  text-align: center;
}

.scale-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.scale-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.fee-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.fee-item {
  text-align: center;
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.fee-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.fee-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.fee-table {
  margin-bottom: 12px;
}

.table-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.table-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 8px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color);
}

.table-row.header {
  background: var(--bg-tertiary);
  font-weight: 500;
  color: var(--text-secondary);
  border-radius: 6px 6px 0 0;
  border-bottom: none;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row .discount {
  color: var(--price-up);
  font-weight: 500;
}

.table-row .free {
  color: var(--price-up);
}

.redemption-estimate {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.estimate-info {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.estimate-fee {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.fee-amount {
  color: var(--price-up);
  font-weight: 600;
}
</style>
