// [WHAT] 基金搜索相关 API
// [DEPS] 本地 fund-list.json + 远程基金列表接口
// [NOTE] 包含基金列表加载、关键词搜索、板块映射

import { http } from '@/utils/http'
import { logger } from '@/utils/logger'
import type { FundInfo } from '@/types/fund'

// ========== 基金列表 & 搜索 ==========

// 基金列表缓存
let _fundListCache: FundInfo[] | null = null

/** 加载全量基金列表（本地 JSON），失败时回退到远程 */
export async function fetchFundList(): Promise<FundInfo[]> {
  if (_fundListCache) return _fundListCache

  const paths = ['./fund-list.json', '/fund-list.json', 'fund-list.json']

  for (const path of paths) {
    try {
      const data = await http.get<FundInfo[]>(path)
      if (Array.isArray(data) && data.length > 0) {
        _fundListCache = data
        return _fundListCache
      }
    } catch (e) {
      logger.warn('[fundSearch] 加载本地基金列表失败', { path, error: e })
    }
  }

  // [M6] 已移除 JSONP 降级代码，使用 http.text() + 安全解析
  // 尝试远程接口获取基金列表
  try {
    const url = `/api/fund/fund/js/fundcode_search.js?rt=${Date.now()}`
    const text = await http.text(url)
    // [FIX] 安全解析：用正则提取数组，避免 new Function
    const rMatch = text.match(/var\s+r\s*=\s*(\[[\s\S]*?\])\s*;/)
    if (!rMatch) {
      logger.warn('[fundSearch] 无法从响应中提取基金列表')
      return []
    }
    const raw = JSON.parse(rMatch[1])
    if (!Array.isArray(raw)) {
      throw new Error('基金列表数据格式错误')
    }
    _fundListCache = raw.map((item: string[]) => ({
      code: item[0] || '',
      pinyin: item[1] || '',
      name: item[2] || '',
      type: item[3] || ''
    }))
    return _fundListCache!
  } catch (fetchErr) {
    logger.warn('[fundSearch] 获取远程基金列表失败，返回空数组', { error: fetchErr })
    return []
  }
}

