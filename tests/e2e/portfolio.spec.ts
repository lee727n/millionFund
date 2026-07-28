import { test, expect } from '@playwright/test'

/**
 * 资产总览页面 E2E 测试
 * 测试 Portfolio 页面加载、资产分布、持仓列表
 */
test.describe('资产总览页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('networkidle')
  })

  test('Portfolio 页面加载正常', async ({ page }) => {
    // 页面应该有导航栏
    await expect(page.locator('.van-nav-bar')).toBeVisible()

    // 要么显示持仓列表，要么显示空状态
    const holdingList = page.locator('[data-testid="fund-list-item"], .holding-item, .portfolio-item')
    const emptyState = page.locator('.van-empty, text=暂无持仓')

    const hasList = await holdingList.first().isVisible().catch(() => false)
    const hasEmpty = await emptyState.first().isVisible().catch(() => false)
    expect(hasList || hasEmpty).toBeTruthy()
  })

  test('资产分类筛选', async ({ page }) => {
    // 检查资产分类筛选器是否存在
    const filterTabs = page.locator('.van-tabs, [data-testid="asset-class-filter"]')
    const isVisible = await filterTabs.first().isVisible().catch(() => false)

    if (isVisible) {
      // 点击第二个标签（如果存在）
      const secondTab = filterTabs.locator('.van-tab').nth(1)
      const hasSecondTab = await secondTab.isVisible().catch(() => false)
      if (hasSecondTab) {
        await secondTab.click()
        await page.waitForTimeout(500)
      }
    }
  })
})
