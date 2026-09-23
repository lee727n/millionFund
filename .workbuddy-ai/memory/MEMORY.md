# 项目长期笔记：AI百万实盘（MillionfundN）

## 本地存储约定（致命陷阱）

用户数据全在 localStorage，key 集中 `src/utils/storage.ts` 的 `STORAGE_KEYS`。
`checkVersionAndClearCache()` 版本变更时删除命中 `CACHE_PREFIXES`（`fund_`/`api_`/`market_`/`estimate_`）
却不在 `preservedKeys` 白名单的 key。**任何这些前缀开头的用户数据 key 必须登记进白名单**，否则被静默清空。
事故：`fund_t_trades` 漏登记被清空（2026-09-05 修复）。新增 UI 偏好类 key 优先取**不带前缀**的名字（如 `panorama_col_widths`）双保险。
白名单：watchlist / holdings / trades / t_trades / net_values / source_filter / app_version /
starred_funds / panorama_col_widths / panorama_account_order / panorama_account_heights。

## 数据结构

普通交易 `fund_trades`；做T记录 `fund_t_trades`（一买一卖配对归档，原两条从 `fund_trades` 移除）。
做T由 Detail.vue「标记T」生成，TradeCenter/Detail「恢复」可还原成普通交易。

## 估值架构与字段语义

`useFundValuation` composable = 估值层（拉取/缓存 `liveFundData`/`calcPostReturn`）；
`holdingStore.updateHoldingWithAccurateData` = 收益层（重算市值盈亏 + 落盘）。需估值的页面复用 composable，勿内联。

`fetchFundAccurateData` 两个易混字段：
- `dataSource: 'nav'|'estimate'|'fallback'|'local_cache'` —— currentValue 用哪类数据（UI 文案/交易基准）。
- `navIsCurrent: boolean` —— navDate 是不是「当前该拿到的那一期」。

> 盘前/非交易日回退上一期净值时 `dataSource` 也是 `'nav'`，但那期不属于今天。
> 「今天交易能否用此净值确认」**只看 `navIsCurrent`**，绝不能用 `dataSource !== 'nav'` 代替。
> `updateTradesByCode(code, nav, navDate, navIsCurrent)` 内置该守卫：只有 `navIsCurrent=true` 才把 estimated 单确认成净值。

**两个「今天」必须分开**：共用 `isNavUpToDate`，但传不同 `today`。
- `getCalendarDateStr()`：自然日（默认）。估值取值/交易守卫/缓存新鲜度用它。
- `getProgressDateStr()`：**仅进度条专用**，9 点前归属上一工作日（宽限期，净值半夜才更新完，否则早上进度条空）。
误用 → 09:00 前守卫失效 → 今天的单被 T-1 净值确认，份额算错。配套：净值缓存窗口已放宽到 `hour<18`。

## 刷新短路（排查「刷新没反应/数据不对」先看这俩）

