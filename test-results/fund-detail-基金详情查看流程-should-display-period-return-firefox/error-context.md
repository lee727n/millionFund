# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-detail.spec.ts >> 基金详情查看流程 >> should display period return
- Location: e2e\fund-detail.spec.ts:100:3

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - generic [ref=e8]: AI 百万实盘
        - generic [ref=e10]:
          - generic [ref=e11]: 参考均线
          - generic [ref=e12]: +0.00%
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: 自动刷新开
          - switch [checked] [ref=e16] [cursor=pointer]
          - generic [ref=e18]: 
          - generic "复制日志" [ref=e19]: 
          - generic [ref=e20]: 
        - text:   
    - generic [ref=e24]:
      - generic [ref=e25]: 📈
      - generic [ref=e26]: 欢迎使用基金管理
      - generic [ref=e27]:
        - text: 在这里管理你的自选和持仓基金
        - text: 实时掌握涨跌情况和投资收益
      - generic [ref=e28]:
        - button "🔍 添加自选基金" [ref=e29] [cursor=pointer]:
          - generic [ref=e31]: 🔍 添加自选基金
        - button "💰 添加持仓记录" [ref=e32] [cursor=pointer]:
          - generic [ref=e34]: 💰 添加持仓记录
      - generic [ref=e36]: 💡 小提示：在持仓页长按基金可快速操作
  - tablist [ref=e38]:
    - tab " 首页" [selected] [ref=e39] [cursor=pointer]:
      - generic [ref=e41]: 
      - generic [ref=e42]: 首页
    - tab " 自选" [ref=e43] [cursor=pointer]:
      - generic [ref=e45]: 
      - generic [ref=e46]: 自选
    - tab " 资产" [ref=e47] [cursor=pointer]:
      - generic [ref=e49]: 
      - generic [ref=e50]: 资产
    - tab " 资讯" [ref=e51] [cursor=pointer]:
      - generic [ref=e53]: 
      - generic [ref=e54]: 资讯
    - tab " 我的" [ref=e55] [cursor=pointer]:
      - generic [ref=e57]: 
      - generic [ref=e58]: 我的