/** 搜索基金（本地过滤 + 板块关键词映射） */
export async function searchFund(keyword: string, limit = 50): Promise<FundInfo[]> {
  const list = await fetchFundList()
  if (!keyword.trim()) return []
  const kw = keyword.toLowerCase().trim()

  const sectorKeywords: Record<string, string[]> = {
    // === 科技板块 ===
    '半导体': ['半导体', '芯片', '集成电路', '科技', '电子', 'IC', '晶圆'],
    '软件开发': ['软件', '计算机', '信息技术', '科技', '云计算', '数字'],
    '计算机': ['计算机', '软件', '信息', '科技', '数据', '互联网'],
    '人工智能': ['人工智能', 'AI', '智能', '机器人', '科技', '算力'],
    '云计算': ['云计算', '云', '数据中心', '大数据', '科技'],
    '大数据': ['大数据', '数据', '云', '信息', '科技'],
    '物联网': ['物联网', 'IOT', '智能', '信息', '科技'],
    '网络安全': ['网络安全', '安全', '信息安全', '科技'],
    '通信设备': ['通信', '5G', '设备', '网络', '互联网', '信息', '电信', '光纤', '光缆', '基站', '卫星', '移动', '联通', '电信运营'],
    '消费电子': ['消费电子', '电子', '智能', '手机', '科技'],
    '电子元件': ['电子', '元件', '元器件', '科技', '半导体'],

    // === 消费板块 ===
    '白酒': ['白酒', '酒', '消费', '食品饮料', '茅台'],
    '食品饮料': ['食品', '饮料', '消费', '酒', '乳业', '调味品'],
    '家用电器': ['家电', '电器', '消费', '家居', '智能家居'],
    '纺织服装': ['纺织', '服装', '消费', '服饰', '鞋'],
    '商业零售': ['零售', '商业', '消费', '百货', '超市', '电商'],
    '电商': ['电商', '电子商务', '互联网', '消费', '零售'],
    '旅游酒店': ['旅游', '酒店', '餐饮', '消费', '休闲', '服务', '景区', '度假', '民宿', '航空', '出行', '文旅', '免税'],
    '餐饮': ['餐饮', '食品', '消费', '酒店'],
    '教育': ['教育', '培训', '学校', '消费'],
    '美容护理': ['美容', '护理', '化妆品', '消费', '医美'],

    // === 金融板块 ===
    '银行': ['银行', '金融', '理财'],
    '证券': ['证券', '券商', '金融', '投资'],
    '保险': ['保险', '金融', '寿险'],
    '多元金融': ['金融', '信托', '租赁', '投资'],

    // === 医药健康板块 ===
    '医药生物': ['医药', '生物', '医疗', '健康', '制药', '创新药'],
    '中药': ['中药', '医药', '中医', '健康'],
    '医疗器械': ['医疗器械', '器械', '医疗', '医药', '健康'],
    '医疗服务': ['医疗', '医院', '健康', '医药', '服务'],
    '创新药': ['创新药', '医药', '生物', '制药'],

    // === 新能源板块 ===
    '新能源': ['新能源', '光伏', '锂电', '风电', '储能', '电池', '太阳能', '清洁能源'],
    '光伏': ['光伏', '太阳能', '新能源', '组件'],
    '锂电池': ['锂电', '电池', '新能源', '储能', '动力电池'],
    '风电': ['风电', '风能', '新能源', '风机'],
    '储能': ['储能', '电池', '新能源', '能源'],
    '氢能源': ['氢能', '燃料电池', '新能源', '氢'],

    // === 制造业板块 ===
    '汽车': ['汽车', '新能源车', '智能汽车', '车', '整车', '零部件'],
    '新能源汽车': ['新能源车', '电动车', '汽车', '智能汽车'],
    '机械设备': ['机械', '设备', '制造', '工程机械', '自动化'],
    '电气设备': ['电气', '设备', '电力', '输配电'],
    '工程机械': ['工程机械', '机械', '挖掘机', '起重机'],
    '军工': ['军工', '国防', '航空', '航天', '军民融合', '船舶'],
    '航空航天': ['航空', '航天', '飞机', '军工', '卫星'],
    '船舶': ['船舶', '航运', '造船', '军工', '海洋'],

    // === 周期板块 ===
    '钢铁': ['钢铁', '钢', '金属', '有色'],
    '有色金属': ['有色', '金属', '铜', '铝', '锂', '稀土', '黄金'],
    '煤炭': ['煤炭', '能源', '煤', '焦炭'],
    '石油石化': ['石油', '石化', '化工', '油气', '能源'],
    '化工': ['化工', '化学', '材料', '石化'],
    '电子化学品': ['电子', '化学', '化工', '材料', '新材料', '特种', '精细化工', '半导体材料', '光刻胶', '电解液', '正极', '负极'],
    '基础化学': ['化学', '化工', '基础化工'],

    // === 基建地产板块 ===
    '房地产': ['房地产', '地产', '房产', '建筑', '基建', '物业'],
    '建筑': ['建筑', '基建', '工程', '建材', '房地产'],
    '建材': ['建材', '水泥', '玻璃', '建筑', '装修'],
    '装修装饰': ['装修', '装饰', '建材', '家居', '家装', '家电', '地产', '建筑', '房地产', '基建'],
    '基建': ['基建', '基础设施', '建筑', '工程', '铁路', '公路'],

    // === 交通运输板块 ===
    '港口航运': ['港口', '航运', '船舶', '物流', '海运'],
    '航空机场': ['航空', '机场', '飞机', '民航'],
    '铁路公路': ['铁路', '公路', '高铁', '交通'],
    '物流': ['物流', '快递', '仓储', '供应链', '运输'],

    // === 公用事业板块 ===
    '电力': ['电力', '电网', '发电', '能源', '公用事业'],
    '水务': ['水务', '水利', '供水', '环保', '公用事业'],
    '燃气': ['燃气', '天然气', '能源', '公用事业'],
    '环保': ['环保', '环境', '污染治理', '绿色', '碳中和'],

    // === 传媒娱乐板块 ===
    '传媒': ['传媒', '媒体', '广告', '影视', '文化'],
    '游戏': ['游戏', '网游', '手游', '娱乐', '互联网'],
    '影视': ['影视', '电影', '电视', '娱乐', '传媒'],
    '广告': ['广告', '营销', '传媒', '互联网'],

    // === 农业板块 ===
    '农牧饲渔': ['农业', '养殖', '畜牧', '渔业', '饲料', '农产品', '种植', '粮食', '猪', '鸡', '生猪', '肉鸡', '水产', '牧业', '兽药', '动保', '种子', '化肥', '农药'],
    '种植业': ['种植', '农业', '粮食', '农产品', '种子'],
    '养殖业': ['养殖', '畜牧', '猪', '鸡', '农业'],

    // === 其他板块 ===
    '造纸印刷': ['造纸', '印刷', '纸业', '包装', '纸', '林业', '木材', '森林', '浆纸', '纸板', '出版'],
    '纺织': ['纺织', '服装', '棉', '丝绸'],
    '贵金属': ['贵金属', '黄金', '白银', '金', '银'],
    '稀土': ['稀土', '稀有金属', '有色']
  }

  const mappedKeywords = sectorKeywords[kw]

  const results = list.filter(
    (item) =>
      item.code.includes(kw) ||
      item.name.toLowerCase().includes(kw) ||
      item.pinyin.toLowerCase().includes(kw)
  )

  if (mappedKeywords) {
    const keywordResults = list.filter((item) => {
      const name = item.name.toLowerCase()
      return mappedKeywords.some((k) => name.includes(k.toLowerCase()))
    })
    const existingCodes = new Set(results.map((r) => r.code))
    keywordResults.forEach((item) => {
      if (!existingCodes.has(item.code)) {
        results.push(item)
        existingCodes.add(item.code)
      }
    })
  }

  if (results.length < 10 && kw.length >= 2 && !mappedKeywords) {
    const chars = kw.split('')
    const charResults = list.filter((item) => {
      const name = item.name.toLowerCase()
      const matchCount = chars.filter((c) => name.includes(c)).length
      return matchCount >= Math.min(2, chars.length)
    })
    const existingCodes = new Set(results.map((r) => r.code))
    charResults.forEach((item) => {
      if (!existingCodes.has(item.code)) {
        results.push(item)
        existingCodes.add(item.code)
      }
    })
  }

  return results.slice(0, limit)
}
