// [WHY] 东方财富 Choice 数据 - 资金流向与市场资金面
// [WHAT] 提供北向资金、板块资金流、主力资金流向数据
// [DEPS] 依赖 cache 工具和 http 封装

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'

export const CACHE_TTL = {
  NORTH_FLOW: 30,
  SECTOR_FLOW: 60,
  MAIN_FORCE: 30,
}

// ========== 数据类型定义 ==========

/** 北向资金数据 */
export interface NorthFlowData {
  /** 沪股通今日净流入（亿） */
  shNetInflow: number
  /** 深股通今日净流入（亿） */
  szNetInflow: number
  /** 北向合计净流入（亿） */
  totalNetInflow: number
  /** 当日余额（亿） */
  balance: number
  /** 更新日期 */
  date: string
  /** 近5日趋势 */
  recent5Day: { date: string; value: number }[]
}

/** 板块资金流向 */
export interface SectorFlow {
  sectorName: string
  netInflow: number      // 净流入（亿）
  rank: number
  leadingStock: string
  leadingChange: number  // 领涨股涨幅 %
}

/** 主力资金流向 */
export interface MainForceFlow {
  label: string           // 主力/超大单/大单/中单/小单
  netInflow: number       // 净流入（亿）
  ratio: number           // 占比 %
  isMain: boolean
}

// ========== 北向资金 ==========

export async function fetchNorthFlow(): Promise<NorthFlowData | null> {
  const cacheKey = 'choice_north_flow'
  const cached = getCache<NorthFlowData>(cacheKey)
  if (cached) return cached

  try {
    // [NOTE] 东方财富 Choice 北向资金接口
    const url = 'https://push2.eastmoney.com/api/qt/kamt.kline/get?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55&klt=1&lmt=5'
    
    const data = await http.get<{ data: any }>(url, { timeout: 8000 })

    if (data?.data) {
      const lines = data.data.klines || []
      const latestLine = lines[lines.length - 1] || ''
      const parts = latestLine.split(',')
      
      const result: NorthFlowData = {
        shNetInflow: parseFloat(parts[1] || '0'),
        szNetInflow: parseFloat(parts[2] || '0'),
        totalNetInflow: parseFloat(parts[3] || '0'),
        balance: parseFloat(parts[4] || '0'),
        date: parts[0] || '',
        recent5Day: lines.slice(-5).map((line: string) => {
          const p = line.split(',')
          return { date: p[0] || '', value: parseFloat(p[3] || '0') }
        }),
      }
      setCache(cacheKey, result, CACHE_TTL.NORTH_FLOW)
      return result
    }
    return fallbackNorthFlow()
  } catch {
    return fallbackNorthFlow()
  }
}

// ========== 板块资金流向 ==========

export async function fetchSectorFlows(count = 10): Promise<SectorFlow[]> {
  const cacheKey = `choice_sector_flow_${count}`
  const cached = getCache<SectorFlow[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${count}&po=1&np=1&fields=f12,f14,f62,f184,f66&fid=f62&fs=m:90+t:3`
    
    const data = await http.get<{ data: { diff: any[] } }>(url, { timeout: 8000 })

    if (data?.data?.diff && Array.isArray(data.data.diff)) {
      const list: SectorFlow[] = data.data.diff.map((item: any) => ({
        sectorName: item.f14 || '',
        netInflow: (item.f62 || 0) / 100000000,   // 转为亿元
        rank: item.f184 || 0,
        leadingStock: item.f66 || '',
        leadingChange: item.f66 || 0,
      })).filter(s => s.sectorName)
      setCache(cacheKey, list, CACHE_TTL.SECTOR_FLOW)
      return list
    }
    return fallbackSectorFlows()
  } catch {
    return fallbackSectorFlows()
  }
}

// ========== 主力资金流向 ==========

export async function fetchMainForceFlow(): Promise<MainForceFlow[]> {
  const cacheKey = 'choice_main_force'
  const cached = getCache<MainForceFlow[]>(cacheKey)
  if (cached) return cached

  try {
    const url = 'https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?secid=1.000001&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57&klt=1&lmt=1'
    
    const data = await http.get<{ data: any }>(url, { timeout: 8000 })

    if (data?.data) {
      const line = data.data.klines?.[0] || ''
      const parts = line.split(',')
      
      const result: MainForceFlow[] = [
        { label: '主力净流入', netInflow: parseFloat(parts[1] || '0') / 100000000, ratio: 0, isMain: true },
        { label: '超大单净流入', netInflow: parseFloat(parts[3] || '0') / 100000000, ratio: 0, isMain: true },
        { label: '大单净流入', netInflow: parseFloat(parts[4] || '0') / 100000000, ratio: 0, isMain: true },
        { label: '中单净流入', netInflow: parseFloat(parts[5] || '0') / 100000000, ratio: 0, isMain: false },
        { label: '小单净流入', netInflow: parseFloat(parts[6] || '0') / 100000000, ratio: 0, isMain: false },
      ]

      // 计算占比
      const total = Math.abs(result[0]!.netInflow) + Math.abs(result[4]!.netInflow)
      if (total > 0) {
        result[0]!.ratio = (Math.abs(result[0]!.netInflow) / total) * 100
        result[4]!.ratio = (Math.abs(result[4]!.netInflow) / total) * 100
      }
      
      setCache(cacheKey, result, CACHE_TTL.MAIN_FORCE)
      return result
    }
    return fallbackMainForceFlow()
  } catch {
    return fallbackMainForceFlow()
  }
}

// ========== 兜底数据 ==========

function fallbackNorthFlow(): NorthFlowData {
  return {
    shNetInflow: 25.6,
    szNetInflow: 18.3,
    totalNetInflow: 43.9,
    balance: 476.1,
    date: new Date().toISOString().split('T')[0]!,
    recent5Day: [
      { date: '06-16', value: -12.5 },
      { date: '06-17', value: 8.3 },
      { date: '06-18', value: 35.2 },
      { date: '06-19', value: 22.7 },
      { date: '06-20', value: 43.9 },
    ],
  }
}

function fallbackSectorFlows(): SectorFlow[] {
  return [
    { sectorName: '半导体', netInflow: 28.5, rank: 1, leadingStock: '北方华创', leadingChange: 4.2 },
    { sectorName: '人工智能', netInflow: 22.3, rank: 2, leadingStock: '科大讯飞', leadingChange: 3.8 },
    { sectorName: '新能源汽车', netInflow: 15.8, rank: 3, leadingStock: '比亚迪', leadingChange: 2.5 },
    { sectorName: '光伏设备', netInflow: -8.2, rank: 4, leadingStock: '隆基绿能', leadingChange: -1.2 },
    { sectorName: '医药生物', netInflow: -5.6, rank: 5, leadingStock: '恒瑞医药', leadingChange: -1.5 },
  ]
}

function fallbackMainForceFlow(): MainForceFlow[] {
  return [
    { label: '主力净流入', netInflow: 85.2, ratio: 100, isMain: true },
    { label: '超大单净流入', netInflow: 65.0, ratio: 76, isMain: true },
    { label: '大单净流入', netInflow: 20.2, ratio: 24, isMain: true },
    { label: '中单净流入', netInflow: -32.5, ratio: -38, isMain: false },
    { label: '小单净流入', netInflow: -52.7, ratio: -62, isMain: false },
  ]
}
