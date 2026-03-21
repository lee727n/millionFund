# 基金宝 - 构建指南

本文档介绍如何从源码构建基金宝 Android 应用。

## 环境要求

- **Node.js** 18.x 或更高版本
- **npm** 9.x 或更高版本
- **JDK** 21（推荐使用 Android Studio 内置的 JBR）
- **Android SDK**（通过 Android Studio 安装）

## 快速构建

### 1. 安装依赖

```bash
npm install
```

### 2. 构建 Web 资源

```bash
npm run build
```

### 3. 同步到 Android 项目

```bash
npx cap sync
```

### 4. 构建 APK

**Debug 版本**（用于开发测试）：

```powershell
# Windows PowerShell
$env:JAVA_HOME = "D:\android\jbr"  # 替换为你的 JDK 路径
cd android
.\gradlew.bat assembleDebug
```

输出路径：`android/app/build/outputs/apk/debug/app-debug.apk`

**Release 版本**（用于发布）：

```powershell
# Windows PowerShell
$env:JAVA_HOME = "D:\android\jbr"  # 替换为你的 JDK 路径
cd android
.\gradlew.bat assembleRelease
```

输出路径：`android/app/build/outputs/apk/release/app-release.apk`

## 签名配置

Release 版本使用项目内置的签名密钥（仅供开发测试）。

如果你要发布自己的版本，建议生成新的签名密钥：

```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -alias my-key-alias \
  -keyalg RSA -keysize 2048 -validity 10000
```

然后修改 `android/app/build.gradle` 中的签名配置：

```groovy
signingConfigs {
    release {
        storeFile file('my-release-key.keystore')
        storePassword 'your-store-password'
        keyAlias 'my-key-alias'
        keyPassword 'your-key-password'
    }
}
```

## 版本号管理

版本号在以下位置配置：

1. **`android/app/build.gradle`**
   - `versionCode`: 整数，每次发布递增
   - `versionName`: 版本号字符串，如 "1.0.0"

2. **`src/config/version.ts`**
   - 应用内显示的版本信息

3. **`package.json`**
   - npm 包版本号

## 常见问题

### JAVA_HOME 设置

如果遇到 `JAVA_HOME is set to an invalid directory` 错误：

1. 找到 JDK 路径（Android Studio 通常自带 JBR）
2. 设置环境变量：
   - Windows: `$env:JAVA_HOME = "你的JDK路径"`
   - Linux/Mac: `export JAVA_HOME=/path/to/jdk`

### Gradle 下载慢

可以配置国内镜像，编辑 `android/gradle/wrapper/gradle-wrapper.properties`：

```properties
distributionUrl=https://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-all.zip
```

### 首次构建时间长

首次构建需要下载 Gradle 和依赖，可能需要 5-10 分钟。后续构建会快很多。

## 目录结构

```
fund-app/
├── src/                    # Vue 源码
├── public/                 # 静态资源
├── android/                # Android 原生项目
│   ├── app/
│   │   ├── build.gradle    # 应用构建配置
│   │   └── fund-app.keystore  # 签名密钥
│   └── gradle/             # Gradle 配置
├── dist/                   # 构建输出（Web）
├── package.json            # npm 配置
└── capacitor.config.ts     # Capacitor 配置
```

## 开发调试

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 进行开发调试。

### 在 Android Studio 中调试

```bash
npx cap open android
```

然后在 Android Studio 中运行/调试应用。

## 联系方式

如有问题，请提交 [Issue](https://github.com/xiriovo/fund-app/issues)。
