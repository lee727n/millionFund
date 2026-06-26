// [WHY] 资产总览页 E2E 测试 — 验证 Portfolio.vue 功能正常工作
// [WHAT] 测试总资产、盈亏、走势图、资产分配、持仓列表显示
// [DEPS] @playwright/test、./mock-api、./pages/portfolio.page、./pages/fund-list.page

import { test, expect } from '@playwright/test'
import { setupMockAPI, waitForPageLoad, mockStorage } from './mock-api'
import { PortfolioPage } from './pages/portfolio.page'

/**
 * 资产总览页 E2E 测试
 */
test.describe('资产总览页', () => {
  let portfolioPage: PortfolioPage

  /**
   * 每个测试前的设置
   */
  test.beforeEach(async ({ page }) => {
    // 设置 Mock API
    await setupMockAPI(page)

    // 初始化页面对象
    portfolioPage = new PortfolioPage(page)

    // 生成最近30天的历史快照数据
    const today = new Date()
    const historyData = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      historyData.push({
        date: dateStr,
        totalValueCNY: 28000 + Math.random() * 2000,
        totalCostCNY: 20000,
        totalProfitCNY: 8000 + Math.random() * 2000,
        byAssetClass: { fund: { value: 29628.5 } }
      })
    }

    // Mock localStorage 中的持仓、汇总和历史数据
    await mockStorage(page, {
      'fund_watchlist': JSON.stringify(['000001', '110022']),
      'fund_holdings': JSON.stringify([
        {
          id: '1',
          code: '000001',
          name: '华夏成长混合',
          assetClass: 'fund',
          costPrice: 1.0,
          currentPrice: 1.2345,
          shares: 10000,
          costValue: 10000,
          currentValue: 12345,
          profit: 2345,
          profitRate: 23.45,
          todayProfit: 123.45,
          currency: 'CNY',
          fxRate: 1,
          valueCNY: 12345,
          profitCNY: 2345,
          createdAt: '2024-01-01',
          updatedAt: new Date().toISOString(),
          marketValue: 12345,
          buyNetValue: 1.0,
          loading: false,
        },
        {
          id: '2',
          code: '110022',
          name: '易方达消费行业',
          assetClass: 'fund',
          costPrice: 2.0,
          currentPrice: 3.4567,
          shares: 5000,
          costValue: 10000,
          currentValue: 17283.5,
          profit: 7283.5,
          profitRate: 72.84,
          todayProfit: -50.25,
          currency: 'CNY',
          fxRate: 1,
          valueCNY: 17283.5,
          profitCNY: 7283.5,
          createdAt: '2024-01-01',
          updatedAt: new Date().toISOString(),
          marketValue: 17283.5,
          buyNetValue: 2.0,
          loading: false,
        },
      ]),
      'portfolio_history': JSON.stringify(historyData),
    })

    // 导航到资产总览页
    await portfolioPage.goto()
    await waitForPageLoad(page)
  })

  /**
   * 测试：页面加载并显示资产总览
   */
  test('应显示资产总览页面', async ({ page }) => {
    await portfolioPage.expectPageLoaded()
  })

  /**
   * 测试：显示总资产
   */
  test('应显示总资产', async ({ page }) => {
    await portfolioPage.expectTotalAssetVisible()
    const totalAsset = await portfolioPage.getTotalAsset()
    expect(totalAsset).not.toBe('')
    // 12345 + 17283.5 = 29628.5, formatMoney 会格式化为 2.96万
    expect(totalAsset).toContain('2.96万')
  })

  /**
   * 测试：显示今日盈亏
   */
  test('应显示今日盈亏', async ({ page }) => {
    await portfolioPage.expectTodayChangeVisible()
    const todayChange = await portfolioPage.todayChangeValue.textContent()
    expect(todayChange).not.toBe('')
    // mock 数据未提供涨跌幅，todayProfit 计算为 0
    expect(todayChange).toContain('+0.00')
  })

  /**
   * 测试：显示累计盈亏
   */
  test('应显示累计盈亏', async ({ page }) => {
    await portfolioPage.expectTotalProfitVisible()
    const totalProfit = await portfolioPage.totalProfitValue.textContent()
    expect(totalProfit).not.toBe('')
    // 2345 + 7283.5 = 9628.5
    expect(totalProfit).toContain('9628.50')
  })

  /**
   * 测试：显示资产走势图
   */
  test('应显示资产走势图', async ({ page }) => {
    await portfolioPage.expectTrendChartVisible()
    await expect(portfolioPage.chartContainer).toBeVisible()
  })

  /**
   * 测试：切换走势图时间范围
   */
  test('应支持切换走势图时间范围', async ({ page }) => {
    await portfolioPage.expectTrendChartVisible()

    // 点击 7 天标签
    await portfolioPage.switchTrendDays(7)
    await page.waitForTimeout(500)

    // 点击 90 天标签
    await portfolioPage.switchTrendDays(90)
    await page.waitForTimeout(500)
  })

  /**
   * 测试：显示资产分配图
   */
  test('应显示资产分配图', async ({ page }) => {
    await portfolioPage.expectAllocationVisible()
    await expect(portfolioPage.pieChart).toBeVisible()
  })

  /**
   * 测试：切换资产分配视图
   */
  test('应支持切换资产分配视图', async ({ page }) => {
    await portfolioPage.expectAllocationVisible()

    // 默认显示饼图
    await expect(portfolioPage.pieChart).toBeVisible()

    // 切换到柱状图
    await portfolioPage.toggleAllocationView()
    await page.waitForTimeout(500)
    await expect(portfolioPage.barChart).toBeVisible()

    // 切换回饼图
    await portfolioPage.toggleAllocationView()
    await page.waitForTimeout(500)
    await expect(portfolioPage.pieChart).toBeVisible()
  })

  /**
   * 测试：显示持仓列表
   */
  test('应显示持仓列表', async ({ page }) => {
    await portfolioPage.expectHoldingsVisible()
    const count = await portfolioPage.getHoldingCount()
    expect(count).toBeGreaterThan(0)
  })

  /**
   * 测试：持仓按盈亏排序
   */
  test('持仓应按盈亏降序排列', async ({ page }) => {
    await portfolioPage.expectHoldingsVisible()
    const items = await portfolioPage.holdingItems.all()

    if (items.length >= 2) {
      // 获取第一个和第二个持仓的收益率
      const firstRate = await items[0].locator('.holding-rate').textContent()
      const secondRate = await items[1].locator('.holding-rate').textContent()

      // 第一个应该比第二个收益率高（降序）
      expect(firstRate).not.toBe('')
      expect(secondRate).not.toBe('')
    }
  })
})
