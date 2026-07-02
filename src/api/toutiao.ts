/**
 * 今日头条财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取今日头条财经新闻
 * TODO: 今日头条有反爬，需找替代方案
 * 可尝试：
 * 1. 使用 RSSHub 路由：https://docs.rsshub.app/routes/new-media#jin-ri-tou-tiao
 * 2. 使用第三方 API 或爬虫
 * 3. 联系今日头条开放平台获取 API
 */
export async function fetchToutiaoNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    // 当前使用 RSSHub 路由（需确认是否可用）
    // const response = await Http.get({
    //   url: 'https://rsshub.app/jin-ri-tou-tiao',
    //   headers: { 'User-Agent': 'Mozilla/5.0' }
    // })
    
    console.warn('[今日头条] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[今日头条] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  return generateMockToutiaoNews(page, pageSize)
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
