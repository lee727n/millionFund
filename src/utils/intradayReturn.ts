// [WHAT] 每个账户「当日收益曲线」的分钟级采样存储 + 采样器
// [WHY] 用户想在「持仓进度条」和「市值」之间看到一条小收益曲线，展示当天账户收益率随时间的波动。
//       做法：每次刷新估值（holdingStore.refreshEstimates）完成后，按账户聚合出当前
//       profitPercent（= 今日盈亏 / 昨日市值，与首页/全景口径一致），记录一条 (分钟, 收益率%) 采样点。
//       曲线组件读取当天的采样序列绘制 sparkline。
// [CRITICAL-命名] 存储 key 绝不能带 fund_/api_/market_/estimate_ 前缀，否则版本更新缓存清理会误删。
//           用中性名字，并登记进 storage.ts 的 preservedKeys 双保险。

import { ref } from 'vue'

/** 单个采样点：t = 距零点分钟数（如 9:30 = 570），v = 账户当日收益率(%) */
export interface ReturnSample {
  t: number
  v: number
}

const STORAGE_KEY = 'intraday_return_series'

/** 每个账户每天最多保留的采样点数（约 5 小时 @60s 一轮，足够覆盖 9:30-15:00） */
const MAX_POINTS = 320
/** 最多保留最近几天的数据 */
const KEEP_DAYS = 5

/** 交易时段：工作日 9:30(570) - 15:00(900)，含端点 */
const WINDOW_START = 570
const WINDOW_END = 900

/** [WHAT] 跨组件共享的版本计数器：每次采样后 +1，曲线组件 watch 它来重绘 */
export const intradayTick = ref(0)

function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function loadAll(): Record<string, Record<string, ReturnSample[]>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Record<string, ReturnSample[]>>) : {}
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, Record<string, ReturnSample[]>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // 容量异常静默忽略，不影响主流程
  }
}

function isTradingMinute(mins: number, day: number): boolean {
  const weekday = day >= 1 && day <= 5 // 1=周一 ... 5=周五
  return weekday && mins >= WINDOW_START && mins <= WINDOW_END
}

/**
 * [WHAT] 记录一组账户的当前收益率采样
 * [WHY] 由 holdingStore.refreshEstimates 在估值刷新完成后统一调用，确保
 *       首页/全景/持仓页所有入口都只在此处落盘，不重复。
 * [NOTE] 仅在交易时段内采样；非交易时段（含午休、收盘后、周末）直接跳过，
 *       避免把「收盘后不变的净值」或「昨收基线」画进当天曲线。
 */
export function recordIntradaySamples(samples: { key: string; profitPercent: number }[]): void {
  if (!samples.length) return
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  if (!isTradingMinute(mins, now.getDay())) return

  const all = loadAll()
  const dateKey = todayKey(now)
  const dayMap = (all[dateKey] ||= {})

  for (const s of samples) {
    const arr = (dayMap[s.key] ||= [])
    if (arr.length && arr[arr.length - 1].t === mins) {
      arr[arr.length - 1].v = s.profitPercent // 同一分钟重复刷新：覆盖不追加
    } else {
      arr.push({ t: mins, v: s.profitPercent })
    }
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
  }

  // 剪枝：只保留最近 KEEP_DAYS 天
  const keys = Object.keys(all).sort()
  while (keys.length > KEEP_DAYS) delete all[keys.shift() as string]

  saveAll(all)
  intradayTick.value++
}

/** 读取某天某账户的采样序列（无则返回空数组） */
export function getIntradaySeries(dateKey: string, accountKey: string): ReturnSample[] {
  const all = loadAll()
  return all[dateKey]?.[accountKey] || []
}

export { todayKey }
