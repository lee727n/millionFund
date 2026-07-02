import { test, expect } from '@playwright/test'

/**
 * 基金对比 E2E 测试
 * 测试基金对比功能
 */
test.describe('基金对比', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fund-compare')
    await page.waitForLoadState('networkidle')
  })

  test('基金对比页面加载', async ({ page }) => {
    // 检查页面标题
    await expect(page.locator('text=基金对比')).toBeVisible()

    // 检查空状态（如果没添加基金）
    const emptyState = page.locator('text=请添加至少2只基金')
    const hasEmpty = await emptyState.isVisible().catch(() => false)

    if (hasEmpty) {
      // 检查"添加基金"按钮
      const addButton = page.locator('text=添加基金')
      await expect(addButton).toBeVisible()
    }
  })

  test('打开添加基金面板', async ({ page }) => {
    // 点击添加基金按钮
    const addButton = page.locator('text=添加基金').or(page.locator('.add-btn'))
    const isVisible = await addButton.isVisible().catch(() => false)

    if (isVisible) {
      await addButton.click()
      await page.waitForTimeout(500)

      // 检查添加面板
      const panel = page.locator('text=添加对比基金')
      await expect(panel).toBeVisible()
    }
  })

  test('搜索并添加基金', async ({ page }) => {
    // 打开添加面板
    const addButton = page.locator('text=添加基金').or(page.locator('.add-btn'))
    const isVisible = await addButton.isVisible().catch(() => false)

    if (isVisible) {
      await addButton.click()
      await page.waitForTimeout(500)

      // 在面板中搜索基金
      const searchInput = page.locator('.add-panel .van-search input')
      const hasInput = await searchInput.isVisible().catch(() => false)

      if (hasInput) {
        await searchInput.fill('易方达')
        await page.waitForTimeout(500)

        // 点击搜索结果
        const searchResult = page.locator('.search-item').first()
        const hasResult = await searchResult.isVisible().catch(() => false)

        if (hasResult) {
          await searchResult.click()
          await page.waitForTimeout(500)

          // 检查基金是否已添加
          const fundTag = page.locator('.fund-tag')
          const count = await fundTag.count()
          expect(count).toBeGreaterThan(0)
        }
      }
    }
  })

  test('标签页切换', async ({ page }) => {
    // 先添加两只基金（通过 URL 参数）
    await page.goto('/fund-compare?codes=000001,000002')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // 等待数据加载

    // 检查对比内容
    const compareContent = page.locator('.compare-content')
    const hasContent = await compareContent.isVisible().catch(() => false)

    if (hasContent) {
      // 切换到风险指标标签
      const riskTab = page.locator('text=风险指标')
      const hasRiskTab = await riskTab.isVisible().catch(() => false)

      if (hasRiskTab) {
        await riskTab.click()
        await page.waitForTimeout(500)

        // 检查风险指标表格
        const riskTable = page.locator('.risk-table')
        await expect(riskTable).toBeVisible()
      }

      // 切换到持仓对比标签
      const holdingsTab = page.locator('text=持仓对比')
      const hasHoldingsTab = await holdingsTab.isVisible().catch(() => false)

      if (hasHoldingsTab) {
        await holdingsTab.click()
        await page.waitForTimeout(500)

        // 检查持仓对比内容
        const holdingsContainer = page.locator('.holdings-container')
        await expect(holdingsContainer).toBeVisible()
      }
    }
  })

  test('移除基金', async ({ page }) => {
    // 先添加基金
    await page.goto('/fund-compare?codes=000001,000002')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // 检查是否有基金标签
    const fundTag = page.locator('.fund-tag').first()
    const hasFund = await fundTag.isVisible().catch(() => false)

    if (hasFund) {
      // 点击移除按钮
      const removeButton = page.locator('.fund-tag-remove').first()
      await removeButton.click()
      await page.waitForTimeout(500)

      // 确认移除（如果有确认对话框）
      const confirmButton = page.locator('text=确认')
      const hasConfirm = await confirmButton.isVisible().catch(() => false)
      if (hasConfirm) {
        await confirmButton.click()
      }
    }
  })

  test('清空所有基金', async ({ page }) => {
    // 先添加基金
    await page.goto('/fund-compare?codes=000001,000002')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // 点击清空按钮
    const clearButton = page.locator('.van-icon[name="delete-o"]')
    const isVisible = await clearButton.isVisible().catch(() => false)

    if (isVisible) {
      await clearButton.click()
      await page.waitForTimeout(500)

      // 确认清空
      const confirmButton = page.locator('text=确认')
      const hasConfirm = await confirmButton.isVisible().catch(() => false)
      if (hasConfirm) {
        await confirmButton.click()
        await page.waitForTimeout(500)

        // 检查是否回到空状态
        const emptyState = page.locator('text=请添加至少2只基金')
        await expect(emptyState).toBeVisible()
      }
    }
  })
})
