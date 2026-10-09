# 项目长期笔记：AI百万实盘（MillionfundN）

## 本地存储约定（致命陷阱）
- 用户数据全在 localStorage，key 集中 `src/utils/storage.ts` 的 `STORAGE_KEYS`。
- `checkVersionAndClearCache()` 版本变更会删命中 `CACHE_PREFIXES`（`fund_`/`api_`/`market_`/`estimate_`）且不在 `preservedKeys` 白名单的 key。**这些前缀开头的用户数据 key 必须登记进白名单**，否则静默清空（事故：`fund_t_trades` 漏登记被清空，2026-09-05）。
- 新增 UI 偏好类 key 优先用**不带前缀**的名字（如 `panorama_col_widths`）双保险。
- 白名单：watchlist / holdings / trades / t_trades / net_values / source_filter / app_version / starred_funds / panorama_col_widths / panorama_account_order / panorama_account_heights。

## 数据结构
- 普通交易 `fund_trades`；做T记录 `fund_t_trades`（一买一卖配对归档，原两条从 `fund_trades` 移除）。做T由 Detail「标记T」生成，TradeCenter/Detail「恢复」可还原成普通交易。

## 估值架构与字段语义
- `useFundValuation` = 估值层（拉取/缓存 `liveFundData`/`calcPostReturn`）；`holdingStore.updateHoldingWithAccurateData` = 收益层（重算市值盈亏+落盘）。需估值页面复用 composable，勿内联。
- `fetchFundAccurateData` 字段：
  - `dataSource: 'nav'|'estimate'|'fallback'|'local_cache'` —— currentValue 用哪类数据（DEPRECATED 做判断，仅日志）。
  - `navIsCurrent` —— navDate 是不是「当前该拿到的那一期」。**今天交易能否用此净值确认只看 `navIsCurrent`**，绝不能用 `dataSource!=='nav'` 代替；`updateTradesByCode(code,nav,navDate,navIsCurrent)` 内置该守卫。
  - `isNav` —— currentValue 是净值还是估值，唯一判定出口。**交易时间内估值拉取失败会强制 `currentValue=0`**（保护持仓市值不被旧净值污染），此时星标K线应回退 `nav` 兜底（见"星标K线"）。
- **两个「今天」必须分开**（共用 `isNavUpToDate`，传不同 `today`）：
  - `getCalendarDateStr()`：自然日（默认）——估值取值/交易守卫/缓存新鲜度。
  - `getProgressDateStr()`：**仅进度条专用**，9点前归属上一工作日（净值半夜才更新完的宽限期）。误用→09:00 前守卫失效→今天单被 T-1 净值确认、份额算错。净值缓存窗口已放宽到 `hour<18`。

## 刷新短路（数据不对先查这）
1. **`isUpdated` 粘性布尔陷阱（2026-09-15/16）**：被置 true 后不因日历日推进复位。两处跳过条件改为 `holdingNavIsCurrent(h)`（`isNavUpToDate({nav:h.currentValue,navDate:h.valueDate,isQDII})`），**必须不传 `today`（默认自然日），不能用 `getProgressDateStr()`**（QDII 在 09:00 前恒 true 致不重拉）。`isUpdated` 字段保留但不再当跳过闸门；快路径须按进度条口径重算写回 `isUpdated`（否则绿名/进度条「未更新」错显）。
2. `fetchFundEstimateFast`：非交易时间（周末/<9:30/>=15:00）且 `forceRefresh=false` 直接返回持久化缓存。
3. **`fetchFundAccurateData` 估值分支必须带 `inTradingTime` 守卫**：`isWeekday && inTradingTime && estimate>0` 才用盘中实时估值；非交易时间进此分支会拿上一交易日快照当今日涨跌幅盖掉真净值（QDII 典型）。`inTradingTime = isWeekday && isTradingHours`（9:30-11:30 ∪ 13:00-15:00）。
4. **QDII 判定按设计用持仓手动开关，不要自动从接口推导去覆盖**（2026-09-16 Request 9 反例，用户确认回退）。漏勾→QDII 滞后净值 ≠ 今天→`isUpdated` 恒 false→绿名/进度条错显。保持手动开关唯一来源。

