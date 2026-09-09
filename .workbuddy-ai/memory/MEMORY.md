# 项目长期笔记：AI百万实盘（MillionfundN）

## 本地存储约定（重要）

用户数据全在 localStorage，key 集中在 `src/utils/storage.ts` 的 `STORAGE_KEYS`。

**致命陷阱**：`checkVersionAndClearCache()` 在版本变更时删除所有命中 `CACHE_PREFIXES`
（`fund_` / `api_` / `market_` / `estimate_`）却**不在 `preservedKeys`** 白名单里的 key。

> 任何以这些前缀开头的用户数据 key 都必须登记进 `preservedKeys`，否则版本更新时被静默删除。
> 事故：`fund_t_trades`（做T记录）因漏登记被清空，2026-09-05 修复。
> 新增 UI 偏好类 key 优先选**不带那些前缀**的名字（如 `panorama_col_widths`），双保险。

白名单：watchlist / holdings / trades / t_trades / net_values / source_filter / app_version /
starred_funds / panorama_col_widths / panorama_account_order / panorama_account_heights。

## 数据结构

- 普通交易 `fund_trades`；做T记录 `fund_t_trades`（一买一卖配对归档，归档时原两条从 `fund_trades` 移除）
- 做T记录由 Detail.vue「标记T」生成，TradeCenter / Detail 点「恢复」可还原成普通交易

## 估值架构与字段语义

`useFundValuation` composable = 估值层（拉取 / 缓存 `liveFundData` / `calcPostReturn`）；
`holdingStore.updateHoldingWithAccurateData` = 收益层（重算市值盈亏 + 落盘）。
需要估值的页面都复用该 composable，不要内联重复实现。

`fetchFundAccurateData`（`src/api/fundFast.ts`）两个易混字段：
- `dataSource: 'nav'|'estimate'|'fallback'|'local_cache'` —— currentValue 用的是哪类数据（UI 文案 / 交易基准）
- `navIsCurrent: boolean` —— navDate 是不是「当前该拿到的那一期」（内部 `isNavUpdated`）

> 盘前/非交易日回退上一期净值时 `dataSource` 也是 `'nav'`，但那期净值不属于今天。
> 「今天交易能否用此净值确认」**只能看 `navIsCurrent`**，绝不能用 `dataSource !== 'nav'` 代替。
> `updateTradesByCode(code, nav, navDate)` 会无条件确认 estimated 交易，靠该 guard 兜底。

**两个「今天」必须分开（2026-09-07 定稿）**：共用 `isNavUpToDate`，但传不同 `today`。
- `getCalendarDateStr()`：自然日。`isNavUpToDate` 的 `today` **默认值**。
- `getProgressDateStr()`：**仅进度条专用**，9 点前归属上一工作日。宽限期是刻意设计（净值半夜/次日上午才更新完，否则整个早上进度条是空的），别再动。

| 谁在问 | 用什么 today |
|---|---|
| `holding.ts` 的 `isUpdated`（进度条） | 显式传 `getProgressDateStr()` ← 全项目唯一一处 |
| `fundFast.ts` 的 `navIsCurrent` / `isNavUpdated` / `isHolidaySync` / 净值缓存 | 自然日（默认） |
| 今后新写的估值 / 交易 / 缓存函数 | 自然日（不传 `today`） |

误用 `getProgressDateStr()` → 09:00 前守卫失效 → 今天的单被 T-1 净值确认，份额算错。
配套：`fundFast.ts` 净值缓存窗口已从 `hour>=9 && hour<18` 放宽为 `hour<18`。

`isUpdated`（holding 持久化字段，进度条读）与 `navIsCurrent`（API 瞬时字段）是同一公式的两份独立拷贝，
互不通信。**不能**把 `updateHoldingWithAccurateData` 改成信任 `data.navIsCurrent`（快路径传的是自己合成的 data，恒 true）。

**两个刷新短路（排查「刷新没反应」时先看这俩）**：
1. `useFundValuation.loadFundData` 快路径：`holding.isUpdated && currentValue > 0` → 直接回灌 holding，**连 `forceRefresh=true` 也照样短路**，不发请求。净值落地后 60s 刷新自然变空转（正确行为）。
2. `fetchFundEstimateFast`：非交易时间（周末 / <9:30 / >=15:00）且 `forceRefresh=false` → 直接返回持久化缓存，不拉网络。

## 星标K线（StarKLinePanel）= 唯一展示层，3 处复用

`src/components/StarKLinePanel.vue`：独立页 `views/StarKLine.vue`（全屏、minItemWidth=300、深色）、
全景大屏第二列（2 列/行、colorScheme=auto、传 `liveFundData`）、手机版 `views/MobileStarKLine.vue`。
改星标 UI/交互只动这个组件。

- 星标增删靠 `window` 的 `starred-funds-changed` 事件同步（`saveStarredFunds()` 里广播）。
- `MiniKLineChart` 的 `realtime` prop：父层传了就不自取。**面板恒传 `:realtime="realtimeFor(code)"`**，
  所以子图自带的 60s 定时器基本是空转（`loadRealtime()` 开头 `if (props.realtime) return`），
  只在某只基金取不到估值（realtime 为 null）时才作为兜底补拉。**不存在 N 个图放大 N 倍请求的问题。**