1. **`isUpdated` 粘性布尔陷阱（2026-09-15 修复，2026-09-16 再细化）**：
   `holding.isUpdated` 持久化布尔，被置 true 后**不会因日历日推进复位**。原来 `refreshEstimates()`（holding.ts）
   和 `useFundValuation.loadFundData` 快路径都直接读这个布尔决定「跳过重拉」——导致隔了几天再开 App，
   持仓停在「上次更新那天的净值/涨幅」，和账户实际更新后的净值对不上（全景左侧持仓、持仓页都错显）。
   **修法**：两处跳过条件改为 `holdingNavIsCurrent(h)` —— 用持仓自己的 `valueDate` 重跑
   `isNavUpToDate({ nav: h.currentValue, navDate: h.valueDate, isQDII })`，
   **⚠️ 必须不传 `today`（即默认自然日 `getCalendarDateStr()`），不能用 `getProgressDateStr()`**：
   进度条口径在 09:00 前会归属上一工作日，对 QDII 来说 `prevWorkdaySync(昨日) === valueDate` 恒为 true，
   导致「早上一开 App 仍然停在更早的旧净值」不重拉（真实案例：2026-09-16 0:50 QDII 024239，
   valueDate=9/14、stored todayChange=-3.24% 是 9/15 盘中估值，9/15 收盘后真净值 -3.77% 进不来）。
   `isUpdated` 字段本身保留（进度条/状态徽标仍读它），但不再当跳过闸门。
   **⚠️ 配套坑（2026-09-16 Request 8）**：快路径只复用数据、不调 `updateHoldingWithAccurateData`，
   原本**不会回写 `isUpdated`** → 基金实际已最新（否则进不来快路径）却 `isUpdated` 停在旧 `false`，
   全景名变绿（`fm-pending`）/ 进度条「未更新」错显（华宝纳斯达克案例）。
   修法：快路径复用数据后按进度条口径重算写回 `holding.isUpdated`
   （`useFundValuation.ts` 已加；能进快路径 → 进度条口径也必 current，无假阳性）。
   凡改快路径闸门，都要确认 `isUpdated` 仍被正确刷新。
2. `fetchFundEstimateFast`：非交易时间（周末/<9:30/>=15:00）且 `forceRefresh=false` → 直接返回持久化缓存，不拉网络。
3. **`fetchFundAccurateData` 估值分支必须带 `inTradingTime` 守卫（2026-09-16 补）**：
   分支 `else if (isWeekday && inTradingTime && result.estimate > 0)` 才用盘中实时估值；
   非交易时间（盘前/盘后/半夜，含周末）**不能**进此分支，否则会拿上一交易日的盘中快照
   （QDII 因 fundgz 404、App 用重仓股重算的旧估算）当今日涨跌幅，盖掉最新已公布净值。
   非交易时间应落空走 prev-NAV 分支（`result.nav`/`navChange`）。
   排查「非交易时间显示了一个奇怪的小涨跌幅（如 -0.08%）」先查这个分支有没有 `inTradingTime`。
   `inTradingTime = isWeekday && isTradingHours`（`isTradingHours`=9:30-11:30 ∪ 13:00-15:00，fundFast.ts）。
4. **QDII 判定按设计用持仓手动开关，不要自动从接口推导去覆盖（2026-09-16 Request 9 反例）**：
   `isUpdated`/`navIsCurrent`/`holdingNavIsCurrent` 都吃 `isQDII`，而 `isQDII` 是**手动开关**（默认 false）。
   漏勾开关会让 QDII 滞后净值永远 != 今天 → `isUpdated` 恒 false → 绿名/进度条「未更新」错显
   （华宝纳斯达克 017436/017437 案例，数据其实是对的）。
   **本 Request 我曾加「接口 fundType 自动推导 + 写回持仓」去覆盖手动开关，用户确认后已回退**——
   用户明确「还是通过手动标记判断是不是 QDII」。教训：改动判定逻辑前先确认设计意图，自动覆盖手动开关是反模式。
   **现状**：保持手动开关为唯一来源；真 QDII 漏勾就由用户在来源里标记（用户已这么处理）。

## 口径铁律：累计/收益率 一律用 addedGain（真 ROI）

用户约定（2026-09-15「教给你了」）：所有「累计/累计涨幅/收益率/持有收益率」展示，
**必须用 `addedGain` = (现价−买价)/买价（利润÷成本）**，**禁止 `profitRate`（利润÷市值）**。
`profitRate = 1 - 1/(1 + addedGain/100)`。例：addedGain -17.6% ↔ profitRate ≈ -21.33%。
易错：`holdingStore.profitRate` 是 ÷市值；但 `Detail.vue` 的 `holdingDetails.profitRate` 是本地重算成 ÷买价（变量名误导）。
已统一：全景左列/观察「累计」、星标K线信息条（`StarKLinePanel` 传 `h.addedGain`）用 addedGain；
Holding 顶部「收益率」汇总 = 真组合 ROI（`HoldingSummary.totalCost`=Σ份额×买价，`summary.totalProfitRate`=总收益÷总成本）。

