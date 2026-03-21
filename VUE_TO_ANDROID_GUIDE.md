# Vue 项目刷到安卓手机完整流程

## 目录
1. [前期环境配置](#前期环境配置)
2. [项目初始化](#项目初始化)
3. [开发流程](#开发流程)
4. [构建和安装流程](#构建和安装流程)
5. [自动化脚本](#自动化脚本)
6. [常见问题](#常见问题)

---

## 前期环境配置

### 1. 安装 Java JDK

#### macOS
```bash
# 使用 Homebrew 安装
brew install openjdk@17

# 配置环境变量
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# 验证安装
java -version
```

#### Windows
1. 下载 JDK 17: https://www.oracle.com/java/technologies/downloads/#java17
2. 安装后配置环境变量：
   - `JAVA_HOME`: `C:\Program Files\Java\jdk-17`
   - `Path`: 添加 `%JAVA_HOME%\bin`

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install openjdk-17-jdk

# 验证安装
java -version
```

### 2. 安装 Android SDK

#### 方式一：使用 Android Studio（推荐）
1. 下载 Android Studio: https://developer.android.com/studio
2. 安装后打开 Android Studio
3. 打开 SDK Manager（Tools -> SDK Manager）
4. 安装以下组件：
   - Android SDK Platform-Tools
   - Android SDK Build-Tools
   - Android SDK Platform (选择最新版本)
   - Android Emulator

#### 方式二：命令行安装
```bash
# macOS
brew install --cask android-sdk

# 配置环境变量
echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME/tools' >> ~/.zshrc
source ~/.zshrc
```

### 3. 配置 ADB

#### 启用 USB 调试（手机端）
1. 打开手机设置
2. 进入"关于手机"
3. 连续点击"版本号"7次，启用开发者选项
4. 返回设置，进入"开发者选项"
5. 启用"USB 调试"
6. 连接电脑后，在手机上允许 USB 调试

#### 验证 ADB 连接
```bash
# 启动 ADB 服务
adb start-server

# 查看连接的设备
adb devices

# 应该看到类似输出：
# List of devices attached
# PJRKORO7GENN45EY        device
```

### 4. 安装 Node.js 和 npm

#### macOS
```bash
brew install node

# 验证安装
node -v
npm -v
```

#### Windows
1. 下载 Node.js: https://nodejs.org/
2. 安装后验证：
```cmd
node -v
npm -v
```

---

## 项目初始化

### 1. 创建 Vue 项目

```bash
# 使用 Vite 创建 Vue 项目
npm create vite@latest my-app -- --template vue

# 进入项目目录
cd my-app

# 安装依赖
npm install
```

### 2. 安装 Capacitor

```bash
# 安装 Capacitor 核心依赖
npm install @capacitor/core @capacitor/cli

# 安装 Android 平台
npm install @capacitor/android

# 初始化 Capacitor
npx cap init
```

初始化时会询问：
- App Name: 应用名称（如：AI百万实盘）
- App ID: 包名（如：com.fundapp.realtime）
- Web Dir: web 资源目录（如：dist）

### 3. 添加 Android 平台

```bash
# 添加 Android 平台
npx cap add android
```

这会创建 `android/` 目录，包含 Android 项目结构。

### 4. 配置 Capacitor

创建 `capacitor.config.json`：

```json
{
  "appId": "com.fundapp.realtime",
  "appName": "AI百万实盘",
  "webDir": "dist",
  "server": {
    "url": "http://your-local-ip:5173",
    "cleartext": true,
    "allowNavigation": ["*"]
  }
}
```

#### 配置说明：
- `appId`: 应用的唯一包名
- `appName`: 应用显示名称
- `webDir`: Vue 构建输出目录
- `server.url`: 开发服务器地址（用于实时开发）
- `server.cleartext`: 允许 HTTP 连接

### 5. 配置说明

**注意**：本指南使用 Debug 模式构建，不需要生成签名密钥。Debug 模式下 Android 会使用默认的调试签名，直接刷到手机上进行测试。
```

---

## 开发流程

### 1. 启动开发服务器

```bash
# 启动 Vite 开发服务器
npm run dev
```

服务器会启动在：
- Local: http://localhost:5173/
- Network: http://your-local-ip:5173/

### 2. 配置 Vite 网络访问

编辑 `vite.config.ts`：

```typescript
export default defineConfig({
  // ... 其他配置
  server: {
    host: '0.0.0.0',  // 允许外部访问
    port: 5173
  }
})
```

### 3. 同步到 Android 项目

```bash
# 同步 web 资源到 Android 项目
npx cap sync android
```

这会：
- 复制 `dist/` 目录到 `android/app/src/main/assets/public/`
- 更新 Android 插件
- 同步配置文件

### 4. 构建并安装 APK

```bash
# 构建 APK
cd android
./gradlew assembleDebug

# 安装到手机（保留数据）
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 打开应用
adb shell monkey -p com.fundapp.realtime -c android.intent.category.LAUNCHER 1
```

---

## 构建和安装流程

### 完整流程（Debug模式）

```bash
# 1. 停止开发服务器（如果正在运行）
pkill -f "vite" || true

# 2. 构建 Vue 项目
npm run build

# 3. 同步到 Android 项目
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/www
cp -r dist android/app/src/main/assets/www

# 4. 同步 Capacitor 配置
npx cap sync android

# 5. 构建 APK
cd android
./gradlew assembleDebug
cd ..

# 6. 安装到手机（保留数据）
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 7. 打开应用
adb shell monkey -p com.fundapp.realtime -c android.intent.category.LAUNCHER 1
```

### 开发模式流程（实时开发）

```bash
# 1. 启动开发服务器（保持运行）
npm run dev

# 2. 在另一个终端同步并安装
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/public
cp -r dist android/app/src/main/assets/public
npx cap sync android
cd android
./gradlew assembleDebug
cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.fundapp.realtime -c android.intent.category.LAUNCHER 1
```

---

## 自动化脚本

### 生产模式脚本（build-and-install.sh）

```bash
#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_PACKAGE="com.fundapp.realtime"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  自动构建并安装 APK${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 停止 dev 服务器
echo -e "${YELLOW}[1/6] 停止 dev 服务器...${NC}"
pkill -f "vite" || true
echo -e "${GREEN}✓ Dev 服务器已停止${NC}"

# 构建项目
echo -e "${YELLOW}[2/6] 构建项目...${NC}"
npm run build
echo -e "${GREEN}✓ 项目构建完成${NC}"

# 同步到 Android 项目
echo -e "${YELLOW}[3/6] 同步到 Android 项目...${NC}"
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/www
cp -r dist android/app/src/main/assets/www
echo -e "${GREEN}✓ 同步完成${NC}"

# 同步 Capacitor 配置
echo -e "${YELLOW}[4/6] 同步 Capacitor 配置...${NC}"
npx cap sync android
echo -e "${GREEN}✓ 同步完成${NC}"

# 构建 APK
echo -e "${YELLOW}[5/6] 构建 APK...${NC}"
cd android
./gradlew assembleRelease
cd ..
echo -e "${GREEN}✓ APK 构建完成${NC}"

# 安装新版（保留数据）
echo -e "${YELLOW}[6/6] 安装新版（保留数据）...${NC}"
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if adb install -r "$APK_PATH"; then
    echo -e "${GREEN}✓ 覆盖安装成功${NC}"
else
    adb uninstall "$APP_PACKAGE"
    adb install "$APK_PATH"
    echo -e "${YELLOW}⚠ 数据已清除（签名不匹配）${NC}"
fi

# 打开应用
adb shell monkey -p "$APP_PACKAGE" -c android.intent.category.LAUNCHER 1
echo -e "${GREEN}✓ 应用已启动${NC}"
```

### 开发模式脚本（build-and-install-dev.sh）

```bash
#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_PACKAGE="com.fundapp.realtime"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  自动构建并安装 APK（开发模式）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 同步到 Android 项目
echo -e "${YELLOW}[1/5] 同步到 Android 项目...${NC}"
mkdir -p android/app/src/main/assets
rm -rf android/app/src/main/assets/public
cp -r dist android/app/src/main/assets/public
echo -e "${GREEN}✓ 同步完成${NC}"

# 同步 Capacitor 配置
echo -e "${YELLOW}[2/5] 同步 Capacitor 配置...${NC}"
npx cap sync android
echo -e "${GREEN}✓ 同步完成${NC}"

# 构建 APK
echo -e "${YELLOW}[3/5] 构建 APK...${NC}"
cd android
./gradlew assembleRelease
cd ..
echo -e "${GREEN}✓ APK 构建完成${NC}"

# 安装新版（保留数据）
echo -e "${YELLOW}[4/5] 安装新版（保留数据）...${NC}"
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"

if adb install -r "$APK_PATH"; then
    echo -e "${GREEN}✓ 覆盖安装成功${NC}"
else
    adb uninstall "$APP_PACKAGE"
    adb install "$APK_PATH"
    echo -e "${YELLOW}⚠ 数据已清除（签名不匹配）${NC}"
fi

# 打开应用
adb shell monkey -p "$APP_PACKAGE" -c android.intent.category.LAUNCHER 1
echo -e "${GREEN}✓ 应用已启动${NC}"
```

### 使用方法

```bash
# 赋予执行权限
chmod +x build-and-install.sh
chmod +x build-and-install-dev.sh

# 生产模式（停止 dev 服务器）
./build-and-install.sh

# 开发模式（不停止 dev 服务器）
./build-and-install-dev.sh
```

---

## 常见问题

### 1. ADB 无法识别设备

**问题**: `adb devices` 显示空列表

**解决方案**:
```bash
# 重启 ADB 服务
adb kill-server
adb start-server

# 检查 USB 调试是否启用
# 手机上重新授权 USB 调试

# 尝试使用无线连接
adb tcpip 5555
adb connect <手机IP>:5555
```

### 2. 签名不匹配

**问题**: `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

**解决方案**:
```bash
# 卸载旧版本
adb uninstall com.fundapp.realtime

# 重新安装
adb install android/app/build/outputs/apk/release/app-release.apk
```

### 3. Gradle 构建失败

**问题**: `Could not resolve all dependencies`

**解决方案**:
```bash
# 清理 Gradle 缓存
cd android
./gradlew clean

# 重新构建
./gradlew assembleRelease
```

### 4. 应用无法访问开发服务器

**问题**: 网页无法打开

**解决方案**:
1. 确保 `capacitor.config.json` 中配置了正确的服务器 URL
2. 确保 Vite 配置了 `host: '0.0.0.0'`
3. 确保手机和电脑在同一网络
4. 检查防火墙设置

### 5. 覆盖安装失败

**问题**: `adb install -r` 失败

**解决方案**:
```bash
# 检查签名是否一致
# 如果签名不同，必须卸载重装
adb uninstall com.fundapp.realtime
adb install app-release.apk
```

### 6. 数据丢失

**问题**: 重新安装后数据丢失

**解决方案**:
- 使用 `adb install -r` 进行覆盖安装
- 确保签名一致
- 备份应用数据（使用 adb backup）

---

## 项目结构

```
my-app/
├── src/                    # Vue 源代码
│   ├── components/         # 组件
│   ├── views/             # 页面
│   ├── stores/            # 状态管理
│   ├── api/               # API 接口
│   └── utils/             # 工具函数
├── public/                # 静态资源
├── dist/                  # 构建输出
├── android/               # Android 项目
│   ├── app/
│   │   ├── src/
│   │   │   └── main/
│   │   │       ├── assets/  # Web 资源
│   │   │       └── java/    # Java 代码
│   │   └── build.gradle     # 应用构建配置
│   ├── build.gradle         # 项目构建配置
│   └── gradlew             # Gradle 包装器
├── capacitor.config.json    # Capacitor 配置
├── vite.config.ts         # Vite 配置
├── package.json           # 项目依赖
├── build-and-install.sh          # 生产模式脚本
└── build-and-install-dev.sh      # 开发模式脚本
```

---

## 快速参考

### 常用命令

```bash
# 开发
npm run dev                              # 启动开发服务器
npm run build                            # 构建生产版本

# Capacitor
npx cap init                             # 初始化 Capacitor
npx cap add android                      # 添加 Android 平台
npx cap sync android                     # 同步到 Android
npx cap open android                     # 打开 Android Studio

# Android
./gradlew assembleDebug                   # 构建 Debug APK
adb devices                             # 查看连接的设备
adb install -r app-debug.apk           # 覆盖安装
adb uninstall com.fundapp.realtime       # 卸载应用
adb shell monkey -p <package> 1         # 打开应用
```

### 文件路径

- **APK 输出**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Web 资源**: `android/app/src/main/assets/public/`
- **Capacitor 配置**: `capacitor.config.json`

---

## 总结

从 Vue 刷到安卓手机的完整流程包括：

1. **环境配置**: Java JDK、Android SDK、ADB、Node.js
2. **项目初始化**: 创建 Vue 项目、安装 Capacitor
3. **开发流程**: 启动开发服务器、实时同步、构建安装
4. **自动化脚本**: 一键构建和安装，提高开发效率

关键点：
- 使用 `adb install -r` 进行覆盖安装，保留数据
- 配置 Capacitor 连接开发服务器，实现实时开发
- 使用自动化脚本简化构建流程
- 使用 Debug 模式构建，无需签名配置

通过以上流程，可以高效地将 Vue 应用部署到安卓手机上进行开发和测试。