## 口径铁律：累计/收益率一律用 addedGain（真 ROI）
- `addedGain = (现价−买价)/买价`（利润÷成本）；**禁止 `profitRate`（利润÷市值）**。`profitRate = 1 - 1/(1+addedGain/100)`。例：addedGain -17.6% ↔ profitRate -21.33%。
- 易错：`holdingStore.profitRate` 是 ÷市值；`Detail.holdingDetails.profitRate` 本地重算成 ÷买价（变量名误导）。全景左列/观察「累计」、星标K线信息条（`h.addedGain`）用 addedGain；Holding 顶部「收益率」汇总=真组合 ROI（`totalCost`=Σ份额×买价，`totalProfitRate`=总收益÷总成本）。

## 星标K线（StarKLinePanel）= 唯一展示层，3 处复用
- `src/components/StarKLinePanel.vue`：独立页 `views/StarKLine.vue`、全景第二列（2列/行/传 `liveFundData`）、手机版 `views/MobileStarKLine.vue`。改星标 UI 只动此组件。
- 增删靠 `window` 的 `starred-funds-changed` 事件同步。
- `MiniKLineChart.realtime` prop：父层传了就不自取（子图 60s 定时器兜底）；估值判定只认 `isNav`。
- 9.30 这类「今天的点」是 `MiniKLineChart.drawChart` 的**延伸点**，仅在 `rt.value.currentValue>0` 时补画；`rt = props.realtime ?? realtimeData`（自取）。**不再加 `nav` 兜底**（2026-09-30 回退）：曾以为批量拉取超时致 `currentValue=0` 会让点消失，但用户确认 002910 的 9.30 点「没改之前就画出来了」；且估值失败时用旧净值当今天点会显示错误数据，保持 `currentValue>0` 原闸门更诚实。
- **点击命中铁律（2026-09-30 修）**：`handleCanvasClick` 必须与 `drawChart` 用**同一套坐标**——算 `extendedPerfData`/`hasExtension`/`todayStr`，`toX` 用 `extendedPerfData.length`；交易命中用**严格日期匹配**（禁 `findDateIndex` 的 7 天兜底，会把今天交易误匹配到最近历史点），且取**最近命中**而非首命中（防相邻日期交易点互相遮挡）。否则点「今天加仓点」会显示前一天交易 tooltip（002910 案例：点 9.30 却显示 9.29 加仓信息）。
- **Y 范围铁律（同次补）**：点击的 `toY` 范围必须**包含 HS300 返回**（`showHS300Line` 时）和**成本线返回**（`props.costNavValue>0` 时），不能只算 `fundReturn`。否则 `toY` 映射和画出来的不一致，**高亮红点会跑到下方很远**（HS300 跌得越深、点偏得越远；002910 案例：点击 9.24 加仓点，高亮跑到 -10.6% 处）。和 `drawChart` 的 `allReturns` 构造保持一字不差。
- 星标排序 `sortStarredByAccount()`：权重 ali=0/TX=1/JD=2/observe=4/其他3；组内按 `todayChange` 降序，相同保添加顺序。
- 交易 tooltip「涨幅」=`(latestValue-区间首根净值)/区间首根净值`，latest=rt.currentValue??末根净值；`props.returnRate`(=addedGain) 是成本收益率，与「区间累计涨幅」两指标别混。
- **星标快照（2026-09-17）**：`STARRED_FUNDS` 由 `string[]` 升级为 `StarredFundMeta[]`，每只冗余 `name/addedGain/buyNetValue/source/isQDII`；删持仓后 `fundInfoMap` 用快照兜底仍显示名称/累计/成本线，只「在星标里删除」才真不显示。`updateStarredFundMeta()` **不广播** `starred-funds-changed`（否则死循环）；快照刷新仅在持仓存在时。`getStarredFunds()` 仍返回 `string[]`。
- **备份带快照（同次补）**：`buildBackupPayload.starredFunds` 走 `getAllStarredFundMeta()`（全量对象）；`applyBackupData.saveStarredFunds` 原样写回 `Array<string|StarredFundMeta>`。老备份纯 string[] 仍归一化；新备份（带对象）恢复到旧版 App 会丢快照（版本耦合，需两端同版本）。

