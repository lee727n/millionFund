<template>
  <div class="dca-page">
    <!-- 顶部栏 -->
    <header class="dca-topbar">
      <div class="dca-top-left">
        <h1>📅 定投管理</h1>
        <span class="dca-sub">按计划自动以当前净值买入 · 扣减对应账户现金</span>
      </div>
      <div class="dca-top-right">
        <span class="dca-updated">{{ lastUpdated }}</span>
        <button class="dca-btn ghost" @click="doRefresh">↻ 刷新</button>
        <button class="dca-btn ghost" @click="openPanorama">← 全景大屏</button>
      </div>
    </header>

    <div class="dca-body">
      <!-- 左：新建定投 -->
      <aside class="dca-newpanel">
        <div class="dca-new-title">＋ 新建定投计划</div>

        <div class="dca-field">
          <label>账户</label>
          <select v-model="form.source">
            <option v-for="a in ACCOUNTS" :key="a.key" :value="a.key">{{ a.label }}</option>
          </select>
        </div>

        <div class="dca-field">
          <label>定投基金</label>
          <select v-model="form.code">
            <option value="">请选择基金</option>
            <option v-for="f in formFunds" :key="f.code" :value="f.code">{{ f.name }}（{{ f.code }}）</option>
          </select>
        </div>

        <div class="dca-field">
          <label>每期金额（元）</label>
          <input v-model="form.amount" type="number" step="0.01" min="0" placeholder="如 1000" />
        </div>

        <div class="dca-field">
          <label>频率</label>
          <div class="dca-freq">
            <label :class="{ active: form.frequency === 'daily' }"><input type="radio" value="daily" v-model="form.frequency" /> 每日</label>
            <label :class="{ active: form.frequency === 'weekly' }"><input type="radio" value="weekly" v-model="form.frequency" /> 每周</label>
            <label :class="{ active: form.frequency === 'monthly' }"><input type="radio" value="monthly" v-model="form.frequency" /> 每月</label>
          </div>
        </div>

        <div v-if="form.frequency === 'weekly'" class="dca-field">
          <label>星期</label>
          <select v-model.number="form.weekday">
            <option :value="1">周一</option>
            <option :value="2">周二</option>
            <option :value="3">周三</option>
            <option :value="4">周四</option>
            <option :value="5">周五</option>
          </select>
        </div>

        <div v-if="form.frequency === 'monthly'" class="dca-field">
          <label>每月几号</label>
          <select v-model.number="form.monthday">
            <option v-for="d in 28" :key="d" :value="d">{{ d }} 号</option>
          </select>
        </div>

        <div class="dca-field">
          <label>开始日期</label>
          <input v-model="form.startDate" type="date" />
        </div>

        <div class="dca-field row">
          <label>启用</label>
          <input type="checkbox" v-model="form.active" />
        </div>

        <button class="dca-btn primary dca-save" @click="submit">保存计划</button>
        <p class="dca-note">
          定投仅在网页打开且触发刷新时执行；过去的交易日不补买。<br />
          无后端，关掉页面即停止采集与买入。
        </p>
      </aside>

      <!-- 右：账户 × 计划（统计内联，不分 tab） -->
      <main class="dca-accounts">
        <section v-for="a in ACCOUNTS" :key="a.key" class="dca-acc">
          <div class="dca-acc-head">
            <img class="dca-acc-icon" :src="accountIcon(a.key)" :alt="a.label" />
            <span class="dca-acc-name">{{ a.label }}</span>
            <span class="dca-acc-count">{{ plansOf(a.key).length }} 个计划</span>
            <div class="dca-acc-stats">
              <div><span>现金</span><b>{{ fmtMoney(statOf(a.key).cash) }}</b></div>
              <div><span>日均</span><b>{{ fmtMoney(statOf(a.key).dailyRate) }}/日</b></div>
              <div>
                <span>可定投</span>
                <b>{{ isFinite(statOf(a.key).daysRemaining) ? statOf(a.key).daysRemaining + ' 天' : '∞' }}</b>
              </div>
            </div>
          </div>

          <div class="dca-acc-body">
            <div v-if="plansOf(a.key).length === 0" class="dca-acc-empty">该账户暂无定投计划</div>
            <div v-for="plan in plansOf(a.key)" :key="plan.id" class="dca-plan" :title="plan.name + ' · 累计投入 ' + fmtMoney(plan.totalInvested) + ' · 已执行 ' + plan.executedCount + ' 次'">
              <div class="dca-plan-row">
                <span class="dca-p-name">{{ plan.name }}<i class="dca-p-code">{{ plan.code }}</i></span>
                <span
                  v-if="editingId !== plan.id"
                  class="dca-p-amt"
                  title="点击编辑每期金额"
                  @click="startEdit(plan)"
                >{{ fmtMoney(plan.amount) }}/期</span>
                <span v-else class="dca-p-edit">
                  <input
                    v-model="editAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    class="dca-edit-input"
                    @keyup.enter="saveEdit"
                  />
                  <button class="dca-edit-save" @click="saveEdit">保存</button>
                  <button class="dca-edit-cancel" @click="cancelEdit">取消</button>
                </span>
                <span class="dca-p-freq">{{ freqLabel(plan) }}</span>
                <span class="dca-p-next">下次 {{ nextDate(plan).slice(5) }}</span>
                <span class="dca-p-inv">累计{{ fmtMoney(plan.totalInvested) }}</span>
                <span v-if="plan.lastSkipReason === 'insufficient_cash'" class="dca-warn" title="余额不足跳过">⚠</span>
                <span v-else-if="plan.lastSkipReason === 'no_value'" class="dca-warn" title="无估值跳过">⚠</span>
                <label class="dca-switch">
                  <input
                    type="checkbox"
                    :checked="plan.active"
                    @change="toggle(plan.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ plan.active ? '启' : '停' }}</span>
                </label>
                <button class="dca-del" @click="remove(plan.id)" title="删除">✕</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import { useHoldingStore } from '@/stores/holding'
