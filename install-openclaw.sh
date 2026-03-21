#!/bin/bash

echo "=========================================="
echo "OpenClaw 安装脚本"
echo "=========================================="
echo ""

# 检查是否已经安装
if [ -f "/usr/local/bin/openclaw" ]; then
    echo "✓ OpenClaw 已经安装"
    /usr/local/bin/openclaw --version
    echo ""
    echo "如需重新安装，请先删除："
    echo "  sudo rm /usr/local/bin/openclaw"
    exit 0
fi

echo "开始安装 OpenClaw..."
echo ""

# 临时文件路径
TEMP_FILE="/tmp/openclaw_download"

# 方法1：尝试从 GitHub 下载
echo "[1/3] 尝试从 GitHub 下载..."
if curl -L https://github.com/openclaw/openclaw/releases/latest/download/openclaw -o "$TEMP_FILE" 2>/dev/null && [ -s "$TEMP_FILE" ]; then
    sudo mv "$TEMP_FILE" /usr/local/bin/openclaw
    sudo chmod +x /usr/local/bin/openclaw
    echo "✓ 从 GitHub 下载成功"
    /usr/local/bin/openclaw --version
    exit 0
fi

# 方法2：尝试使用代理下载
echo "[2/3] 尝试使用代理下载..."
if curl -L https://ghproxy.com/https://github.com/openclaw/openclaw/releases/latest/download/openclaw -o "$TEMP_FILE" 2>/dev/null && [ -s "$TEMP_FILE" ]; then
    sudo mv "$TEMP_FILE" /usr/local/bin/openclaw
    sudo chmod +x /usr/local/bin/openclaw
    echo "✓ 从代理下载成功"
    /usr/local/bin/openclaw --version
    exit 0
fi

# 方法3：检查 Downloads 目录
echo "[3/3] 检查本地下载文件..."
if [ -f "$HOME/Downloads/openclaw" ]; then
    echo "✓ 在 Downloads 目录找到 openclaw"
    sudo cp "$HOME/Downloads/openclaw" /usr/local/bin/openclaw
    sudo chmod +x /usr/local/bin/openclaw
    echo "✓ 安装成功"
    /usr/local/bin/openclaw --version
    exit 0
fi

# 所有方法都失败
echo ""
echo "❌ 自动安装失败"
echo ""
echo "请手动下载 OpenClaw："
echo "1. 访问：https://github.com/openclaw/openclaw/releases"
echo "2. 下载最新版本的 openclaw 文件（macOS 版本）"
echo "3. 保存到 ~/Downloads/openclaw"
echo "4. 重新运行此脚本"
echo ""
echo "或者手动安装："
echo "  sudo cp ~/Downloads/openclaw /usr/local/bin/openclaw"
echo "  sudo chmod +x /usr/local/bin/openclaw"
echo ""
echo "=========================================="
