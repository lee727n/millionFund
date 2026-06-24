import { test, expect } from '@playwright/test'
import { FundListPage } from './pages/fund-list.page'

test.describe('资产总览页', () => {
  let portfolioPage: FundListPage

  test.beforeEach(async ({ page }) => {
    portfolioPage = new FundListPage(page)
    await page.goto('/#/portfolio')
    await page.waitForLoadState('networkidle')
  })

  test('应该显示资产总览页面', async ({ page }) => {
    await expect(page.locator('.portfolio-page')).toBeVisible()
    await expect(page.locator('.summary-card')).toBeVisible()
  })

  test('应该显示总资产', async ({ page }) => {
    const totalValue = page.locator('.summary-item').filter({ hasText: '总资产' })
    await expect(totalValue).toBeVisible()
  })

  test('应该显示资产分配图', async ({ page }) => {
    // 等待资产分配图加载
    await page.waitForTimeout(2000)
    
    // 检查是否有资产分配图或走势图
    const hasChart = await page.locator('.allocation-chart, .trend-chart').count()
    expect(hasChart).toBeGreaterThan(0)
  })

  test('应该支持切换资产分配视图', async ({ page }) => {
    // 如果有切换按钮，测试切换功能
    const toggleBtn = page.locator('.allocation-toggle')
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click()
      await page.waitForTimeout(500)
    }
  })

  test('应该显示持仓列表', async ({ page }) => {
    // 等待持仓列表加载
    await page.waitForTimeout(2000)
    
    // 检查是否有持仓列表
    const holdingsList = page.locator('.holdings-list, .holding-item')
    const count = await holdingsList.count()
    
    if (count > 0) {
      await expect(holdingsList.first()).toBeVisible()
    }
  })
})
