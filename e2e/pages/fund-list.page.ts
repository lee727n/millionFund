// [WHY] 基金列表页 POM — 封装基金列表页的元素选择器和操作方法
// [WHAT] 提供页面导航、搜索、添加基金、验证列表状态等方法
// [DEPS] @playwright/test

import { type Page, type Locator, expect } from '@playwright/test'

/**
 * 基金列表页 Page Object Model
 */
export class FundListPage {
  readonly page: Page

  // 页面元素定位器
  readonly searchInput: Locator
  readonly searchButton: Locator
  readonly addFundButton: Locator
  readonly fundItems: Locator
  readonly refreshButton: Locator
  readonly loadingIndicator: Locator
  readonly errorMessage: Locator

  /**
   * 构造函数
   * @param page - Playwright Page 对象
   */
  constructor(page: Page) {
    this.page = page

    // 初始化元素定位器（使用 data-test-id 属性）
    this.searchInput = page.locator('[data-test-id="search-input"]')
    this.searchButton = page.locator('[data-test-id="search-button"]')
    this.addFundButton = page.locator('[data-test-id="add-fund-button"]')
    this.fundItems = page.locator('[data-test-id="fund-item"]')
    this.refreshButton = page.locator('[data-test-id="refresh-button"]')
    this.loadingIndicator = page.locator('[data-test-id="loading"]')
    this.errorMessage = page.locator('[data-test-id="error-message"]')
  }

  /**
   * 导航到基金列表页
   */
  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 搜索基金
   * @param code - 基金代码
   */
  async searchFund(code: string): Promise<void> {
    await this.searchInput.fill(code)
    await this.searchButton.click()
    // 等待搜索结果加载
    await this.page.waitForTimeout(1000)
  }

  /**
   * 添加基金到列表
   * @param code - 基金代码
   */
  async addFund(code: string): Promise<void> {
    await this.searchFund(code)
    await this.addFundButton.click()
    // 等待添加完成
    await this.page.waitForTimeout(1000)
  }

  /**
   * 获取基金列表中的基金数量
   * @returns 基金数量
   */
  async getFundCount(): Promise<number> {
    return await this.fundItems.count()
  }

  /**
   * 点击某个基金查看详情
   * @param index - 基金在列表中的索引（从 0 开始）
   */
  async viewFundDetail(index: number = 0): Promise<void> {
    await this.fundItems.nth(index).click()
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 验证基金是否在列表中
   * @param code - 基金代码
   * @returns 是否存在
   */
  async isFundInList(code: string): Promise<boolean> {
    const fundItem = this.page.locator(`[data-testid="fund-item"][data-code="${code}"]`)
    return await fundItem.isVisible()
  }

  /**
   * 获取基金的估值信息
   * @param code - 基金代码
   * @returns 估值信息文本
   */
  async getFundValuation(code: string): Promise<string> {
    const fundItem = this.page.locator(`[data-testid="fund-item"][data-code="${code}"]`)
    const valuation = fundItem.locator('[data-testid="fund-valuation"]')
    return (await valuation.textContent()) || ''
  }

  /**
   * 刷新基金列表
   */
  async refreshList(): Promise<void> {
    await this.refreshButton.click()
    // 等待刷新完成
    await this.loadingIndicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }

  /**
   * 验证页面已加载
   */
  async expectPageLoaded(): Promise<void> {
    await expect(this.page).toHaveTitle(/百万实盘|fund/i)
    await expect(this.searchInput).toBeVisible()
  }

  /**
   * 验证加载状态
   */
  async expectLoading(): Promise<void> {
    await expect(this.loadingIndicator).toBeVisible()
  }

  /**
   * 验证加载完成
   */
  async expectLoaded(): Promise<void> {
    await expect(this.loadingIndicator).toBeHidden()
  }

  /**
   * 验证错误信息
   * @param message - 期望的错误信息（可选）
   */
  async expectError(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible()
    if (message) {
      await expect(this.errorMessage).toContainText(message)
    }
  }
}
