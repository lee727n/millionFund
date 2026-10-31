# 项目长期笔记：AI百万实盘（MillionfundN）

## 本地存储致命陷阱
- 用户数据全在 localStorage，key 集中 `src/utils/storage.ts` 的 `STORAGE_KEYS`。`checkVersionAndClearCache()` 版本变更会删命中 `CACHE_PREFIXES`（`fund_`/`api_`/`market_`/`estimate_`）且不在 `preservedKeys` 白名单的 key——前缀开头的用户数据 key 必须登记进白名单，否则静默清空（事故：`fund_t_trades` 漏登记被清空 2026-09-05）。
- 新增 UI 偏好类 key 优先用不带前缀的名字（如 `panorama_col_widths`）双保险。白名单：watchlist/holdings/trades/t_trades/net_values/source_filter/app_version/starred_funds/panorama_col_widths/panorama_account_order/panorama_account_heights。

## 数据结构与 TradeType 铁律
- 普通交易 `fund_trades`；做T记录 `fund_t_trades`（一买一卖配对归档，原两条从 `fund_trades` 移除）。
- `TradeType='buy'|'sell'|'dividend'|'auto_invest'`。**绝不写 `type==='buy'?A:B`**（会把定投/分红错判）。展示用 `tradeTypeLabel(type)`；资金/份额方向用 `isBuySide(type)`（=buy||auto_invest）。**例外**：画K线买卖点要白名单 `type==='buy'||type==='sell'`（定投按需求不画）；MiniKLineChart(2处)/OKXChart 遍历 trades 默认不过滤类型，不显式加白名单定投会被画成绿色卖点。
- 定投：刷新时 `executeDueDCAs(today)` 建 `auto_invest`+扣现金+加份额，`lastExecutedDate` 防同日重扣；只在网页打开刷新时跑，过去交易日不补买。`getTodayFirstBuyCorrection` 返回值整体覆盖 holding.shares（只按唯一 buy 重算），当天有定投已被守卫挡掉（`if(trades.some(t=>t.type==='auto_invest'))return null`），改此函数务必保留守卫。

## 定投云端协调铁律（2026-10-28）
- DCA 云端协调与整库备份是**两个独立 gist**：主备份 `fund-holdings-backup.json`(描述"基金持仓数据备份 - AI百万实盘")；DCA 台账 `dca-sync.json`(描述"定投计划云端同步")。两者都需同一 GitHub Token，缺一不可；token 不同 → 两端各看各的 gist → 恢复/去重全乱。
- **引导死锁 bug（已修）**：`dca.ts` `executeDueDCAsCloudCore` 的 `!cloud` 分支在 dca gist 不存在时直接走本地执行，而 `writeDcaCloudState` 只在 cloud 非空分支被调用 → gist 永不被创建 → 新 Token 永久卡"本地"徽标、跨设备去重永不生效。修复：`findDcaGist` 三态(找到/notfound/error) + 新增 `bootstrapDcaCloudState(plans)` 仅当 `notfound` 时创建 + `!cloud` 先引导再重读。
- `dcaCloud.ts` `findDcaGist` 用 `per_page=100` 列 gist；若某端 gist 超 100 个会被漏匹配（边角风险）。

## 备份/恢复铁律（2026-10-28）
- `BackupActions.vue` `applyBackupData`：**先写回全部数据（trades/cash/dcaPlans/fundNetValues/starred…），最后再 `holdingStore.initHoldings()`**。旧顺序是 initHoldings 在写回前跑，导致自愈补齐买点用旧交易、净值快照在网络重算后才落盘(恢复瞬间市值由手机联网决定)、定投幂等依赖的恢复后 dcaPlans 缺失。改顺序务必保持「数据落盘 → 估值重算」次序。
- 市值(marketValue)永不进备份（运行时字段被剥），恢复后由手机端联网重算，故恢复瞬间部分基金市值可能与备份时刻略有差异——属设计，非 bug；想恢复瞬间完全一致需让恢复走「本地净值快照」而非联网。
- `gist.ts` `findBackupGist` **精确文件名 `fund-holdings-backup.json` 优先**，再兜底描述匹配，且排除定投云端同步 gist。模糊匹配会"写到一个 gist、读到另一个"→ 恢复到旧数据。PC/手机必须配**同一个 GitHub Token**，否则两边 gist 不是同一批。
- 现金(`panoramaAccountCash`)不经计算：PC 显示值 = `getPanoramaAccountCash()` = 备份抓取值 = 还原整对象覆盖。若手机现金对不上，只可能是"恢复到旧 gist"（最新备份没落地）或还原静默失败，绝不可能是估值计算。

