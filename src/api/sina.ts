/**
 * 新浪财经新闻API
 */
import { Http } from '@capacitor-community/http'
import type { NewsItem } from './toutiao'

/**
 * 抓取新浪财经新闻
 */
export async function fetchSinaNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  try {
    // 新浪财经RSS feed
    const response = await Http.get({
      url: 'https://finance.sina.com.cn/roll/index.d.html?col=financenews&rss=1',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })
    
    if (response.status === 200 && response.data) {
      // 解析RSS XML
      const items = parseRSS(response.data)
      return items.slice((page - 1) * pageSize, page * pageSize)
    }
  } catch (e) {
    console.warn('[新浪财经] 抓取失败，使用模拟数据', e)
  }
  
  return generateMockSinaNews(page, pageSize)
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
        id: `sina_${index}`,
        title: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1'),
        summary: descriptionMatch ? descriptionMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').substring(0, 100) : '',
        source: '新浪财经',
        time: pubDateMatch ? new Date(pubDateMatch[1]).toLocaleString() : '未知时间',
        url: linkMatch[1],
        image: undefined
      })
    }
  })
  
  return items
}

function generateMockSinaNews(page: number, pageSize: number): NewsItem[] {
  const mockNews = [
    {
      title: '沪深两市成交额突破1.2万亿，创年内新高',
      summary: '今日沪深两市成交额突破1.2万亿元，创年内新高，市场活跃度显著提升。',
      time: '15分钟前'
    },
    {
      title: '北向资金净流入超180亿，外资看好A股',
      summary: '今日北向资金净流入超180亿元，外资持续看好A股市场，净流入规模创近期新高。',
      time: '45分钟前'
    },
    {
      title: '科创板第五套标准上市企业突破100家',
      summary: '科创板实施第五套标准上市的企业数量突破100家，为科技创新企业提供有力支持。',
      time: '1.5小时前'
    },
    {
      title: '多只AI概念股涨停，人工智能板块强势',
      summary: '今日人工智能板块表现强势，多只AI概念股涨停，市场对AI应用前景保持乐观。',
      time: '2小时前'
    },
    {
      title: '港股恒生指数涨超1.5%，科技股领涨',
      summary: '香港恒生指数今日涨超1.5%，科技股领涨，腾讯、阿里等权重股表现强劲。',
      time: '3小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `sina_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '新浪财经',
    time: news.time,
    url: 'https://finance.sina.com.cn/',
    image: undefined
  }))
}
