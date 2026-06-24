// [WHY] 基金搜索流程 E2E 测试 — 验证搜索功能正常工作
// [WHAT] 测试搜索基金、显示搜索结果、验证基金信息
// [DEPS] @playwright/test、./mock-api、./pages/fund-search.page

import { test, expect } from '@playwright/test'
import { setupMockAPI, waitForPageLoad } from './mock-api'
import { FundSearchPage } from './pages/fund-search.page'

/**
 * 基金搜索流程 E2E 测试
 */
test.describe('基金搜索流程', () => {
  let searchPage: FundSearchPage

  /**
   * 每个测试前的设置
   */
  test.beforeEach(async ({ page }) => {
    // 设置 Mock API
    await setupMockAPI(page)

    // 初始化页面对象
    searchPage = new FundSearchPage(page)

    // 导航到搜索页
    await searchPage.goto()
    await waitForPageLoad(page)
  })

  /**
   * 测试：打开首页
   */
  test('should open search page', async ({ page }) => {
    await searchPage.expectPageLoaded()
  })

  /**
   * 测试：在搜索框输入基金代码并搜索
   */
  test('should search fund by code', async ({ page }) => {
    // 搜索基金
    await searchPage.search('000001')

    // 验证搜索结果
    const resultCount = await searchPage.getResultCount()
    expect(resultCount).toBeGreaterThan(0)
  })

  /**
   * 测试：验证搜索结果正确显示
   */
  test('should display correct search results', async ({ page }) => {
    // 搜索基金
    await searchPage.search('000001')

    // 验证搜索结果包含期望的基金
    await searchPage.expectResultContains('000001', '华夏成长混合')
  })

  /**
   * 测试：验证基金名称、净值、估值等信息正确
   */
  test('should display fund information correctly', async ({ page }) => {
    // 搜索基金
    await searchPage.search('000001')

    // 验证搜索结果中的基金信息
    const resultInfo = await searchPage.getResultInfo(0)
    expect(resultInfo.code).toBe('000001')
    expect(resultInfo.name).toContain('华夏')
  })

  /**
   * 测试：搜索不存在的基金
   */
  test('should show empty result for non-existent fund', async ({ page }) => {
    // 搜索不存在的基金
    await searchPage.search('999999')

    // 验证搜索结果为空
    await searchPage.expectEmptyResult()
  })

  /**
   * 测试：清空搜索框
   */
  test('should clear search input', async ({ page }) => {
    // 输入搜索关键词
    await searchPage.searchInput.fill('000001')
    expect(await searchPage.searchInput.inputValue()).toBe('000001')

    // 清空搜索框
    await searchPage.clearSearch()
    expect(await searchPage.searchInput.inputValue()).toBe('')
  })

  /**
   * 测试：搜索基金名称（而不是代码）
   */
  test('should search fund by name', async ({ page }) => {
    // 搜索基金名称
    await searchPage.search('华夏')

    // 验证搜索结果
    const resultCount = await searchPage.getResultCount()
    expect(resultCount).toBeGreaterThan(0)
  })
})
