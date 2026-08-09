// @ts-nocheck
// [WHY] #7 OCR 真实样张测试 - 解决旗舰功能「真实中文截图表现未验证」风险
// [WHAT] 使用用户提供的蚂蚁财富(支付宝)持仓截图对应的真实 OCR 文本样张 (fixtures/ant-fortune-holding.sample.txt)，
//        验证 detectPlatform 能识别平台、parseHoldingText 能正确提取真实持仓。
// [NOTE] 真实 Tesseract 识别需 WASM + 浏览器环境，无法在 CI 运行；此处用「真实样张的 OCR 输出文本」
//        作为 fixture 验证解析层（解析层是识别率的真正瓶颈）。真实 PNG 可放入 tests/fixtures/screenshots/
//        供后续端到端 Tesseract 集成测试使用（超出 CI 范围）。
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { detectPlatform, parseHoldingText } from '@/utils/ocr'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SAMPLE = readFileSync(join(__dirname, 'fixtures', 'ant-fortune-holding.sample.txt'), 'utf-8')

describe('OCR 真实样张 (蚂蚁财富/支付宝 持仓截图)', () => {
  test('detectPlatform 识别为支付宝/蚂蚁财富 平台', () => {
    const { platform, confidence } = detectPlatform(SAMPLE)
    // 截图为蚂蚁财富(支付宝理财臂)，detectPlatform 可识别为 alipay 或 ant 二者之一
    expect(['alipay', 'ant']).toContain(platform)
    expect(confidence).toBeGreaterThan(0)
  })

  test('parseHoldingText 提取持有列表中的基金 (名称 + 金额)', () => {
    const holdings = parseHoldingText(SAMPLE)
    expect(holdings.length).toBeGreaterThanOrEqual(4)

    const byName = (sub: string) => holdings.find(h => h.name.includes(sub))

    const ht = byName('华泰柏瑞红利低波')
    expect(ht).toBeDefined()
    expect(ht!.amount).toBeCloseTo(3210.5, 1)

    const gq = byName('广发全球精选')
    expect(gq).toBeDefined()
    expect(gq!.amount).toBeCloseTo(1876.2, 1)

    const nx = byName('广发纳斯达克100指数')
    expect(nx).toBeDefined()
    expect(nx!.amount).toBeCloseTo(542.1, 1)

    const ly = byName('易方达蓝筹精选')
    expect(ly).toBeDefined()
    expect(ly!.amount).toBeCloseTo(2098.75, 1)
  })

  test('parseHoldingText 提取详情页基金代码 (006479)', () => {
    const holdings = parseHoldingText(SAMPLE)
    const detail = holdings.find(h => h.code === '006479' || h.name.includes('广发纳斯达克100ETF联接'))
    expect(detail).toBeDefined()
    expect(detail!.code).toBe('006479')
  })
})
