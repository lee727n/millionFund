package com.fundapp.realtime;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * [WHY] APK 安装插件
 * [WHAT] 调用 Android 系统安装器安装 APK 文件
 * [HOW] 通过 FileProvider 提供 content:// URI 给系统安装器
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String TAG = "ApkInstaller";

    /**
     * [WHAT] 安装 APK
     * [HOW] 接收文件路径，通过 FileProvider 转换为 content:// URI，启动安装 Intent
     */
    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("文件路径不能为空");
            return;
        }

        try {
            File file;
            // [WHAT] 处理不同的路径格式
            if (filePath.startsWith("file://")) {
                file = new File(Uri.parse(filePath).getPath());
            } else if (filePath.startsWith("/")) {
                file = new File(filePath);
            } else {
                // [WHAT] 相对路径，基于缓存目录解析
                file = new File(getContext().getCacheDir(), filePath);
            }

            if (!file.exists()) {
                call.reject("APK 文件不存在: " + file.getAbsolutePath());
                return;
            }

            Log.i(TAG, "安装 APK: " + file.getAbsolutePath());

            // [WHAT] 通过 FileProvider 获取 content:// URI
            // [WHY] Android 7.0+ 不允许直接使用 file:// URI
            Context context = getContext();
            String authority = context.getPackageName() + ".fileprovider";
            Uri apkUri = FileProvider.getUriForFile(context, authority, file);

            // [WHAT] 创建安装 Intent
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // [WHAT] 启动安装界面
            context.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "安装界面已启动");
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "安装 APK 失败", e);
            call.reject("安装失败: " + e.getMessage());
        }
    }
}
