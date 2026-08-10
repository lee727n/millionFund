#!/bin/bash

# 只构建 APK 脚本（不安装到手机）
# 功能：构建项目 -> 构建 APK -> 重命名为带版本号的文件

set -e  # 遇到错误立即退出

# 设置 Java 21 环境
export JAVA_HOME=/usr/local/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 应用信息
APP_PACKAGE="com.fundapp.realtime"
APP_NAME="AI百万实盘"

# 从 package.json 读取版本号
VERSION=$(node -p "require('./package.json').version")
if [ -z "$VERSION" ]; then
    echo -e "${RED}✗ 无法读取版本号${NC}"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  构建 APK（版本: v${VERSION}）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 步骤 1: 停止 dev 服务器（如果正在运行）
echo -e "${YELLOW}[1/5] 停止 dev 服务器...${NC}"
pkill -f "vite" || true
echo -e "${GREEN}✓ Dev 服务器已停止${NC}"
echo ""

# 步骤 2: 构建项目
echo -e "${YELLOW}[2/5] 构建项目...${NC}"
npm run build
echo -e "${GREEN}✓ 项目构建完成${NC}"
echo ""

# 步骤 3: 同步到 Android 项目
echo -e "${YELLOW}[3/5] 同步到 Android 项目...${NC}"
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/public
rm -rf android/app/src/main/assets/www
cp -r dist android/app/src/main/assets/public
echo -e "${GREEN}✓ 同步完成${NC}"
echo ""

# 步骤 4: 构建 APK
echo -e "${YELLOW}[4/5] 构建 APK...${NC}"
cd android
./gradlew assembleDebug
cd ..
echo -e "${GREEN}✓ APK 构建完成${NC}"
echo ""

# 步骤 5: 复制并重命名 APK
echo -e "${YELLOW}[5/5] 复制并重命名 APK...${NC}"
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
echo -e "${GREEN}应用名称: $APP_NAME${NC}"
echo -e "${GREEN}版本号:   v${VERSION}${NC}"
echo -e "${GREEN}包名:     $APP_PACKAGE${NC}"
echo -e "${GREEN}APK 文件: ${OUTPUT_APK}${NC}"
echo ""
echo -e "${YELLOW}提示: 上传到 GitHub Release 时使用文件名 fund-app-v${VERSION}.apk${NC}"
echo ""
