#!/bin/bash
# [WHY] 一键发布脚本 - 构建 APK 并创建 GitHub Release
# [WHAT] 自动构建 APK、更新 version.json、创建 GitHub Release
# [HOW] 用法: ./scripts/publish-release.sh <版本号> [更新内容]
# 示例: ./scripts/publish-release.sh 1.9.0 "1. 新增XX功能\n2. 修复XX问题"

set -e

# [WHAT] 检查参数
VERSION=$1
UPDATE_CONTENT=$2

if [ -z "$VERSION" ]; then
  echo "用法: ./scripts/publish-release.sh <版本号> [更新内容]"
  echo "示例: ./scripts/publish-release.sh 1.9.0 \"1. 新增功能\n2. 修复问题\""
  exit 1
fi

if [ -z "$UPDATE_CONTENT" ]; then
  echo ""
  echo "请输入更新内容（每行一条，输入空行结束）："
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
fi

echo "=========================================="
echo "  发布版本 v$VERSION"
echo "=========================================="

# [第一步] 更新 package.json 版本号
echo "[1/5] 更新 package.json 版本号..."
npm version $VERSION --no-git-tag-version

# [第二步] 更新 src/config/version.ts
echo "[2/5] 更新 version.ts..."
sed -i '' "s/export const APP_VERSION = '.*'/export const APP_VERSION = '$VERSION'/" src/config/version.ts

# [第三步] 更新 android/app/build.gradle 版本号
echo "[3/5] 更新 build.gradle 版本号..."
VERSION_CODE=$(echo $VERSION | awk -F. '{print $1 * 100 + $2 * 10 + $3}')
sed -i '' "s/versionCode .*/versionCode $VERSION_CODE/" android/app/build.gradle
sed -i '' "s/versionName \".*\"/versionName \"$VERSION\"/" android/app/build.gradle

# [第四步] 构建 APK
echo "[4/5] 构建 APK..."
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
cd ..

# [WHAT] APK 路径
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK_PATH" ]; then
  echo "错误: APK 构建失败，文件不存在: $APK_PATH"
  exit 1
fi

# [第五步] 更新 version.json
echo "[5/5] 更新 version.json..."
PUBLISH_DATE=$(date +%Y-%m-%d)
cat > version.json << EOF
{
  "version": "$VERSION",
  "code": $VERSION_CODE,
  "apkUrl": "https://github.com/lee727n/millionFund/releases/download/v$VERSION/fund-app-v$VERSION.apk",
  "updateContent": "$UPDATE_CONTENT",
  "forceUpdate": false,
  "minSupportVersion": "1.0.0",
  "publishDate": "$PUBLISH_DATE"
}
EOF

echo ""
echo "=========================================="
echo "  构建完成!"
echo "=========================================="
echo ""
echo "APK 路径: $APK_PATH"
echo "版本号: v$VERSION (code: $VERSION_CODE)"
echo ""
echo "接下来请手动操作:"
echo ""
echo "1. 提交代码:"
echo "   git add -A"
echo "   git commit -m \"release: v$VERSION\""
echo "   git push"
echo ""
echo "2. 创建 GitHub Release:"
echo "   a. 打开 https://github.com/lee727n/millionFund/releases/new"
echo "   b. Tag: v$VERSION (选择 'Create new tag: v$VERSION on publish')"
echo "   c. Title: v$VERSION"
echo "   d. Description: $UPDATE_CONTENT"
echo "   e. 上传 APK: 选择 $APK_PATH 文件，重命名为 fund-app-v$VERSION.apk"
echo "   f. 点击 'Publish release'"
echo ""
echo "3. 验证更新:"
echo "   打开 App → 我的持仓 → 点击版本号 → 检测到新版本"
echo ""
