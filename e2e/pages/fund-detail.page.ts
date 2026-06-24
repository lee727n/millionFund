// [WHY] 基金详情页 POM — 封装基金详情页的元素选择器和操作方法
// [WHAT] 提供页面导航、查看估值、查看历史净值、刷新等方法
// [DEPS] @playwright/test

import { type Page, type Locator, expect } from '@playwright/test'

/**
 * 基金详情页 Page Object Model
 */
export class FundDetailPage {
  readonly page: Page

  // 页面元素定位器
  readonly fundName: Locator
  readonly fundCode: Locator
  readonly valuation: Locator
  readonly valuationChange: Locator
  readonly historyNavLink: Locator
  readonly periodReturnSection: Locator
  readonly refreshButton: Locator
  readonly backButton: Locator
  readonly loadingIndicator: Locator
  readonly chartContainer: Locator

  /**
   * 构造函数
   * @param page - Playwright Page 对象
   */
  constructor(page: Page) {
    this.page = page

    // 初始化元素定位器（使用 data-test-id 属性）
    this.fundName = page.locator('[data-test-id="fund-name"]')
    this.fundCode = page.locator('[data-test-id="fund-code"]')
    this.valuation = page.locator('[data-test-id="valuation"]')
    this.valuationChange = page.locator('[data-test-id="valuation-change"]')
    this.historyNavLink = page.locator('[data-test-id="history-nav"]')
    this.periodReturnSection = page.locator('[data-test-id="period-return"]')
    this.refreshButton = page.locator('[data-test-id="refresh-button"]')
    this.backButton = page.locator('[data-test-id="back-button"]')
    this.loadingIndicator = page.locator('[data-test-id="loading"]')
    this.chartContainer = page.locator('[data-test-id="chart-container"]')
  }

  /**
   * 导航到基金详情页
   * @param code - 基金代码
   */
  async goto(code: string): Promise<void> {
    await this.page.goto(`/detail/${code}`)
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 获取基金名称
   * @returns 基金名称
   */
  async getFundName(): Promise<string> {
    return (await this.fundName.textContent()) || ''
  }

  /**
   * 获取基金代码
   * @returns 基金代码
   */
  async getFundCode(): Promise<string> {
    return (await this.fundCode.textContent()) || ''
  }

  /**
   * 获取实时估值
   * @returns 估值数值
   */
  async getValuation(): Promise<string> {
    return (await this.valuation.textContent()) || ''
  }

  /**
   * 获取估值变化
   * @returns 估值变化（包含涨跌百分比）
   */
  async getValuationChange(): Promise<string> {
    return (await this.valuationChange.textContent()) || ''
  }

  /**
   * 点击查看历史净值
   */
  async viewHistory(): Promise<void> {
    await this.historyNavLink.click()
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 刷新估值
   */
  async refreshValuation(): Promise<void> {
    await this.refreshButton.click()
    // 等待刷新完成
    await this.loadingIndicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }

  /**
   * 返回基金列表页
   */
  async goBack(): Promise<void> {
    await this.backButton.click()
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 验证页面已加载
   * @param code - 期望的基金代码
   */
  async expectPageLoaded(code: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`/detail/${code}`))
    await expect(this.fundCode).toContainText(code)
  }

  /**
   * 验证估值显示
   */
  async expectValuationVisible(): Promise<void> {
    await expect(this.valuation).toBeVisible()
    const valuationText = await this.getValuation()
    expect(valuationText).not.toBe('')
  }

  /**
   * 验证历史净值图表显示
   */
  async expectHistoryChartVisible(): Promise<void> {
    await expect(this.chartContainer).toBeVisible()
  }

  /**
   * 验证阶段涨幅显示
   */
  async expectPeriodReturnVisible(): Promise<void> {
    await expect(this.periodReturnSection).toBeVisible()
  }

  /**
   * 验证刷新按钮工作
   */
  async expectRefreshWorks(): Promise<void> {
    const valuationBefore = await this.getValuation()
    await this.refreshValuation()
    // 这里只是验证刷新按钮可点击，不验证估值变化（因为可能是相同的）
    await this.expectValuationVisible()
  }

  /**
   * 等待估值自动刷新（用于测试智能刷新功能）
   * @param timeout - 超时时间（毫秒），默认 10000
   */
  async waitForAutoRefresh(timeout: number = 10000): Promise<void> {
    // 记录初始估值
    const initialValuation = await this.getValuation()

    // 等待估值变化或超时
    await this.page.waitForFunction(
      async (initial) => {
        const current = document.querySelector('[data-test-id="valuation"]')?.textContent
        return current !== initial
      },
      initialValuation,
      { timeout }
    )
  }
}
