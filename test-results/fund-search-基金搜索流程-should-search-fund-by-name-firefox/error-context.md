# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-search.spec.ts >> 基金搜索流程 >> should search fund by name
- Location: e2e\fund-search.spec.ts:100:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
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
      - generic [ref=e19]:
        - searchbox "输入基金代码或名称" [active] [ref=e20]: 华夏
        - generic [ref=e21] [cursor=pointer]: 
    - button "取消" [ref=e22] [cursor=pointer]
  - generic [ref=e23]:
    - generic [ref=e24] [cursor=pointer]:
      - generic [ref=e25]:
        - generic [ref=e26]: 华夏成长混合
        - generic [ref=e27]:
          - generic [ref=e28]: "000001"
          - generic [ref=e29]: 混合型-灵活
      - generic [ref=e30]: "--"
      - generic [ref=e32]: 
    - generic [ref=e33] [cursor=pointer]:
      - generic [ref=e34]:
        - generic [ref=e35]: 华夏成长混合(后端)
        - generic [ref=e36]:
          - generic [ref=e37]: "000002"
          - generic [ref=e38]: 混合型-灵活
      - generic [ref=e39]: "--"
      - generic [ref=e41]: 
    - generic [ref=e42] [cursor=pointer]:
      - generic [ref=e43]:
        - generic [ref=e44]: 华夏大盘精选混合A
        - generic [ref=e45]:
          - generic [ref=e46]: "000011"
          - generic [ref=e47]: 混合型-灵活
      - generic [ref=e48]: "--"
      - generic [ref=e50]: 
    - generic [ref=e51] [cursor=pointer]:
      - generic [ref=e52]:
        - generic [ref=e53]: 华夏大盘精选混合A(后端)
        - generic [ref=e54]:
          - generic [ref=e55]: "000012"
          - generic [ref=e56]: 混合型-灵活
      - generic [ref=e57]: "--"
      - generic [ref=e59]: 
    - generic [ref=e60] [cursor=pointer]:
      - generic [ref=e61]:
        - generic [ref=e62]: 华夏聚利债券A
        - generic [ref=e63]:
          - generic [ref=e64]: "000014"
          - generic [ref=e65]: 债券型-混合一级
      - generic [ref=e66]: "--"
      - generic [ref=e68]: 
    - generic [ref=e69] [cursor=pointer]:
      - generic [ref=e70]:
        - generic [ref=e71]: 华夏纯债债券A
        - generic [ref=e72]:
          - generic [ref=e73]: "000015"
          - generic [ref=e74]: 债券型-长债
      - generic [ref=e75]: "--"
      - generic [ref=e77]: 
    - generic [ref=e78] [cursor=pointer]:
      - generic [ref=e79]:
        - generic [ref=e80]: 华夏纯债债券C
        - generic [ref=e81]:
          - generic [ref=e82]: "000016"
          - generic [ref=e83]: 债券型-长债
      - generic [ref=e84]: "--"
      - generic [ref=e86]: 
    - generic [ref=e87] [cursor=pointer]:
      - generic [ref=e88]:
        - generic [ref=e89]: 华夏优势增长混合
        - generic [ref=e90]:
          - generic [ref=e91]: "000021"
          - generic [ref=e92]: 混合型-偏股
      - generic [ref=e93]: "--"
      - generic [ref=e95]: 
    - generic [ref=e96] [cursor=pointer]:
      - generic [ref=e97]:
        - generic [ref=e98]: 华夏复兴混合A
        - generic [ref=e99]:
          - generic [ref=e100]: "000031"
          - generic [ref=e101]: 混合型-偏股
      - generic [ref=e102]: "--"
      - generic [ref=e104]: 
    - generic [ref=e105] [cursor=pointer]:
      - generic [ref=e106]:
        - generic [ref=e107]: 华夏全球股票(QDII)(人民币)
        - generic [ref=e108]:
          - generic [ref=e109]: "000041"
          - generic [ref=e110]: QDII-普通股票
      - generic [ref=e111]: "--"
      - generic [ref=e113]: 
    - generic [ref=e114] [cursor=pointer]:
      - generic [ref=e115]:
        - generic [ref=e116]: 华夏双债债券A
        - generic [ref=e117]:
          - generic [ref=e118]: "000047"
          - generic [ref=e119]: 债券型-混合一级
      - generic [ref=e120]: "--"
      - generic [ref=e122]: 
    - generic [ref=e123] [cursor=pointer]:
      - generic [ref=e124]:
        - generic [ref=e125]: 华夏双债债券C
        - generic [ref=e126]:
          - generic [ref=e127]: "000048"
          - generic [ref=e128]: 债券型-混合一级
      - generic [ref=e129]: "--"
      - generic [ref=e131]: 
    - generic [ref=e132] [cursor=pointer]:
      - generic [ref=e133]:
        - generic [ref=e134]: 华夏沪深300ETF联接A
        - generic [ref=e135]:
          - generic [ref=e136]: "000051"
          - generic [ref=e137]: 指数型-股票
      - generic [ref=e138]: "--"
      - generic [ref=e140]: 
    - generic [ref=e141] [cursor=pointer]:
      - generic [ref=e142]:
        - generic [ref=e143]: 华夏盛世混合
        - generic [ref=e144]:
          - generic [ref=e145]: "000061"
          - generic [ref=e146]: 混合型-偏股
      - generic [ref=e147]: "--"
      - generic [ref=e149]: 
    - generic [ref=e150] [cursor=pointer]:
      - generic [ref=e151]:
        - generic [ref=e152]: 华夏恒生ETF联接A
        - generic [ref=e153]:
          - generic [ref=e154]: "000071"
          - generic [ref=e155]: 指数型-海外股票
      - generic [ref=e156]: "--"
      - generic [ref=e158]: 
    - generic [ref=e159] [cursor=pointer]:
      - generic [ref=e160]:
        - generic [ref=e161]: 华夏恒生ETF联接现汇
        - generic [ref=e162]:
          - generic [ref=e163]: "000075"
          - generic [ref=e164]: 指数型-海外股票
      - generic [ref=e165]: "--"
      - generic [ref=e167]: 
    - generic [ref=e168] [cursor=pointer]:
      - generic [ref=e169]:
        - generic [ref=e170]: 华夏恒生ETF联接现钞
        - generic [ref=e171]:
          - generic [ref=e172]: "000076"
          - generic [ref=e173]: 指数型-海外股票
      - generic [ref=e174]: "--"
      - generic [ref=e176]: 
    - generic [ref=e177] [cursor=pointer]:
      - generic [ref=e178]:
        - generic [ref=e179]: 华夏永福混合A
        - generic [ref=e180]:
          - generic [ref=e181]: "000121"
          - generic [ref=e182]: 混合型-偏债
      - generic [ref=e183]: "--"
      - generic [ref=e185]: 
    - generic [ref=e186] [cursor=pointer]:
      - generic [ref=e187]:
        - generic [ref=e188]: 华夏财富宝货币A
        - generic [ref=e189]:
          - generic [ref=e190]: "000343"
          - generic [ref=e191]: 货币型-普通货币
      - generic [ref=e192]: "--"
      - generic [ref=e194]: 
    - generic [ref=e195] [cursor=pointer]:
      - generic [ref=e196]:
        - generic [ref=e197]: 华夏薪金宝货币
        - generic [ref=e198]:
          - generic [ref=e199]: "000645"
          - generic [ref=e200]: 货币型-普通货币
      - generic [ref=e201]: "--"
      - generic [ref=e203]: 
    - generic [ref=e204] [cursor=pointer]:
      - generic [ref=e205]:
        - generic [ref=e206]: 华夏医疗健康混合A
        - generic [ref=e207]:
          - generic [ref=e208]: "000945"
          - generic [ref=e209]: 混合型-灵活
      - generic [ref=e210]: "--"
      - generic [ref=e212]: 
    - generic [ref=e213] [cursor=pointer]:
      - generic [ref=e214]:
        - generic [ref=e215]: 华夏医疗健康混合C
        - generic [ref=e216]:
          - generic [ref=e217]: "000946"
          - generic [ref=e218]: 混合型-灵活
      - generic [ref=e219]: "--"
      - generic [ref=e221]: 
    - generic [ref=e222] [cursor=pointer]:
      - generic [ref=e223]:
        - generic [ref=e224]: 华夏沪港通恒生ETF联接A
        - generic [ref=e225]:
          - generic [ref=e226]: "000948"
          - generic [ref=e227]: 指数型-股票
      - generic [ref=e228]: "--"
      - generic [ref=e230]: 
    - generic [ref=e231] [cursor=pointer]:
      - generic [ref=e232]:
        - generic [ref=e233]: 华夏债券A/B
        - generic [ref=e234]:
          - generic [ref=e235]: "001001"
          - generic [ref=e236]: 债券型-混合一级
      - generic [ref=e237]: "--"
      - generic [ref=e239]: 
    - generic [ref=e240] [cursor=pointer]:
      - generic [ref=e241]:
        - generic [ref=e242]: 华夏债券A/B(后端)
        - generic [ref=e243]:
          - generic [ref=e244]: "001002"
          - generic [ref=e245]: 债券型-混合一级
      - generic [ref=e246]: "--"
      - generic [ref=e248]: 
    - generic [ref=e249] [cursor=pointer]:
      - generic [ref=e250]:
        - generic [ref=e251]: 华夏债券C
        - generic [ref=e252]:
          - generic [ref=e253]: "001003"
          - generic [ref=e254]: 债券型-混合一级
      - generic [ref=e255]: "--"
      - generic [ref=e257]: 
    - generic [ref=e258] [cursor=pointer]:
      - generic [ref=e259]:
        - generic [ref=e260]: 华夏希望债券A
        - generic [ref=e261]:
          - generic [ref=e262]: "001011"
          - generic [ref=e263]: 债券型-混合二级
      - generic [ref=e264]: "--"
      - generic [ref=e266]: 
    - generic [ref=e267] [cursor=pointer]:
      - generic [ref=e268]:
        - generic [ref=e269]: 华夏希望债券C
        - generic [ref=e270]:
          - generic [ref=e271]: "001013"
          - generic [ref=e272]: 债券型-混合二级
      - generic [ref=e273]: "--"
      - generic [ref=e275]: 
    - generic [ref=e276] [cursor=pointer]:
      - generic [ref=e277]:
        - generic [ref=e278]: 华夏沪深300指数增强A
        - generic [ref=e279]:
          - generic [ref=e280]: "001015"
          - generic [ref=e281]: 指数型-股票
      - generic [ref=e282]: "--"
      - generic [ref=e284]: 
    - generic [ref=e285] [cursor=pointer]:
      - generic [ref=e286]:
        - generic [ref=e287]: 华夏沪深300指数增强C
        - generic [ref=e288]:
          - generic [ref=e289]: "001016"
          - generic [ref=e290]: 指数型-股票
      - generic [ref=e291]: "--"
      - generic [ref=e293]: 
