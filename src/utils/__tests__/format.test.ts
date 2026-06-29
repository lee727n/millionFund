import { describe, test, expect } from 'vitest'
import {
  formatMoney,
  formatPercent,
  formatNetValue,
  getChangeStatus,
  formatTime,
  formatDate,
} from '@/utils/format'

describe('format.ts', () => {
  test('formatMoney 正常格式化金额', () => {
    expect(formatMoney(1234.56)).toBe('1234.56')
    expect(formatMoney(1234.56, '¥')).toBe('¥1234.56')
    expect(formatMoney(1234.56, '', true)).toBe('1,234')
  })

  test('formatMoney 处理 NaN', () => {
    expect(formatMoney(NaN)).toBe('--')
    expect(formatMoney('abc')).toBe('--')
  })

  test('formatMoney 处理字符串数字', () => {
    expect(formatMoney('1234.56')).toBe('1234.56')
  })

  test('formatPercent 正常格式化百分比', () => {
    expect(formatPercent(1.23)).toBe('+1.23%')
    expect(formatPercent(-1.23)).toBe('-1.23%')
    expect(formatPercent(0)).toBe('0.00%')
  })

  test('formatPercent withSign=false', () => {
    expect(formatPercent(1.23, false)).toBe('1.23%')
    expect(formatPercent(-1.23, false)).toBe('-1.23%')
  })

  test('formatPercent integerOnly', () => {
    expect(formatPercent(1.23, true, true)).toBe('+1%')
    expect(formatPercent(1.99, true, true)).toBe('+1%')
  })

  test('formatPercent 处理 NaN', () => {
    expect(formatPercent(NaN)).toBe('--')
  })

  test('formatNetValue 正常格式化净值', () => {
    expect(formatNetValue(1.2345)).toBe('1.2345')
    expect(formatNetValue(1.23456)).toBe('1.2346')
  })

  test('formatNetValue 处理 NaN', () => {
    expect(formatNetValue(NaN)).toBe('--')
  })

  test('getChangeStatus 判断涨跌', () => {
    expect(getChangeStatus(1)).toBe('up')
    expect(getChangeStatus(0.01)).toBe('up')
    expect(getChangeStatus(0)).toBe('flat')
    expect(getChangeStatus(-0.01)).toBe('down')
    expect(getChangeStatus(-1)).toBe('down')
  })

  test('getChangeStatus 处理 NaN', () => {
    expect(getChangeStatus(NaN)).toBe('flat')
    expect(getChangeStatus('abc')).toBe('flat')
  })

  test('formatTime 格式化时间', () => {
    expect(formatTime('2024-01-01 15:30:00')).toBe('15:30:00')
    expect(formatTime('')).toBe('--')
    expect(formatTime('2024-01-01')).toBe('2024-01-01')
  })

  test('formatDate 格式化日期', () => {
    expect(formatDate('2024-01-01 15:30:00')).toBe('01-01')
    expect(formatDate('')).toBe('--')
    expect(formatDate('invalid')).toBe('invalid')
  })
})
