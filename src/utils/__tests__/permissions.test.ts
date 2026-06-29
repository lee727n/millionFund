import { describe, test, expect, vi, beforeEach } from 'vitest'

// 顶层 mock
vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => ({
    checkPermissions: vi.fn().mockResolvedValue({ camera: 'GRANTED', storage: 'GRANTED', allGranted: true }),
    requestPermissions: vi.fn().mockResolvedValue({ camera: 'GRANTED', storage: 'GRANTED', allGranted: true }),
  })),
}))

describe('permissions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('checkPermissions 返回权限状态', async () => {
    const { checkPermissions } = await import('@/utils/permissions')
    const result = await checkPermissions()
    expect(result.allGranted).toBe(true)
  })

  test('requestPermissions 请求权限', async () => {
    const { requestPermissions } = await import('@/utils/permissions')
    const result = await requestPermissions()
    expect(result.allGranted).toBe(true)
  })
})