## 星标K线（StarKLinePanel）= 唯一展示层，3 处复用

`src/components/StarKLinePanel.vue`：独立页 `views/StarKLine.vue`（全屏/minItemWidth=300/深色）、
全景第二列（2列/行/colorScheme=auto/传 `liveFundData`）、手机版 `views/MobileStarKLine.vue`。改星标 UI 只动此组件。
- 增删靠 `window` 的 `starred-funds-changed` 事件同步。
- `MiniKLineChart.realtime` prop：父层传了就不自取，面板恒传 `:realtime="realtimeFor(code)"`（子图 60s 定时器基本空转，仅兜底）。
- 估值/净值判定**只认 `isNav`**，展示层不二次推导。
- 星标排序 `sortStarredByAccount()`：权重 ali=0/TX=1/JD=2/observe=4/其他3；组内按 `todayChange` 降序，相同保添加顺序。
- 交易 tooltip「涨幅」=`(latestValue-区间首根净值)/区间首根净值*100`，latest=rt.currentValue??末根净值，与累计收益率线同口径；
  **注意**：`props.returnRate`（面板传 `h.addedGain`）是买入至今成本收益率，和「区间累计涨幅」是两指标，标签别混。
- **星标快照（2026-09-17 修复「删持仓后星标K线变空白」）**：`STARRED_FUNDS` 已由 `string[]` 升级为 `StarredFundMeta[]`（对象），
  每只星标冗余一份展示快照 `name/addedGain/buyNetValue/source/isQDII`；删除持仓后 `fundInfoMap` 用快照兜底，星标K线仍显示
  **名称/累计涨跌幅/成本线**，只「在星标里删除」才真正不显示。`getStarredFunds()` 对外仍返回 `string[]`（兼容首页计数/排序）。
  **静默写回铁律**：`updateStarredFundMeta()` **不广播** `starred-funds-changed`，否则触发面板 `onStarredChanged`→再写快照 死循环；
  快照刷新只在持仓存在时（`syncStarMeta` 跳过无持仓星标）→ 删持仓即保留删除前最后一次快照。
  **估值口径**：`loadFundData` 新增 `isQDIIMap` 形参给已删持仓的星标基金补 QDII；全景 `refreshAll` 已把星标代码纳入估值拉取集合
  （否则全景第二列靠 `liveData` 只含持仓，删持仓的星标会丢 估值涨幅）。
  **⚠️ 备份必须带快照（同次补充修复）**：`BackupActions.buildBackupPayload` 的 `starredFunds` 改走 `getAllStarredFundMeta()`（全量对象），
  `applyBackupData` 的 `saveStarredFunds` 改 authoritative 原样写回（`Array<string|StarredFundMeta>`，不再按 string 过滤）。
  否则「已删持仓但仍星标」的基金跨设备（如 PC 备份→手机恢复，手机无此持仓）恢复后会变空白。`saveStarredFunds` 仅恢复路径调用，无合并语义。
  老备份（纯 string[]）仍正常归一化；但**新备份（带对象）恢复到旧版 App** 会被旧 `saveStarredFunds` 的 string 过滤丢掉快照——属版本耦合，需两端同版本。

## 备份与恢复（BackupActions.vue）

`Holding.vue` 备份逻辑抽到 `src/components/BackupActions.vue`，全景+持仓共用。
Props 全默认 true：`showLocalBackup/showLocalRestore/showCloudBackup/showCloudRestore/size/buttonClass`。
恢复成功 `emit('restored')`，全景监听调 `refreshAll(true)`。
payload v1.2：`holdings/summary/aiTracking/baiduOcrConfig/trades/tTrades/starredFunds/watchlist`，云备份额外带 `fundNetValues`。
加字段只改 `buildBackupPayload` 两处（本地/云）即四条路径生效。**恢复铁律**：新字段必须 `if (Array.isArray(jsonData.x)) saveX(...)`，
不能无条件写默认值（老备份没该字段会清空现有数据）。判定用「字段是否存在」非版本号。