```

# Test source

```ts
  6   | import { setupMockAPI, waitForPageLoad } from './mock-api'
  7   | import { FundSearchPage } from './pages/fund-search.page'
  8   | 
  9   | /**
  10  |  * 基金搜索流程 E2E 测试
  11  |  */
  12  | test.describe('基金搜索流程', () => {
  13  |   let searchPage: FundSearchPage
  14  | 
  15  |   /**
  16  |    * 每个测试前的设置
  17  |    */
  18  |   test.beforeEach(async ({ page }) => {
  19  |     // 设置 Mock API
  20  |     await setupMockAPI(page)
  21  | 
  22  |     // 初始化页面对象
  23  |     searchPage = new FundSearchPage(page)
  24  | 
  25  |     // 导航到搜索页
  26  |     await searchPage.goto()
  27  |     await waitForPageLoad(page)
  28  |   })
  29  | 
  30  |   /**
  31  |    * 测试：打开首页
  32  |    */
  33  |   test('should open search page', async ({ page }) => {
  34  |     await searchPage.expectPageLoaded()
  35  |   })
  36  | 
  37  |   /**
  38  |    * 测试：在搜索框输入基金代码并搜索
  39  |    */
  40  |   test('should search fund by code', async ({ page }) => {
  41  |     // 搜索基金
  42  |     await searchPage.search('000001')
  43  | 
  44  |     // 验证搜索结果
  45  |     const resultCount = await searchPage.getResultCount()
  46  |     expect(resultCount).toBeGreaterThan(0)
  47  |   })
  48  | 
  49  |   /**
  50  |    * 测试：验证搜索结果正确显示
  51  |    */
  52  |   test('should display correct search results', async ({ page }) => {
  53  |     // 搜索基金
  54  |     await searchPage.search('000001')
  55  | 
  56  |     // 验证搜索结果包含期望的基金
  57  |     await searchPage.expectResultContains('000001', '华夏成长混合')
  58  |   })
  59  | 
  60  |   /**
  61  |    * 测试：验证基金名称、净值、估值等信息正确
  62  |    */
  63  |   test('should display fund information correctly', async ({ page }) => {
  64  |     // 搜索基金
  65  |     await searchPage.search('000001')
  66  | 
  67  |     // 验证搜索结果中的基金信息
  68  |     const resultInfo = await searchPage.getResultInfo(0)
  69  |     expect(resultInfo.code).toBe('000001')
  70  |     expect(resultInfo.name).toContain('华夏')
  71  |   })
  72  | 
  73  |   /**
  74  |    * 测试：搜索不存在的基金
  75  |    */
  76  |   test('should show empty result for non-existent fund', async ({ page }) => {
  77  |     // 搜索不存在的基金
  78  |     await searchPage.search('999999')
  79  | 
  80  |     // 验证搜索结果为空
  81  |     await searchPage.expectEmptyResult()
  82  |   })
  83  | 
  84  |   /**
  85  |    * 测试：清空搜索框
  86  |    */
  87  |   test('should clear search input', async ({ page }) => {
  88  |     // 输入搜索关键词
  89  |     await searchPage.searchInput.fill('000001')
  90  |     expect(await searchPage.searchInput.inputValue()).toBe('000001')
  91  | 
  92  |     // 清空搜索框
  93  |     await searchPage.clearSearch()
  94  |     expect(await searchPage.searchInput.inputValue()).toBe('')
  95  |   })
  96  | 
  97  |   /**
  98  |    * 测试：搜索基金名称（而不是代码）
  99  |    */
  100 |   test('should search fund by name', async ({ page }) => {
  101 |     // 搜索基金名称
  102 |     await searchPage.search('华夏')
  103 | 
  104 |     // 验证搜索结果
  105 |     const resultCount = await searchPage.getResultCount()
> 106 |     expect(resultCount).toBeGreaterThan(0)
      |                         ^ Error: expect(received).toBeGreaterThan(expected)
  107 |   })
  108 | })
  109 | 
```