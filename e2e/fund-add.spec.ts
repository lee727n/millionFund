// [WHY] 基金添加流程 E2E 测试 — 验证添加基金功能正常工作
// [WHAT] 测试搜索基金、添加基金、验证列表更新、验证本地存储
// [DEPS] @playwright/test、./mock-api、./pages/fund-search.page、./pages/fund-list.page

import { test, expect } from '@playwright/test'
import { setupMockAPI, waitForPageLoad } from './mock-api'
import { FundSearchPage } from './pages/fund-search.page'
import { FundListPage } from './pages/fund-list.page'

/**
 * 基金添加流程 E2E 测试
 */
test.describe('基金添加流程', () => {
  let searchPage: FundSearchPage
  let listPage: FundListPage

  /**
   * 每个测试前的设置
   */
  test.beforeEach(async ({ page }) => {
    // 设置 Mock API
    await setupMockAPI(page)

    // 初始化页面对象
    searchPage = new FundSearchPage(page)
    listPage = new FundListPage(page)

    // 导航到搜索页
    await searchPage.goto()
    await waitForPageLoad(page)
  })

  /**
   * 测试：搜索基金并添加
   */
  test('should search and add fund', async ({ page }) => {
    // 获取添加前的基金数量
    await listPage.goto()
    const initialCount = await listPage.getFundCount()

    // 搜索基金
    await searchPage.goto()
    await searchPage.search('000001')

    // 添加基金
    await searchPage.addFund(0)

    // 返回列表页，验证基金已添加
    await listPage.goto()
    await waitForPageLoad(page)
    const newCount = await listPage.getFundCount()
    expect(newCount).toBe(initialCount + 1)
  })

  /**
   * 测试：验证基金已添加到列表
   */
  test('should display added fund in list', async ({ page }) => {
    // 搜索并添加基金
    await searchPage.search('000001')
    await searchPage.addFund(0)

    // 返回列表页
    await listPage.goto()
    await waitForPageLoad(page)

    // 验证基金在列表中
    const isInList = await listPage.isFundInList('000001')
    expect(isInList).toBe(true)
  })

  /**
   * 测试：验证持仓数据正确更新
   */
  test('should update holding data after adding fund', async ({ page }) => {
    // 搜索并添加基金
    await searchPage.search('000001')
    await searchPage.addFund(0)

    // 返回列表页
    await listPage.goto()
    await waitForPageLoad(page)

    // 验证基金估值显示
    const valuation = await listPage.getFundValuation('000001')
    expect(valuation).not.toBe('')
  })

  /**
   * 测试：验证本地存储已更新
   */
  test('should update localStorage after adding fund', async ({ page }) => {
    // 搜索并添加基金
    await searchPage.search('000001')
    await searchPage.addFund(0)

    // [FIX] 等待 localStorage 异步保存完成
    await page.waitForTimeout(2000)

    // 验证本地存储（自选列表的键名是 fund_watchlist，存储格式是字符串数组）
    const watchlistData = await page.evaluate(() => {
      const data = localStorage.getItem('fund_watchlist')
      return data ? JSON.parse(data) : null
    })

    expect(watchlistData).not.toBeNull()
    expect(watchlistData).toContain('000001')
  })

  /**
   * 测试：重复添加同一基金
   */
  test('should not duplicate fund when adding same fund twice', async ({ page }) => {
    // 搜索并添加基金
    await searchPage.search('000001')
    await searchPage.addFund(0)

    // 尝试再次添加
    await searchPage.search('000001')
    await searchPage.addFund(0)

    // 返回列表页，验证基金数量
    await listPage.goto()
    await waitForPageLoad(page)
    const count = await listPage.getFundCount()
    expect(count).toBe(1) // 应该只有一只基金，不是两只
  })

  /**
   * 测试：添加多只基金
   */
  test('should add multiple funds', async ({ page }) => {
    // 添加第一只基金
    await searchPage.search('000001')
    await searchPage.addFund(0)

    // 添加第二只基金
    await searchPage.search('110022')
    await searchPage.addFund(0)

    // 返回列表页，验证基金数量
    await listPage.goto()
    await waitForPageLoad(page)
    const count = await listPage.getFundCount()
    expect(count).toBe(2)
  })
})
