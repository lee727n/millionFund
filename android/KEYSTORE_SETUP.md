# Android 密钥配置指南

## 重要提示

**不要将密钥文件提交到 Git 仓库！**

`.gitignore` 已配置为忽略所有 `.keystore` 文件。

## 生成新的签名密钥

### 1. 生成 Release 密钥

在项目根目录运行：

```bash
keytool -genkey -v -keystore android/app/fund-app.keystore -alias fund-app -keyalg RSA -keysize 2048 -validity 10000
```

按照提示设置：
- 密钥密码（记住这个密码！）
- 姓名、组织单位、组织名称等
- 城市、省份、国家代码

### 2. 配置构建签名

在 `android/app/build.gradle` 的 `android` 块中添加：

```gradle
signingConfigs {
    release {
        storeFile file('fund-app.keystore')
        storePassword "你的密钥密码"
        keyAlias "fund-app"
        keyPassword "你的密钥密码"
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

### 3. 安全存储密码

**推荐方式**：使用环境变量或 Gradle 属性文件

创建 `android/key.properties`（已加入 .gitignore）：

```properties
storePassword=你的密钥密码
keyPassword=你的密钥密码
keyAlias=fund-app
storeFile=fund-app.keystore
```

然后在 `build.gradle` 中读取：

```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

android {
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    // ...
}
```

## Debug 密钥

Debug 密钥由 Android Studio 自动生成，位于：
```
~/.android/debug.keystore
```

默认密码：`android`

## 备份密钥

**非常重要**：妥善备份你的密钥文件！如果丢失，将无法更新应用商店中的 APK。

建议备份到：
- 加密的云存储
- 外部硬盘
- 密码管理器（保存密码）
