// [WHY] 资产总览页 POM — 封装资产总览页的元素选择器和操作方法
// [WHAT] 提供总资产、走势图、资产分配、持仓列表的验证方法
// [DEPS] @playwright/test

import { type Page, type Locator, expect } from '@playwright/test'

/**
 * 资产总览页 Page Object Model
 */
export class PortfolioPage {
  readonly page: Page

  // 页面元素定位器
  readonly pageContainer: Locator
  readonly pageTitle: Locator
  readonly summaryCard: Locator
  readonly totalAssetLabel: Locator
  readonly totalAssetValue: Locator
  readonly todayChangeLabel: Locator
  readonly todayChangeValue: Locator
  readonly totalProfitLabel: Locator
  readonly totalProfitValue: Locator
  readonly trendSection: Locator
  readonly trendTabs: Locator
  readonly chartContainer: Locator
  readonly allocationSection: Locator
  readonly pieChart: Locator
  readonly pieTotal: Locator
  readonly pieLegend: Locator
  readonly barChart: Locator
  readonly toggleBtn: Locator
  readonly holdingsSection: Locator
  readonly holdingItems: Locator

  /**
   * 构造函数
   * @param page - Playwright Page 对象
   */
  constructor(page: Page) {
    this.page = page

    // 初始化元素定位器（使用更稳定的选择器）
    this.pageContainer = page.locator('.portfolio-page')
    this.pageTitle = page.locator('.page-title')
    this.summaryCard = page.locator('.summary-card')
    this.totalAssetLabel = page.locator('.summary-card .summary-item .label').first()
    this.totalAssetValue = page.locator('.summary-card .summary-item .value').first()
    this.todayChangeLabel = page.locator('.summary-card .summary-item-small .label').first()
    this.todayChangeValue = page.locator('.summary-card .summary-item-small .value-small').first()
    this.totalProfitLabel = page.locator('.summary-card .summary-item-small .label').last()
    this.totalProfitValue = page.locator('.summary-card .summary-item-small .value-small').last()
    this.trendSection = page.locator('.section-card:has(.section-title:has-text("资产走势"))')
    this.trendTabs = page.locator('.trend-tab')
    this.chartContainer = page.locator('.chart-container')
    this.allocationSection = page.locator('.section-card:has(.section-title:has-text("资产分配"))')
    this.pieChart = page.locator('.pie-chart')
    this.pieTotal = page.locator('.pie-total')
    this.pieLegend = page.locator('.pie-legend')
    this.barChart = page.locator('.asset-allocation')
    this.toggleBtn = page.locator('.toggle-btn')
    this.holdingsSection = page.locator('.section-card:has(.section-title:has-text("持仓列表"))')
    this.holdingItems = page.locator('.holding-item')
  }

  /**
   * 导航到资产总览页
   */
  async goto(): Promise<void> {
    await this.page.goto('/portfolio')
    await this.page.waitForLoadState('networkidle')
    // 等待 Vue 应用初始化完成
    await this.page.waitForTimeout(500)
  }

  /**
   * 验证页面已加载
   */
  async expectPageLoaded(): Promise<void> {
    await expect(this.pageContainer).toBeVisible()
    await expect(this.pageTitle).toContainText('百万实盘')
  }

  /**
   * 验证总资产显示
   */
  async expectTotalAssetVisible(): Promise<void> {
    await expect(this.totalAssetLabel).toBeVisible()
    await expect(this.totalAssetValue).not.toBeEmpty()
  }

  /**
   * 获取总资产文本
   * @returns 总资产文本
   */
  async getTotalAsset(): Promise<string> {
    return (await this.totalAssetValue.textContent()) || ''
  }

  /**
   * 验证今日盈亏显示
   */
  async expectTodayChangeVisible(): Promise<void> {
    await expect(this.todayChangeLabel).toBeVisible()
    await expect(this.todayChangeValue).not.toBeEmpty()
  }

  /**
   * 验证累计盈亏显示
   */
  async expectTotalProfitVisible(): Promise<void> {
    await expect(this.totalProfitLabel).toBeVisible()
    await expect(this.totalProfitValue).not.toBeEmpty()
  }

  /**
   * 验证走势图区域显示
   */
  async expectTrendChartVisible(): Promise<void> {
    await expect(this.trendSection).toBeVisible()
    await expect(this.chartContainer).toBeVisible()
  }

  /**
   * 切换走势图时间范围
   * @param days - 天数（7、30、90）
   */
  async switchTrendDays(days: number): Promise<void> {
    const tab = this.trendTabs.filter({ hasText: String(days) })
    if (await tab.count() > 0) {
      await tab.first().click()
      await this.page.waitForTimeout(500)
    }
  }

  /**
   * 验证资产分配区域显示
   */
  async expectAllocationVisible(): Promise<void> {
    await expect(this.allocationSection).toBeVisible()
  }

  /**
   * 切换资产分配视图（饼图/柱状图）
   */
  async toggleAllocationView(): Promise<void> {
    if (await this.toggleBtn.isVisible()) {
      await this.toggleBtn.click()
      await this.page.waitForTimeout(500)
    }
  }

  /**
   * 验证饼图显示
   */
  async expectPieChartVisible(): Promise<void> {
    await expect(this.pieChart).toBeVisible()
  }

  /**
   * 验证柱状图显示
   */
  async expectBarChartVisible(): Promise<void> {
    await expect(this.barChart).toBeVisible()
  }

  /**
   * 获取持仓列表数量
   * @returns 持仓数量
   */
  async getHoldingCount(): Promise<number> {
    return await this.holdingItems.count()
  }

  /**
   * 验证持仓列表显示
   */
  async expectHoldingsVisible(): Promise<void> {
    await expect(this.holdingsSection).toBeVisible()
  }
}
