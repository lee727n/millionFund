# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-add.spec.ts >> 基金添加流程 >> should search and add fund
- Location: e2e\fund-add.spec.ts:36:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e5]:
    - generic [ref=e7]:
      - generic [ref=e9] [cursor=pointer]: 
      - generic [ref=e10]: 搜索基金
    - generic [ref=e13]:
      - generic [ref=e15]:
        - generic [ref=e17]: 
        - searchbox "输入基金代码或名称" [ref=e20]: "000001"
      - button "取消" [ref=e21] [cursor=pointer]
    - generic [ref=e22]:
      - generic [ref=e23] [cursor=pointer]:
        - generic [ref=e24]:
          - generic [ref=e25]: 华夏成长混合
          - generic [ref=e26]:
            - generic [ref=e27]: "000001"
            - generic [ref=e28]: 混合型-灵活
        - generic [ref=e29]: "--"
        - generic [ref=e31]: 
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
  - dialog [ref=e293]:
    - generic [ref=e294]: 添加成功
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
> 43  |     await this.page.goto('/')
      |                     ^ Error: page.goto: Test timeout of 30000ms exceeded.
  44  |     await this.page.waitForLoadState('networkidle')
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
```