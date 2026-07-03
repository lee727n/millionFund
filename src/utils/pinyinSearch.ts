// [WHY] 本地拼音索引 - 避免每次搜索都发远程请求，提升搜索响应速度
// [WHAT] 构建本地基金名称拼音索引，支持中文/拼音/首字母搜索

import { logger } from './logger'

interface SearchIndexEntry {
  code: string
  name: string
  pinyin: string
  pinyinAbbr: string  // 首字母缩写
  type?: string
}

class PinyinSearchEngine {
  private index: SearchIndexEntry[] = []
  private built = false

  // 简单的中文转拼音映射（常用字）
  private static readonly PINYIN_MAP: Record<string, string> = {
    '华': 'hua', '夏': 'xia', '成': 'cheng', '长': 'chang',
    '易': 'yi', '方': 'fang', '达': 'da', '蓝': 'lan', '筹': 'chou',
    '精': 'jing', '选': 'xuan', '混': 'hun', '合': 'he',
    '招': 'zhao', '商': 'shang', '中': 'zhong', '证': 'zheng',
    '白': 'bai', '酒': 'jiu', '指': 'zhi', '数': 'shu',
    '广': 'guang', '发': 'fa', '纳': 'na', '斯': 'si', '克': 'ke',
    '博': 'bo', '时': 'shi', '标': 'biao', '普': 'pu',
    '恒': 'heng', '生': 'sheng', '科': 'ke', '技': 'ji',
    '富': 'fu', '国': 'guo', '天': 'tian', '弘': 'hong',
    '嘉': 'jia', '实': 'shi', '基': 'ji', '金': 'jin',
    '兴': 'xing', '全': 'quan', '球': 'qiu', '配': 'pei',
    '置': 'zhi', '债': 'zhai', '券': 'quan', '股': 'gu', '票': 'piao',
    '上': 'shang', '海': 'hai', '深': 'shen', '圳': 'zhen',
    '创': 'chuang', '业': 'ye', '板': 'ban', '港': 'gang',
    '美': 'mei', '日': 'ri', '欧': 'ou', '洲': 'zhou',
    '黄': 'huang', '铜': 'tong', '铁': 'tie', '石': 'shi', '油': 'you',
    '能': 'neng', '源': 'yuan', '环': 'huan', '保': 'bao',
    '医': 'yi', '药': 'yao', '健': 'jian', '康': 'kang',
    '食': 'shi', '品': 'pin', '饮': 'yin', '料': 'liao',
    '房': 'fang', '地': 'di', '产': 'chan',
    '军': 'jun', '工': 'gong', '汽': 'qi', '车': 'che',
    '银': 'yin', '行': 'hang', '证': 'zheng', '保': 'bao',
    '信': 'xin', '息': 'xi', '传': 'chuan', '媒': 'mei',
    '农': 'nong', '林': 'lin', '牧': 'mu', '渔': 'yu',
    '交': 'jiao', '通': 'tong', '运': 'yun', '输': 'shu',
    '电': 'dian', '力': 'li', '设': 'she', '备': 'bei',
    '建': 'jian', '筑': 'zhu', '材': 'cai',
    '轻': 'qing', '重': 'zhong',
    '机': 'ji', '械': 'xie',
    '电': 'dian', '子': 'zi',
    '家': 'jia', '用': 'yong', '电': 'dian', '器': 'qi',
    '纺': 'fang', '织': 'zhi', '服': 'fu', '装': 'zhuang',
    '旅': 'lv', '游': 'you', '酒': 'jiu', '店': 'dian',
    '教': 'jiao', '育': 'yu',
    '传': 'chuan', '媒': 'mei',
    '综': 'zong', '合': 'he',
  }

  // Convert Chinese text to pinyin (simplified)
  private toPinyin(text: string): string {
    let result = ''
    for (const char of text) {
      if (PinyinSearchEngine.PINYIN_MAP[char]) {
        result += PinyinSearchEngine.PINYIN_MAP[char]
      } else if (/[a-zA-Z0-9]/.test(char)) {
        result += char.toLowerCase()
      }
    }
    return result
  }

  // Get pinyin abbreviation (first letter of each word)
  private toPinyinAbbr(text: string): string {
    let result = ''
    for (const char of text) {
      if (PinyinSearchEngine.PINYIN_MAP[char]) {
        result += PinyinSearchEngine.PINYIN_MAP[char][0]
      } else if (/[a-zA-Z0-9]/.test(char)) {
        result += char.toLowerCase()
      }
    }
    return result
  }

  // Build index from fund list
  buildIndex(funds: { code: string; name: string; type?: string }[]): void {
    this.index = funds.map(f => ({
      code: f.code,
      name: f.name,
      pinyin: this.toPinyin(f.name),
      pinyinAbbr: this.toPinyinAbbr(f.name),
      type: f.type,
    }))
    this.built = true
    logger.info(`[PinyinSearch] 索引构建完成，共 ${this.index.length} 条`)
  }

  // Search by keyword (matches name, code, pinyin, pinyin abbreviation)
  search(keyword: string, limit: number = 20): { code: string; name: string; type?: string }[] {
    if (!this.built || !keyword.trim()) return []
    const kw = keyword.toLowerCase().trim()

    const results: { code: string; name: string; type?: string; score: number }[] = []

    for (const entry of this.index) {
      let score = 0
      // Code exact match gets highest score
      if (entry.code === kw) score = 100
      else if (entry.code.startsWith(kw)) score = 90
      // Name contains keyword
      else if (entry.name.includes(keyword)) score = 80
      // Pinyin match
      else if (entry.pinyin.includes(kw)) score = 70
      // Pinyin abbreviation match
      else if (entry.pinyinAbbr.includes(kw)) score = 60

      if (score > 0) {
        results.push({ code: entry.code, name: entry.name, type: entry.type, score })
      }
    }

    // Sort by score descending, then by code
    results.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))

    return results.slice(0, limit).map(({ code, name, type }) => ({ code, name, type }))
  }

  isBuilt(): boolean {
    return this.built
  }

  getIndexSize(): number {
    return this.index.length
  }

  // Get recent searches from localStorage
  getRecentSearches(limit: number = 10): string[] {
    try {
      const data = localStorage.getItem('fund_recent_searches')
      if (!data) return []
      const arr = JSON.parse(data)
      return Array.isArray(arr) ? arr.slice(0, limit) : []
    } catch {
      return []
    }
  }

  // Add a search keyword to recent searches
  addRecentSearch(keyword: string): void {
    try {
      let recent = this.getRecentSearches(20)
      recent = recent.filter(k => k !== keyword)
      recent.unshift(keyword)
      recent = recent.slice(0, 20)
      localStorage.setItem('fund_recent_searches', JSON.stringify(recent))
    } catch {
      // ignore
    }
  }

  // Clear recent searches
  clearRecentSearches(): void {
    try {
      localStorage.removeItem('fund_recent_searches')
    } catch {
      // ignore
    }
  }
}

export const pinyinSearch = new PinyinSearchEngine()
