// [WHY] 基金搜索页 POM — 封装基金搜索页的元素选择器和操作方法
// [WHAT] 提供搜索、验证搜索结果、添加基金等方法
// [DEPS] @playwright/test

import { type Page, type Locator, expect } from '@playwright/test'

/**
 * 基金搜索页 Page Object Model
 */
export class FundSearchPage {
  readonly page: Page

  // 页面元素定位器（使用 data-test-id 属性）
  readonly searchInput: Locator
  readonly searchButton: Locator
  readonly searchResults: Locator
  readonly searchResultItems: Locator
  readonly addButtons: Locator
  readonly emptyResultMessage: Locator
  readonly loadingIndicator: Locator
  readonly errorMessage: Locator

  /**
   * 构造函数
   * @param page - Playwright Page 对象
   */
  constructor(page: Page) {
    this.page = page

    // 初始化元素定位器（使用 data-test-id 属性）
    // van-search 组件的输入框（通过 data-test-id 定位）
    this.searchInput = page.locator('[data-test-id="search-input"] input')
    // 搜索按钮（如果有明确的搜索按钮，否则使用取消按钮）
    this.searchButton = page.locator('[data-test-id="search-button"]')
    // 搜索结果容器
    this.searchResults = page.locator('[data-test-id="search-results"]')
    // 搜索结果项（使用 data-test-id）
    this.searchResultItems = page.locator('[data-test-id="fund-item"]')
    // 添加按钮（使用 data-test-id）
    this.addButtons = page.locator('[data-test-id="add-fund-button"] .van-icon')
    // 空结果提示
    this.emptyResultMessage = page.locator('.van-empty')
    // 搜索中文本
    this.loadingIndicator = page.locator('[data-test-id="loading"]')
    // 错误提示（如果有）
    this.errorMessage = page.locator('[data-test-id="error-message"]')
  }

  /**
   * 导航到搜索页
   */
  async goto(): Promise<void> {
    await this.page.goto('/search')
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 搜索基金
   * @param keyword - 搜索关键词（基金代码或名称）
   */
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword)
    // 等待搜索完成（防抖 300ms）
    await this.page.waitForTimeout(500)
    // 等待搜索结果加载或清空
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * 获取搜索结果数量
   * @returns 搜索结果数量
   */
  async getResultCount(): Promise<number> {
    return await this.searchResultItems.count()
  }

  /**
   * 添加搜索结果中的某个基金
   * @param index - 搜索结果中的索引（从 0 开始）
   */
  async addFund(index: number = 0): Promise<void> {
    await this.addButtons.nth(index).click()
    // 等待添加完成（等待 toast 消失）
    await this.page.waitForTimeout(1000)
  }

  /**
   * 验证搜索结果包含指定基金
   * @param code - 基金代码
   * @param name - 基金名称（可选）
   */
  async expectResultContains(code: string, name?: string): Promise<void> {
    const resultItem = this.page.locator('.fund-item', { hasText: code })
    await expect(resultItem).toBeVisible()

    if (name) {
      await expect(resultItem).toContainText(name)
    }
  }

  /**
   * 验证搜索结果为空
   */
  async expectEmptyResult(): Promise<void> {
    await expect(this.emptyResultMessage).toBeVisible()
    await expect(this.searchResultItems).toHaveCount(0)
  }

  /**
   * 验证页面已加载
   */
  async expectPageLoaded(): Promise<void> {
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

  /**
   * 清空搜索框
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear()
  }

  /**
   * 获取搜索结果中某个基金的信息
   * @param index - 搜索结果中的索引（从 0 开始）
   * @returns 基金信息（代码、名称）
   */
  async getResultInfo(index: number = 0): Promise<{ code: string; name: string }> {
    const item = this.searchResultItems.nth(index)
    const code = (await item.locator('.fund-code').textContent()) || ''
    const name = (await item.locator('.fund-name').textContent()) || ''
    return { code, name }
  }
}
