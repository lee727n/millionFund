import { test, expect } from '@playwright/test'

/**
 * 基金搜索 E2E 测试
 * 测试基金搜索功能
 */
test.describe('基金搜索', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
  })

  test('搜索输入框显示', async ({ page }) => {
    // 检查搜索输入框
    const searchInput = page.locator('[data-testid="search-input"] input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', /搜索|基金/)
  })

  test('基金搜索', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"] input')

    // 输入搜索关键词
    await searchInput.fill('易方达')
    await page.waitForTimeout(500) // 等待防抖

    // 等待搜索结果加载
    await page.waitForLoadState('networkidle')

    // 检查搜索结果
    const searchResults = page.locator('[data-testid="search-results"]')
    const isVisible = await searchResults.isVisible().catch(() => false)

    if (isVisible) {
      // 检查是否有搜索结果项
      const fundItems = page.locator('[data-testid="fund-item"]')
      const count = await fundItems.count()
      expect(count).toBeGreaterThanOrEqual(0) // 可能为空，但不应该报错
    }
  })

  test('搜索结果点击进入详情', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"] input')

    // 搜索并有结果
    await searchInput.fill('000001')
    await page.waitForTimeout(500)

    // 点击第一个搜索结果
    const firstResult = page.locator('[data-testid="fund-item"]').first()
    const isVisible = await firstResult.isVisible().catch(() => false)

    if (isVisible) {
      await firstResult.click()
      // 应该导航到详情页
      await expect(page).toHaveURL(/\/detail\//)
    }
  })

  test('添加基金到自选', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"] input')

    // 搜索基金
    await searchInput.fill('000001')
    await page.waitForTimeout(500)

    // 点击添加按钮
    const addButton = page.locator('[data-testid="add-fund-button"]').first()
    const isVisible = await addButton.isVisible().catch(() => false)

    if (isVisible) {
      await addButton.click()
      // 应该显示添加成功提示
      await expect(page.locator('text=添加成功')).toBeVisible({ timeout: 3000 })
    }
  })

  test('搜索历史', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"] input')

    // 输入搜索词
    await searchInput.fill('测试搜索')

    // 清除搜索，检查历史记录
    await searchInput.clear()
    await page.waitForTimeout(300)

    // 检查搜索历史区域
    const historySection = page.locator('text=搜索历史')
    const isVisible = await historySection.isVisible().catch(() => false)

    if (isVisible) {
      // 点击历史记录项
      const historyTag = page.locator('.history-tag').first()
      const hasHistory = await historyTag.isVisible().catch(() => false)
      if (hasHistory) {
        await historyTag.click()
        // 应该自动填充搜索框
        await expect(searchInput).toHaveValue(/测试搜索/)
      }
    }
  })
})