## 估值架构与字段语义
- `useFundValuation`=估值层；`holdingStore.updateHoldingWithAccurateData`=收益层。需估值页面复用 composable，勿内联。
- `fetchFundAccurateData` 字段：`navIsCurrent`（今天交易能否用此净值确认只看它，绝不能用 `dataSource!=='nav'` 代替）；`isNav`（currentValue 是净值/估值的唯一判定出口）。交易时间内估值拉取失败强制 `currentValue=0`（保护市值不被旧净值污染），星标K线应回退 `nav` 兜底。
- **两个「今天」必须分开**（共用 `isNavUpToDate`，传不同 today）：`getCalendarDateStr()` 自然日（估值/交易守卫/缓存新鲜度）；`getProgressDateStr()` 仅进度条专用，9点前归属上一工作日。非交易日 `getProgressDateStr()` 也归属上一工作日（`isWorkday()` 借 `isHolidaySync`）；净值缓存窗口 `hour<18`。

## 刷新短路（数据不对先查这）
1. `isUpdated` 粘性布尔陷阱（2026-09-15/16）：两处跳过条件改 `holdingNavIsCurrent(h)`，必须不传 today（默认自然日），不能用 `getProgressDateStr()`。**必须不传今天**——QDII 09:00 前恒 true 致不重拉。快路径须按进度条口径重算写回 `isUpdated`。
2. `fetchFundEstimateFast`：非交易时间且 `forceRefresh=false` 直接返持久化缓存。
3. `fetchFundAccurateData` 估值分支必须带 `inTradingTime` 守卫（`isWeekday && isTradingHours` 9:30-11:30∪13:00-15:00），否则非交易时间拿上一交易日快照当今日涨跌幅盖真净值（QDII 典型）。
4. QDII 判定按设计用持仓手动开关，不要自动从接口推导去覆盖（2026-09-16 反例）。

## 口径铁律：累计/收益率一律用 addedGain（真ROI）
- `addedGain=(现价-买价)/买价`（利润÷成本）；**禁止 `profitRate`**（利润÷市值）。`profitRate=1-1/(1+addedGain/100)`。易错：`holdingStore.profitRate` 是÷市值；Detail.holdingDetails.profitRate 本地重算成÷买价（变量名误导）。全景左列/观察「累计」、星标K线信息条用 addedGain；Holding 顶部「收益率」=真组合ROI（`totalCost`=Σ份额×买价，`totalProfitRate`=总收益÷总成本）。

## 星标K线（StarKLinePanel）= 唯一展示层，3处复用
- `src/components/StarKLinePanel.vue`：独立页 `views/StarKLine.vue`、全景第二列（传 `liveFundData`）、手机版 `views/MobileStarKLine.vue`。增删靠 window `starred-funds-changed` 事件。`MiniKLineChart.realtime` prop 父传则不自取；估值只认 `isNav`。
- **点击命中铁律**：`handleCanvasClick` 必须与 `drawChart` 用同一套坐标（`extendedPerfData`/`hasExtension`/`todayStr`，`toX` 用 `extendedPerfData.length`）；交易命中严格日期匹配（禁 `findDateIndex` 7天兜底），取最近命中而非首命中。否则点今天加仓点会显前一天 tooltip。
- **Y范围铁律**：点击 `toY` 必须含 HS300 返回（`showHS300Line` 时）和成本线返回（`costNavValue>0`），与 `drawChart` 的 `allReturns` 一字不差，否则高亮红点跑到下方很远。
- 星标快照：`STARRED_FUNDS` 由 `string[]` 升级为 `StarredFundMeta[]`（每只冗余 name/addedGain/buyNetValue/source/isQDII）；删持仓后 `fundInfoMap` 用快照兜底仍显示。删持仓后靠快照继续显示与「量化观察删除语义」无关，别误改。`updateStarredFundMeta()` 不广播 `starred-funds-changed`（死循环）；快照刷新仅持仓存在时。

## 备份与恢复（BackupActions.vue）
- 抽出到 `src/components/BackupActions.vue`，全景+持仓共用。Props 全默认 true：showLocalBackup/showLocalRestore/showCloudBackup/showCloudRestore/size/buttonClass。恢复成功 `emit('restored')`，全景监听调 `refreshAll(true)`。
- payload v1.2：holdings/summary/aiTracking/baiduOcrConfig/trades/tTrades/starredFunds/watchlist；云备份额外带 `fundNetValues`。加字段只改 `buildBackupPayload` 两处。
- **恢复铁律**：新字段必须 `if(Array.isArray(jsonData.x)) saveX(...)`，不能无条件写默认值。payload 另有 `dcaPlans` 与 `dcaDailyRates`。

