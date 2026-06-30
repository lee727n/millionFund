# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.8] - 2026-07-01

### Added (🆕 全品种资产平台)
- **资产总览页面**：支持饼图/条形图双视图切换，展示全品类资产配置
- **统一资产数据模型**：基金/股票/债券/加密货币/大宗商品/期货统一管理
- **加密货币行情**：接入 CoinGecko API（BTC/ETH 等主流币种）
- **A 股实时行情**：批量查询 A 股实时价格
- **美股行情**：接入 Yahoo Finance API（免费无需 Key）
- **港股行情**：接入新浪港股 API
- **可转债支持**：接入集思录 API，完整可转债数据
- **黄金/大宗商品**：新浪财经商品行情
- **期货行情**：新增期货 API + UI 展示
- **持仓卡片**：支持资产类别彩色标签显示
- **首页筛选**：全资产类别筛选功能
- **资讯聚合**：新增资讯 Tab（金十数据/财联社/雪球/资金流向）
- **涨跌提醒系统**：支持设置涨跌幅阈值和定时检查，应用内弹窗通知
- **APK 下载 + CSV 导出**：支持直接下载 APK 和导出持仓 CSV
- **Android 快速构建 workflow**：每次 push main 自动发布 Android 开发版

### Added (🌐 国际化)
- **完整 i18n 国际化**：15 个 View + 11 个 Component 全部支持中英文切换
- **动态版本号**：About 页面版本号从 package.json 动态读取

### Added (🧪 测试)
- **测试覆盖率大幅提升**：从 ~42% 提升至 60.73%（576+ 测试全部通过）
- **组件单元测试**：TrendPrediction/Dividend/Announcement/Home/Portfolio/Trades/Alerts 等
- **Store 单元测试**：theme/network/alerts/holding/release/logger/statistics/commodity/forex
- **E2E 测试**：Portfolio 页面 Playwright E2E 测试（POM 模式）
- **Vue 测试基础设施**：引入 @vue/test-utils，vitest.config.ts 增加 Vue 插件

### Changed
- **Detail.vue 组件拆分**：提取趋势预测、分红记录、基金公告为独立组件
- **存储层异步化**：`storage.ts` 全面改为 async/await
- **JSONP 清零**：核心估值接口全部迁移为 fetch + 正则解析，移除 JSONP 降级逻辑
- **ESLint 零警告**：清理 15+ 文件未使用变量和导入
- **TypeScript strict 模式**：全量通过，类型安全性大幅提升
- **CI/CD 升级**：GitHub Actions 升级至 Node 24 兼容版本，消除弃用警告
- **Windows 便携版构建**：新增 portable target
- **SPA Fallback**：优化路由回退机制

### Fixed 🔧
- **Electron 生产环境 404**：修复所有 `/api/` 请求返回 404 的问题
- **P0 安全漏洞**：移除 `new Function`，用安全解析替代；强化 CSP 策略
- **持有金额 dayChange undefined**：修复 holding store 计算 bug
- **Jin10 API 路径**：修复生产环境相对路径问题
- **Portfolio 首次加载空数据**：修复初始化时数据不显示问题
- **forex 测试语法错误**：修复 6 个 CI 失败测试
- **Home.test.ts 状态泄漏**：防止测试间状态污染
- **Android 构建 Java 版本**：17 → 21 修复构建失败
- **CI 工作流语法**：修复多个 YAML 配置错误

## [1.9.7] - 2026-06-23

### Changed
- **API 层合并**：删除冗余 `fund.ts`，整合至 `fundFast.ts`，减少约 1500 行代码
- **全局变量污染治理**：引入串行化队列工具 `queueGlobalVarScript`，解决 JSONP 数据覆盖问题
- **全平台构建统一**：GitHub Actions 支持 Web + Android + Windows + macOS + Linux 并行构建

### Fixed
- 移除上游遗留 APK 和无关声明

## [1.8.0] - 2026-06-07

### Changed
- 启用 TypeScript strict 模式，修复 233 个类型错误
- 配置 Capacitor allowNavigation，修复原生 WebView 跨域请求
- 添加 404 路由和 scrollBehavior，优化导航体验
- 提取硬编码的基金来源配置，便于扩展

## [1.7.0] - 2026-05-31

### Added
- 添加 Material Design 3 样式系统
- 添加 ProGuard/R8 混淆配置，减小 APK 体积

### Fixed
- 修复 JSONP 全局回调冲突
- 添加 CSP 安全头，防范 XSS 攻击

## [1.0.0] - 2026-05-01

### Added
- 初始版本发布
- 实时估值、自选管理、持仓追踪核心功能
- 支持 Web / Android / iOS / Windows / macOS / Linux 全平台
