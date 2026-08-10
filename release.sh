#!/bin/bash
# [WHY] 统一发布脚本 - 更新版本号 + 构建 APK + 生成双下载源配置
# [WHAT] 修改版本号（4个文件）→ 构建 APK → 交互式输入更新内容 → 生成 GitHub + Gitee 下载链接
# [HOW] 用法: ./release.sh <版本号>
# 示例: ./release.sh 3.9.1

set -e

# 设置 Java 21 环境
export JAVA_HOME=/usr/local/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查参数
VERSION=$1
if [ -z "$VERSION" ]; then
  echo -e "${RED}用法: ./release.sh <版本号>${NC}"
  echo -e "${YELLOW}示例: ./release.sh 3.9.1${NC}"
  exit 1
fi

# [WHAT] 计算 versionCode
VERSION_CODE=$(echo $VERSION | awk -F. '{print $1 * 100 + $2 * 10 + $3}')

# [WHAT] 生成 URL
# GitHub Release tag 带 v 前缀 (如 v3.9.1)
# Gitee Release tag 也带 v 前缀 (如 v3.9.1)
APK_FILENAME="fund-app-v${VERSION}.apk"
GITHUB_APK_URL="https://github.com/lee727n/millionFund/releases/download/v${VERSION}/${APK_FILENAME}"
GITEE_APK_URL="https://gitee.com/lee727n/millionFund/releases/download/v${VERSION}/${APK_FILENAME}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  发布版本 v${VERSION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}GitHub APK:  ${GITHUB_APK_URL}${NC}"
echo -e "${CYAN}Gitee APK:   ${GITEE_APK_URL}${NC}"
echo ""

# [1/7] 更新 package.json
echo -e "${YELLOW}[1/7] 更新 package.json...${NC}"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
echo -e "${GREEN}✓ package.json → $VERSION${NC}"
echo ""

# [2/7] 更新 version.ts
echo -e "${YELLOW}[2/7] 更新 version.ts...${NC}"
sed -i '' "s/export const APP_VERSION = '.*'/export const APP_VERSION = '$VERSION'/" src/config/version.ts
echo -e "${GREEN}✓ version.ts → $VERSION${NC}"
echo ""

# [3/7] 更新 build.gradle
echo -e "${YELLOW}[3/7] 更新 build.gradle...${NC}"
sed -i '' "s/versionCode .*/versionCode $VERSION_CODE/" android/app/build.gradle
sed -i '' "s/versionName \".*\"/versionName \"$VERSION\"/" android/app/build.gradle
echo -e "${GREEN}✓ build.gradle → versionCode=$VERSION_CODE, versionName=$VERSION${NC}"
echo ""

# [4/7] 更新 version.json 版本号和下载 URL
echo -e "${YELLOW}[4/7] 更新 version.json 版本号...${NC}"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" version.json
sed -i '' "s/\"code\": .*/\"code\": $VERSION_CODE,/" version.json
sed -i '' "s|\"apkUrl\": \".*\"|\"apkUrl\": \"${GITHUB_APK_URL}\"|" version.json
sed -i '' "s|\"apkUrlCn\": \".*\"|\"apkUrlCn\": \"${GITEE_APK_URL}\"|" version.json
# 如果 apkUrlCn 不存在（首次），则添加
if ! grep -q "apkUrlCn" version.json; then
  python3 -c "
import json
with open('version.json', 'r') as f:
    data = json.load(f)
data['apkUrlCn'] = '${GITEE_APK_URL}'
with open('version.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
"
fi
echo -e "${GREEN}✓ version.json → version=$VERSION, code=$VERSION_CODE${NC}"
echo -e "${GREEN}  apkUrl:    ${GITHUB_APK_URL}${NC}"
echo -e "${GREEN}  apkUrlCn:  ${GITEE_APK_URL}${NC}"
echo ""

# [5/7] 交互式输入更新内容
echo -e "${YELLOW}[5/7] 请输入更新内容（每行一条，输入空行结束）：${NC}"
UPDATE_CONTENT=""
while IFS= read -r line; do
  [ -z "$line" ] && break
  if [ -n "$UPDATE_CONTENT" ]; then
    UPDATE_CONTENT="${UPDATE_CONTENT}\\n- ${line}"
  else
    UPDATE_CONTENT="- ${line}"
  fi
done
if [ -z "$UPDATE_CONTENT" ]; then
  UPDATE_CONTENT="版本 $VERSION 更新"
fi

# 写入 updateContent 和 publishDate 到 version.json
PUBLISH_DATE=$(date +%Y-%m-%d)
python3 -c "
import json
with open('version.json', 'r') as f:
    data = json.load(f)
data['updateContent'] = '''$UPDATE_CONTENT'''.replace('\\\\n', '\n')
data['publishDate'] = '$PUBLISH_DATE'
with open('version.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
"
echo -e "${GREEN}✓ updateContent 和 publishDate 已写入 version.json${NC}"
echo ""

# [6/7] 构建 APK
echo -e "${YELLOW}[6/7] 构建 APK...${NC}"

# 停止 dev 服务器
pkill -f "vite" 2>/dev/null || true

# 构建项目
npm run build

# 同步到 Android
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/public
rm -rf android/app/src/main/assets/www
cp -r dist android/app/src/main/assets/public

# 构建 APK
cd android
./gradlew assembleDebug
cd ..
echo -e "${GREEN}✓ APK 构建完成${NC}"
echo ""

# [7/7] 复制重命名
echo -e "${YELLOW}[7/7] 复制 APK...${NC}"
SOURCE_APK="android/app/build/outputs/apk/debug/app-debug.apk"
OUTPUT_APK="$APK_FILENAME"

if [ ! -f "$SOURCE_APK" ]; then
  echo -e "${RED}✗ APK 文件不存在: $SOURCE_APK${NC}"
  exit 1
fi

cp "$SOURCE_APK" "$OUTPUT_APK"
echo -e "${GREEN}✓ APK 已保存: ${OUTPUT_APK}${NC}"
echo ""

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  构建完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}版本号:   v${VERSION} (code: ${VERSION_CODE})${NC}"
echo -e "${GREEN}APK 文件: ${OUTPUT_APK}${NC}"
echo ""
echo -e "${CYAN}下载链接:${NC}"
echo -e "  GitHub: ${GITHUB_APK_URL}"
echo -e "  Gitee:  ${GITEE_APK_URL}"
echo ""
echo -e "${YELLOW}接下来请手动操作:${NC}"
echo ""
echo "1. 提交代码 (包含 version.json):"
echo "   git add -A"
echo "   git commit -m \"release: v${VERSION}\""
echo "   git push"
echo ""
echo "2. 创建 GitHub Release:"
echo "   a. 打开 https://github.com/lee727n/millionFund/releases/new"
echo "   b. Tag: v${VERSION} (选择 'Create new tag: v${VERSION} on publish')"
echo "   c. Title: v${VERSION}"
echo "   d. Description: 粘贴上方更新内容"
echo "   e. 上传 APK: ${OUTPUT_APK}"
echo "   f. 点击 'Publish release'"
echo ""
echo "3. 创建 Gitee Release（国内镜像）:"
echo "   a. 打开 https://gitee.com/lee727n/millionFund/tags"
echo "   b. 找到标签 v${VERSION}，点击右侧 '发行版'"
echo "   c. 标题: v${VERSION}"
echo "   d. 描述: 粘贴上方更新内容"
echo "   e. 上传 APK: ${OUTPUT_APK}"
echo "   f. 点击 '发布'"
echo ""