<script setup lang="ts">
// [WHY] 桌面端 DCAPage 是「左表单 + 右账户」的横屏布局，套到手机竖屏上格式全乱。
// [WHAT] 本页是手机端专属竖屏重设计：顶部安全区 + 今日状态条、账户汇总卡、按账户分组的竖向计划卡、
//        悬浮「新建」按钮、点开底部弹层填写/编辑计划。业务逻辑全部复用 dca.ts，不复制。
// [HOW] 主题沿用 app 全局 CSS 变量（var(--bg-primary) 等），与 MobileStarKLine 同套，自动适配深浅色。

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import { useRouter } from 'vue-router'
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
  executeDueDCAsCloud,
  pushPlansToCloud,
  isScheduledDay,
  getDcaTodaySync, isDcaCloudDoneToday,
  nextScheduledDate,
  freqLabel,
  type DCAFrequency,
  type DCAPlan,
  type DCAAccountStat
} from '@/utils/dca'

// [WHAT] 三个定投账户图标：复用持仓/TradeCenter 同款资产（ali/TX/JD 三张 jpg）
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

const router = useRouter()
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

// ============ 今日定投状态条 ============
const dcaTodayStat = computed(() => {
  void dcaRefreshKey.value
  const plans = allPlans.value
  const executed = plans.filter(p => p.lastExecutedDate === todayCal).length
  const pending = plans.filter(
    p => p.active && p.startDate <= todayCal && isScheduledDay(p, todayCal) && p.lastExecutedDate !== todayCal
  ).length
  const sync = getDcaTodaySync(todayCal)
  return { executed, pending, recovered: sync.recovered, cloud: sync.cloud, synced: isDcaCloudDoneToday(todayCal) }
})

// ============ 新建 / 编辑 底部弹层 ============
const showSheet = ref(false)
const editingId = ref<string | null>(null)
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

/** 新建计划：基金下拉按所选账户过滤 */
const fundsBySource = computed(() => {
  const m: Record<string, { code: string; name: string }[]> = {}
  for (const h of holdingStore.holdings) {
    ;(m[h.source] ||= []).push({ code: h.code, name: h.name })
  }
  return m
})
const formFunds = computed(() => fundsBySource.value[form.value.source] || [])

function openAdd() {
  editingId.value = null
  form.value = {
    source: 'ali',
    code: '',
    amount: '',
    frequency: 'daily',
    weekday: 1,
    monthday: 1,
    startDate: todayCal,
    active: true
  }
  showSheet.value = true
}
function openEdit(plan: DCAPlan) {
  editingId.value = plan.id
  form.value = {
    source: plan.source,
    code: plan.code,
    amount: String(plan.amount),
    frequency: plan.frequency,
    weekday: plan.weekday ?? 1,
    monthday: plan.monthday ?? 1,
    startDate: plan.startDate,
    active: plan.active
  }
  showSheet.value = true
}
function closeSheet() {
  showSheet.value = false
  editingId.value = null
}

function saveSheet() {
  const amount = parseFloat(form.value.amount)
  if (!form.value.source) return showToast('请选择账户')
  if (!form.value.code) return showToast('请选择定投基金')
  if (!amount || amount <= 0) return showToast('请输入有效的每期金额')
  if (form.value.startDate > todayCal) return showToast('开始日期不能晚于今天')
  const fund = formFunds.value.find(f => f.code === form.value.code)
  if (!fund) return showToast('该基金不在本账户持仓中')

  if (editingId.value) {
    // [WHAT] 编辑模式：直接改这条计划（金额/频率/日期/启停都可改）
    updateDCAPlan(editingId.value, {
      amount,
      frequency: form.value.frequency,
      weekday: form.value.frequency === 'weekly' ? form.value.weekday : undefined,
      monthday: form.value.frequency === 'monthly' ? form.value.monthday : undefined,
      startDate: form.value.startDate,
      active: form.value.active
    })
    showToast('定投计划已更新')
  } else {
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
  }
  dcaRefreshKey.value++
  pushPlansToCloud().catch(() => {})
  closeSheet()
}

