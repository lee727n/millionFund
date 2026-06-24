# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-search.spec.ts >> 基金搜索流程 >> should search fund by code
- Location: e2e\fund-search.spec.ts:40:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.van-search__field input')

```

# Test source

```ts
  1   | // [WHY] 基金搜索页 POM — 封装基金搜索页的元素选择器和操作方法
  2   | // [WHAT] 提供搜索、验证搜索结果、添加基金等方法
  3   | // [DEPS] @playwright/test
  4   | 
  5   | import { type Page, type Locator, expect } from '@playwright/test'
  6   | 
  7   | /**
  8   |  * 基金搜索页 Page Object Model
  9   |  */
  10  | export class FundSearchPage {
  11  |   readonly page: Page
  12  | 
  13  |   // 页面元素定位器（基于实际 Vue 组件的 CSS 类名）
  14  |   readonly searchInput: Locator
  15  |   readonly searchButton: Locator
  16  |   readonly searchResults: Locator
  17  |   readonly searchResultItems: Locator
  18  |   readonly addButtons: Locator
  19  |   readonly emptyResultMessage: Locator
  20  |   readonly loadingIndicator: Locator
  21  |   readonly errorMessage: Locator
  22  | 
  23  |   /**
  24  |    * 构造函数
  25  |    * @param page - Playwright Page 对象
  26  |    */
  27  |   constructor(page: Page) {
  28  |     this.page = page
  29  | 
  30  |     // 初始化元素定位器（基于 Search.vue 的实际结构）
  31  |     // van-search 组件的输入框
  32  |     this.searchInput = page.locator('.van-search__field input')
  33  |     // van-search 组件的取消按钮（作为搜索按钮的替代）
  34  |     this.searchButton = page.locator('.van-search__action')
  35  |     // 搜索结果容器
  36  |     this.searchResults = page.locator('.search-results')
  37  |     // 搜索结果项
  38  |     this.searchResultItems = page.locator('.fund-item')
  39  |     // 添加按钮（plus 图标）
  40  |     this.addButtons = page.locator('.fund-action .van-icon[name="plus"]')
  41  |     // 空结果提示
  42  |     this.emptyResultMessage = page.locator('.van-empty')
  43  |     // 搜索中文本
  44  |     this.loadingIndicator = page.locator('.searching-text')
  45  |     // 错误提示（如果有）
  46  |     this.errorMessage = page.locator('.van-toast')
  47  |   }
  48  | 
  49  |   /**
  50  |    * 导航到搜索页
  51  |    */
  52  |   async goto(): Promise<void> {
  53  |     await this.page.goto('/search')
  54  |     await this.page.waitForLoadState('networkidle')
  55  |   }
  56  | 
  57  |   /**
  58  |    * 搜索基金
  59  |    * @param keyword - 搜索关键词（基金代码或名称）
  60  |    */
  61  |   async search(keyword: string): Promise<void> {
> 62  |     await this.searchInput.fill(keyword)
      |                            ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  63  |     // 等待搜索完成（防抖 300ms）
  64  |     await this.page.waitForTimeout(500)
  65  |     // 等待搜索结果加载或清空
  66  |     await this.page.waitForLoadState('networkidle')
  67  |   }
  68  | 
  69  |   /**
  70  |    * 获取搜索结果数量
  71  |    * @returns 搜索结果数量
  72  |    */
  73  |   async getResultCount(): Promise<number> {
  74  |     return await this.searchResultItems.count()
  75  |   }
  76  | 
  77  |   /**
  78  |    * 添加搜索结果中的某个基金
  79  |    * @param index - 搜索结果中的索引（从 0 开始）
  80  |    */
  81  |   async addFund(index: number = 0): Promise<void> {
  82  |     await this.addButtons.nth(index).click()
  83  |     // 等待添加完成（等待 toast 消失）
  84  |     await this.page.waitForTimeout(1000)
  85  |   }
  86  | 
  87  |   /**
  88  |    * 验证搜索结果包含指定基金
  89  |    * @param code - 基金代码
  90  |    * @param name - 基金名称（可选）
  91  |    */
  92  |   async expectResultContains(code: string, name?: string): Promise<void> {
  93  |     const resultItem = this.page.locator('.fund-item', { hasText: code })
  94  |     await expect(resultItem).toBeVisible()
  95  | 
  96  |     if (name) {
  97  |       await expect(resultItem).toContainText(name)
  98  |     }
  99  |   }
  100 | 
  101 |   /**
  102 |    * 验证搜索结果为空
  103 |    */
  104 |   async expectEmptyResult(): Promise<void> {
  105 |     await expect(this.emptyResultMessage).toBeVisible()
  106 |     await expect(this.searchResultItems).toHaveCount(0)
  107 |   }
  108 | 
  109 |   /**
  110 |    * 验证页面已加载
  111 |    */
  112 |   async expectPageLoaded(): Promise<void> {
  113 |     await expect(this.searchInput).toBeVisible()
  114 |   }
  115 | 
  116 |   /**
  117 |    * 验证加载状态
  118 |    */
  119 |   async expectLoading(): Promise<void> {
  120 |     await expect(this.loadingIndicator).toBeVisible()
  121 |   }
  122 | 
  123 |   /**
  124 |    * 验证加载完成
  125 |    */
  126 |   async expectLoaded(): Promise<void> {
  127 |     await expect(this.loadingIndicator).toBeHidden()
  128 |   }
  129 | 
  130 |   /**
  131 |    * 验证错误信息
  132 |    * @param message - 期望的错误信息（可选）
  133 |    */
  134 |   async expectError(message?: string): Promise<void> {
  135 |     await expect(this.errorMessage).toBeVisible()
  136 |     if (message) {
  137 |       await expect(this.errorMessage).toContainText(message)
  138 |     }
  139 |   }
  140 | 
  141 |   /**
  142 |    * 清空搜索框
  143 |    */
  144 |   async clearSearch(): Promise<void> {
  145 |     await this.searchInput.clear()
  146 |   }
  147 | 
  148 |   /**
  149 |    * 获取搜索结果中某个基金的信息
  150 |    * @param index - 搜索结果中的索引（从 0 开始）
  151 |    * @returns 基金信息（代码、名称）
  152 |    */
  153 |   async getResultInfo(index: number = 0): Promise<{ code: string; name: string }> {
  154 |     const item = this.searchResultItems.nth(index)
  155 |     const code = (await item.locator('.fund-code').textContent()) || ''
  156 |     const name = (await item.locator('.fund-name').textContent()) || ''
  157 |     return { code, name }
  158 |   }
  159 | }
  160 | 
```