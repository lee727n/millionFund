# AI百万实盘

一款功能丰富的开源基金管理系统，支持 **Web / Android / iOS / Windows / macOS / Linux** 全平台。提供自选基金实时估值、持仓盈亏管理、AI 调仓追踪、涨跌提醒、趋势分析、市场概览等功能。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Vue](https://img.shields.io/badge/Vue-3.x-brightgreen.svg)
![Capacitor](https://img.shields.io/badge/Capacitor-7.x-blue.svg)
![Platform](https://img.shields.io/badge/Platform-全平台-green.svg)
![Version](https://img.shields.io/badge/version-1.9.8-orange.svg)

> [GitHub 仓库](https://github.com/ghshhf/millionFund) | [在线体验](#快速开始) | [更新记录](#更新记录) | [问题反馈](https://github.com/ghshhf/millionFund/issues)

---

## 核心功能

| 功能 | 说明 |
|------|------|
| 实时估值 | 秒级刷新基金实时估值数据（盘中估值 / 收盘净值），支持多数据源 |
| 自选管理 | 添加自选基金，按来源（支付宝 / 腾讯 / 京东）分类筛选 |
| 持仓追踪 | 记录持仓份额和成本，自动计算浮动盈亏和收益率 |
| **涨跌提醒** | 设置涨跌幅阈值，到达条件时自动推送通知（v1.9.8 新增） |
| AI 调仓追踪 | 记录调仓记录，复盘调仓效果，支持成功率统计 |
| 趋势分析 | 包含均线系统、支撑阻力位预测、相关性分析 |
| 市场概览 | 主要 A 股指数、全球指数实时行情 |
| 基金详情 | 完整信息展示，包含分时图、净值走势、持仓分析 |
| 深度数据 | 资产配置、持有人结构、同类排名、风格分析 |
| 资讯动态 | 基金相关新闻与市场资讯聚合 |

## 全平台支持

| 平台 | 构建方式 | 打包产物 |
|------|---------|---------|
| Web | Vite | `dist/` |
| Android | Gradle + Capacitor | `app-release.apk` |
| iOS | Xcode + Capacitor | `ios/App/` 项目 |
| Windows / macOS / Linux | Electron | `electron/` 项目 |

自动化流程：每次提交自动触发 GitHub Actions 多平台并行构建，打 tag 时自动发布到 Releases。

## 更新记录

### v1.9.8 (2026-07-01) - 🆕 全品种资产平台

**全品种资产支持**
- 资产总览页面：饼图/条形图双视图切换，全品类资产配置一览
- 统一资产数据模型：基金/股票/债券/加密货币/大宗商品/期货
- 新增行情 API：A 股、美股（Yahoo Finance）、港股、加密货币（CoinGecko）、可转债（集思录）、黄金/大宗商品（新浪财经）、期货
- 持仓卡片资产类别标签 + 首页全资产类别筛选
- 资讯聚合 Tab（金十数据/财联社/雪球/资金流向）
- APK 下载 + CSV 导出

**涨跌提醒系统 🔔**
- 设置涨跌幅阈值，定时检查，触发时应用内弹窗通知
- 提醒规则持久化（Pinia store + localStorage）

**国际化 🌐**
- 完整 i18n 中英文切换（15 View + 11 Component）
- 版本号自动从 package.json 读取

**质量提升**
- 测试覆盖率 42% → **60.73%**（576+ 测试全过）
- ESLint 零警告，TypeScript strict 全量通过
- JSONP 清零：所有接口迁移为 fetch + 正则解析
- P0 安全漏洞修复：移除 `new Function` + 强化 CSP
- Electron 生产环境 404 修复
- CI/CD 升级至 Node 24 兼容版本
- 组件拆分、存储层异步化、代码清理

### v1.9.0 (2026-06-14) - 架构大重构

- **API 层合并**：删除冗余 `fund.ts`，整合至 `fundFast.ts`，减少约 1500 行代码
- **全局变量污染治理**：引入串行化队列工具 `queueGlobalVarScript`，解决 JSONP 数据覆盖问题
- **全平台构建统一**：GitHub Actions 支持 Web + Android + Windows + macOS + Linux 并行构建
- **代码清洗**：移除上游遗留 APK 和无关声明

### v1.8.0 — TypeScript 强化 & 导航优化

- 启用 TypeScript strict 模式，修复 233 个类型错误
- 配置 Capacitor allowNavigation，修复原生 WebView 跨域请求
- 添加 404 路由和 scrollBehavior，优化导航体验
- 提取硬编码的基金来源配置，便于扩展

### v1.7.0 — 安全加固 & 样式升级

- 添加 Material Design 3 样式系统
- 添加 ProGuard/R8 混淆配置，减小 APK 体积
- 修复 JSONP 全局回调冲突
- 添加 CSP 安全头，防范 XSS 攻击

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/ghshhf/millionFund.git
cd millionFund

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 全平台一键构建

```bash
# 构建所有平台（Web + Android + Electron）
npm run build:all

# 单独构建
npm run build:web       # Web
npm run build:android   # Android APK
npm run build:electron  # 桌面端
```

### Android APK 构建

```bash
npm run build && npx cap sync
cd android && ./gradlew assembleRelease
```

APK 输出：`android/app/build/outputs/apk/release/app-release.apk`

### iOS 构建

```bash
npm run build && npx cap sync ios && npx cap open ios
# 在 Xcode 中选择 Product → Archive
```

### Electron 桌面端

```bash
npm run build:electron
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3 + TypeScript |
| 构建工具 | Vite 7 |
| UI 组件库 | Vant 4（Material Design 3 风格） |
| 移动打包 | Capacitor 7 |
| 桌面打包 | Electron |
| 路由管理 | Vue Router 4 |
| 状态管理 | Pinia 3 |
| 数据可视化 | Lightweight Charts（TradingView） |
| OCR 识别 | Tesseract.js（截图导入功能） |
| CI/CD | GitHub Actions |

## 数据源

本项目所有数据均来自公开免费接口：

| 数据类型 | 数据源 |
|----------|--------|
| 基金估值 / 净值 | 天天基金网（eastmoney）公开 API |
| 股票行情 | 新浪财经公开 API（延迟 ~15 分钟） |
| 加密货币 | CoinGecko 免费 API |
| 市场指数 | 各交易所公开行情接口 |

## 项目结构

```
millionFund/
├── src/
│   ├── api/            # API 数据层（基金/估值/行情/加密货币/股票）
│   ├── views/          # 页面组件（首页/持仓/搜索/详情/提醒/关于...）
│   ├── components/     # 可复用组件（基金卡片/图表/导入等）
│   ├── stores/         # Pinia 状态管理（持仓/提醒/网络状态）
│   ├── composables/    # 组合式函数（提醒检查器等）
│   ├── styles/         # 全局样式
│   └── config/         # 配置文件（版本号/发布地址）
├── android/            # Android 原生项目（Capacitor）
├── ios/                # iOS 原生项目（Capacitor）
├── electron/           # Electron 桌面端
├── scripts/            # 自动化脚本
└── .github/workflows/  # CI/CD 工作流
```

## 免责声明

> 本工具仅供学习交流使用，不构成任何投资建议。基金估值数据仅供参考，以基金公司公布的净值为准。数据刷新有延迟，仅供学习和参考。**投资有风险，理财需谨慎。**

## 开源协议

[MIT License](./LICENSE) © ghshhf
