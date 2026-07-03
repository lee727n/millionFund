// [WHY] QDII 基金辅助工具，处理 QDII 基金的延迟更新、类型识别等
// [WHAT] 提供 QDII 基金检测、延迟天数计算、延迟提示文本生成
// [REF] v1.10: QDII 基金支持增强 - 标记 + 延迟更新逻辑

const QDII_KEYWORDS = [
  'QDII', 'qdii',
  '纳斯达克', '纳指', '标普', '道琼斯',
  '港股', '香港', '恒生',
  '美股', '美国',
  '全球', '海外', '国际',
  '金砖', '新兴市场',
  '亚洲', '欧洲', '日本', '德国', '法国', '英国',
  '黄金', '大宗商品', '原油', '油气', '资源',
  'REIT', 'reits', '不动产',
]

export function detectQDII(fundName: string, fundType?: string): boolean {
  if (!fundName && !fundType) return false
  const text = `${fundName || ''} ${fundType || ''}`.toLowerCase()
  return QDII_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
}

export function getQDIIDelayDays(fundName: string, fundType?: string): number {
  if (!fundName && !fundType) return 1
  const text = `${fundName || ''} ${fundType || ''}`.toLowerCase()

  if (text.includes('黄金') || text.includes('gold')) return 1
  if (text.includes('港股') || text.includes('恒生') || text.includes('香港')) return 1
  if (text.includes('美股') || text.includes('纳斯达克') || text.includes('纳指') ||
      text.includes('标普') || text.includes('道琼斯') || text.includes('美国')) return 2
  if (text.includes('欧洲') || text.includes('德国') || text.includes('法国') ||
      text.includes('英国') || text.includes('日本')) return 2
  if (text.includes('全球') || text.includes('海外') || text.includes('国际') ||
      text.includes('新兴市场') || text.includes('金砖')) return 2
  if (text.includes('reits') || text.includes('不动产') || text.includes('reit')) return 2

  return 1
}

export function getQDIIDelayText(fundName: string, fundType?: string): string {
  const days = getQDIIDelayDays(fundName, fundType)
  return `T+${days}`
}

export function getQDIIDelayDescription(fundName: string, fundType?: string): string {
  const days = getQDIIDelayDays(fundName, fundType)
  if (days <= 1) {
    return '净值延迟1个交易日公布'
  }
  return `净值延迟${days}个交易日公布`
}
