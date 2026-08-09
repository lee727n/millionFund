// [WHY] Task #11: jaccardSimilarity 是新闻去重/相似聚类的核心纯函数，
// 此前无任何单元测试覆盖。中文标题无空格，必须验证字符级 2-gram 分词正确。
import { describe, it, expect } from 'vitest'
import { jaccardSimilarity, tokenize } from '@/utils/jaccard'

describe('jaccardSimilarity', () => {
  it('相同字符串相似度为 1', () => {
    expect(jaccardSimilarity('央行降准', '央行降准')).toBe(1)
    expect(jaccardSimilarity('Fed Hikes Rate', 'Fed Hikes Rate')).toBe(1)
  })

  it('两个空字符串返回 0（而非 NaN/除以零）', () => {
    expect(jaccardSimilarity('', '')).toBe(0)
  })

  it('其一为空返回 0', () => {
    expect(jaccardSimilarity('央行降准', '')).toBe(0)
    expect(jaccardSimilarity('', '央行降准')).toBe(0)
  })

  it('完全不相关的中文标题相似度为 0', () => {
    // "苹果手机" 与 "央行降准" 无公共 2-gram
    expect(jaccardSimilarity('苹果手机', '央行降准')).toBe(0)
  })

  it('高度相似中文标题相似度 > 0.5（能捕捉局部重叠，旧空白分词会失效）', () => {
    // 两标题共享大量相邻 2-gram（央行/降准/释放/流动性…），旧空白分词会整句当单 token 而失效
    const s = jaccardSimilarity('央行降准释放流动性', '央行再次降准释放流动性')
    expect(s).toBeGreaterThan(0.5)
    expect(s).toBeLessThanOrEqual(1)
  })

  it('英文大小写不敏感', () => {
    expect(jaccardSimilarity('Fed Hikes', 'fed hikes')).toBe(1)
  })

  it('英文相似短语相似度 > 0.5', () => {
    const s = jaccardSimilarity('Fed raises interest rate', 'Fed hikes interest rate')
    expect(s).toBeGreaterThan(0.5)
  })

  it('混合中英文与数字/代码正确切分并匹配', () => {
    const s = jaccardSimilarity('基金代码 000001 今日上涨', '基金代码 000001 昨日下跌')
    expect(s).toBeGreaterThan(0.4)
  })

  it('单字符标题不抛错且返回有限值', () => {
    expect(jaccardSimilarity('A', 'A')).toBe(1)
    expect(jaccardSimilarity('A', 'B')).toBe(0)
  })

  it('完全不相交返回 0', () => {
    expect(jaccardSimilarity('abcdef', 'ghijkl')).toBe(0)
  })

  it('相似度始终落在 [0,1] 闭区间', () => {
    const cases = [
      ['央行降准', '降准央行'],
      ['hello world', 'world hello'],
      ['12345', '54321'],
      ['比特币突破新高', '以太坊创历史新高']
    ]
    for (const [a, b] of cases) {
      const s = jaccardSimilarity(a, b)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('tokenize (字符级 2-gram)', () => {
  it('中文生成相邻 2-gram', () => {
    expect([...tokenize('央行降准')]).toEqual(['央行', '行降', '降准'])
  })

  it('归一化：小写 + 去标点空白', () => {
    expect([...tokenize('  Fed, Hikes!  ')]).toEqual([
      'fe', 'ed', 'dh', 'hi', 'ik', 'ke', 'es'
    ])
  })

  it('极短文本（≤3）额外加入单字符 token', () => {
    // 长度 1：仅单字符
    expect([...tokenize('A')]).toEqual(['a'])
    // 长度 3：2-gram（ab,bc）+ 单字符（a,b,c）
    const t = [...tokenize('abc')].sort()
    expect(t).toEqual(['a', 'ab', 'b', 'bc', 'c'])
  })

  it('空字符串返回空集', () => {
    expect(tokenize('').size).toBe(0)
  })
})
