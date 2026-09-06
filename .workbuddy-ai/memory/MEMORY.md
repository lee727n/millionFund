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

## 构建环境坑

`npm run build` 会失败：`Cannot find module '@rollup/rollup-darwin-arm64'`。机器是 arm64，node_modules 只装了 x64 版 rollup 原生包。**与代码无关**。验证代码改动请用 `npx vue-tsc -b`（含 Vue 模板检查，退出码 0 即通过）。
