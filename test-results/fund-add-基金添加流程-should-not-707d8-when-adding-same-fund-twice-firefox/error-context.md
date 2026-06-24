# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-add.spec.ts >> 基金添加流程 >> should not duplicate fund when adding same fund twice
- Location: e2e\fund-add.spec.ts:110:3

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e7]:
    - generic [ref=e9] [cursor=pointer]: 
    - generic [ref=e10]: 搜索基金
  - generic [ref=e13]:
    - generic [ref=e15]:
      - generic [ref=e17]: 
      - searchbox "输入基金代码或名称" [active] [ref=e20]
    - button "取消" [ref=e21] [cursor=pointer]
  - generic [ref=e23]:
    - generic [ref=e24]: 
    - generic [ref=e25]: 输入基金代码（如 001186）或名称搜索
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
  13  |   // 页面元素定位器（使用 data-test-id 属性）
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
  30  |     // 初始化元素定位器（使用 data-test-id 属性）
  31  |     // van-search 组件的输入框
  32  |     this.searchInput = page.locator('[data-test-id="search-input"] input')
  33  |     // Search.vue 没有独立的搜索按钮，搜索是即时的（watch + 防抖）
  34  |     // 这里保留一个占位符，实际测试中不需要点击搜索按钮
  35  |     this.searchButton = page.locator('[data-test-id="search-input"]')
  36  |     // 搜索结果容器
  37  |     this.searchResults = page.locator('[data-test-id="search-results"]')
  38  |     // 搜索结果项
  39  |     this.searchResultItems = page.locator('[data-test-id="fund-item"]')
  40  |     // 添加按钮（在 fund-action 内的 van-icon）
  41  |     this.addButtons = page.locator('[data-test-id="add-fund-button"] .van-icon')
  42  |     // 空结果提示
  43  |     this.emptyResultMessage = page.locator('[data-test-id="empty-result"]')
  44  |     // 搜索中文本
  45  |     this.loadingIndicator = page.locator('[data-test-id="loading"]')
  46  |     // 错误提示（如果有）
  47  |     this.errorMessage = page.locator('[data-test-id="error-message"]')
  48  |   }
  49  | 
  50  |   /**
  51  |    * 导航到搜索页
  52  |    */
  53  |   async goto(): Promise<void> {
  54  |     await this.page.goto('/search')
> 55  |     await this.page.waitForLoadState('networkidle')
      |                     ^ Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
  56  |   }
  57  | 
  58  |   /**
  59  |    * 搜索基金
  60  |    * @param keyword - 搜索关键词（基金代码或名称）
  61  |    */
  62  |   async search(keyword: string): Promise<void> {
  63  |     await this.searchInput.fill(keyword)
  64  |     // 等待搜索完成（防抖 300ms）
  65  |     await this.page.waitForTimeout(500)
  66  |     // 等待搜索结果加载或清空
  67  |     await this.page.waitForLoadState('networkidle')
  68  |   }
  69  | 
  70  |   /**
  71  |    * 获取搜索结果数量
  72  |    * @returns 搜索结果数量
  73  |    */
  74  |   async getResultCount(): Promise<number> {
  75  |     return await this.searchResultItems.count()
  76  |   }
  77  | 
  78  |   /**
  79  |    * 添加搜索结果中的某个基金
  80  |    * @param index - 搜索结果中的索引（从 0 开始）
  81  |    */
  82  |   async addFund(index: number = 0): Promise<void> {
  83  |     await this.addButtons.nth(index).click()
  84  |     // 等待添加完成（等待 toast 消失）
  85  |     await this.page.waitForTimeout(1000)
  86  |   }
  87  | 
  88  |   /**
  89  |    * 验证搜索结果包含指定基金
  90  |    * @param code - 基金代码
  91  |    * @param name - 基金名称（可选）
  92  |    */
  93  |   async expectResultContains(code: string, name?: string): Promise<void> {
  94  |     const resultItem = this.page.locator('[data-test-id="fund-item"]', { hasText: code })
  95  |     await expect(resultItem).toBeVisible()
  96  | 
  97  |     if (name) {
  98  |       await expect(resultItem).toContainText(name)
  99  |     }
  100 |   }
  101 | 
  102 |   /**
  103 |    * 验证搜索结果为空
  104 |    */
  105 |   async expectEmptyResult(): Promise<void> {
  106 |     await expect(this.emptyResultMessage).toBeVisible()
  107 |     await expect(this.searchResultItems).toHaveCount(0)
  108 |   }
  109 | 
  110 |   /**
  111 |    * 验证页面已加载
  112 |    */
  113 |   async expectPageLoaded(): Promise<void> {
  114 |     await expect(this.searchInput).toBeVisible()
  115 |   }
  116 | 
  117 |   /**
  118 |    * 验证加载状态
  119 |    */
  120 |   async expectLoading(): Promise<void> {
  121 |     await expect(this.loadingIndicator).toBeVisible()
  122 |   }
  123 | 
  124 |   /**
  125 |    * 验证加载完成
  126 |    */
  127 |   async expectLoaded(): Promise<void> {
  128 |     await expect(this.loadingIndicator).toBeHidden()
  129 |   }
  130 | 
  131 |   /**
  132 |    * 验证错误信息
  133 |    * @param message - 期望的错误信息（可选）
  134 |    */
  135 |   async expectError(message?: string): Promise<void> {
  136 |     await expect(this.errorMessage).toBeVisible()
  137 |     if (message) {
  138 |       await expect(this.errorMessage).toContainText(message)
  139 |     }
  140 |   }
  141 | 
  142 |   /**
  143 |    * 清空搜索框
  144 |    */
  145 |   async clearSearch(): Promise<void> {
  146 |     await this.searchInput.clear()
  147 |   }
  148 | 
  149 |   /**
  150 |    * 获取搜索结果中某个基金的信息
  151 |    * @param index - 搜索结果中的索引（从 0 开始）
  152 |    * @returns 基金信息（代码、名称）
  153 |    */
  154 |   async getResultInfo(index: number = 0): Promise<{ code: string; name: string }> {
  155 |     const item = this.searchResultItems.nth(index)
```