function toggle(id: string, active: boolean) {
  updateDCAPlan(id, { active })
  dcaRefreshKey.value++
  pushPlansToCloud().catch(() => {})
}
function remove(id: string) {
  removeDCAPlan(id)
  showToast('定投计划已删除')
  dcaRefreshKey.value++
  pushPlansToCloud().catch(() => {})
}

function nextDate(plan: DCAPlan): string {
  return nextScheduledDate(plan, todayCal) || '—'
}
function fmtMoney(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return '¥0.00'
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function daysText(n: number): string {
  return isFinite(n) ? n + ' 天' : '∞'
}

// ============ 刷新 + 执行 ============
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
  const res = await executeDueDCAsCloud(getCalendarDateStr())
  if (res.executed.length) {
    const tag = res.cloudCoordinated ? '（云端）' : '（本地·未配置Token）'
    showToast(`已执行 ${res.executed.length} 笔定投${tag}`)
  } else if (res.recovered > 0) {
    showToast(`已从云端恢复 ${res.recovered} 笔定投`)
  } else if (res.deferred > 0) {
    showToast('云端正在执行，本机暂不扣款')
  }
  dcaRefreshKey.value++
  lastUpdated.value = '更新于 ' + new Date().toLocaleTimeString('zh-CN')
}

function goBack() {
  router.back()
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

<template>
  <div class="mdca-page">
    <!-- 顶部：返回 + 标题 + 刷新 -->
    <header class="mdca-header">
      <div class="mdca-top">
        <button class="mdca-back" @click="goBack" aria-label="返回">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span class="mdca-title">📅 定投管理</span>
        <button class="mdca-refresh" @click="doRefresh" aria-label="刷新">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>
      <!-- 今日定投状态条 -->
      <div
        class="mdca-today"
        :class="[dcaTodayStat.pending > 0 ? 'is-pending' : 'is-ok']"
        :title="`今日定投：已执行 ${dcaTodayStat.executed} 笔，其中从云端恢复 ${dcaTodayStat.recovered} 笔；未触发 ${dcaTodayStat.pending} 笔（${dcaTodayStat.cloud ? '云端协调已开启' : '本地模式，未配置云端 Token'}）`"
      >
        <span class="mt-item">已执行 <b>{{ dcaTodayStat.executed }}</b></span>
        <span class="mt-sep">·</span>
        <span class="mt-item" :class="{ 'is-dim': dcaTodayStat.recovered === 0 }">已恢复 <b>{{ dcaTodayStat.recovered }}</b></span>
        <span class="mt-sep">·</span>
        <span class="mt-item" :class="{ 'is-warn': dcaTodayStat.pending > 0 }">未触发 <b>{{ dcaTodayStat.pending }}</b></span>
        <span class="mt-cloud" :class="dcaTodayStat.cloud ? 'on' : 'off'">{{ dcaTodayStat.cloud ? '云端' : '本地' }}</span>
        <span
          v-if="dcaTodayStat.synced"
          style="margin-left:6px;font-size:11px;color:#52c41a;opacity:.9;white-space:nowrap"
          title="今日已同步：云端协调已处理完成，自动刷新不再请求云端 gist"
        >✓ 今日已同步</span>
      </div>
    </header>

    <div class="mdca-scroll">
      <!-- 账户汇总卡（竖向堆叠） -->
      <section class="mdca-accounts">
        <div v-for="a in ACCOUNTS" :key="a.key" class="mdca-acc">
          <div class="mdca-acc-head">
            <img v-if="accountIcon(a.key)" class="mdca-acc-icon" :src="accountIcon(a.key)" :alt="a.label" />
            <span v-else class="mdca-acc-fallback">{{ a.fallback }}</span>
            <span class="mdca-acc-name">{{ a.label }}</span>
            <span class="mdca-acc-count">{{ plansOf(a.key).length }} 个计划</span>
          </div>
          <div class="mdca-acc-stats">
            <div><span>现金</span><b>{{ fmtMoney(statOf(a.key).cash) }}</b></div>
            <div><span>日均</span><b>{{ fmtMoney(statOf(a.key).dailyRate) }}</b></div>
            <div><span>可定投</span><b>{{ daysText(statOf(a.key).daysRemaining) }}</b></div>
          </div>
        </div>
      </section>

      <!-- 计划列表：按账户分组 -->
      <section class="mdca-plans">
        <div v-for="a in ACCOUNTS" :key="a.key" class="mdca-group">
          <div class="mdca-group-head">
            <img v-if="accountIcon(a.key)" class="mdca-group-icon" :src="accountIcon(a.key)" :alt="a.label" />
            <span v-else class="mdca-acc-fallback sm">{{ a.fallback }}</span>
            <span class="mdca-group-name">{{ a.label }}</span>
            <span class="mdca-group-count">{{ plansOf(a.key).length }}</span>
          </div>

          <div v-if="plansOf(a.key).length === 0" class="mdca-empty">该账户暂无定投计划</div>

          <div
            v-for="plan in plansOf(a.key)"
            :key="plan.id"
            class="mdca-plan"
            :title="plan.name + ' · 累计投入 ' + fmtMoney(plan.totalInvested) + ' · 已执行 ' + plan.executedCount + ' 次'"
          >
            <div class="mp-top">
              <div class="mp-name">
                <span class="mp-title">{{ plan.name }}</span>
                <span class="mp-code">{{ plan.code }}</span>
              </div>
              <div class="mp-actions">
                <button
                  class="mp-toggle"
                  :class="{ on: plan.active, off: !plan.active }"
                  @click="toggle(plan.id, !plan.active)"
                >{{ plan.active ? '启用' : '停用' }}</button>
                <button class="mp-del" @click="remove(plan.id)" aria-label="删除">✕</button>
              </div>
            </div>

            <div class="mp-mid">
              <button class="mp-amt" @click="openEdit(plan)">
                {{ fmtMoney(plan.amount) }}<small>/期 · 改</small>
              </button>
              <span class="mp-freq">{{ freqLabel(plan) }}</span>
              <span class="mp-next">下次 {{ nextDate(plan).slice(5) }}</span>
            </div>

            <div class="mp-bottom">
              <span class="mp-inv">累计 {{ fmtMoney(plan.totalInvested) }}</span>
              <span v-if="plan.lastSkipReason === 'insufficient_cash'" class="mp-warn">⚠ 余额不足跳过</span>
              <span v-else-if="plan.lastSkipReason === 'no_value'" class="mp-warn">⚠ 无估值跳过</span>
            </div>
          </div>
        </div>
      </section>

      <p class="mdca-note">
        定投仅在 App 打开且刷新时执行；过去的交易日不补买。<br />
        无后端，关闭页面即停止采集与买入。
      </p>
    </div>

    <!-- 悬浮新建按钮 -->
    <button class="mdca-fab" @click="openAdd">＋ 新建定投</button>

    <!-- 底部弹层：新建 / 编辑 -->
    <transition name="sheet">
      <div v-if="showSheet" class="mdca-mask" @click.self="closeSheet">
        <div class="mdca-sheet">
          <div class="ms-head">
            <span class="ms-title">{{ editingId ? '编辑定投计划' : '新建定投计划' }}</span>
            <button class="ms-close" @click="closeSheet" aria-label="关闭">✕</button>
          </div>

          <div class="ms-field">
            <label>账户</label>
            <select v-model="form.source" :disabled="!!editingId">
              <option v-for="a in ACCOUNTS" :key="a.key" :value="a.key">{{ a.label }}</option>
            </select>
          </div>

          <div class="ms-field">
            <label>定投基金</label>
            <select v-model="form.code" :disabled="!!editingId">
              <option value="">请选择基金</option>
              <option v-for="f in formFunds" :key="f.code" :value="f.code">{{ f.name }}（{{ f.code }}）</option>
            </select>
          </div>

          <div class="ms-field">
            <label>每期金额（元）</label>
            <input v-model="form.amount" type="number" step="0.01" min="0" placeholder="如 1000" />
          </div>

          <div class="ms-field">
            <label>频率</label>
            <div class="ms-freq">
              <button :class="{ active: form.frequency === 'daily' }" @click="form.frequency = 'daily'">每日</button>
              <button :class="{ active: form.frequency === 'weekly' }" @click="form.frequency = 'weekly'">每周</button>
              <button :class="{ active: form.frequency === 'monthly' }" @click="form.frequency = 'monthly'">每月</button>
            </div>
          </div>

          <div v-if="form.frequency === 'weekly'" class="ms-field">
            <label>星期</label>
            <select v-model.number="form.weekday">
              <option :value="1">周一</option>
              <option :value="2">周二</option>
              <option :value="3">周三</option>
              <option :value="4">周四</option>
              <option :value="5">周五</option>
            </select>
          </div>

          <div v-if="form.frequency === 'monthly'" class="ms-field">
            <label>每月几号</label>
            <select v-model.number="form.monthday">
              <option v-for="d in 28" :key="d" :value="d">{{ d }} 号</option>
            </select>
          </div>

          <div class="ms-field">
            <label>开始日期</label>
            <input v-model="form.startDate" type="date" />
          </div>

          <div class="ms-field row">
            <label>启用</label>
            <button class="ms-switch" :class="{ on: form.active }" @click="form.active = !form.active">
              <span class="ms-knob"></span>
            </button>
          </div>

          <div class="ms-actions">
            <button v-if="editingId" class="ms-del" @click="remove(editingId); closeSheet()">删除计划</button>
            <button class="ms-save" @click="saveSheet">{{ editingId ? '保存修改' : '保存计划' }}</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* ============ 页面壳：竖屏，含安全区 ============ */
.mdca-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* 顶部 */
.mdca-header {
  flex: 0 0 auto;
  padding-top: max(env(safe-area-inset-top, 0px), var(--status-bar-height, 0px));
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}
.mdca-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
}
.mdca-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  background: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 8px;
}
.mdca-back:active { background: var(--bg-tertiary); }
.mdca-title {
  flex: 1;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}