import { useFundValuation } from '@/composables/useFundValuation'
import { getCalendarDateStr } from '@/utils/navDate'
import { getPanoramaAccountCash } from '@/utils/storage'
import {
  getDCAPlans,
  addDCAPlan,
  updateDCAPlan,
  removeDCAPlan,
  computeDCAStats,
  executeDueDCAs,
  nextScheduledDate,
  freqLabel,
  type DCAFrequency,
  type DCAPlan,
  type DCAAccountStat
} from '@/utils/dca'

// [WHAT] 三个定投账户图标：复用全景/持仓/TradeCenter 同款资产（ali/TX/JD 三张 jpg）
// @ts-ignore
import aliIcon from '@/assets/ali.jpg'
// @ts-ignore
import txIcon from '@/assets/TX.jpg'
// @ts-ignore
import jdIcon from '@/assets/JD.jpg'
const accountIconMap: Record<string, string> = { ali: aliIcon, TX: txIcon, JD: jdIcon }
function accountIcon(key: string): string {
  return accountIconMap[key] || ''
}

// [WHAT] 三个定投账户（与现金余额口径一致：ali/TX/JD）
const ACCOUNTS = [
  { key: 'ali', label: '支付宝', fallback: '支' },
  { key: 'TX', label: '腾讯', fallback: '腾' },
  { key: 'JD', label: '京东', fallback: '京' }
]

const holdingStore = useHoldingStore()
const { loadFundData } = useFundValuation()
const todayCal = getCalendarDateStr()
const lastUpdated = ref('')

/** [WHY] 定投计划存 localStorage（非响应式），增删改后靠这个 key 强制相关 computed 重算 */
const dcaRefreshKey = ref(0)

const allPlans = computed(() => {
  void dcaRefreshKey.value
  return getDCAPlans()
})
const allStats = computed(() => {
  void dcaRefreshKey.value
  return computeDCAStats(getDCAPlans(), getPanoramaAccountCash())
})
const EMPTY_STAT: DCAAccountStat = {
  source: '', cash: 0, dailyRate: 0, planCount: 0, totalInvested: 0, executedCount: 0, daysRemaining: 0
}
function plansOf(key: string): DCAPlan[] {
  return allPlans.value.filter(p => p.source === key)
}
function statOf(key: string): DCAAccountStat {
  return allStats.value.find(s => s.source === key) || EMPTY_STAT
}

/** 新建计划：基金下拉按所选账户过滤 */
const fundsBySource = computed(() => {
  const m: Record<string, { code: string; name: string }[]> = {}
  for (const h of holdingStore.holdings) {
    ;(m[h.source] ||= []).push({ code: h.code, name: h.name })
  }
  return m
})
const form = ref({
  source: 'ali' as string,
  code: '' as string,
  amount: '' as string,
  frequency: 'daily' as DCAFrequency,
  weekday: 1,
  monthday: 1,
  startDate: todayCal,
  active: true
})
const formFunds = computed(() => fundsBySource.value[form.value.source] || [])

