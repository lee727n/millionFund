# 项目长期笔记：AI百万实盘（MillionfundN）

## 本地存储约定（重要）

用户数据全部存在 localStorage，key 集中在 `src/utils/storage.ts` 的 `STORAGE_KEYS`。

**致命陷阱**：`checkVersionAndClearCache()` 在 APP 版本变更时会删除所有命中 `CACHE_PREFIXES`（`fund_` / `api_` / `market_` / `estimate_`）却**不在 `preservedKeys` 白名单**里的 key。

> 任何以这些前缀开头的「用户数据」key 都必须登记进 `preservedKeys`，否则每次版本更新都会被静默删除。
> 已发生事故：`fund_t_trades`（做T记录）因漏登记被清空，2026-09-05 修复。

当前白名单：watchlist / holdings / trades / **t_trades** / net_values / source_filter / app_version / starred_funds。

## 数据结构

- 普通交易 `fund_trades`；做T记录 `fund_t_trades`（由一买一卖配对归档而成，归档时原始两条交易会从 `fund_trades` 移除）
- 做T记录通过 Detail.vue 的「标记T」按钮生成，可在 TradeCenter / Detail 点「恢复」还原成普通交易

## 备份与恢复

- 完整导出（Holding.vue）：含 `holdings` / `trades` / `tTrades` / `aiTracking`，文件名 `fund-holdings-backup-YYYY-MM-DD.json`
- GitHub Gist 云端同步：同样在 `backupData` 中包含 `trades` / `tTrades` / `fundNetValues`，云端恢复会调用 `saveTTrades(jsonData.tTrades)`；**前提是做T记录被删除前已经成功执行过云端备份**
- `gist.ts` 本身只是上传/下载 JSON 内容，是否含字段由 Holding.vue 组装的 `backupData` 决定


## 估值架构

`useFundValuation` composable 是估值层（拉取 / 缓存 `liveFundData` / 算 `calcPostReturn`），`holdingStore.updateHoldingWithAccurateData` 是收益层（重算市值盈亏 + 落盘）。两者通过 `loadFundData` 里的回写调用衔接。全景页、交易中心等需要估值的页面都应复用该 composable，不要内联重复实现。

## 估值字段语义（易踩坑）

`fetchFundAccurateData`（`src/api/fundFast.ts`）返回两个容易被混用的字段：

- `dataSource: 'nav' | 'estimate' | 'fallback' | 'local_cache'` —— 表示 **currentValue 用的是哪类数据**，用于 UI 文案（「净值/估值涨幅」、全景页「净/估」角标）和交易弹窗基准类型。
- `navIsCurrent: boolean` —— 表示 **navDate 是不是当前该拿到的那一期**（今天，或 QDII 的前一工作日），即内部 `isNavUpdated`。

> 盘前 / 非交易日回退到上一期净值时，`dataSource` 也是 `'nav'`（因为用的确实是净值），但那期净值**不属于今天**。
> 所以「今天的交易能不能用这个净值确认」只能看 `navIsCurrent`，**绝不能用 `dataSource !== 'nav'` 代替**。
> 2026-09-05 修复：Detail.vue / TradeCenter.vue 的「恢复今天交易为 estimated」guard 已改用 `!data.navIsCurrent`。

相关：`updateTradesByCode(code, nav, navDate)` 会无条件把 `estimated` 的交易确认掉（`estimated=false`），是那个 guard 在兜底，动它要格外小心。

### 与 isUpdated 的关系（2026-09-06 梳理）

`isUpdated`（holding 上的持久化字段，进度条读它）和 `navIsCurrent`（API 返回值的瞬时字段）是**同一公式的两份独立拷贝**，互不通信：

- `holding.ts:267-272` 在 `updateHoldingWithAccurateData` 里重算 `isUpdated` 并落盘 → 服务进度条 / 已更新标签（Home.vue:1150、PanoramaDashboard.vue:60、Holding.vue:1306、FundGridItem.vue:126）
- `fundFast.ts` 内部 `isNavUpdated` → `navIsCurrent` → 只服务 Detail/TradeCenter 的 estimated 恢复 guard

链路：`initHoldings()` → `refreshEstimates()` → 只把 `!isUpdated` 的持仓拿去调 `fetchFundAccurateData`；已更新的用合成 data 回灌（函数内部再用 `valueDate` 重算，所以跨天能自校正）。

**注意**：不能把 `updateHoldingWithAccurateData` 改成直接信任 `data.navIsCurrent` —— 快路径传的是自己合成的 data（恒 true），会变成自己证明自己。`getTradingDateStr` 也有两份逐字相同的私有实现（fundFast.ts:13 / holding.ts:12）。

### ✅ 两个「今天」必须分开（2026-09-07 已实现）

**「9 点前归属上一交易日」是刻意设计的宽限期，不是 bug** —— 有些基金中午 12 点前都不更新净值，
不这么做整个早上进度条都是空的。别再动它。

正确做法是**共用 `isNavUpToDate`，但传不同的 `today`**（该函数本来就支持 `today` 参数）：

**最终定稿（2026-09-07）：默认自然日，进度条显式 opt-in。**

`utils/navDate.ts` 两个函数：
- `getCalendarDateStr()` —— 自然日「今天几号」。`isNavUpToDate` 的 `today` **默认值**就是它。
- `getProgressDateStr()`（原 `getTradingDateStr`，已改名）—— **仅进度条专用**：
  9 点前归属上一工作日（跳过周末/节假日）。宽限期是刻意设计的：净值往往半夜/次日上午才更新完，
  不这么做整个早上进度条都是空的。

| 谁在问 | 用什么 today |
|---|---|
| `holding.ts` 的 `isUpdated`（进度条） | 显式传 `getProgressDateStr()` ← 全项目唯一一处 |
| `fundFast.ts` 的 `navIsCurrent` / `isNavUpdated` / `isHolidaySync` / 净值历史缓存 | 自然日（默认） |
| 今后新写的估值 / 交易 / 缓存函数 | 自然日（即不传 `today`） |

**误用 `getProgressDateStr()` 的后果**：09:00 前「上一交易日净值」被当成今天的 →
Detail/TradeCenter 的交易守卫失效 → `updateTradesByCode` 对 estimated 交易无条件确认 →
今天的单被 T-1 净值确认，份额算错。

配套改动：`fundFast.ts` 净值历史缓存判定窗口由 `hour >= 9 && hour < 18` 放宽为 `hour < 18`
（改成自然日后 `latestDate === today` 在早间永不成立，不放宽会导致 0~9 点白白穿透缓存重新请求）。
`vue-tsc -b` 退出码 0；核对脚本 `/tmp/verify-navdate-final.mjs`。

## 构建环境坑

`npm run build` 会失败：`Cannot find module '@rollup/rollup-darwin-arm64'`。机器是 arm64，node_modules 只装了 x64 版 rollup 原生包。**与代码无关**。验证代码改动请用 `npx vue-tsc -b`（含 Vue 模板检查，退出码 0 即通过）。