## 备份与恢复（BackupActions.vue）
- `Holding.vue` 备份逻辑抽到 `src/components/BackupActions.vue`，全景+持仓共用。Props 全默认 true：showLocalBackup/showLocalRestore/showCloudBackup/showCloudRestore/size/buttonClass。恢复成功 `emit('restored')`，全景监听调 `refreshAll(true)`。
- payload v1.2：holdings/summary/aiTracking/baiduOcrConfig/trades/tTrades/starredFunds/watchlist；云备份额外带 `fundNetValues`。加字段只改 `buildBackupPayload` 两处。
- **恢复铁律**：新字段必须 `if (Array.isArray(jsonData.x)) saveX(...)`，不能无条件写默认值（老备份没该字段会清空现有数据）。判定用「字段是否存在」非版本号。

## 全景大屏（PanoramaDashboard.vue）
- 4 列：0=Portfolio 1=K线全景 2=量化观察+AI追踪 3=交易记录+AI分析。flex+百分比 flexBasis，列间 resizer（12px/内含3px），拖拽守恒、总和100%、`MIN_WIDTH=15%`。宽度存 `panorama_col_widths` 默认 `[37,28,35]`。
- 左列账户块拖拽：⋮⋮ 手柄排序（`panorama_account_order`）、块间 resizer 调高（`panorama_account_heights`，`MIN_ACCOUNT_HEIGHT=80`）。
- 隐藏底栏：`hiddenTabbarPages` 含 `panorama`；离开自动 `setTabbarForceShow(false)`。
- 交易记录时间过滤按「实际有交易的自然日」倒序取前 N（见 `tradeDateStats`），勿用 `Date.now()-N*86400000`。
- 第二列星标K线传 `:live-data="liveFundData"`（口径与持仓/交易一致、不重复请求）。

## 通用坑
- 构建：`npm run build` 失败 `Cannot find module '@rollup/rollup-darwin-arm64'`（arm64 只装 x64 rollup），与代码无关；验证用 `npx vue-tsc -b`（退出码 0 即通过）。
- Vue3 Boolean prop：`defineProps<{x?:boolean}>()` 不带 `withDefaults` → 未传入解析为 **false** 非 undefined；「默认 true」必须 `withDefaults(...,{x:true})`。
- 父级 scoped CSS 写子组件内部必须 `:deep()`。
- Playwright mock：`**/pingzhongdata/*.js` → `var fS_name=..;var Data_netWorthTrend=[...]`；`fundgz` 回调名运行时 `fundgz_<ts>` 需反向扫 window。`**/*.js` 匹配不到带 `?v=` 的 URL（写 `**/*.js*`）；`page.clock.install()` 必须在 `goto` 前。探针改 60000→3000，完事 `grep PROBE-TEMP` 确认无残留。
- MiniKLineChart 窄图信息条（`width<280 && height>=130` 两行）用 `computeLayout` 共用；`topRightReserve` prop 让开右上按钮。改按钮尺寸只动 `StarKLinePanel.controlReserve`。

## 量化观察账户 & 删除语义铁律（2026-09-20）
- **设计意图（用户明确）**：量化观察**不是独立数据**，就是 `holdingStore.holdings` 里 `source==='observe'` 的又一个账户，和 ali/TX/JD 平级（全景=3账户+量化观察，单独显示而已）。全景/首页「量化观察」块都读 `holdings.filter(source==='observe')`。
- **删除语义**：详情页/首页长按/自选列表任意一处「删除这个基金」= 从账户（持仓）移除，全渠道一致，不该删了还在别处残留。
- 已修坑：1) `removeHolding` 原 `findIndex+splice(1)` 只删第一条→改为 `filter(h=>h.code!==code)` 全量删。2) 自选(`fund_watchlist`)与持仓原两份独立存储不级联→`removeHolding` 末尾 `removeFromWatchlist(code)`、`fundStore.removeFund` 末尾 `useHoldingStore().removeHolding(code)`，互调幂等无死循环。改删除逻辑务必保持「删基金=持仓+自选一起清」。
- ⚠️ 星标K线（StarKLinePanel）是**故意**在删持仓后靠快照继续显示的，与本条删除语义无关，别误改。
