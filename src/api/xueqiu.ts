/**
 * 雪球财经新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetchXueqiuNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: '茅台股价重回2000元，市值超2.5万亿',
      summary: '贵州茅台股价重回2000元关口，总市值超过2.5万亿元，白酒龙头地位稳固。',
      time: '30分钟前'
    },
    {
      title: '宁德时代发布新一代电池技术，能量密度提升30%',
      summary: '宁德时代发布新一代动力电池技术，能量密度提升30%，续航里程突破1000公里。',
      time: '1小时前'
    },
    {
      title: '比亚迪6月销量突破30万辆，同比增长超50%',
      summary: '比亚迪公布6月销量数据，突破30万辆大关，同比增长超50%，新能源龙头地位稳固。',
      time: '2小时前'
    },
    {
      title: '科创板新增上市企业15家，IPO募资超200亿',
      summary: '本月科创板新增上市企业15家，IPO募资总规模超过200亿元，支持科技创新发展。',
      time: '3小时前'
    },
    {
      title: '北交所上市公司突破200家，专精特新企业占比超60%',
      summary: '北交所上市公司数量突破200家，其中专精特新企业占比超过60%，服务中小企业成效显著。',
      time: '4小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `xueqiu_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '雪球',
    time: news.time,
    url: 'https://xueqiu.com/',
    image: undefined
  }))
}
