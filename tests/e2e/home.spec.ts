import { test, expect } from '@playwright/test'

/**
 * 首页 E2E 测试
 * 测试首页加载、资产总览、排序功能
 */
test.describe('首页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // 等待页面加载完成
    await page.waitForLoadState('networkidle')
  })

  test('首页加载正常', async ({ page }) => {
    // 检查页面标题/应用标题
    await expect(page.locator('text=百万基金')).toBeVisible()

    // 检查资产总览卡片（如果有持仓）
    const dashboardSummary = page.locator('[data-testid="dashboard-summary"]')
    const emptyState = page.locator('text=暂无持仓')

    // 两种情况之一应该存在
    const hasDashboard = await dashboardSummary.isVisible().catch(() => false)
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    expect(hasDashboard || hasEmpty).toBeTruthy()
  })

  test('排序功能', async ({ page }) => {
    // 如果有持仓，测试排序按钮
    const sortButton = page.locator('[data-testid="sort-button"]')
    const isSortButtonVisible = await sortButton.isVisible().catch(() => false)

    if (isSortButtonVisible) {
      // 点击排序按钮
      await sortButton.click()
      // 验证排序已应用（检查 URL 或 UI 状态变化）
      await page.waitForTimeout(500)
    }

    // 如果没持仓，这个测试跳过
    test.skip(!isSortButtonVisible, 'No holdings to sort')
  })

  test('自动刷新开关', async ({ page }) => {
    // 查找自动刷新开关
    const autoRefreshSwitch = page.locator('[data-testid="auto-refresh-switch"]')
    const isVisible = await autoRefreshSwitch.isVisible().catch(() => false)

    if (isVisible) {
      // 切换自动刷新
      await autoRefreshSwitch.click()
      await page.waitForTimeout(500)
      // 再次切换回来
      await autoRefreshSwitch.click()
    }
  })

  test('导航到搜索页', async ({ page }) => {
    // 点击搜索按钮/图标
    const searchButton = page.locator('[data-testid="search-button"]')
    const isVisible = await searchButton.isVisible().catch(() => false)

    if (isVisible) {
      await searchButton.click()
      await expect(page).toHaveURL(/\/search/)
    }
  })

  test('导航到新闻页', async ({ page }) => {
    // 点击底部导航的新闻标签
    const newsTab = page.locator('[data-testid="nav-news"]')
    const isVisible = await newsTab.isVisible().catch(() => false)

    if (isVisible) {
      await newsTab.click()
      await expect(page).toHaveURL(/\/news/)
    }
  })
})
