import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

describe('useActionSheet.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('open 打开 ActionSheet 并设置标题和操作列表', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { show, title, actions, context, open } = useActionSheet()

    expect(show.value).toBe(false)

    open({
      title: '测试标题',
      actions: [
        { name: '操作1', key: 'action1' },
        { name: '操作2', key: 'action2' },
      ],
      context: { id: 123 },
    })

    expect(show.value).toBe(true)
    expect(title.value).toBe('测试标题')
    expect(actions.value).toHaveLength(2)
    expect(actions.value[0].key).toBe('action1')
    expect(context.value).toEqual({ id: 123 })
  })

  test('open 默认 context 为空对象', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { open, context } = useActionSheet()

    open({
      title: '测试',
      actions: [],
    })

    expect(context.value).toEqual({})
  })

  test('close 关闭 ActionSheet', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { show, open, close } = useActionSheet()

    open({ title: '测试', actions: [] })
    expect(show.value).toBe(true)

    close()
    expect(show.value).toBe(false)
  })

  test('onSelect 选择操作并返回 action 和 context', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { open, onSelect, context } = useActionSheet()

    open({
      title: '测试',
      actions: [
        { name: '操作1', key: 'action1' },
        { name: '操作2', key: 'action2' },
      ],
      context: { fundCode: '000001' },
    })

    const result = onSelect(0)
    expect(result).toEqual({
      action: { name: '操作1', key: 'action1' },
      context: { fundCode: '000001' },
    })
  })

  test('onSelect 选择后自动关闭', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { show, open, onSelect } = useActionSheet()

    open({
      title: '测试',
      actions: [{ name: '操作1', key: 'action1' }],
    })

    onSelect(0)
    expect(show.value).toBe(false)
  })

  test('onSelect 无效索引返回 undefined', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { open, onSelect } = useActionSheet()

    open({
      title: '测试',
      actions: [{ name: '操作1', key: 'action1' }],
    })

    const result = onSelect(5)
    expect(result).toBeUndefined()
  })

  test('多次 open 更新状态', async () => {
    const { useActionSheet } = await import('@/composables/useActionSheet')
    const { open, title, actions } = useActionSheet()

    open({
      title: '第一次',
      actions: [{ name: '操作1', key: 'action1' }],
    })
    expect(title.value).toBe('第一次')
    expect(actions.value).toHaveLength(1)

    open({
      title: '第二次',
      actions: [
        { name: '操作A', key: 'actionA' },
        { name: '操作B', key: 'actionB' },
      ],
    })
    expect(title.value).toBe('第二次')
    expect(actions.value).toHaveLength(2)
  })
})
