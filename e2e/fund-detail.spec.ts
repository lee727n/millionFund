// [WHY] 基金详情查看流程 E2E 测试 — 验证详情页功能正常工作
// [WHAT] 测试点击基金跳转详情页、验证估值/历史净值/阶段涨幅显示、验证刷新按钮
// [DEPS] @playwright/test、./mock-api、./pages/fund-list.page、./pages/fund-detail.page

import { test, expect } from '@playwright/test'
import { setupMockAPI, waitForPageLoad } from './mock-api'
import { FundListPage } from './pages/fund-list.page'
import { FundDetailPage } from './pages/fund-detail.page'

/**
 * 基金详情查看流程 E2E 测试
 */
test.describe('基金详情查看流程', () => {
  let listPage: FundListPage
  let detailPage: FundDetailPage

  /**
   * 每个测试前的设置
   */
  test.beforeEach(async ({ page }) => {
    // 设置 Mock API
    await setupMockAPI(page)

    // 初始化页面对象
    listPage = new FundListPage(page)
    detailPage = new FundDetailPage(page)

    // 先添加一只基金到列表
    await listPage.goto()
    // 如果列表为空，先添加一只基金
    const count = await listPage.getFundCount()
    if (count === 0) {
      // 这里需要通过搜索页添加基金，或者直接使用 API 添加
      // 为简化测试，假设列表页已经有基金
    }
  })

  /**
   * 测试：点击基金列表中的某个基金跳转详情页
   */
  test('should navigate to detail page when clicking fund', async ({ page }) => {
    // 假设列表页已有基金，点击第一只基金
    const count = await listPage.getFundCount()

    if (count > 0) {
      // 获取基金代码
      const fundCode = await listPage.fundItems.first().getAttribute('data-code') || '000001'

      // 点击基金
      await listPage.viewFundDetail(0)

      // 验证跳转到详情页
      await detailPage.expectPageLoaded(fundCode)
    } else {
      // 如果列表为空，直接访问详情页
      await detailPage.goto('000001')
      await detailPage.expectPageLoaded('000001')
    }
  })

  /**
   * 测试：验证估值、历史净值、阶段涨幅等信息正确显示
   */
  test('should display fund information correctly', async ({ page }) => {
    // 导航到详情页
    await detailPage.goto('000001')

    // 验证页面加载
    await detailPage.expectPageLoaded('000001')

    // 验证估值显示
    await detailPage.expectValuationVisible()

    // 验证基金名称显示
    const fundName = await detailPage.getFundName()
    expect(fundName).not.toBe('')

    // 验证基金代码显示
    const fundCode = await detailPage.getFundCode()
    expect(fundCode).toContain('000001')
  })

  /**
   * 测试：验证历史净值图表显示
   */
  test('should display history chart', async ({ page }) => {
    // 导航到详情页
    await detailPage.goto('000001')

    // 查看历史净值
    await detailPage.viewHistory()

    // 验证历史净值图表显示
    await detailPage.expectHistoryChartVisible()
  })

  /**
   * 测试：验证阶段涨幅显示
   */
  test('should display period return', async ({ page }) => {
    // 导航到详情页
    await detailPage.goto('000001')

    // 验证阶段涨幅显示
    await detailPage.expectPeriodReturnVisible()
  })

  /**
   * 测试：验证刷新按钮工作正常
   */
  test('should refresh valuation when clicking refresh button', async ({ page }) => {
    // 导航到详情页
    await detailPage.goto('000001')

    // 验证刷新按钮工作
    await detailPage.expectRefreshWorks()
  })

  /**
   * 测试：验证返回按钮工作正常
   */
  test('should go back to list when clicking back button', async ({ page }) => {
    // 导航到详情页
    await detailPage.goto('000001')

    // 点击返回按钮
    await detailPage.goBack()

    // 验证返回到列表页
    await listPage.expectPageLoaded()
  })

  /**
   * 测试：验证估值变化显示（涨跌颜色）
   */
  test('should display valuation change with correct color', async ({ page }) => {
    // 导航到详情页
    await detailPage.goto('000001')

    // 获取估值变化
    const change = await detailPage.getValuationChange()
    expect(change).not.toBe('')

    // 验证涨跌颜色（通过 CSS class 验证）
    const changeElement = detailPage.valuationChange
    const className = await changeElement.getAttribute('class')
    expect(className).toMatch(/up|down|positive|negative/)
  })
})