- 估值/净值判定**只认 `isNav`**，展示层不二次推导。
- `#toolbar` 作用域插槽暴露 `period/setPeriod/count/valueBasis/refresh/force-refresh`：
  全景压成一行用 `refresh`（不弹 toast）；手机页用 `force-refresh`（带 toast + reloadTick）。
- 全景只有一个刷新入口（右上角 ↻）：子模块不自带刷新按钮，由 `refreshAll` 调子组件 `defineExpose` 的 `refresh()`。
- `@media (hover: none) { .skp-item-controls { opacity: 1 } }` —— 触屏没 hover，否则「详情/移除」永远看不见。

**60s 自动刷新（2026-09-09 实测确认）**：`startAutoRefresh()` → `setInterval(() => loadRealtime(true), 60000)`，
但 `if (props.liveData) return` —— 全景传了 `liveFundData` 所以跳过；**手机页和独立页没传，定时器真的会跑**。
实测（把 60000 临时改 3000 跑探针）：10s 内新增 24 次 pingzhongdata 请求，确认定时器在跑且真的在拉数。
生命周期：`onMounted`/`onActivated` 起，`onDeactivated`/`onUnmounted` 停。
`App.vue` 的 `keep-alive include="home,ai-tracking,portfolio,market"` 不含 mobile-star-kline → 离开即卸载，不漏定时器。

**一次刷新的网络成本（2026-09-09 实测，6 只星标）**：约 26 次请求/轮（pingzhongdata 18 + qt.gtimg 7 + push2delay 1），
≈ 每只基金每轮 4.3 次。真正的问题不是请求数而是流量：
`fetchNetValueHistoryFast(code, 2, force=true)` 跳过缓存（fundFast.ts:562），且 URL 带
`?v=${Date.now()}` 打掉 HTTP 缓存（fundFast.ts:434）—— `days=2` 只影响解析条数，
**实际每次把该基金完整净值历史整个重下一遍**。盘后净值不变时纯属浪费。
修法（待确认，只改 StarKLinePanel）：`startAutoRefresh` 只在交易时间传 `force=true`，盘后传 `false`
（`force=false` + 非交易时间 → `fetchFundEstimateFast` 返回持久化缓存，零网络；
且净值历史仍有「缓存最新日期 ≠ 今天」判定，傍晚新净值照样拉得到）。

## 星标排序 = 左侧持仓列同口径

权重 `ali=0, TX=1, JD=2, observe=4`，其他/未分类 `3`；组内按 `parseFloat(todayChange||'0')` **降序**；
相同则保留星标添加顺序。`sortStarredByAccount()` 在 `StarKLinePanel.vue`。
`boot()` 和 `onActivated` 必须在 `ensureHoldings()` 后再 `refreshList()`（首次排序时 holdings 还是空的）。
`watch(orderSignature)`（只取 `code:source:todayChange`）盯持仓变化实时重排。

## 备份与恢复（BackupActions.vue）

`Holding.vue` 410 行备份逻辑已抽到 `src/components/BackupActions.vue`，全景 + 持仓共用。
Props：`showLocalBackup/showLocalRestore/showCloudBackup/showCloudRestore/size/buttonClass`（全默认 true）。
恢复成功 `emit('restored')`，全景监听调 `refreshAll(true)`。GitHub Token 弹窗在组件内部，父级不感知。

**payload（version 1.2）**：`holdings / summary / aiTracking / baiduOcrConfig / trades / tTrades /
starredFunds / watchlist`，云备份额外带 `fundNetValues`。
- 本地备份 = `buildBackupPayload(false)`，云备份 = `buildBackupPayload(true)`；
  本地/云恢复都走同一个 `applyBackupData`。**加字段只改这两处，四条路径同时生效。**
- **恢复铁律**：新字段必须写 `if (Array.isArray(jsonData.x)) saveX(...)`，**不能无条件写默认值**——
  老备份没该字段时会把用户现有数据清空。判定用「字段是否存在」，不用版本号。
- 星标 / 自选是 2026-09-09 才补进备份的（之前漏了）。

## 全景大屏（PanoramaDashboard.vue）

**4 列**（2026-09-08 起）：0=Portfolio 1=K线全景 2=量化观察+AI追踪 3=交易记录+AI分析。
flex + 百分比 `flexBasis`，列间 resizer（12px 占位，内含 3px 竖条）。
拖拽「相邻两列和守恒」，总和恒 100%，`MIN_WIDTH=15%`。宽度存 `panorama_col_widths`，默认 `[37,28,35]`。
鼠标 + 触摸都支持；touchmove 必须 `{ passive: false }`。
文件里有**两组** `onMounted`/`onUnmounted` —— Vue 3 允许，不是 bug，别合并。

**左列账户区块拖拽**（2026-09-09）：标题左侧 ⋮⋮ 手柄排序（Pointer Events，`panorama_account_order`），
块间 resizer 调高（`panorama_account_heights`，同款和守恒公式，`MIN_ACCOUNT_HEIGHT=80`）。
4 段几乎一样的模板已抽成 `v-for="acc in accountSections"`；panel-header 有「复位」。
注意高度是 `max-height`，基金少时拖了看不出变化。末尾块用 `.is-last` 而非 `:last-child`。

