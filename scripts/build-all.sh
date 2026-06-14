#!/bin/bash
# 全平台打包脚本
# 支持: Android, iOS, macOS, Windows, Web

set -e

ANDROID_DIR="android"
IOS_DIR="ios"
WEB_DIR="dist"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 构建 Web
build_web() {
    log_info "Building Web..."
    npm run build
    log_info "Web build complete: $WEB_DIR"
}

# 构建 Android
build_android() {
    log_info "Building Android APK..."
    
    if [ ! -d "$ANDROID_DIR" ]; then
        log_error "Android directory not found. Run: npx cap add android"
        return 1
    fi
    
    npx cap sync android
    cd $ANDROID_DIR
    chmod +x gradlew
    ./gradlew assembleDebug
    cd ..
    
    log_info "Android APK: $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
}

# 构建 iOS (需要 macOS)
build_ios() {
    log_info "Building iOS App..."
    
    if ! command_exists xcodegen; then
        log_warn "XcodeGen not found. Install: brew install xcodegen"
        return 1
    fi
    
    if [ ! -d "$IOS_DIR" ]; then
        log_error "iOS directory not found. Run: npx cap add ios"
        return 1
    fi
    
    npx cap sync ios
    cd $IOS_DIR
    xcodegen generate
    xcodebuild -workspace "App.xcworkspace" -scheme App -configuration Release -destination "generic/platform=iOS" build
    cd ..
    
    log_info "iOS build complete"
}

# 构建 macOS (需要 macOS)
build_macos() {
    log_info "Building macOS App..."
    
    if ! command_exists xcodegen; then
        log_warn "XcodeGen not found. Install: brew install xcodegen"
        return 1
    fi
    
    if [ ! -d "$IOS_DIR" ]; then
        log_error "iOS directory not found."
        return 1
    fi
    
    npx cap sync ios
    cd $IOS_DIR
    xcodegen generate
    xcodebuild -workspace "App.xcworkspace" -scheme App -configuration Release -destination "platform=macOS" build
    cd ..
    
    log_info "macOS build complete"
}

# 清理构建
clean() {
    log_info "Cleaning build directories..."
    rm -rf $WEB_DIR
    cd $ANDROID_DIR && ./gradlew clean && cd ..
    rm -rf $IOS_DIR/build
    log_info "Clean complete"
}

# 显示帮助
show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all       Build all platforms (default)"
    echo "  web       Build web app only"
    echo "  android   Build Android APK"
    echo "  ios       Build iOS app (macOS only)"
    echo "  macos     Build macOS app (macOS only)"
    echo "  clean     Clean build directories"
    echo "  help      Show this help message"
}

# 主入口
case "${1:-all}" in
    all)
        build_web
        build_android
        if command_exists xcodegen && [ -d "$IOS_DIR" ]; then
            build_ios
        fi
        ;;
    web) build_web ;;
    android) build_android ;;
    ios) build_ios ;;
    macos) build_macos ;;
    clean) clean ;;
    help) show_help ;;
    *) log_error "Unknown command: $1"; show_help; exit 1 ;;
esac

log_info "Done!"
