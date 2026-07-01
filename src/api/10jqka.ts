/**
 * 同花顺财经新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetch10jqkaNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: '创业板注册制改革深化，市场化程度提升',
      summary: '创业板注册制改革持续深化，市场化程度不断提升，服务创新创业企业能力增强。',
      time: '40分钟前'
    },
    {
      title: '新能源汽车产业链全面爆发，上下游企业受益',
      summary: '新能源汽车产业链今日全面爆发，上下游企业集体受益，行业高景气度延续。',
      time: '1.5小时前'
    },
    {
      title: '5G应用加速落地，相关概念股表现活跃',
      summary: '5G应用场景加速落地，相关概念股表现活跃，新一代信息技术产业迎来发展机遇。',
      time: '2.5小时前'
    },
    {
      title: '环保板块走强，碳中和政策持续加码',
      summary: '环保板块今日走势强劲，碳中和政策持续加码，绿色产业发展前景广阔。',
      time: '3.5小时前'
    },
    {
      title: '物流板块表现亮眼，电商旺季带动需求',
      summary: '物流板块今日表现亮眼，电商旺季带动行业需求，龙头企业业绩增长确定性强。',
      time: '5小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `10jqka_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '同花顺',
    time: news.time,
    url: 'https://www.10jqka.com.cn/',
    image: undefined
  }))
}
