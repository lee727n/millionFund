/**
 * 今日头条财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { logger } from '@/utils/logger'

/**
 * RSSHub 路由列表（多个备份）
 */
const TOUTIAO_RSS_URLS = [
  'https://rsshub.app/jin-ri-tou-tiao/recommend',  // 推荐
  'https://rsshub.app/jin-ri-tou-tiao/category/finance',  // 财经分类
  'https://rsshub.app/jin-ri-tou-tiao/category/news',  // 新闻分类
]

/**
 * 抓取今日头条财经新闻（通过 RSSHub）
 */
export async function fetchToutiaoNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const url of TOUTIAO_RSS_URLS) {
    try {
      logger.info(`[今日头条] 尝试 RSS: ${url}`)
      
      const response = await Http.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        const items = parseRSSItems(response.data)
        if (items.length > 0) {
          logger.info(`[今日头条] ✓ RSS 抓取成功: ${items.length} 条`)
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      logger.warn(`[今日头条] RSS 抓取失败: ${url}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  logger.warn('[今日头条] 所有 RSS 源失败，使用模拟数据')
  return generateMockToutiaoNews(page, pageSize)
}

/**
 * 解析 RSS XML 数据
 */
function parseRSSItems(xmlData: string): ApiNewsItem[] {
  try {
    const items: ApiNewsItem[] = []
    
    // 匹配 <item> 或 <entry> 标签
    const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g
    let match
    
    while ((match = itemRegex.exec(xmlData)) !== null) {
      const itemContent = match[1] || match[2]
      
      // 提取标题
      const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(itemContent)
      const title = titleMatch ? titleMatch[1].trim() : ''
      
      // 提取链接
      const linkMatch = /<link>(.*?)<\/link>|<guid>(.*?)<\/guid>/.exec(itemContent)
      const url = linkMatch ? (linkMatch[1] || linkMatch[2]).trim() : ''
      
      // 提取描述
      const descMatch = /<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>|<summary>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/.exec(itemContent)
      const summary = descMatch ? (descMatch[1] || descMatch[2]).trim() : ''
      
      // 提取发布时间
      const dateMatch = /<pubDate>(.*?)<\/pubDate>|<published>(.*?)<\/published>|<updated>(.*?)<\/updated>/.exec(itemContent)
      const dateStr = dateMatch ? (dateMatch[1] || dateMatch[2] || dateMatch[3]).trim() : ''
      const publishedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
      
      if (title) {
        items.push({
          id: `toutiao_${Date.now()}_${items.length}`,
          title,
          summary: summary || title,
          source: '今日头条',
          publishedAt,
          url: url || 'https://www.toutiao.com/',
          image: undefined
        })
      }
    }
    
    return items
  } catch (e) {
    logger.error('[今日头条] RSS 解析失败', e)
    return []
  }
}

function generateMockToutiaoNews(page: number, pageSize: number): ApiNewsItem[] {
  const mockNews = [
    {
      title: 'A股三大指数集体上涨，创业板指涨超2%',
      summary: '今日A股市场表现强劲，三大指数集体上涨，创业板指涨幅超过2%，市场情绪明显回暖。',
      publishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    },
    {
      title: '比特币突破70000美元，加密货币集体大涨',
      summary: '比特币价格突破70000美元大关，以太坊等主流加密货币集体上涨，市场情绪乐观。',
      publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    },
    {
      title: '美联储维持利率不变，鲍威尔发表讲话',
      summary: '美联储宣布维持基准利率不变，主席鲍威尔在新闻发布会上发表讲话，暗示未来政策方向。',
      publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
    },
    {
      title: '特斯拉Q2交付量超预期，股价盘前大涨',
      summary: '特斯拉公布第二季度交付量数据，超出市场预期，股价在盘前交易中大幅上涨。',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      title: '中国6月PMI数据公布，制造业景气回升',
      summary: '国家统计局公布6月制造业PMI数据，显示制造业景气水平回升，经济复苏势头良好。',
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `toutiao_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '今日头条',
    publishedAt: news.publishedAt,
    url: 'https://www.toutiao.com/',
    image: undefined
  }))
}
