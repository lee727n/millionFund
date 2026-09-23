#!/usr/bin/env node
// [WHAT] 修复「华夏上证科创」买点：删除除最新(今天)外的前几笔 5W 买入交易记录及其 K线买点，
//        并把持仓份额对齐到「仅这一笔 5W 买入」，使市值保持 ~5W 不变。
// [WHY] 该基金存在多笔孤儿/重复买入记录（来自之前的删持仓重加），App 内「删除交易」会回滚持仓份额
//       （holding.shares -= 该笔份额），对在 5W 持仓上删 2 笔 5W 会直接把份额打成负数、市值损坏。
//       所以不能用 App 内删除，必须离线精确修备份 JSON：删交易记录 + 重算份额到单笔 5W。
// [HOW] node scripts/repair-huaxia-buys.mjs <backup.json> [--name 华夏上证科创] [--code XXXX] [--apply]
//       默认 dry-run 只打印将要做的改动；加 --apply 才真正写出 <backup>.repaired.json。
// [SAFE] 只动该基金的 buy 类交易 + 对齐持仓 shares/buyNetValue/buyDate；其余持仓/交易/做T/星标全部不动。

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const getOpt = (k, def) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const APPLY = args.includes('--apply')
const NAME = getOpt('--name', '华夏上证科创')
const CODE = getOpt('--code', '')

if (!file) {
  console.error('用法: node scripts/repair-huaxia-buys.mjs <backup.json> [--name 华夏上证科创] [--code XXXX] [--apply]')
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
if (!raw.holdings || !Array.isArray(raw.holdings)) {
  console.error('备份文件格式不对（缺少 holdings 数组）')
  process.exit(1)
}
const trades = Array.isArray(raw.trades) ? raw.trades : []

// ---- 定位基金 ----
const matched = raw.holdings.filter(h =>
  CODE ? h.code === CODE : (h.name || '').includes(NAME)
)
if (matched.length === 0) {
  console.error(`未找到匹配「${NAME}」的持仓。可用名称示例：`, raw.holdings.slice(0, 20).map(h => `${h.code} ${h.name}`))
  process.exit(1)
}
if (matched.length > 1) {
  console.error(`匹配到多个基金，请用 --code 指定唯一代码：`)
  matched.forEach(h => console.error(`  ${h.code}  ${h.name}`))
  process.exit(1)
}
const fund = matched[0]
console.log(`命中基金: ${fund.code}  ${fund.name}`)
console.log(`  持仓现状: shares=${fund.shares} buyNetValue=${fund.buyNetValue} buyDate=${fund.buyDate} marketValue=${fund.marketValue ?? '(运行时重算)'}`)

// ---- 该基金的交易 ----
const fundTrades = trades.filter(t => t.code === fund.code)
const buys = fundTrades.filter(t => t.type === 'buy')
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
console.log(`\n该基金交易记录 ${fundTrades.length} 条，其中 buy ${buys.length} 条：`)

// 找「最新的 buy」（按 date 升序，最后一条 = 今天这笔 5W）
const kept = buys[buys.length - 1]
const removed = buys.slice(0, -1)
buys.forEach((t, i) => {
  const tag = t === kept ? '  <== 保留(今天)' : '  <== 删除'
  console.log(`  [${i}] date=${t.date} amount=${t.amount} netValue=${t.netValue} shares=${t.shares} estimated=${!!t.estimated}${t === kept ? '  <== 保留(今天)' : '  <== 删除'}`)
})

if (!kept) {
  console.error('没有可保留的 buy 交易，退出（不改动）')
  process.exit(1)
}
if (removed.length === 0) {
  console.log('\n没有需要删除的早期 buy（只存在一笔），无需修复。')
  process.exit(0)
}

// ---- 计算修复后持仓份额：对齐到「仅这一笔 5W 买入」 ----
const nv = kept.netValue > 0 ? kept.netValue : 0
const newShares = nv > 0 ? kept.amount / nv : null
console.log(`\n保留的买点: date=${kept.date} amount=${kept.amount} netValue=${kept.netValue}`)
if (newShares != null) {
  console.log(`修复后持仓份额 = amount / netValue = ${newShares.toFixed(4)}（对齐到单笔买入，市值保持 ~${kept.amount} 元）`)
} else {
  console.log('⚠️ 保留买点的 netValue 无效，跳过持仓份额重算（持仓 shares 保持不变）')
}

if (!APPLY) {
  console.log('\n[dry-run] 未加 --apply，不写文件。确认无误后加 --apply 执行。')
  process.exit(0)
}

// ---- 执行 ----
const removedIds = new Set(removed.map(t => t.id))
raw.trades = trades.filter(t => !(t.code === fund.code && removedIds.has(t.id)))

// 对齐持仓
const idx = raw.holdings.findIndex(h => h.code === fund.code)
if (newShares != null) {
  raw.holdings[idx] = {
    ...raw.holdings[idx],
    shares: newShares,
    buyNetValue: kept.netValue,
    buyDate: kept.date,
  }
}

const out = file.replace(/(\.json)?$/i, '.repaired.json')
fs.writeFileSync(out, JSON.stringify(raw, null, 2), 'utf-8')
console.log(`\n[已写出] ${out}`)
console.log(`  - 删除 buy 交易 ${removed.length} 条（保留 date=${kept.date} 这一笔）`)
console.log(`  - 持仓份额对齐到单笔买入（shares=${newShares != null ? newShares.toFixed(4) : '未变'}，buyDate=${kept.date}）`)
console.log(`下一步：在 App 里「恢复」导入这个 .repaired.json 即可。`)
