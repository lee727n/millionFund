import https from 'https'
import fs from 'fs'

console.log('开始获取基金列表...')

const url = 'https://fund.eastmoney.com/js/fundcode_search.js'

https.get(url, (res) => {
    let data = ''

    res.on('data', (chunk) => {
        data += chunk
    })

    res.on('end', () => {
        try {
            const startIndex = data.indexOf('[')
            const endIndex = data.lastIndexOf(']')

            if (startIndex === -1 || endIndex === -1) {
                throw new Error('无法找到JSON数据')
            }

            const jsonStr = data.substring(startIndex, endIndex + 1)
            const funds = JSON.parse(jsonStr)

            const fundList = funds.map((item) => ({
                code: item[0],
                name: item[2],
                type: item[3],
                pinyin: item[4] || ''
            }))

            fs.writeFileSync('./fund-list.json', JSON.stringify(fundList, null, 2))
            console.log(`成功获取 ${fundList.length} 只基金`)
        } catch (error) {
            console.error('解析失败:', error)
            console.error('数据开头:', data.substring(0, 300))
        }
    })
}).on('error', (error) => {
    console.error('请求失败:', error)
})