**隐藏底部 Tabbar**：App.vue `hiddenTabbarPages = ['search','detail','trades','panorama','mobile-star-kline']`。
手动开关走模块级 ref `src/composables/useTabbar.ts`（`tabbarForceShow/toggleTabbar/setTabbarForceShow`），
离开 panorama 自动 `setTabbarForceShow(false)`。**故意不持久化**（会话级）。

## 交易记录时间过滤：按「交易日」不按自然日（2026-09-07 定口径）

> 任何「近 N 天」过滤都基于**实际有交易的日期**倒序取前 N 个（见 `PanoramaDashboard.vue` 的 `tradeDateStats`），
> **不要**用 `Date.now() - N*86400000`。周末/节假日自动对齐，还不用查节假日表。

「上一交易日」= 严格 `< 今天` 且有交易的最近一天。交易中心、持仓页保持一致。

## 通用坑

- **构建**：`npm run build` 会失败 `Cannot find module '@rollup/rollup-darwin-arm64'`（arm64 机器只装了 x64 rollup 原生包），**与代码无关**。验证用 `npx vue-tsc -b`（退出码 0 即通过）。
- **Vue 3 Boolean prop**：`defineProps<{x?: boolean}>()` 不带 `withDefaults` → 未传入的解析为 **`false`** 不是 `undefined`。「默认 true」必须 `withDefaults(..., { x: true })`，用 `prop !== false` 判定永远为 false。（`MiniKLineChart.showHS300` 曾因此长期不显示沪深300）
- **父级 scoped CSS 写子组件内部**必须 `:deep()`：子组件根元素继承父 scope id，内部节点不继承。
- **Playwright mock 行情**：`**/pingzhongdata/*.js` → `var fS_name="..";var Data_netWorthTrend=[{x,y,equityReturn}];`；
  `**/fundgz.1234567.com.cn/**` → 回调名是运行时 `fundgz_<ts>`，回包里反向扫 `window` 找出来调用。
  坑：`page.route('**/*')` 兜底按 LIFO 覆盖更具体的路由，别乱加。
  坑：`**/*.js` 匹配不到带 `?v=` 的 URL，要写 `**/*.js*`。
  坑：`page.clock.install()` 必须在 `goto` 之前，否则已有的 interval 不受控。
  更稳的做法：临时把源码里的 `60000` 改成 `3000` 跑完再改回（记得 `grep PROBE-TEMP` 确认无残留）。

## MiniKLineChart 信息条自适应排版（2026-09-09）

canvas 顶部信息条三段文字（基金名 / 涨跌幅 / 累计涨幅）与 Y 轴右上刻度，原用死坐标 →
窄图（手机 2 列 186px、全景列 ~145px）互相压字，且被右上角「详情/移除」按钮盖住。一次修三个重叠：

1. `computeLayout(width, height)` 抽出来给 drawChart 和 handleCanvasClick **共用**（否则点击命中会漂）。
2. 信息条右侧的量按 `measureText` 实际宽度从右往左排，右边界让开 `topRightReserve`；
   放不下整段不画（`MIN_NAME_WIDTH=34`）。
3. 窄图（`width<280 && height>=130`）切两行：基金名独占第一行，涨跌幅+累计涨幅挤第二行；
   名称按像素二分加省略号（canvas 没 text-overflow）。
4. 窄图省掉「净值/估值」后缀（~26px）。
5. Y 轴顶部刻度（`y<26 && reserve>0`）右对齐到 `width-reserve-2`。
6. prop `topRightReserve: number`（父层按按钮数算好传入，默认 0）。

**StarKLinePanel 配合**：`showDetail?: boolean`（默认 true，手机版关掉只剩「移除」）；
`controlReserve = 2 + n*22 + (n-1)*2 + 2`（n=0→0，n=1→26，n=2→50），改按钮尺寸只动这一处。
**MobileStarKLine** 用 `:show-detail="false"` + `aspect-ratio="4/3"`（186×140，触发两行信息条）。
未改 desktop：全景列 180×112（height<130）走单行；独立页 width≥280 单行无省略号。

## 手机版专属星标K线页 `/m/star-kline`（2026-09-09）

路由 `name='mobile-star-kline'`，已隐藏底栏。入口在 Home.vue `.overview-title .title-left`：
`.mobile-star-entry.mobile-only`（星形 svg + 角标，`::before` 负 inset 撑到 44px 触摸区），
`starredCount` ref 监听 `starred-funds-changed` 同步。
页面：`#toolbar` 插槽自己画两行头部；`columns=2`、`colorScheme='auto'`、`:show-market-value="false"`；
`.msk-page height:100% flex column` + `.msk-panel flex:1 min-height:0`；
顶安全区 `padding-top: max(env(safe-area-inset-top), var(--status-bar-height))`，box-sizing content-box；
底安全区**不叠**（`.app-container` 已统一加过 `env(safe-area-inset-bottom)`）。
