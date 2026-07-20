// [WHAT] 测试 fundDetail.ts 的多源净值解析核心逻辑
// [WHY] Batch C 抽取了 resolveAccurateValue / setAccurateSource 以消除 QDII/非QDII 重复分支，
//        这两个纯函数是本次审计修复的高风险改动，需覆盖 QDII/非QDII、今日/昨日净值、估值、交易时段等分支
// [DEPS] src/api/fundDetail

import { describe, test, expect, vi } from 'vitest'

// 隔离 IO / 网络依赖，仅测试纯逻辑（resolveAccurateValue / setAccurateSource）
vi.mock('@/utils/http', () => ({ http: { text: vi.fn(), get: vi.fn() } }))
vi.mock('@/api/cache', () => ({ cache: { get: vi.fn(), set: vi.fn() }, CACHE_TTL: {} }))
vi.mock('@/utils/persistCache', () => ({ persistCache: vi.fn() }))
vi.mock('@/api/tiantianApi', () => ({ isTradingTime: vi.fn() }))
vi.mock('@/api/fundEstimate', () => ({ fetchFundEstimateFast: vi.fn() }))
vi.mock('@/api/fundNetValue', () => ({ fetchNetValueHistoryFast: vi.fn(), fetchHS300History: vi.fn() }))
vi.mock('@/api/fundUtils', () => ({ clearFundCache: vi.fn(), clearAllCache: vi.fn(), queueGlobalVarScript: vi.fn() }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { resolveAccurateValue, setAccurateSource } from '@/api/fundDetail'
import type { FundAccurateData } from '@/api/fundTypes'

function makeResult(overrides: Partial<FundAccurateData> = {}): FundAccurateData {
  return {
    code: '000001',
    name: '测试基金',
    nav: 0,
    navDate: '',
    navChange: 0,
    estimate: 0,
    estimateTime: '',
    estimateChange: 0,
    currentValue: 0,
    dayChange: 0,
    dataSource: 'fallback',
    updateTime: '',
    ...overrides
  }
}

const baseOpts = {
  isQDII: false,
  isNavFromToday: false,
  isNavFromYesterday: false,
  isEstimateFromToday: false,
  inTradingTime: false,
  dwjz: 0
}

describe('setAccurateSource', () => {
  test("source='nav' 时写入 nav / navChange", () => {
    const r = makeResult({ nav: 1.5, navChange: 0.02 })
    setAccurateSource(r, 'nav')
    expect(r.currentValue).toBe(1.5)
    expect(r.dayChange).toBe(0.02)
    expect(r.dataSource).toBe('nav')
  })

  test("source='estimate' 时写入 estimate / estimateChange", () => {
    const r = makeResult({ estimate: 1.2, estimateChange: -0.03 })
    setAccurateSource(r, 'estimate')
    expect(r.currentValue).toBe(1.2)
    expect(r.dayChange).toBe(-0.03)
    expect(r.dataSource).toBe('estimate')
  })

  test("source='fallback' 传入 dwjz 时写入备用净值", () => {
    const r = makeResult()
    setAccurateSource(r, 'fallback', 0.99)
    expect(r.currentValue).toBe(0.99)
    expect(r.dayChange).toBe(0)
    expect(r.dataSource).toBe('fallback')
  })

  test("source='fallback' 无 fallbackValue 时默认 0", () => {
    const r = makeResult()
    setAccurateSource(r, 'fallback')
    expect(r.currentValue).toBe(0)
    expect(r.dataSource).toBe('fallback')
  })
})

describe('resolveAccurateValue - QDII', () => {
  test('QDII + 昨日净值可用 → 优先使用 nav（即便今日估值可用）', () => {
    const r = makeResult({ nav: 2.0, navChange: 0.01, estimate: 1.9, estimateChange: 0.05 })
    resolveAccurateValue(r, { ...baseOpts, isQDII: true, isNavFromYesterday: true, isEstimateFromToday: true, inTradingTime: true })
    expect(r.dataSource).toBe('nav')
    expect(r.currentValue).toBe(2.0)
    expect(r.dayChange).toBe(0.01)
  })

  test('QDII + 无净值 + 今日估值 → estimate', () => {
    const r = makeResult({ estimate: 1.5, estimateChange: 0.04 })
    resolveAccurateValue(r, { ...baseOpts, isQDII: true, isEstimateFromToday: true })
    expect(r.dataSource).toBe('estimate')
    expect(r.currentValue).toBe(1.5)
  })

  test('QDII + 无净值 + 非今日估值 → 仍使用 estimate（兜底）', () => {
    const r = makeResult({ estimate: 1.5, estimateChange: 0.04 })
    resolveAccurateValue(r, { ...baseOpts, isQDII: true, isEstimateFromToday: false })
    expect(r.dataSource).toBe('estimate')
    expect(r.currentValue).toBe(1.5)
  })
})

describe('resolveAccurateValue - 非 QDII', () => {
  test('今日净值可用 → 使用 nav（即便交易时段有估值）', () => {
    const r = makeResult({ nav: 2.1, navChange: 0.02, estimate: 1.8, estimateChange: 0.06 })
    resolveAccurateValue(r, { ...baseOpts, isNavFromToday: true, isEstimateFromToday: true, inTradingTime: true })
    expect(r.dataSource).toBe('nav')
    expect(r.currentValue).toBe(2.1)
  })

  test('非今日净值 + 交易时段 + 估值可用 → estimate', () => {
    const r = makeResult({ nav: 2.0, navChange: 0.01, estimate: 1.8, estimateChange: 0.03 })
    resolveAccurateValue(r, { ...baseOpts, isNavFromYesterday: true, isEstimateFromToday: true, inTradingTime: true })
    expect(r.dataSource).toBe('estimate')
    expect(r.currentValue).toBe(1.8)
  })

  test('非今日净值 + 非交易时段 + 今日估值 → estimate', () => {
    const r = makeResult({ nav: 2.0, estimate: 1.8, estimateChange: 0.03 })
    resolveAccurateValue(r, { ...baseOpts, isNavFromYesterday: true, isEstimateFromToday: true, inTradingTime: false })
    expect(r.dataSource).toBe('estimate')
    expect(r.currentValue).toBe(1.8)
  })

  test('无净值 + 交易时段 + 估值可用 → estimate', () => {
    const r = makeResult({ estimate: 1.7, estimateChange: 0.02 })
    resolveAccurateValue(r, { ...baseOpts, inTradingTime: true, isEstimateFromToday: true })
    expect(r.dataSource).toBe('estimate')
    expect(r.currentValue).toBe(1.7)
  })

  test('无净值 + 非交易时段 + 非今日估值 → 仍使用 estimate', () => {
    const r = makeResult({ estimate: 1.7, estimateChange: 0.02 })
    resolveAccurateValue(r, { ...baseOpts, inTradingTime: false, isEstimateFromToday: false })
    expect(r.dataSource).toBe('estimate')
    expect(r.currentValue).toBe(1.7)
  })

  test('无今日净值 + 无估值 + 仅有昨日净值 → 兜底使用 nav', () => {
    const r = makeResult({ nav: 2.0, navChange: 0.01 })
    resolveAccurateValue(r, { ...baseOpts, isNavFromYesterday: true, inTradingTime: false, isEstimateFromToday: false })
    expect(r.dataSource).toBe('nav')
    expect(r.currentValue).toBe(2.0)
  })
})

describe('resolveAccurateValue - 兜底', () => {
  test('仅 dwjz 可用（无净值无估值）→ fallback 写入 dwjz', () => {
    const r = makeResult({ dwjz: 0.88 } as any)
    resolveAccurateValue(r, { ...baseOpts, dwjz: 0.88 })
    expect(r.dataSource).toBe('fallback')
    expect(r.currentValue).toBe(0.88)
    expect(r.dayChange).toBe(0)
  })

  test('全部为零 → 保持初始 fallback 状态', () => {
    const r = makeResult()
    resolveAccurateValue(r, { ...baseOpts })
    expect(r.dataSource).toBe('fallback')
    expect(r.currentValue).toBe(0)
    expect(r.dayChange).toBe(0)
  })
})
