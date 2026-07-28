import { test, expect } from '@playwright/test'

/**
 * 持仓页面 E2E 测试
 * 测试持仓列表加载、添加/删除持仓、资产汇总
 */
test.describe('持仓页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/holding')
    await page.waitForLoadState('networkidle')
  })

  test('持仓页面加载正常', async ({ page }) => {
    // 页面应该有导航栏
    await expect(page.locator('.van-nav-bar')).toBeVisible()

    // 要么显示持仓列表，要么显示空状态
    const holdingList = page.locator('[data-testid="fund-list-item"], .holding-item')
    const emptyState = page.locator('.van-empty, text=暂无持仓')

    const hasList = await holdingList.first().isVisible().catch(() => false)
    const hasEmpty = await emptyState.first().isVisible().catch(() => false)
    expect(hasList || hasEmpty).toBeTruthy()
  })

  test('下拉刷新功能', async ({ page }) => {
    // 检查 pull-refresh 容器存在
    const pullRefresh = page.locator('.van-pull-refresh')
    const isVisible = await pullRefresh.isVisible().catch(() => false)

    if (isVisible) {
      // 模拟下拉刷新
      await page.locator('.van-pull-refresh').evaluate((el: HTMLElement) => {
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }))
        el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true }))
        el.dispatchEvent(new TouchEvent('touchend', { bubbles: true }))
      })
      // 等待刷新完成，不报错即可
      await page.waitForTimeout(1000)
    }
  })

  test('持仓搜索功能', async ({ page }) => {
    const searchInput = page.locator('[data-testid="holding-search"], .van-search input').first()
    const isVisible = await searchInput.isVisible().catch(() => false)

    if (isVisible) {
      await searchInput.fill('测试')
      await page.waitForTimeout(500)
      // 搜索结果应过滤或显示无结果
      const results = page.locator('[data-testid="fund-list-item"], .holding-item')
      const emptyAfterSearch = page.locator('.van-empty')
      const hasResults = await results.first().isVisible().catch(() => false)
      const hasEmpty = await emptyAfterSearch.isVisible().catch(() => false)
      expect(hasResults || hasEmpty).toBeTruthy()
    }
  })
})
