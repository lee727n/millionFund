# [WHY] ProGuard rules for Capacitor Android app
# [WHAT] 防止混淆移除通过反射调用的 Capacitor 插件类和方法

# [WHY] Capacitor 核心通过反射调用插件方法
-keep class com.getcapacitor.** { *; }
-keep class com.fundapp.realtime.** { *; }

# [WHY] WebView JavaScript 桥接接口需保持原生方法名
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# [WHY] Gson 序列化/反序列化需要保留成员字段名
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }

# [WHY] 保留行号信息便于线上崩溃堆栈定位
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
