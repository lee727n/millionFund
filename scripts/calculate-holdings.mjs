import https from 'https'
import fs from 'fs'

console.log('开始计算持仓数据...')

// 从截图中提取的数据（只有基金名称，没有代码）
const holdingsData = [
    { name: '永赢先进制造智选混合 C', marketValue: 139906.18, profit: -16377.12, profitRate: -10.48 },
    { name: '博时中证卫星产业指数 C', marketValue: 191314.28, profit: -37533.30, profitRate: -16.40 },
    { name: '工银瑞信中证传媒指数 (LOF)A', marketValue: 120110.55, profit: -24242.74, profitRate: -16.79 },
    { name: '中信建投品质优选一年持有期混合 A', marketValue: 112514.74, profit: -7485.26, profitRate: -6.24 },
    { name: '华夏全球科技先锋混合 (QDII)C', marketValue: 103458.21, profit: 7111.07, profitRate: 7.70 }
]

// 读取基金列表
let fundList = []
try {
    const fundListData = fs.readFileSync('./fund-list.json', 'utf-8')
    fundList = JSON.parse(fundListData)
    console.log(`已加载 ${fundList.length} 只基金数据`)
} catch (error) {
    console.error('读取基金列表失败：', error.message)
    process.exit(1)
}

// 规范化基金名称（只去除空格和括号，保留核心信息）
function normalizeName(name) {
    return name
        .replace(/\s+/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase()
}

// 计算两个字符串的相似度（使用编辑距离算法）
function calculateSimilarity(str1, str2) {
    const len1 = str1.length
    const len2 = str2.length

    if (len1 === 0) return len2 === 0 ? 100 : 0
    if (len2 === 0) return 0

    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null))

    for (let i = 0; i <= len1; i++) {
        matrix[i][0] = i
    }

    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            )
        }
    }

    const maxLength = Math.max(len1, len2)
    const distance = matrix[len1][len2]
    const similarity = ((maxLength - distance) / maxLength) * 100

    return similarity
}

// 通过基金名称查找基金代码
function findFundCode(name) {
    console.log(`\n  [查询过程] 开始查找基金代码：${name}`)

    // 步骤1：精确匹配
    console.log(`  [步骤1] 尝试精确匹配...`)
    const exactMatch = fundList.find(fund => fund.name === name)
    if (exactMatch) {
        console.log(`  [成功] 找到精确匹配：${exactMatch.code} - ${exactMatch.name}`)
        return exactMatch
    }
    console.log(`  [失败] 未找到精确匹配，进入模糊匹配`)

    // 步骤2：模糊匹配
    console.log(`  [步骤2] 开始模糊匹配...`)
    const normalizedName = normalizeName(name)
    console.log(`  [规范化] 查询名称规范化后：${normalizedName}`)

    let bestMatch = null
    let bestScore = 0

    // 遍历所有基金，计算相似度分数
    console.log(`  [步骤3] 遍历 ${fundList.length} 只基金计算相似度...`)

    for (const fund of fundList) {
        const normalizedFundName = normalizeName(fund.name)

        // 计算相似度（使用编辑距离算法）
        const similarity = calculateSimilarity(normalizedName, normalizedFundName)

        // 检查是否包含关键信息，计算加分项
        let bonus = 0

        // 检查基金公司名称是否匹配（前两个字）
        const fundCompany = name.substring(0, 2)
        if (fund.name.substring(0, 2) === fundCompany) {
            bonus += 20
        }

        // 检查基金类型（A/C/E）是否匹配
        const typeMatch = name.includes('A') === fund.name.includes('A') &&
            name.includes('C') === fund.name.includes('C') &&
            name.includes('E') === fund.name.includes('E')
        if (typeMatch) {
            bonus += 10
        }

        // 检查是否包含相同的数字
        const numbersInName = (name.match(/\d/g) || []).join('')
        const numbersInFund = (fund.name.match(/\d/g) || []).join('')
        if (numbersInName === numbersInFund && numbersInName.length > 0) {
            bonus += 15
        }

        // 计算总分
        const totalScore = similarity + bonus

        // 更新最佳匹配
        if (totalScore > bestScore) {
            bestScore = totalScore
            bestMatch = fund
        }
    }

    console.log(`  [步骤4] 最佳匹配结果：`)
    console.log(`    - 基金代码：${bestMatch.code}`)
    console.log(`    - 基金名称：${bestMatch.name}`)
    console.log(`    - 相似度分数：${bestScore.toFixed(2)}`)

    // 判断分数是否达到阈值
    if (bestScore >= 70) {
        console.log(`  [成功] 分数达到阈值（70），使用此匹配`)
        return bestMatch
    }

    console.log(`  [失败] 分数未达到阈值，无法找到匹配的基金`)
    return null
}

