#!/bin/bash
# [WHY] 统一发布脚本 - 更新版本号 + 构建 APK
# [WHAT] 修改版本号（4个文件）→ 构建 APK → 交互式输入更新内容
# [HOW] 用法: ./release.sh <版本号>
# 示例: ./release.sh 3.8.6

set -e

# 设置 Java 21 环境
export JAVA_HOME=/usr/local/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查参数
VERSION=$1
if [ -z "$VERSION" ]; then
  echo -e "${RED}用法: ./release.sh <版本号>${NC}"
  echo -e "${YELLOW}示例: ./release.sh 3.8.6${NC}"
  exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  发布版本 v${VERSION}${NC}"
echo -e "${GREEN}========================================${NC}"
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
VERSION_CODE=$(echo $VERSION | awk -F. '{print $1 * 100 + $2 * 10 + $3}')
sed -i '' "s/versionCode .*/versionCode $VERSION_CODE/" android/app/build.gradle
sed -i '' "s/versionName \".*\"/versionName \"$VERSION\"/" android/app/build.gradle
echo -e "${GREEN}✓ build.gradle → versionCode=$VERSION_CODE, versionName=$VERSION${NC}"
echo ""

# [4/7] 更新 version.json（版本号部分，updateContent 后面填）
echo -e "${YELLOW}[4/7] 更新 version.json 版本号...${NC}"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" version.json
sed -i '' "s/\"code\": .*/\"code\": $VERSION_CODE,/" version.json
sed -i '' "s|releases/download/v.*/fund-app|releases/download/v${VERSION}/fund-app|" version.json
echo -e "${GREEN}✓ version.json → version=$VERSION, code=$VERSION_CODE${NC}"
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

# 写入 updateContent 到 version.json
# 使用 python3 处理 JSON 中的换行符
python3 -c "
import json
with open('version.json', 'r') as f:
    data = json.load(f)
data['updateContent'] = '''$UPDATE_CONTENT'''.replace('\\\\n', '\n')
with open('version.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
"
echo -e "${GREEN}✓ updateContent 已写入 version.json${NC}"
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
OUTPUT_APK="fund-app-v${VERSION}.apk"

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
echo -e "${YELLOW}接下来请手动操作:${NC}"
echo ""
echo "1. 提交代码:"
echo "   git add -A"
echo "   git commit -m \"release: v${VERSION}\""
echo "   git push"
echo ""
echo "2. 创建 GitHub Release:"
echo "   a. 打开 https://github.com/lee727n/millionFund/releases/new"
echo "   b. Tag: v${VERSION}"
echo "   c. Title: v${VERSION}"
echo "   d. 上传 APK: fund-app-v${VERSION}.apk"
echo "   e. 点击 'Publish release'"
echo ""
