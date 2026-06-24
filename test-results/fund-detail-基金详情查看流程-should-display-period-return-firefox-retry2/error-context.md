# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-detail.spec.ts >> 基金详情查看流程 >> should display period return
- Location: e2e\fund-detail.spec.ts:100:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-test-id="period-return"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-test-id="period-return"]')

```

```yaml
- text:  加载中... 000001 | 估值涨幅 +0.00% | 估值 0.0000 当日涨幅 -- +0.00% 估算净值 0 昨日净值 0 最佳回报 -- 当日 5日 1月 3月 6月 1年 实时 开 0.0000 高 0.0000 低 0.0000 收 0.0000 涨跌 +0.00% 成交量(Volume) 0
- img
- paragraph: 暂无趋势数据
- text: 费率信息 管理费 1.50%/年 托管费 0.25%/年 申购费率 金额 原费率 优惠费率 <100万 1.5% 0.15% 100-300万 1.2% 0.12% 300-500万 0.8% 0.08% ≥500万 1000元 1000元 赎回费率 持有期限 费率 <7天 1.5% 7-30天 0.5% 30-365天 0.5% 365-730天 0.25% ≥730天 免费 重仓股票 暂无持仓数据 基金公告 公告 投资有风险，理财需谨慎 2026-06-24  公告 数据刷新有延迟，仅供学习和参考 2026-06-24   修改持仓  来源  交易记录  加自选  行业板块  更多
```

# Test source

```ts
  41  |     this.loadingIndicator = page.locator('[data-test-id="loading"]')
  42  |     this.chartContainer = page.locator('[data-test-id="chart-container"]')
  43  |   }
  44  | 
  45  |   /**
  46  |    * 导航到基金详情页
  47  |    * @param code - 基金代码
  48  |    */
  49  |   async goto(code: string): Promise<void> {
  50  |     await this.page.goto(`/detail/${code}`)
  51  |     await this.page.waitForLoadState('networkidle')
  52  |   }
  53  | 
  54  |   /**
  55  |    * 获取基金名称
  56  |    * @returns 基金名称
  57  |    */
  58  |   async getFundName(): Promise<string> {
  59  |     return (await this.fundName.textContent()) || ''
  60  |   }
  61  | 
  62  |   /**
  63  |    * 获取基金代码
  64  |    * @returns 基金代码
  65  |    */
  66  |   async getFundCode(): Promise<string> {
  67  |     return (await this.fundCode.textContent()) || ''
  68  |   }
  69  | 
  70  |   /**
  71  |    * 获取实时估值
  72  |    * @returns 估值数值
  73  |    */
  74  |   async getValuation(): Promise<string> {
  75  |     return (await this.valuation.textContent()) || ''
  76  |   }
  77  | 
  78  |   /**
  79  |    * 获取估值变化
  80  |    * @returns 估值变化（包含涨跌百分比）
  81  |    */
  82  |   async getValuationChange(): Promise<string> {
  83  |     return (await this.valuationChange.textContent()) || ''
  84  |   }
  85  | 
  86  |   /**
  87  |    * 点击查看历史净值
  88  |    */
  89  |   async viewHistory(): Promise<void> {
  90  |     await this.historyNavLink.click()
  91  |     await this.page.waitForLoadState('networkidle')
  92  |   }
  93  | 
  94  |   /**
  95  |    * 刷新估值
  96  |    */
  97  |   async refreshValuation(): Promise<void> {
  98  |     await this.refreshButton.click()
  99  |     // 等待刷新完成
  100 |     await this.loadingIndicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  101 |     await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  102 |   }
  103 | 
  104 |   /**
  105 |    * 返回基金列表页
  106 |    */
  107 |   async goBack(): Promise<void> {
  108 |     await this.backButton.click()
  109 |     await this.page.waitForLoadState('networkidle')
  110 |   }
  111 | 
  112 |   /**
  113 |    * 验证页面已加载
  114 |    * @param code - 期望的基金代码
  115 |    */
  116 |   async expectPageLoaded(code: string): Promise<void> {
  117 |     await expect(this.page).toHaveURL(new RegExp(`/detail/${code}`))
  118 |     await expect(this.fundCode).toContainText(code)
  119 |   }
  120 | 
  121 |   /**
  122 |    * 验证估值显示
  123 |    */
  124 |   async expectValuationVisible(): Promise<void> {
  125 |     await expect(this.valuation).toBeVisible()
  126 |     const valuationText = await this.getValuation()
  127 |     expect(valuationText).not.toBe('')
  128 |   }
  129 | 
  130 |   /**
  131 |    * 验证历史净值图表显示
  132 |    */
  133 |   async expectHistoryChartVisible(): Promise<void> {
  134 |     await expect(this.chartContainer).toBeVisible()
  135 |   }
  136 | 
  137 |   /**
  138 |    * 验证阶段涨幅显示
  139 |    */
  140 |   async expectPeriodReturnVisible(): Promise<void> {
> 141 |     await expect(this.periodReturnSection).toBeVisible()
      |                                            ^ Error: expect(locator).toBeVisible() failed
  142 |   }
  143 | 
  144 |   /**
  145 |    * 验证刷新按钮工作
  146 |    */
  147 |   async expectRefreshWorks(): Promise<void> {
  148 |     const valuationBefore = await this.getValuation()
  149 |     await this.refreshValuation()
  150 |     // 这里只是验证刷新按钮可点击，不验证估值变化（因为可能是相同的）
  151 |     await this.expectValuationVisible()
  152 |   }
  153 | 
  154 |   /**
  155 |    * 等待估值自动刷新（用于测试智能刷新功能）
  156 |    * @param timeout - 超时时间（毫秒），默认 10000
  157 |    */
  158 |   async waitForAutoRefresh(timeout: number = 10000): Promise<void> {
  159 |     // 记录初始估值
  160 |     const initialValuation = await this.getValuation()
  161 | 
  162 |     // 等待估值变化或超时
  163 |     await this.page.waitForFunction(
  164 |       async (initial) => {
  165 |         const current = document.querySelector('[data-test-id="valuation"]')?.textContent
  166 |         return current !== initial
  167 |       },
  168 |       initialValuation,
  169 |       { timeout }
  170 |     )
  171 |   }
  172 | }
  173 | 
```