function nextDate(plan: DCAPlan): string {
  return nextScheduledDate(plan, todayCal) || '—'
}
function resetForm() {
  form.value.code = ''
  form.value.amount = ''
  form.value.frequency = 'daily'
  form.value.weekday = 1
  form.value.monthday = 1
  form.value.startDate = todayCal
  form.value.active = true
}

function submit() {
  const amount = parseFloat(form.value.amount)
  if (!form.value.source) return showToast('请选择账户')
  if (!form.value.code) return showToast('请选择定投基金')
  if (!amount || amount <= 0) return showToast('请输入有效的每期金额')
  if (form.value.startDate > todayCal) return showToast('开始日期不能晚于今天')
  const fund = formFunds.value.find(f => f.code === form.value.code)
  if (!fund) return showToast('该基金不在本账户持仓中')
  // [WHAT] 同一基金同一频率只允许一条启用计划，避免重复扣款（若已存在则更新而非新增）
  const exist = allPlans.value.find(p => p.code === form.value.code && p.frequency === form.value.frequency)
  if (exist) {
    updateDCAPlan(exist.id, {
      amount,
      weekday: form.value.frequency === 'weekly' ? form.value.weekday : undefined,
      monthday: form.value.frequency === 'monthly' ? form.value.monthday : undefined,
      startDate: form.value.startDate,
      active: form.value.active
    })
    showToast('定投计划已更新')
  } else {
    addDCAPlan({
      code: fund.code,
      name: fund.name,
      source: form.value.source,
      amount,
      frequency: form.value.frequency,
      weekday: form.value.frequency === 'weekly' ? form.value.weekday : undefined,
      monthday: form.value.frequency === 'monthly' ? form.value.monthday : undefined,
      startDate: form.value.startDate,
      active: form.value.active
    })
    showToast('定投计划已保存')
  }
  resetForm()
  dcaRefreshKey.value++
}

function toggle(id: string, active: boolean) {
  updateDCAPlan(id, { active })
  dcaRefreshKey.value++
}
function remove(id: string) {
  removeDCAPlan(id)
  showToast('定投计划已删除')
  dcaRefreshKey.value++
}

// [WHAT] 行内编辑每期金额：点击金额 → 输入框 → 保存写回 plan.amount → 后续执行按新金额扣款
// [WHY] 用户希望已添加的计划能直接改金额，而不必删除重建；updateDCAPlan 会持久化，executeDueDCAs 自然用新值
const editingId = ref<string | null>(null)
const editAmount = ref<number>(0)
function startEdit(plan: DCAPlan) {
  editingId.value = plan.id
  editAmount.value = plan.amount
}
function saveEdit() {
  const amt = parseFloat(String(editAmount.value))
  if (isNaN(amt) || amt <= 0) {
    showToast('请输入有效的每期金额')
    return
  }
  if (editingId.value) {
    updateDCAPlan(editingId.value, { amount: amt })
    dcaRefreshKey.value++
    showToast('每期金额已更新')
  }
  editingId.value = null
}
function cancelEdit() {
  editingId.value = null
}

// ============ 刷新 + 执行 ============
// [WHAT] 与全景 refreshAll 同口径：拉取最新估值后执行「今天到期」的定投（买入 auto_invest + 扣现金 + 累加份额）。
// [WHY] 页面常开时，60s 自动刷新即可持续买入；与全景共用 lastExecutedDate 防重，不会重复扣款。
let timer: number | undefined
async function doRefresh() {
  const codes = holdingStore.holdings.map(h => h.code)
  if (codes.length) {
    try {
      await loadFundData(codes, false, undefined)
    } catch {
      /* 估值拉取失败不阻断执行 */
    }
  }
  const res = executeDueDCAs(getCalendarDateStr())
  if (res.executed.length) showToast(`已执行 ${res.executed.length} 笔定投`)
  dcaRefreshKey.value++
  lastUpdated.value = '更新于 ' + new Date().toLocaleTimeString('zh-CN')
}

function openPanorama() {
  window.open(location.origin + '/panorama', '_blank')
}