```

# Test source

```ts
  1   | // [WHY] 基金列表页 POM — 封装基金列表页的元素选择器和操作方法
  2   | // [WHAT] 提供页面导航、搜索、添加基金、验证列表状态等方法
  3   | // [DEPS] @playwright/test
  4   | 
  5   | import { type Page, type Locator, expect } from '@playwright/test'
  6   | 
  7   | /**
  8   |  * 基金列表页 Page Object Model
  9   |  */
  10  | export class FundListPage {
  11  |   readonly page: Page
  12  | 
  13  |   // 页面元素定位器
  14  |   readonly searchInput: Locator
  15  |   readonly searchButton: Locator
  16  |   readonly addFundButton: Locator
  17  |   readonly fundItems: Locator
  18  |   readonly refreshButton: Locator
  19  |   readonly loadingIndicator: Locator
  20  |   readonly errorMessage: Locator
  21  | 
  22  |   /**
  23  |    * 构造函数
  24  |    * @param page - Playwright Page 对象
  25  |    */
  26  |   constructor(page: Page) {
  27  |     this.page = page
  28  | 
  29  |     // 初始化元素定位器（使用 data-test-id 属性）
  30  |     this.searchInput = page.locator('[data-test-id="search-input"]')
  31  |     this.searchButton = page.locator('[data-test-id="search-button"]')
  32  |     this.addFundButton = page.locator('[data-test-id="add-fund-button"]')
  33  |     this.fundItems = page.locator('[data-test-id="fund-item"]')
  34  |     this.refreshButton = page.locator('[data-test-id="refresh-button"]')
  35  |     this.loadingIndicator = page.locator('[data-test-id="loading"]')
  36  |     this.errorMessage = page.locator('[data-test-id="error-message"]')
  37  |   }
  38  | 
  39  |   /**
  40  |    * 导航到基金列表页
  41  |    */
  42  |   async goto(): Promise<void> {
  43  |     await this.page.goto('/')
> 44  |     await this.page.waitForLoadState('networkidle')
      |                     ^ Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
  45  |   }
  46  | 
  47  |   /**
  48  |    * 搜索基金
  49  |    * @param code - 基金代码
  50  |    */
  51  |   async searchFund(code: string): Promise<void> {
  52  |     await this.searchInput.fill(code)
  53  |     await this.searchButton.click()
  54  |     // 等待搜索结果加载
  55  |     await this.page.waitForTimeout(1000)
  56  |   }
  57  | 
  58  |   /**
  59  |    * 添加基金到列表
  60  |    * @param code - 基金代码
  61  |    */
  62  |   async addFund(code: string): Promise<void> {
  63  |     await this.searchFund(code)
  64  |     await this.addFundButton.click()
  65  |     // 等待添加完成
  66  |     await this.page.waitForTimeout(1000)
  67  |   }
  68  | 
  69  |   /**
  70  |    * 获取基金列表中的基金数量
  71  |    * @returns 基金数量
  72  |    */
  73  |   async getFundCount(): Promise<number> {
  74  |     return await this.fundItems.count()
  75  |   }
  76  | 
  77  |   /**
  78  |    * 点击某个基金查看详情
  79  |    * @param index - 基金在列表中的索引（从 0 开始）
  80  |    */
  81  |   async viewFundDetail(index: number = 0): Promise<void> {
  82  |     await this.fundItems.nth(index).click()
  83  |     await this.page.waitForLoadState('networkidle')
  84  |   }
  85  | 
  86  |   /**
  87  |    * 验证基金是否在列表中
  88  |    * @param code - 基金代码
  89  |    * @returns 是否存在
  90  |    */
  91  |   async isFundInList(code: string): Promise<boolean> {
  92  |     const fundItem = this.page.locator(`[data-test-id="fund-item"][data-code="${code}"]`)
  93  |     return await fundItem.isVisible()
  94  |   }
  95  | 
  96  |   /**
  97  |    * 获取基金的估值信息
  98  |    * @param code - 基金代码
  99  |    * @returns 估值信息文本
  100 |    */
  101 |   async getFundValuation(code: string): Promise<string> {
  102 |     const fundItem = this.page.locator(`[data-test-id="fund-item"][data-code="${code}"]`)
  103 |     const valuation = fundItem.locator('[data-test-id="fund-valuation"]')
  104 |     return (await valuation.textContent()) || ''
  105 |   }
  106 | 
  107 |   /**
  108 |    * 刷新基金列表
  109 |    */
  110 |   async refreshList(): Promise<void> {
  111 |     await this.refreshButton.click()
  112 |     // 等待刷新完成
  113 |     await this.loadingIndicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  114 |     await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  115 |   }
  116 | 
  117 |   /**
  118 |    * 验证页面已加载
  119 |    */
  120 |   async expectPageLoaded(): Promise<void> {
  121 |     await expect(this.page).toHaveTitle(/百万实盘|fund/i)
  122 |     await expect(this.searchInput).toBeVisible()
  123 |   }
  124 | 
  125 |   /**
  126 |    * 验证加载状态
  127 |    */
  128 |   async expectLoading(): Promise<void> {
  129 |     await expect(this.loadingIndicator).toBeVisible()
  130 |   }
  131 | 
  132 |   /**
  133 |    * 验证加载完成
  134 |    */
  135 |   async expectLoaded(): Promise<void> {
  136 |     await expect(this.loadingIndicator).toBeHidden()
  137 |   }
  138 | 
  139 |   /**
  140 |    * 验证错误信息
  141 |    * @param message - 期望的错误信息（可选）
  142 |    */
  143 |   async expectError(message?: string): Promise<void> {
  144 |     await expect(this.errorMessage).toBeVisible()
```