.mdca-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
}
.mdca-refresh:active { background: var(--bg-tertiary); color: var(--primary-color); }

/* 今日状态条 */
.mdca-today {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 14px 10px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  white-space: nowrap;
  overflow: hidden;
}
.mt-item b { font-weight: 700; color: var(--text-primary); }
.mt-item.is-dim { opacity: 0.45; }
.mt-item.is-warn b { color: var(--color-up, #f6465d); }
.mt-sep { opacity: 0.3; }
.mt-cloud {
  margin-left: auto;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  flex: 0 0 auto;
}
.mt-cloud.on { color: #0891b2; background: rgba(8, 145, 178, 0.14); }
.mt-cloud.off { color: #f59e0b; background: rgba(245, 158, 11, 0.16); }
.mdca-today.is-pending { border-color: rgba(245, 158, 11, 0.45); }
.mdca-today.is-ok { border-color: rgba(16, 185, 129, 0.35); }

/* 滚动区 */
.mdca-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 14px calc(84px + env(safe-area-inset-bottom, 0px));
}

/* 账户汇总卡 */
.mdca-accounts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.mdca-acc {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
}
.mdca-acc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.mdca-acc-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  object-fit: cover;
}
.mdca-acc-fallback {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}
.mdca-acc-fallback.sm { width: 18px; height: 18px; font-size: 10px; }
.mdca-acc-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.mdca-acc-count { margin-left: auto; font-size: 11px; color: var(--text-secondary); }
.mdca-acc-stats {
  display: flex;
  gap: 0;
}
.mdca-acc-stats > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mdca-acc-stats > div:not(:last-child) {
  border-right: 1px solid var(--border-color);
}
.mdca-acc-stats span { font-size: 11px; color: var(--text-secondary); }
.mdca-acc-stats b {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

/* 计划分组 */
.mdca-group { margin-bottom: 16px; }
.mdca-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 0 2px;
}
.mdca-group-icon {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  object-fit: cover;
}
.mdca-group-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.mdca-group-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: 10px;
  padding: 1px 8px;
}
.mdca-empty {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 14px;
  text-align: center;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
}

/* 计划卡 */
.mdca-plan {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
}
.mp-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.mp-name { min-width: 0; }
.mp-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-code { font-size: 11px; color: var(--text-secondary); }
.mp-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.mp-toggle {
  font-size: 12px;
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  border: 1px solid transparent;
}
.mp-toggle.on { color: #fff; background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.mp-toggle.off { color: var(--text-secondary); background: var(--bg-tertiary); border-color: var(--border-color); }
.mp-del {
  font-size: 12px;
  color: #ff6b6b;
  background: transparent;
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
}
.mp-del:active { background: rgba(255, 107, 107, 0.12); }

.mp-mid {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.mp-amt {
  font-size: 15px;
  font-weight: 700;
  color: var(--primary-color);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.mp-amt small { font-size: 11px; font-weight: 400; color: var(--text-secondary); margin-left: 2px; }
.mp-freq, .mp-next { font-size: 12px; color: var(--text-secondary); }

.mp-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.mp-inv { font-size: 11px; color: var(--text-secondary); }
.mp-warn { font-size: 11px; color: #f59e0b; }

.mdca-note {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
  text-align: center;
  margin: 8px 0 0;
}

/* 悬浮新建按钮 */
.mdca-fab {
  position: fixed;
  right: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 23px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.4);
  cursor: pointer;
  z-index: 20;
}
.mdca-fab:active { filter: brightness(1.08); }

/* 底部弹层 */
.mdca-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 30;
  display: flex;
  align-items: flex-end;
}
.mdca-sheet {
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  background: var(--bg-primary);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.ms-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.ms-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.ms-close {
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 8px;
}
.ms-close:active { background: var(--bg-tertiary); }
.ms-field { margin-bottom: 14px; }
.ms-field > label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.ms-field.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ms-field.row > label { margin-bottom: 0; }
.ms-field select,
.ms-field input[type='number'],
.ms-field input[type='date'] {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  padding: 10px 12px;
}
.ms-field select:focus,
.ms-field input:focus { border-color: var(--primary-color); outline: none; }
.ms-field select:disabled { opacity: 0.55; }
.ms-freq { display: flex; gap: 8px; }
.ms-freq button {
  flex: 1;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 0;
  cursor: pointer;
}
.ms-freq button.active {
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-color: transparent;
}
/* 启用开关 */
.ms-switch {
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 13px;
  border: none;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: background 0.15s;
}
.ms-switch.on { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.ms-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}
.ms-switch.on .ms-knob { left: 23px; }

.ms-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.ms-save {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.ms-save:active { filter: brightness(1.08); }
.ms-del {
  flex: 0 0 auto;
  padding: 0 16px;
  height: 44px;
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-radius: 10px;
  background: transparent;
  color: #ff6b6b;
  font-size: 14px;
  cursor: pointer;
}

/* 弹层滑入动画 */
.sheet-enter-active, .sheet-leave-active { transition: opacity 0.2s; }
.sheet-enter-active .mdca-sheet, .sheet-leave-active .mdca-sheet { transition: transform 0.25s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .mdca-sheet, .sheet-leave-to .mdca-sheet { transform: translateY(100%); }
</style>
