import { describe, test, expect, beforeEach } from 'vitest'
import { pinyinSearch } from './pinyinSearch'

describe('pinyinSearch.ts', () => {
  beforeEach(() => {
    // [WHAT] 清空 localStorage（含 recent searches 与 logger 写入），并在每个用例前重建索引，保证测试隔离
    localStorage.clear()
    pinyinSearch.buildIndex([
      { code: '110011', name: '易方达蓝筹精选混合', type: '混合型' },
      { code: '161725', name: '招商中证白酒指数', type: '指数型' },
      { code: '001102', name: '华夏成长混合', type: '混合型' },
      { code: '000001', name: '华夏大盘精选混合', type: '混合型' },
      { code: '519674', name: '银河创新成长混合', type: '混合型' }
    ])
  })

  // ========== buildIndex & 基础状态 ==========

  test('buildIndex 构建索引并更新状态', () => {
    expect(pinyinSearch.isBuilt()).toBe(true)
    expect(pinyinSearch.getIndexSize()).toBe(5)
  })

  test('buildIndex 重建索引时覆盖旧数据', () => {
    pinyinSearch.buildIndex([
      { code: '001', name: '基金一' },
      { code: '002', name: '基金二' }
    ])
    expect(pinyinSearch.getIndexSize()).toBe(2)
  })

  // ========== 空关键词 ==========

  test('空关键词返回空数组', () => {
    expect(pinyinSearch.search('')).toEqual([])
    expect(pinyinSearch.search('   ')).toEqual([])
  })

  test('无匹配时返回空数组', () => {
    expect(pinyinSearch.search('zzzznotexist')).toEqual([])
  })

  // ========== 按代码搜索 ==========

  test('按代码精确匹配（得分最高，排在首位）', () => {
    const results = pinyinSearch.search('110011')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.code).toBe('110011')
    expect(results[0]!.name).toBe('易方达蓝筹精选混合')
  })

  test('按代码前缀匹配', () => {
    const results = pinyinSearch.search('1100')
    expect(results.some(r => r.code === '110011')).toBe(true)
  })

  // ========== 按名称搜索 ==========

  test('按名称包含匹配', () => {
    const results = pinyinSearch.search('白酒')
    expect(results.some(r => r.code === '161725')).toBe(true)
  })

  // ========== 按拼音搜索 ==========

  test('按拼音匹配（huaxia 命中华夏系列）', () => {
    const results = pinyinSearch.search('huaxia')
    // [WHAT] 华夏成长混合 / 华夏大盘精选混合 的拼音均以 huaxia 开头
    expect(results.some(r => r.name.includes('华夏'))).toBe(true)
    expect(results.filter(r => r.name.includes('华夏')).length).toBe(2)
  })

  // ========== 按拼音首字母缩写搜索 ==========

  test('按拼音首字母缩写匹配（yfd 命中易方达）', () => {
    // [WHAT] 易方达蓝筹精选混合 -> yfdlcjxhh
    const results = pinyinSearch.search('yfd')
    expect(results.some(r => r.code === '110011')).toBe(true)
  })

  // ========== 得分排序 ==========

  test('得分排序：代码精确匹配(100) 排在 名称包含(80) 之前', () => {
    pinyinSearch.buildIndex([
      { code: '000001', name: '某某基金A', type: '混合' },
      { code: '000010', name: '名称包含000001的基金', type: '混合' }
    ])
    // [WHAT] '000001' 精确命中 000001 代码(score=100)；同时命中 000010 的名称(score=80)
    const results = pinyinSearch.search('000001')
    expect(results.length).toBe(2)
    expect(results[0]!.code).toBe('000001')   // score 100
    expect(results[1]!.code).toBe('000010')   // score 80
  })

  test('同分时按代码升序排列', () => {
    pinyinSearch.buildIndex([
      { code: '002', name: '华夏大盘', type: '混合' },
      { code: '001', name: '华夏成长', type: '混合' }
    ])
    // [WHAT] 两条均按名称命中 '华夏'，得分相同(80)，按代码升序
    const results = pinyinSearch.search('华夏')
    expect(results[0]!.code).toBe('001')
    expect(results[1]!.code).toBe('002')
  })

  // ========== limit 参数 ==========

  test('limit 参数限制返回数量', () => {
    const results = pinyinSearch.search('华夏', 1)
    expect(results.length).toBe(1)
  })

  // ========== type 字段透传 ==========

  test('搜索结果保留 type 字段', () => {
    const results = pinyinSearch.search('110011')
    expect(results[0]!.type).toBe('混合型')
  })

  // ========== 最近搜索 ==========

  test('addRecentSearch / getRecentSearches 添加并读取（最新在前）', () => {
    pinyinSearch.addRecentSearch('白酒')
    pinyinSearch.addRecentSearch('华夏')
    const recent = pinyinSearch.getRecentSearches()
    expect(recent[0]).toBe('华夏')
    expect(recent[1]).toBe('白酒')
  })

  test('addRecentSearch 重复关键词会被去重并移到最前', () => {
    pinyinSearch.addRecentSearch('白酒')
    pinyinSearch.addRecentSearch('华夏')
    pinyinSearch.addRecentSearch('白酒')
    const recent = pinyinSearch.getRecentSearches()
    expect(recent[0]).toBe('白酒')
    expect(recent.length).toBe(2)
  })

  test('getRecentSearches 支持限制返回数量', () => {
    for (let i = 0; i < 5; i++) {
      pinyinSearch.addRecentSearch(`kw${i}`)
    }
    expect(pinyinSearch.getRecentSearches(3).length).toBe(3)
  })

  test('getRecentSearches 无数据时返回空数组', () => {
    expect(pinyinSearch.getRecentSearches()).toEqual([])
  })

  test('clearRecentSearches 清空最近搜索', () => {
    pinyinSearch.addRecentSearch('白酒')
    pinyinSearch.addRecentSearch('华夏')
    pinyinSearch.clearRecentSearches()
    expect(pinyinSearch.getRecentSearches()).toEqual([])
  })
})