// 获取基金最新净值
function fetchFundNetValue(code) {
    return new Promise((resolve, reject) => {
        const url = `https://fundgz.1234567.com.cn/js/${code}.js`

        https.get(url, {
            headers: {
                'Referer': 'https://fund.eastmoney.com/'
            }
        }, (res) => {
            let data = ''

            res.on('data', (chunk) => {
                data += chunk
            })

            res.on('end', () => {
                try {
                    const jsonMatch = data.match(/jsonpgz\((.*)\)/)
                    if (!jsonMatch) {
                        reject(new Error(`无法解析基金 ${code} 的数据`))
                        return
                    }

                    const fundData = JSON.parse(jsonMatch[1])
                    const netValue = parseFloat(fundData.gsz || fundData.dwjz || '0')
                    const date = fundData.jzrq || ''
                    const changeRate = parseFloat(fundData.gszzl || '0')

                    resolve({ netValue, date, changeRate, fundData })
                } catch (error) {
                    reject(new Error(`解析基金 ${code} 失败：${error.message}`))
                }
            })
        }).on('error', (error) => {
            reject(new Error(`请求基金 ${code} 失败：${error.message}`))
        })
    })
}

// 计算份额和买入净值
function calculateSharesAndBuyNetValue(marketValue, profit, currentNetValue) {
    const shares = marketValue / currentNetValue
    const buyNetValue = currentNetValue - (profit / shares)

    return { shares, buyNetValue }
}

// 主函数
async function main() {
    const results = []

    for (const item of holdingsData) {
        console.log(`\n处理基金：${item.name}`)

        // 查找基金代码
        const fund = findFundCode(item.name)
        if (!fund) {
            console.error(`  错误：无法找到基金代码`)
            results.push({
                name: item.name,
                error: '无法找到基金代码'
            })
            continue
        }

        console.log(`  基金代码：${fund.code}`)
        console.log(`  匹配到的名称：${fund.name}`)

        try {
            const { netValue, date, changeRate, fundData } = await fetchFundNetValue(fund.code)
            console.log(`  最新净值：${netValue} (${date}), 涨跌幅：${changeRate}%`)

            const { shares, buyNetValue } = calculateSharesAndBuyNetValue(
                item.marketValue,
                item.profit,
                netValue
            )

            console.log(`  计算结果：份额=${shares.toFixed(2)}, 买入净值=${buyNetValue.toFixed(6)}`)

            results.push({
                code: fund.code,
                name: fund.name,
                marketValue: item.marketValue,
                profit: item.profit,
                profitRate: item.profitRate,
                currentNetValue: netValue,
                shares: parseFloat(shares.toFixed(2)),
                buyNetValue: parseFloat(buyNetValue.toFixed(6)),
                buyDate: date
            })

            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 200))
        } catch (error) {
            console.error(`  错误：${error.message}`)
            results.push({
                code: fund.code,
                name: fund.name,
                error: error.message
            })
        }
    }

    // 输出结果
    console.log('\n========== 计算结果 ==========')
    results.forEach(item => {
        if (item.error) {
            console.log(`${item.name}: 错误 - ${item.error}`)
        } else {
            console.log(`${item.code} ${item.name}:`)
            console.log(`  份额：${item.shares}`)
            console.log(`  买入净值：${item.buyNetValue}`)
            console.log(`  当前净值：${item.currentNetValue}`)
            console.log(`  买入日期：${item.buyDate}`)
        }
    })

    // 保存到文件
    fs.writeFileSync('./holdings-calculation.json', JSON.stringify(results, null, 2))
    console.log('\n结果已保存到 holdings-calculation.json')
}

main()