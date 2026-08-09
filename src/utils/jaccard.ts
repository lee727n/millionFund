/**
 * Jaccard 相似度交叉验证工具 (Task #11)
 *
 * 计算两个字符串的 Jaccard 相似度（字符级二元语法分词）
 * J(A,B) = |A ∩ B| / |A ∪ B|
 *
 * [WHY] 原实现按空白分词对中文标题完全失效（中文无空格），
 *       导致整句被当作单个 token，Jaccard 要么 0 要么 1，0.5 阈值形同虚设。
 * [WHAT] 改用字符级 2-gram（bigram）对中英文短标题通用：
 *        - 中文："央行降准" → ["央行","行降","降准"]，能捕捉局部语义重叠
 *        - 英文："Fed Hikes" → 归一化后 "fedhikes" → ["fe","ed","dh","hi","ik","ke","es"]
 *        - 混合代码/数字：正确切分并匹配
 */

/**
 * 字符级 2-gram 分词。
 * 归一化：转小写 + 删除所有 Unicode 标点与空白。
 * 极短文本（长度 ≤ 3）额外加入单字符 token，以覆盖单字标题、基金代码等场景。
 */
export function tokenize(str: string): Set<string> {
  const normalized = str
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, '') // 删除所有 Unicode 标点和空白
  const grams = new Set<string>()
  const len = normalized.length
  if (len === 0) return grams
  if (len === 1) {
    grams.add(normalized)
    return grams
  }
  for (let i = 0; i < len - 1; i++) {
    grams.add(normalized.slice(i, i + 2))
  }
  // 极短文本额外加入单字符（单字标题、基金代码等）
  if (len <= 3) {
    for (let i = 0; i < len; i++) {
      grams.add(normalized[i])
    }
  }
  return grams
}

/**
 * 计算两个字符串的 Jaccard 相似度（字符级 2-gram 分词）。
 * @param strA 字符串A
 * @param strB 字符串B
 * @returns 相似度 (0-1 之间)，两者皆空时返回 0
 */
export function jaccardSimilarity(strA: string, strB: string): number {
  const setA = tokenize(strA)
  const setB = tokenize(strB)

  // 计算交集（用更小集合遍历：O(min(|A|,|B|))）
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA]
  let intersectionCount = 0
  for (const t of small) {
    if (large.has(t)) intersectionCount++
  }

  const unionCount = setA.size + setB.size - intersectionCount
  return unionCount === 0 ? 0 : intersectionCount / unionCount
}