## 全景大屏（PanoramaDashboard.vue）

4 列：0=Portfolio 1=K线全景 2=量化观察+AI追踪 3=交易记录+AI分析。flex+百分比 flexBasis，列间 resizer（12px/内含3px），
拖拽相邻两列和守恒、总和 100%、`MIN_WIDTH=15%`。宽度存 `panorama_col_widths` 默认 `[37,28,35]`。
左列账户块拖拽：⋮⋮ 手柄排序（`panorama_account_order`）、块间 resizer 调高（`panorama_account_heights`，`MIN_ACCOUNT_HEIGHT=80`）。
隐藏底栏：`hiddenTabbarPages` 含 `panorama`；离开自动 `setTabbarForceShow(false)`（会话级不持久化）。
交易记录时间过滤按「实际有交易的自然日」倒序取前 N（见 `tradeDateStats`），勿用 `Date.now()-N*86400000`。

## 通用坑

- 构建：`npm run build` 失败 `Cannot find module '@rollup/rollup-darwin-arm64'`（arm64 只装 x64 rollup），与代码无关。
  验证用 `npx vue-tsc -b`（退出码 0 即通过）。
- Vue3 Boolean prop：`defineProps<{x?:boolean}>()` 不带 `withDefaults` → 未传入解析为 **false** 非 undefined。「默认 true」必须 `withDefaults(...,{x:true})`。
- 父级 scoped CSS 写子组件内部必须 `:deep()`。
- Playwright mock：`**/pingzhongdata/*.js` → `var fS_name=..;var Data_netWorthTrend=[...]`；`fundgz` 回调名运行时 `fundgz_<ts>` 需反向扫 window。
  `**/*.js` 匹配不到带 `?v=` 的 URL（写 `**/*.js*`）；`page.clock.install()` 必须在 `goto` 前。探针用临时改 60000→3000，完事 `grep PROBE-TEMP` 确认无残留。
- MiniKLineChart 窄图信息条（`width<280 && height>=130` 两行）用 `computeLayout` 共用；`topRightReserve` prop 让开右上按钮。改按钮尺寸只动 `StarKLinePanel.controlReserve`。

## 量化观察账户 & 删除语义铁律（2026-09-20 定）

**设计意图（用户明确）**：量化观察**不是独立数据**，它就是 `holdingStore.holdings` 里 `source==='observe'` 的又一个账户，
和 ali/TX/JD 平级（全景=3账户+量化观察，单独显示而已）。全景/首页「量化观察」块都读 `holdings.filter(source==='observe')`。
**删除语义**：详情页 / 首页长按 / 自选列表 任意一处「删除这个基金」= 把它从账户（持仓）里移除，全渠道一致，不该删了还在别处残留。

**两个真实坑（已修）**：
1. `holdingStore.removeHolding(code)` 原实现 `findIndex+splice(1)` 只删第一条——同一 code 若有两条记录
   （真实账户 + observe，或老数据/导入残留），删一次只删一条，剩下那条仍显示。**修法**：改成 `filter(h=>h.code!==code)` 全量删。
2. 自选（watchlist, `fund_watchlist`）和持仓（`fund_holdings`）原是两份独立存储、删除互不级联——
   从自选列表删掉，持仓里的 observe 记录残留 → 量化观察还显示。**修法（双向幂等）**：
   - `removeHolding` 末尾顺手 `removeFromWatchlist(code)`；
   - `fundStore.removeFund` 末尾 `useHoldingStore().removeHolding(code)`。
   互调幂等无死循环。改删除逻辑时务必保持「删基金=持仓+自选一起清」。
   ⚠️ 注意：星标K线（StarKLinePanel）是**故意**在删持仓后靠快照继续显示的，与本条删除语义无关，别误改。