## 定投云端化（2026-10-26，跨设备只扣一次）
- 云端=独立 GitHub Gist（`src/api/dcaCloud.ts`，文件名 `dca-sync.json`、描述 `定投计划云端同步`，刻意避开整库备份 gist 定位规则）。唯一入口 `executeDueDCAsCloud(today)`（`src/utils/dca.ts`）；调用方：DCAPage/PanoramaDashboard/Home.vue 手机端。
- 确定性交易 id `dcaTradeId(planId,date)=dca_<planId>_<date>`——幂等基石。⚠️ planId 本身以 `dca_` 开头，禁止靠字符串反解 planId。
- 幂等两层：本地 `lastExecutedDate===today` 且 确定性 trade id 已存在→跳过。四分支：云端 done→幂等恢复；claimed 他人未超时(5min)→退避；无/过期→认领→二次校验→本地执行→发 done；本机已执行云端无台账→补发。
- `reconcilePlans` TODAY-GUARD：`updatedAt` 较新者胜（后改者胜）；执行标记取日期较大者（防陈旧云端抹掉今天已执行）。`DCAPlan` 新增 `updatedAt?`；add/update 打戳。手机端须配 GitHub Token 否则退化纯本地。

## 全景大屏（PanoramaDashboard.vue）
- 4列：0=Portfolio 1=K线全景 2=量化观察+AI追踪 3=交易记录+AI分析。flex+百分比 flexBasis，列间 resizer（12px/3px），拖拽守恒总和100%，`MIN_WIDTH=15%`。默认 `[37,28,35]`。左列账户块拖拽：⋮⋮ 手柄排序（`panorama_account_order`）、块间 resizer 调高（`panorama_account_heights`，`MIN_ACCOUNT_HEIGHT=80`）。隐藏底栏 `hiddenTabbarPages` 含 panorama；离开 `setTabbarForceShow(false)`。交易记录按实际有交易自然日倒序（见 `tradeDateStats`），第二列星标K线传 `:live-data="liveFundData"`。

## 账户收益曲线（2026-10-17）
- 每个账户头部 sparkline（58×18 全景 / 46×16 手机），组件 `src/components/AccountReturnCurve.vue`，读 `getIntradaySeries(todayKey,accountKey)` 画 SVG，涨红跌绿，含0基线虚线；<2点占位不画。数据层 `src/utils/intradayReturn.ts`：`recordIntradaySamples` 仅交易时段（工作日 9:30=570~15:00=900 分钟）落盘 `localStorage['intraday_return_series']`（中性 key 已登记白名单），每天每账户封顶320点、保留5天。采样钩子在 `stores/holding.ts` 的 `refreshEstimates()` finally 调 `recordAccountReturnSamples()`（聚合 ali/TX/JD/other 的 marketValue/todayProfit，observe 跳过）。数据缺口铁律：系统没开的那段交易时间无采样→左侧留白。

## 通用坑
- Home.vue 桌面/移动两套 UI（2026-10-17 事故）：`.home-holdings-desktop`（原版）+ `.home-holdings-mobile`（手机分块），各自媒体查询切换。**改手机端绝不动物端，反之亦然**。外层切换容器勿复用 `.web-only`/`.mobile-only`（`.web-only.web-only{display:flex}` 命中所有）。
- 构建 `npm run build` 失败（arm64 缺 x64 rollup，与代码无关）；验证用 `npx vue-tsc -b`（退出码0）。
- Vue3 Boolean prop 不带 `withDefaults`→未传解析为 false 非 undefined；「默认 true」必须 `withDefaults(...,{x:true})`。父级 scoped CSS 写子组件内部须 `:deep()`。
- Playwright mock：`**/pingzhongdata/*.js`→`var fS_name=..;var Data_netWorthTrend=[...]`；`fundgz` 回调名运行时 `fundgz_<ts>` 扫描 window；`**/*.js*` 才匹配带 `?v=`；`page.clock.install()` 须在 `goto` 前。探针改 60000→3000，完事 `grep PROBE-TEMP` 确认无残留。
- MiniKLineChart 窄图信息条（`width<280 && height>=130` 两行）用 `computeLayout` 共用；`topRightReserve` 让开右上按钮，改按钮只动 `StarKLinePanel.controlReserve`。

## 量化观察账户 & 删除语义（2026-09-20）
- 量化观察= `holdingStore.holdings` 里 `source==='observe'` 的账户，和 ali/TX/JD 平级，单独显示。删除语义：任意处「删除这个基金」=从账户（持仓）移除全渠道一致。删持仓需保持「删基金=持仓+自选一起清」（`removeHolding` 末尾 `removeFromWatchlist`，`fundStore.removeFund` 末尾 `useHoldingStore().removeHolding`，互调幂等）。