function fmtMoney(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return '¥0.00'
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(async () => {
  await holdingStore.initHoldings()
  await doRefresh()
  timer = window.setInterval(doRefresh, 60000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.dca-page {
  min-height: 100vh;
  background: #0b1120;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
/* 顶部栏 */
.dca-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.dca-top-left { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.dca-top-left h1 { font-size: 18px; font-weight: 700; margin: 0; color: #f1f5f9; }
.dca-sub { font-size: 12px; color: #64748b; }
.dca-top-right { display: flex; align-items: center; gap: 10px; }
.dca-updated { font-size: 11px; color: #64748b; }
.dca-btn {
  font-size: 13px;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.dca-btn.ghost {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}
.dca-btn.ghost:hover { background: rgba(255, 255, 255, 0.12); }
.dca-btn.primary {
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}
.dca-btn.primary:hover { filter: brightness(1.08); }

/* 主体：左表单 + 右账户 */
.dca-body {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  padding: 18px 22px 40px;
}
.dca-newpanel {
  position: sticky;
  top: 70px;
  flex: 0 0 300px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 16px;
}
.dca-new-title { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; }
.dca-field { margin-bottom: 11px; }
.dca-field > label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.dca-field.row { display: flex; align-items: center; gap: 8px; }
.dca-field.row > label { margin-bottom: 0; }
.dca-field select,
.dca-field input[type='number'],
.dca-field input[type='date'] {
  width: 100%;
  box-sizing: border-box;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 7px 9px;
}
.dca-field select:focus,
.dca-field input:focus { border-color: #6366f1; outline: none; }
.dca-freq { display: flex; gap: 8px; }
.dca-freq label {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 0;
  cursor: pointer;
}
.dca-freq label.active { color: #fff; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-color: transparent; }
.dca-freq input { display: none; }
.dca-save { width: 100%; margin-top: 4px; }
.dca-note { font-size: 11px; color: #64748b; line-height: 1.5; margin: 10px 0 0; }

/* 右：账户区块 */
.dca-accounts {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dca-acc {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow: hidden;
}
.dca-acc-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  flex-wrap: wrap;
}
.dca-acc-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  object-fit: cover;
}
.dca-acc-name { font-size: 15px; font-weight: 700; color: #f1f5f9; }
.dca-acc-count { font-size: 11px; color: #64748b; }
.dca-acc-stats {
  margin-left: auto;
  display: flex;
  gap: 16px;
}
.dca-acc-stats > div { display: flex; flex-direction: column; align-items: flex-end; }
.dca-acc-stats span { font-size: 10px; color: #64748b; }
.dca-acc-stats b { font-size: 13px; color: #e2e8f0; font-variant-numeric: tabular-nums; }

/* 每个账户内的计划：一行两个（参考全景持仓分块布局），单卡进一步精简为一行 */
.dca-acc-body {
  padding: 10px 16px 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dca-acc-empty { grid-column: 1 / -1; font-size: 12px; color: #64748b; padding: 6px 0; }

/* 计划卡片：单行紧凑 */
.dca-plan {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 6px 10px;
  overflow: hidden;
}
.dca-plan-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  white-space: nowrap;
}
.dca-p-name {
  font-weight: 600;
  color: #f1f5f9;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dca-p-code { font-style: normal; font-size: 10px; color: #64748b; margin-left: 4px; }
.dca-p-amt { color: #a5b4fc; cursor: pointer; }
.dca-p-amt:hover { text-decoration: underline; }
.dca-p-edit { display: inline-flex; align-items: center; gap: 4px; }
.dca-edit-input {
  width: 70px;
  box-sizing: border-box;
  background: #0f172a;
  border: 1px solid #6366f1;
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 12px;
  padding: 2px 4px;
}
.dca-edit-input:focus { outline: none; border-color: #8b5cf6; }
.dca-edit-save,
.dca-edit-cancel {
  font-size: 11px;
  border-radius: 4px;
  padding: 2px 7px;
  cursor: pointer;
  border: 1px solid transparent;
}
.dca-edit-save {
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}
.dca-edit-cancel {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}
.dca-p-freq, .dca-p-next, .dca-p-inv { color: #94a3b8; }
.dca-p-inv { font-size: 11px; }
.dca-switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
}
.dca-del {
  font-size: 12px;
  color: #ff6b6b;
  background: transparent;
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 4px;
  padding: 1px 7px;
  cursor: pointer;
}
.dca-del:hover { background: rgba(255, 107, 107, 0.12); }
.dca-warn { color: #f59e0b; }

/* 窄屏：单列堆叠 */
@media (max-width: 860px) {
  .dca-body { flex-direction: column; }
  .dca-newpanel { position: static; flex: none; width: 100%; box-sizing: border-box; }
  .dca-acc-stats { margin-left: 0; width: 100%; justify-content: flex-start; gap: 18px; }
  .dca-acc-stats > div { align-items: flex-start; }
}
</style>
