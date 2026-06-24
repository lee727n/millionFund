// [WHY] Mock API 工具 — 拦截和模拟 API 请求，避免依赖外部服务
// [WHAT] 提供 Mock 基金数据、拦截 API 请求的方法
// [DEPS] @playwright/test

import { type Page } from '@playwright/test'

/**
 * Mock 基金数据
 */
export const MOCK_FUNDS = {
  '000001': {
    code: '000001',
    name: '华夏成长混合',
    valuation: '1.2345',
    change: '+0.56%',
    nav: '1.2289',
    navDate: '2026-06-23',
  },
  '110022': {
    code: '110022',
    name: '易方达消费行业',
    valuation: '3.4567',
    change: '-0.23%',
    nav: '3.4611',
    navDate: '2026-06-23',
  },
  '161725': {
    code: '161725',
    name: '招商中证白酒指数',
    valuation: '1.0123',
    change: '+1.25%',
    nav: '1.0008',
    navDate: '2026-06-23',
  },
  '001186': {
    code: '001186',
    name: '富国文体健康股票A',
    valuation: '2.1234',
    change: '+0.89%',
    nav: '2.1100',
    navDate: '2026-06-23',
  },
  '163406': {
    code: '163406',
    name: '兴全合润混合',
    valuation: '1.5678',
    change: '-0.45%',
    nav: '1.5723',
    navDate: '2026-06-23',
  },
}

/**
 * 设置 Mock API
 * @param page - Playwright Page 对象
 */
export async function setupMockAPI(page: Page): Promise<void> {
  // 拦截基金估值 API（相对路径，Vite proxy 转发）
  await page.route('**/api/fundgz/**', async (route) => {
    const url = route.request().url()
    console.log('[Mock API] Intercepted valuation API (relative):', url)

    // 提取基金代码
    const codeMatch = url.match(/fundcode=(\d+)/)
    const code = codeMatch ? codeMatch[1] : '000001'
    const fund = MOCK_FUNDS[code as keyof typeof MOCK_FUNDS] || MOCK_FUNDS['000001']

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          fundcode: fund.code,
          name: fund.name,
          gsz: fund.valuation,
          gszzl: fund.change,
          jzrq: fund.navDate,
          dwjz: fund.nav,
        },
      }),
    })
  })

  // 拦截基金估值 API（绝对路径，直接请求外部数据源）
  await page.route('**/fundgz.1234567.com.cn/**', async (route) => {
    const url = route.request().url()
    console.log('[Mock API] Intercepted valuation API (absolute):', url)

    // 提取基金代码
    const codeMatch = url.match(/fundcode=(\d+)/)
    const code = codeMatch ? codeMatch[1] : '000001'
    const fund = MOCK_FUNDS[code as keyof typeof MOCK_FUNDS] || MOCK_FUNDS['000001']

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          fundcode: fund.code,
          name: fund.name,
          gsz: fund.valuation,
          gszzl: fund.change,
          jzrq: fund.navDate,
          dwjz: fund.nav,
        },
      }),
    })
  })

  // 拦截基金搜索 API（相对路径）
  await page.route('**/api/fund/**', async (route) => {
    const url = route.request().url()
    console.log('[Mock API] Intercepted fund API (relative):', url)

    // Mock 基金搜索结果
    if (url.includes('search') || url.includes('FundSearch')) {
      // 尝试从 URL 或请求体获取搜索关键词
      const urlParams = new URL(url).searchParams
      const keyword = urlParams.get('keyword') || urlParams.get('kw') || ''
      
      // 过滤匹配的基金
      const allFunds = Object.values(MOCK_FUNDS)
      const filteredFunds = keyword 
        ? allFunds.filter(f => 
            f.code.includes(keyword) || 
            f.name.includes(keyword)
          )
        : allFunds
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: filteredFunds,
          total: filteredFunds.length,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // 拦截基金搜索 API（绝对路径）
  await page.route('**/api.fund.eastmoney.com/**', async (route) => {
    const url = route.request().url()
    console.log('[Mock API] Intercepted fund API (absolute):', url)

    // Mock 基金搜索结果
    if (url.includes('search') || url.includes('FundSearch')) {
      // 尝试从 URL 或请求体获取搜索关键词
      const urlParams = new URL(url).searchParams
      const keyword = urlParams.get('keyword') || urlParams.get('kw') || ''
      
      // 过滤匹配的基金
      const allFunds = Object.values(MOCK_FUNDS)
      const filteredFunds = keyword 
        ? allFunds.filter(f => 
            f.code.includes(keyword) || 
            f.name.includes(keyword)
          )
        : allFunds
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: filteredFunds,
          total: filteredFunds.length,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // 拦截历史净值 API（相对路径）
  await page.route('**/api/fund/**', async (route) => {
    const url = route.request().url()
    if (url.includes('F10DataHistory') || url.includes('f10/')) {
      console.log('[Mock API] Intercepted history API (relative):', url)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { date: '2026-06-23', nav: '1.2289', change: '+0.56%' },
            { date: '2026-06-22', nav: '1.2200', change: '-0.32%' },
            { date: '2026-06-21', nav: '1.2250', change: '+0.89%' },
          ],
        }),
      })
    } else {
      await route.continue()
    }
  })

  // 拦截历史净值 API（绝对路径）
  await page.route('**/api.fund.eastmoney.com/f10/F10DataHistory/**', async (route) => {
    console.log('[Mock API] Intercepted history API (absolute)')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { date: '2026-06-23', nav: '1.2289', change: '+0.56%' },
          { date: '2026-06-22', nav: '1.2200', change: '-0.32%' },
          { date: '2026-06-21', nav: '1.2250', change: '+0.89%' },
        ],
      }),
    })
  })
}

/**
 * 模拟交易时间
 * @param page - Playwright Page 对象
 * @param isTrading - 是否在交易时间
 */
export async function mockTradingTime(page: Page, isTrading: boolean): Promise<void> {
  await page.addInitScript((trading) => {
    // 重写 Date 对象，模拟交易时间
    const originalDate = Date
    const mockDate = new Date('2026-06-24T10:30:00+08:00') // 上午 10:30，交易时间

    if (!trading) {
      mockDate.setHours(20, 0, 0, 0) // 晚上 8 点，非交易时间
    }

    // @ts-ignore
    window.__mockDate = mockDate
  }, isTrading)
}

/**
 * 等待页面加载完成
 * @param page - Playwright Page 对象
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
}
