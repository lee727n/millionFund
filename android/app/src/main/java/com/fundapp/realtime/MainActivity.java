package com.fundapp.realtime;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * [WHY] 主Activity，禁用全屏沉浸模式，显示系统虚拟导航栏
 * [WHAT] 继承 Capacitor 的 BridgeActivity，重写 onCreate 来配置窗口模式
 */
public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Window window = getWindow();
        
        // [WHY] 禁用全屏沉浸模式，让系统导航栏始终显示
        // [WHAT] 设置窗口不占用系统栏区域，导航栏正常显示
        View decorView = window.getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_VISIBLE
        );
        
        // [WHAT] 确保内容不会延伸到系统栏下方
        WindowCompat.setDecorFitsSystemWindows(window, true);
        
        // [WHY] 设置状态栏背景色为深色，避免内容与状态栏重叠
        // [WHAT] 状态栏使用深灰色背景，与应用暗色主题协调
        window.setStatusBarColor(Color.parseColor("#1a1a1a"));
    }
}
