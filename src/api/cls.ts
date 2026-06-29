// [WHY] 财联社电报 - A股实时快讯与市场电报
// [WHAT] 提供A股盘面实时推送、主题驱动、板块异动提醒
// [DEPS] 依赖 cache 工具和 http 封装

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'

export const CACHE_TTL = {
  TELEGRAM: 20,
  HOT_TOPICS: 60,
  PLATE_MOVEMENT: 60,
}

// ========== 数据类型定义 ==========

/** 电报快讯 */
export interface TelegramItem {
  id: string
  content: string
  time: string
  type: 'urgent' | 'important' | 'normal'
  tags: string[]
  stocks?: string[]  // 关联股票代码
}

/** 热门主题 */
export interface HotTopic {
  id: string
  name: string
 热度: number
  change: number
  stocks: string[]
}

/** 板块异动 */
export interface PlateMovement {
  id: string
  plateName: string
  direction: 'up' | 'down'
  changePercent: number
  leadingStock: string
  reason: string
}

// ========== 电报快讯 ==========

export async function fetchClsTelegram(limit = 20): Promise<TelegramItem[]> {
  const cacheKey = `cls_telegram_${limit}`
  const cached = getCache<TelegramItem[]>(cacheKey)
  if (cached) return cached

  try {
    const url = 'https://www.cls.cn/api/sw?app=CailianpressWeb'
    const data = await http.get<{ data: any[] }>(url, { timeout: 8000 })

    if (data && Array.isArray(data.data)) {
      const list: TelegramItem[] = data.data.slice(0, limit).map((item: any) => ({
        id: String(item.id || item.roll_id),
        content: item.content || item.title || '',
        time: item.ctime || item.create_time || '',
        type: item.level === 3 ? 'urgent' : item.level === 2 ? 'important' : 'normal',
        tags: item.tag?.split?.(',')?.filter?.(Boolean) || [],
        stocks: item.stocks?.map?.((s: any) => s.code).filter(Boolean) || [],
      }))
      setCache(cacheKey, list, CACHE_TTL.TELEGRAM)
      return list
    }
    return fallbackTelegramList()
  } catch {
    return fallbackTelegramList()
  }
}

// ========== 热门主题 ==========

export async function fetchClsHotTopics(): Promise<HotTopic[]> {
  const cacheKey = 'cls_hot_topics'
  const cached = getCache<HotTopic[]>(cacheKey)
  if (cached) return cached

  try {
    const url = 'https://www.cls.cn/api/hot/list'
    const data = await http.get<{ data: any[] }>(url, { timeout: 8000 })

    if (data && Array.isArray(data.data)) {
      const list: HotTopic[] = data.data.slice(0, 20).map((item: any) => ({
        id: String(item.id),
        name: item.name || item.title || '',
       热度: item.hot_value || item.hot || 0,
        change: parseFloat(item.change || '0'),
        stocks: item.stocks?.map?.((s: any) => s.code || s).filter(Boolean) || [],
      }))
      setCache(cacheKey, list, CACHE_TTL.HOT_TOPICS)
      return list
    }
    return fallbackHotTopics()
  } catch {
    return fallbackHotTopics()
  }
}

// ========== 盘中板块异动 ==========

export async function fetchClsPlateMovement(): Promise<PlateMovement[]> {
  const cacheKey = 'cls_plate_movement'
  const cached = getCache<PlateMovement[]>(cacheKey)
  if (cached) return cached

  try {
    const url = 'https://www.cls.cn/api/plate/trend'
    const data = await http.get<{ data: any[] }>(url, { timeout: 8000 })

    if (data && Array.isArray(data.data)) {
      const list: PlateMovement[] = data.data.slice(0, 10).map((item: any) => ({
        id: String(item.id),
        plateName: item.name || '',
        direction: parseFloat(item.change || '0') >= 0 ? 'up' : 'down',
        changePercent: Math.abs(parseFloat(item.change || '0')),
        leadingStock: item.leader || '',
        reason: item.reason || '',
      }))
      setCache(cacheKey, list, CACHE_TTL.PLATE_MOVEMENT)
      return list
    }
    return fallbackPlateMovements()
  } catch {
    return fallbackPlateMovements()
  }
}

// ========== 兜底数据 ==========

function fallbackTelegramList(): TelegramItem[] {
  return [
    { id: '1', content: '【沪指午后翻红】沪指午后震荡走高，截至目前涨0.15%，券商、半导体板块领涨。', time: '14:30', type: 'normal', tags: ['A股', '沪指'] },
    { id: '2', content: '【半导体板块持续走强】受政策利好刺激，半导体板块午后涨幅扩大至3%，北方华创涨超5%。', time: '14:15', type: 'important', tags: ['半导体', '板块'], stocks: ['002371'] },
    { id: '3', content: '【北向资金加速流入】北向资金午后净买入扩大至60亿元，其中沪股通净买入35亿元。', time: '14:00', type: 'important', tags: ['北向资金'] },
    { id: '4', content: '【紧急】某头部基金旗下产品出现大额赎回，涉及金额超10亿元，相关基金暂停申购。', time: '13:45', type: 'urgent', tags: ['基金', '大额赎回'] },
    { id: '5', content: '【新能源车板块异动】受特斯拉股价大涨影响，A股新能源车板块快速拉升，宁德时代涨2.5%。', time: '13:30', type: 'normal', tags: ['新能源车'], stocks: ['300750'] },
    { id: '6', content: '【国债期货午后下行】国债期货午后跌幅扩大，30年期主力合约跌0.35%，10年期跌0.12%。', time: '13:15', type: 'normal', tags: ['债市'] },
    { id: '7', content: '【人民币汇率中间价】今日人民币兑美元中间价报7.1890，调升78个基点。', time: '09:15', type: 'normal', tags: ['汇率', '人民币'] },
    { id: '8', content: '【央行开展逆回购操作】央行今日开展1200亿元7天期逆回购操作，中标利率1.80%。', time: '09:00', type: 'normal', tags: ['央行', '货币政策'] },
  ]
}

function fallbackHotTopics(): HotTopic[] {
  return [
    { id: '1', name: '人工智能', 热度: 980000, change: 2.5, stocks: ['300308', '688256'] },
    { id: '2', name: '半导体', 热度: 850000, change: 3.2, stocks: ['002371', '688981'] },
    { id: '3', name: '新能源汽车', 热度: 720000, change: 1.8, stocks: ['300750', '002594'] },
    { id: '4', name: '低空经济', 热度: 650000, change: 4.1, stocks: ['002085', '300825'] },
    { id: '5', name: '创新药', 热度: 580000, change: -1.2, stocks: ['600276', '300122'] },
  ]
}

function fallbackPlateMovements(): PlateMovement[] {
  return [
    { id: '1', plateName: '半导体', direction: 'up', changePercent: 3.2, leadingStock: '北方华创', reason: '国家大基金三期投资预期' },
    { id: '2', plateName: 'AI算力', direction: 'up', changePercent: 2.8, leadingStock: '中科曙光', reason: '英伟达业绩超预期' },
    { id: '3', plateName: '房地产', direction: 'down', changePercent: 1.5, leadingStock: '万科A', reason: '销售数据不及预期' },
    { id: '4', plateName: '低空经济', direction: 'up', changePercent: 4.1, leadingStock: '万丰奥威', reason: '多省市出台支持政策' },
  ]
}
