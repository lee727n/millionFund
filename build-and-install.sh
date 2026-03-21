#!/bin/bash

# 自动构建并安装 APK 脚本
# 功能：构建项目 -> 构建 APK -> 卸载旧版 -> 安装新版 -> 打开 app

set -e  # 遇到错误立即退出

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 应用信息
APP_PACKAGE="com.fundapp.realtime"
APP_NAME="AI百万实盘"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  自动构建并安装 APK${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 步骤 1: 停止 dev 服务器（如果正在运行）
echo -e "${YELLOW}[1/6] 停止 dev 服务器...${NC}"
pkill -f "vite" || true
echo -e "${GREEN}✓ Dev 服务器已停止${NC}"
echo ""

# 步骤 2: 构建项目
echo -e "${YELLOW}[2/6] 构建项目...${NC}"
npm run build
echo -e "${GREEN}✓ 项目构建完成${NC}"
echo ""

# 步骤 3: 同步到 Android 项目
echo -e "${YELLOW}[3/6] 同步到 Android 项目...${NC}"
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/www
cp -r dist android/app/src/main/assets/www
echo -e "${GREEN}✓ 同步完成${NC}"
echo ""

# 构建 APK
echo -e "${YELLOW}[5/6] 构建 APK...${NC}"
cd android
./gradlew assembleDebug
cd ..
echo -e "${GREEN}✓ APK 构建完成${NC}"

# 安装新版（保留数据）
echo -e "${YELLOW}[6/6] 安装新版（保留数据）...${NC}"
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

# 检查 APK 文件是否存在
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}✗ APK 文件不存在: $APK_PATH${NC}"
    exit 1
fi

# 尝试覆盖安装（保留数据）
echo -e "${YELLOW}  覆盖安装（保留数据）...${NC}"
if adb install -r "$APK_PATH"; then
    echo -e "${GREEN}✓ 覆盖安装成功${NC}"
else
    # 如果覆盖安装失败（签名不匹配），则卸载重装
    echo -e "${YELLOW}  覆盖安装失败，尝试卸载重装...${NC}"
    adb uninstall "$APP_PACKAGE" || echo -e "${YELLOW}  旧版本未安装${NC}"
    adb install "$APK_PATH"
    echo -e "${YELLOW}⚠ 数据已清除（签名不匹配）${NC}"
fi
echo -e "${GREEN}✓ 安装完成${NC}"
echo ""

# 步骤 6: 打开 app
echo -e "${YELLOW}[6/6] 打开应用...${NC}"
adb shell monkey -p "$APP_PACKAGE" -c android.intent.category.LAUNCHER 1
echo -e "${GREEN}✓ 应用已启动${NC}"
echo ""

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  全部完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}应用名称: $APP_NAME${NC}"
echo -e "${GREEN}包名: $APP_PACKAGE${NC}"
echo -e "${GREEN}APK 路径: $APK_PATH${NC}"
echo ""