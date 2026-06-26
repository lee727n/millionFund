# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 涨跌提醒系统：支持设置涨跌幅阈值和定时检查，触发时应用内弹窗通知
- 提醒规则持久化：基于 Pinia store + localStorage

### Fixed
- 修复 Electron 生产环境所有 `/api/` 请求返回 404 的问题
- 大幅减少 JSONP 使用：核心估值接口迁移为 fetch + text() + 正则解析
- 统一错误处理架构：新增 `errorHandler.ts`

### Changed
- ESLint 零警告，TypeScript strict 模式全量通过

## [1.9.8] - 2026-06-27

### Added
- 新增组件单元测试：`TrendPredictionSection`、`DividendRecordsSection`、`FundAnnouncementsSection`，共 29 个测试用例
- 引入 `@vue/test-utils` 支持 Vue 组件测试，`vitest.config.ts` 增加 Vue 插件
- 新增 Portfolio 页面 E2E 测试 POM 和测试用例

### Changed
- 拆分 `Detail.vue`：提取趋势预测、分红记录、基金公告 3 个独立组件
- 存储层异步化：`storage.ts` 全面改为 async/await
- 版本号统一升级至 1.9.8

### Fixed
- 清理 15+ 文件中的未使用变量和导入，ESLint 零警告
- 删除敏感数据文件 `holdings-calculation.json`

## [1.9.0] - 2026-06-14

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
