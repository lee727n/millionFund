import { describe, test, expect, beforeEach } from 'vitest'

describe('storage.ts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('getWatchlist 默认返回空数组', async () => {
    const { getWatchlist } = await import('@/utils/storage')
    const r = await getWatchlist()
    expect(r).toEqual([])
  })

  test('saveWatchlist 和 getWatchlist 往返', async () => {
    const { getWatchlist, saveWatchlist } = await import('@/utils/storage')
    await saveWatchlist(['000001', '000002'])
    expect(await getWatchlist()).toEqual(['000001', '000002'])
  })

  test('addToWatchlist 不重复添加', async () => {
    const { addToWatchlist, getWatchlist } = await import('@/utils/storage')
    await addToWatchlist('000001')
    await addToWatchlist('000001')
    expect(await getWatchlist()).toEqual(['000001'])
  })

  test('removeFromWatchlist 删除', async () => {
    const { addToWatchlist, removeFromWatchlist, getWatchlist } = await import('@/utils/storage')
    await addToWatchlist('000001')
    await addToWatchlist('000002')
    await removeFromWatchlist('000001')
    expect(await getWatchlist()).toEqual(['000002'])
  })

  test('isInWatchlist 判断', async () => {
    const { addToWatchlist, isInWatchlist } = await import('@/utils/storage')
    await addToWatchlist('000001')
    expect(await isInWatchlist('000001')).toBe(true)
    expect(await isInWatchlist('000002')).toBe(false)
  })

  test('getHoldings 默认返回空数组', async () => {
    const { getHoldings } = await import('@/utils/storage')
    const r = await getHoldings()
    expect(r).toEqual([])
  })

  test('saveHoldings 和 getHoldings 往返', async () => {
    const { getHoldings, saveHoldings } = await import('@/utils/storage')
    const holdings = [{ code: '000001', name: '基金A', buyNetValue: 1, shares: 100, buyDate: '2024-01-01', holdingDays: 0 }] as any
    await saveHoldings(holdings)
    expect(await getHoldings()).toHaveLength(1)
  })

  test('updateFundNetValue 和 getFundNetValue', async () => {
    const { updateFundNetValue, getFundNetValue } = await import('@/utils/storage')
    await updateFundNetValue('000001', 1.5)
    expect(await getFundNetValue('000001')).toBe(1.5)
  })

  test('getSourceFilter 默认返回空', async () => {
    const { getSourceFilter } = await import('@/utils/storage')
    expect(getSourceFilter()).toBe('')
  })
})
