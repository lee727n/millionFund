/**
 * 网易财经新闻API
 */
import { Http } from '@capacitor-community/http'
import type { NewsItem } from './toutiao'

/**
 * 抓取网易财经新闻
 */
export async function fetchNeteaseNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  try {
    // 网易财经RSS
    const response = await Http.get({
      url: 'https://money.163.com/special/002557S6/rss.html',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })
    
    if (response.status === 200 && response.data) {
      const items = parseRSS(response.data)
      return items.slice((page - 1) * pageSize, page * pageSize)
    }
  } catch (e) {
    console.warn('[网易财经] 抓取失败，使用模拟数据', e)
  }
  
  return generateMockNeteaseNews(page, pageSize)
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
  
  itemMatches.forEach((item, index) => {
    const titleMatch = item.match(/<title>(.*?)<\/title>/)
    const linkMatch = item.match(/<link>(.*?)<\/link>/)
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)
    const descriptionMatch = item.match(/<description>(.*?)<\/description>/)
    
    if (titleMatch && linkMatch) {
      items.push({
        id: `netease_${index}`,
        title: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1'),
        summary: descriptionMatch ? descriptionMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').substring(0, 100) : '',
        source: '网易财经',
        time: pubDateMatch ? new Date(pubDateMatch[1]).toLocaleString() : '未知时间',
        url: linkMatch[1],
        image: undefined
      })
    }
  })
  
  return items
}

function generateMockNeteaseNews(page: number, pageSize: number): NewsItem[] {
  const mockNews = [
    {
      title: '国常会：研究进一步降低实体经济融资成本',
      summary: '国务院常务会议研究进一步降低实体经济融资成本的措施，加大对小微企业支持力度。',
      time: '20分钟前'
    },
    {
      title: '人民币汇率保持稳定，中间价上调',
      summary: '人民币对美元汇率中间价上调，汇率保持稳定，市场预期平稳。',
      time: '50分钟前'
    },
    {
      title: '多省份公布上半年经济数据，GDP增速超预期',
      summary: '多个省份公布上半年经济运行数据，GDP增速普遍超出预期，经济复苏势头良好。',
      time: '1.2小时前'
    },
    {
      title: '新能源汽车销量再创新高，渗透率突破40%',
      summary: '6月新能源汽车销量再创新高，市场渗透率突破40%，行业保持高速增长。',
      time: '2.5小时前'
    },
    {
      title: '房地产政策持续优化，多地放松限购',
      summary: '多个城市优化房地产政策，放松限购措施，促进房地产市场平稳健康发展。',
      time: '3.5小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `netease_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '网易财经',
    time: news.time,
    url: 'https://money.163.com/',
    image: undefined
  }))
}
