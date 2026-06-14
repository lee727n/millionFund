package com.fundapp.realtime;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PermissionPlugin",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        ),
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE },
            maxSdkVersion = 32
        ),
        @Permission(
            alias = "media",
            strings = { Manifest.permission.READ_MEDIA_IMAGES }
        )
    }
)
public class PermissionPlugin extends Plugin {

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();

        result.put("camera", getPermissionState("camera").toString());
        result.put("storage", getPermissionState("storage").toString());
        result.put("media", getPermissionState("media").toString());

        // For Android 13+, READ_MEDIA_IMAGES replaces READ_EXTERNAL_STORAGE
        if (Build.VERSION.SDK_INT >= 33) {
            result.put("storage", getPermissionState("media").toString());
        }

        result.put("allGranted",
            result.getString("camera").equals("GRANTED") &&
            result.getString("storage").equals("GRANTED")
        );

        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        requestAllPermissions(call, "handlePermissionsResult");
    }

    @PermissionCallback
    private void handlePermissionsResult(PluginCall call) {
        checkPermissions(call);
    }
}
