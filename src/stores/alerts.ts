import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AlertRule {
  id: string
  fundCode: string
  fundName: string
  type: 'threshold' | 'change' | 'scheduled'
  // 阈值提醒（净值跌破/突破）
  threshold?: number
  direction?: 'above' | 'below'
  // 涨跌幅提醒
  changePercent?: number
  // 定时提醒
  scheduleTime?: string // HH:mm 格式
  enabled: boolean
  createdAt: number
  lastTriggered?: number
}

export const useAlertsStore = defineStore('alerts', () => {
  const rules = ref<AlertRule[]>(loadRules())
  const enabledRules = computed(() => rules.value.filter(r => r.enabled))

  function loadRules(): AlertRule[] {
    try {
      const raw = localStorage.getItem('alert_rules')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  function saveRules() {
    try {
      localStorage.setItem('alert_rules', JSON.stringify(rules.value))
    } catch (e) {
      // [FIX] 存储满或被禁用时静默失败，避免未捕获异常导致页面白屏
      console.warn('[alerts] 保存规则失败', e)
    }
  }

  function addRule(rule: Omit<AlertRule, 'id' | 'createdAt'>) {
    const newRule: AlertRule = {
      ...rule,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    rules.value.push(newRule)
    saveRules()
    return newRule
  }

  function removeRule(id: string) {
    rules.value = rules.value.filter(r => r.id !== id)
    saveRules()
  }

  function toggleRule(id: string) {
    const rule = rules.value.find(r => r.id === id)
    if (rule) {
      rule.enabled = !rule.enabled
      saveRules()
    }
  }

  function updateRule(id: string, updates: Partial<AlertRule>) {
    const rule = rules.value.find(r => r.id === id)
    if (rule) {
      Object.assign(rule, updates)
      saveRules()
    }
  }

  function markTriggered(id: string) {
    const rule = rules.value.find(r => r.id === id)
    if (rule) {
      rule.lastTriggered = Date.now()
      saveRules()
    }
  }

  return {
    rules,
    enabledRules,
    addRule,
    removeRule,
    toggleRule,
    updateRule,
    markTriggered,
  }
})
