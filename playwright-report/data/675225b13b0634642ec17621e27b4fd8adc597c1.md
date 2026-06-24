# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-add.spec.ts >> 基金添加流程 >> should display added fund in list
- Location: e2e\fund-add.spec.ts:58:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.fund-action .van-icon[name="plus"]').first()

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e7]:
    - generic [ref=e9] [cursor=pointer]: 
    - generic [ref=e10]: 搜索基金
  - generic [ref=e12]:
    - generic [ref=e14]:
      - generic [ref=e16]: 
      - generic [ref=e18]:
        - searchbox "输入基金代码或名称" [active] [ref=e19]: "000001"
        - generic [ref=e20] [cursor=pointer]: 
    - button "取消" [ref=e21] [cursor=pointer]
  - generic [ref=e22]:
    - generic [ref=e23] [cursor=pointer]:
      - generic [ref=e24]:
        - generic [ref=e25]: 华夏成长混合
        - generic [ref=e26]:
          - generic [ref=e27]: "000001"
          - generic [ref=e28]: 混合型-灵活
      - generic [ref=e29]: "--"
      - generic [ref=e31]: 
    - generic [ref=e32] [cursor=pointer]:
      - generic [ref=e33]:
        - generic [ref=e34]: 嘉实中证500ETF联接A
        - generic [ref=e35]:
          - generic [ref=e36]: "000008"
          - generic [ref=e37]: 指数型-股票
      - generic [ref=e38]: "--"
      - generic [ref=e40]: 
    - generic [ref=e41] [cursor=pointer]:
      - generic [ref=e42]:
        - generic [ref=e43]: 财通中证ESG100指数增强A
        - generic [ref=e44]:
          - generic [ref=e45]: "000042"
          - generic [ref=e46]: 指数型-股票
      - generic [ref=e47]: "--"
      - generic [ref=e49]: 
    - generic [ref=e50] [cursor=pointer]:
      - generic [ref=e51]:
        - generic [ref=e52]: 华夏沪深300ETF联接A
        - generic [ref=e53]:
          - generic [ref=e54]: "000051"
          - generic [ref=e55]: 指数型-股票
      - generic [ref=e56]: "--"
      - generic [ref=e58]: 
    - generic [ref=e59] [cursor=pointer]:
      - generic [ref=e60]:
        - generic [ref=e61]: 广发纳斯达克100ETF联接美元(QDII)A
        - generic [ref=e62]:
          - generic [ref=e63]: "000055"
          - generic [ref=e64]: 指数型-海外股票
      - generic [ref=e65]: "--"
      - generic [ref=e67]: 
    - generic [ref=e68] [cursor=pointer]:
      - generic [ref=e69]:
        - generic [ref=e70]: 国联安中证医药100A
        - generic [ref=e71]:
          - generic [ref=e72]: "000059"
          - generic [ref=e73]: 指数型-股票
      - generic [ref=e74]: "--"
      - generic [ref=e76]: 
    - generic [ref=e77] [cursor=pointer]:
      - generic [ref=e78]:
        - generic [ref=e79]: 富国沪深300指数增强A(后端)
        - generic [ref=e80]:
          - generic [ref=e81]: "000154"
          - generic [ref=e82]: 指数型-股票
      - generic [ref=e83]: "--"
      - generic [ref=e85]: 
    - generic [ref=e86] [cursor=pointer]:
      - generic [ref=e87]:
        - generic [ref=e88]: 汇添富美丽30混合A
        - generic [ref=e89]:
          - generic [ref=e90]: "000173"
          - generic [ref=e91]: 混合型-偏股
      - generic [ref=e92]: "--"
      - generic [ref=e94]: 
    - generic [ref=e95] [cursor=pointer]:
      - generic [ref=e96]:
        - generic [ref=e97]: 嘉实沪深300指数研究增强A
        - generic [ref=e98]:
          - generic [ref=e99]: "000176"
          - generic [ref=e100]: 指数型-股票
      - generic [ref=e101]: "--"
      - generic [ref=e103]: 
    - generic [ref=e104] [cursor=pointer]:
      - generic [ref=e105]:
        - generic [ref=e106]: 景顺长城沪深300指数增强A
        - generic [ref=e107]:
          - generic [ref=e108]: "000311"
          - generic [ref=e109]: 指数型-股票
      - generic [ref=e110]: "--"
      - generic [ref=e112]: 
    - generic [ref=e113] [cursor=pointer]:
      - generic [ref=e114]:
        - generic [ref=e115]: 华安沪深300增强A
        - generic [ref=e116]:
          - generic [ref=e117]: "000312"
          - generic [ref=e118]: 指数型-股票
      - generic [ref=e119]: "--"
      - generic [ref=e121]: 
    - generic [ref=e122] [cursor=pointer]:
      - generic [ref=e123]:
        - generic [ref=e124]: 华安沪深300增强C
        - generic [ref=e125]:
          - generic [ref=e126]: "000313"
          - generic [ref=e127]: 指数型-股票
      - generic [ref=e128]: "--"
      - generic [ref=e130]: 
    - generic [ref=e131] [cursor=pointer]:
      - generic [ref=e132]:
        - generic [ref=e133]: 汇添富沪深300安中指数A
        - generic [ref=e134]:
          - generic [ref=e135]: "000368"
          - generic [ref=e136]: 指数型-股票
      - generic [ref=e137]: "--"
      - generic [ref=e139]: 
    - generic [ref=e140] [cursor=pointer]:
      - generic [ref=e141]:
        - generic [ref=e142]: 建信中证500指数增强A
        - generic [ref=e143]:
          - generic [ref=e144]: "000478"
          - generic [ref=e145]: 指数型-股票
      - generic [ref=e146]: "--"
      - generic [ref=e148]: 
    - generic [ref=e149] [cursor=pointer]:
      - generic [ref=e150]:
        - generic [ref=e151]: 国泰沪深300指数增强A
        - generic [ref=e152]:
          - generic [ref=e153]: "000512"
          - generic [ref=e154]: 指数型-股票
      - generic [ref=e155]: "--"
      - generic [ref=e157]: 
    - generic [ref=e158] [cursor=pointer]:
      - generic [ref=e159]:
        - generic [ref=e160]: 国寿安保沪深300ETF联接A
        - generic [ref=e161]:
          - generic [ref=e162]: "000613"
          - generic [ref=e163]: 指数型-股票
      - generic [ref=e164]: "--"
      - generic [ref=e166]: 
    - generic [ref=e167] [cursor=pointer]:
      - generic [ref=e168]:
        - generic [ref=e169]: 前海开源沪深300指数A
        - generic [ref=e170]:
          - generic [ref=e171]: "000656"
          - generic [ref=e172]: 指数型-股票
      - generic [ref=e173]: "--"
      - generic [ref=e175]: 
    - generic [ref=e176] [cursor=pointer]:
      - generic [ref=e177]:
        - generic [ref=e178]: 宝盈科技30混合
        - generic [ref=e179]:
          - generic [ref=e180]: "000698"
          - generic [ref=e181]: 混合型-灵活
      - generic [ref=e182]: "--"
      - generic [ref=e184]: 
    - generic [ref=e185] [cursor=pointer]:
      - generic [ref=e186]:
        - generic [ref=e187]: 广发百发100指数A
        - generic [ref=e188]:
          - generic [ref=e189]: "000826"
          - generic [ref=e190]: 指数型-股票
      - generic [ref=e191]: "--"
      - generic [ref=e193]: 
    - generic [ref=e194] [cursor=pointer]:
      - generic [ref=e195]:
        - generic [ref=e196]: 广发百发100指数E
        - generic [ref=e197]:
          - generic [ref=e198]: "000827"
          - generic [ref=e199]: 指数型-股票
      - generic [ref=e200]: "--"
      - generic [ref=e202]: 
    - generic [ref=e203] [cursor=pointer]:
      - generic [ref=e204]:
        - generic [ref=e205]: 大成纳斯达克100ETF联接(QDII)A
        - generic [ref=e206]:
          - generic [ref=e207]: "000834"
          - generic [ref=e208]: 指数型-海外股票
      - generic [ref=e209]: "--"
      - generic [ref=e211]: 
    - generic [ref=e212] [cursor=pointer]:
      - generic [ref=e213]:
        - generic [ref=e214]: 华润元大富时中国A50指数A
        - generic [ref=e215]:
          - generic [ref=e216]: "000835"
          - generic [ref=e217]: 指数型-股票
      - generic [ref=e218]: "--"
      - generic [ref=e220]: 
    - generic [ref=e221] [cursor=pointer]:
      - generic [ref=e222]:
        - generic [ref=e223]: 前海开源股息率100强股票A
        - generic [ref=e224]:
          - generic [ref=e225]: "000916"
          - generic [ref=e226]: 股票型
      - generic [ref=e227]: "--"
      - generic [ref=e229]: 
    - generic [ref=e230] [cursor=pointer]:
      - generic [ref=e231]:
        - generic [ref=e232]: 天弘沪深300ETF联接A
        - generic [ref=e233]:
          - generic [ref=e234]: "000961"
          - generic [ref=e235]: 指数型-股票
      - generic [ref=e236]: "--"
      - generic [ref=e238]: 
    - generic [ref=e239] [cursor=pointer]:
      - generic [ref=e240]:
        - generic [ref=e241]: 天弘中证500ETF联接A
        - generic [ref=e242]:
          - generic [ref=e243]: "000962"
          - generic [ref=e244]: 指数型-股票
      - generic [ref=e245]: "--"
      - generic [ref=e247]: 
    - generic [ref=e248] [cursor=pointer]:
      - generic [ref=e249]:
        - generic [ref=e250]: 华夏沪深300指数增强A
        - generic [ref=e251]:
          - generic [ref=e252]: "001015"
          - generic [ref=e253]: 指数型-股票
      - generic [ref=e254]: "--"
      - generic [ref=e256]: 
    - generic [ref=e257] [cursor=pointer]:
      - generic [ref=e258]:
        - generic [ref=e259]: 华夏沪深300指数增强C
        - generic [ref=e260]:
          - generic [ref=e261]: "001016"
          - generic [ref=e262]: 指数型-股票
      - generic [ref=e263]: "--"
      - generic [ref=e265]: 
    - generic [ref=e266] [cursor=pointer]:
      - generic [ref=e267]:
        - generic [ref=e268]: 汇添富中证500指数增强A
        - generic [ref=e269]:
          - generic [ref=e270]: "001050"
          - generic [ref=e271]: 指数型-股票
      - generic [ref=e272]: "--"
      - generic [ref=e274]: 
    - generic [ref=e275] [cursor=pointer]:
      - generic [ref=e276]:
        - generic [ref=e277]: 华夏上证50ETF联接A
        - generic [ref=e278]:
          - generic [ref=e279]: "001051"
          - generic [ref=e280]: 指数型-股票
      - generic [ref=e281]: "--"
      - generic [ref=e283]: 
    - generic [ref=e284] [cursor=pointer]:
      - generic [ref=e285]:
        - generic [ref=e286]: 华夏中证500ETF联接A
        - generic [ref=e287]:
          - generic [ref=e288]: "001052"
          - generic [ref=e289]: 指数型-股票
      - generic [ref=e290]: "--"
      - generic [ref=e292]: 
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
  62  |     await this.searchInput.fill(keyword)
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
> 82  |     await this.addButtons.nth(index).click()
      |                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
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