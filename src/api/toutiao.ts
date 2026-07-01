/**
 * 今日头条财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'

export interface NewsItem {
  id: string
  title: string
  summary: string
  content?: string
  source: string
  time: string
  url: string
  image?: string
}

/**
 * 抓取今日头条财经新闻
 * 今日头条有反爬，这里先返回模拟数据
 */
export async function fetchToutiaoNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  try {
    // 尝试真实抓取（今日头条反爬严重，大概率失败）
    const response = await Http.get({
      url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.status === 200 && response.data) {
      const data = JSON.parse(response.data)
      return data.data.map((item: any) => ({
        id: `toutiao_${item.ClusterId}`,
        title: item.Title,
        summary: item.Abstract || item.Title,
        source: '今日头条',
        time: new Date(item.PublishTime * 1000).toLocaleString(),
        url: `https://www.toutiao.com${item.Url}`,
        image: item.Image?.url
      }))
    }
  } catch (e) {
    console.warn('[今日头条] 抓取失败，使用模拟数据', e)
  }
  
  // 兜底：模拟数据
  return generateMockToutiaoNews(page, pageSize)
}

function generateMockToutiaoNews(page: number, pageSize: number): NewsItem[] {
  const mockNews = [
    {
      title: 'A股三大指数集体上涨，创业板指涨超2%',
      summary: '今日A股市场表现强劲，三大指数集体上涨，创业板指涨幅超过2%，市场情绪明显回暖。',
      time: '10分钟前'
    },
    {
      title: '比特币突破70000美元，加密货币集体大涨',
      summary: '比特币价格突破70000美元大关，以太坊等主流加密货币集体上涨，市场情绪乐观。',
      time: '30分钟前'
    },
    {
      title: '美联储维持利率不变，鲍威尔发表讲话',
      summary: '美联储宣布维持基准利率不变，主席鲍威尔在新闻发布会上发表讲话，暗示未来政策方向。',
      time: '1小时前'
    },
    {
      title: '特斯拉Q2交付量超预期，股价盘前大涨',
      summary: '特斯拉公布第二季度交付量数据，超出市场预期，股价在盘前交易中大幅上涨。',
      time: '2小时前'
    },
    {
      title: '中国6月PMI数据公布，制造业景气回升',
      summary: '国家统计局公布6月制造业PMI数据，显示制造业景气水平回升，经济复苏势头良好。',
      time: '3小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `toutiao_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '今日头条',
    time: news.time,
    url: 'https://www.toutiao.com/',
    image: undefined
  }))
}
