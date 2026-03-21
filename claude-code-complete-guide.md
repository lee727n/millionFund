# Claude Code 完整安装指南（从零开始）

## 目录
1. [环境准备](#环境准备)
2. [问题诊断](#问题诊断)
3. [安装步骤](#安装步骤)
4. [验证安装](#验证安装)
5. [常见问题](#常见问题)
6. [进阶使用](#进阶使用)

---

## 环境准备

### 检查系统环境

```bash
# 1. 检查 macOS 版本
sw_vers
# 输出示例：
# ProductName: macOS
# ProductVersion: 13.7.8
# BuildVersion: 22H730

# 2. 检查 Node.js 版本
node --version
# 输出示例：v24.13.0

# 3. 检查 npm 版本
npm --version
# 输出示例：10.9.2

# 4. 检查 shell 类型
echo $SHELL
# 输出示例：/bin/bash 或 /bin/zsh
```

### 确认工具可用性

```bash
# 检查 npx 是否可用
npx --version
# 应该显示版本号，如 10.9.2

# 如果 npx 不可用，需要重新安装 Node.js
# 访问 https://nodejs.org/ 下载并安装最新版本
```

---

## 问题诊断

### 步骤 1：尝试直接使用 claude 命令

```bash
# 尝试运行 claude 命令
claude --version
```

**可能的结果**：

#### 情况 A：命令不存在
```bash
zsh: command not found: claude
```
**说明**：系统中没有安装 claude 命令，可以直接安装

#### 情况 B：命令存在但报错
```bash
Error: Cannot find module '/Users/liuzixuan/FInanceModule/node_modules/@anthropic-ai/claude-code/cli.js'
```
**说明**：系统中有 claude 命令，但配置有问题，需要修复

#### 情况 C：命令正常工作
```bash
2.1.72 (Claude Code)
```
**说明**：claude 命令已经正常工作，无需安装

### 步骤 2：检查系统中已有的 claude 命令

```bash
# 查找 claude 命令位置
which claude
# 输出示例：/usr/local/bin/claude

# 查看命令类型
file /usr/local/bin/claude
# 输出示例：a /usr/bin/env node script text executable

# 查看命令内容（前几行）
head -20 /usr/local/bin/claude
```

---

## 安装步骤

### 方法一：使用 npx（推荐，无需管理员权限）

#### 步骤 1：测试 npx 方式

```bash
# 测试 npx 是否能正常工作
npx @anthropic-ai/claude-code --version
```

**预期输出**：
```
2.1.72 (Claude Code)
```

如果看到这个输出，说明 npx 方式可以正常工作。

#### 步骤 2：创建便捷命令

**对于 zsh 用户（macOS 默认）**：

```bash
# 编辑 zsh 配置文件
nano ~/.zshrc
# 或使用 vim
vim ~/.zshrc
```

**在文件末尾添加以下内容**：

```bash
# Claude Code CLI 便捷命令
claudeai() {
    npx @anthropic-ai/claude-code "$@"
}
```

**保存并退出**：
- 如果使用 nano：按 `Ctrl+O` 保存，按 `Ctrl+X` 退出
- 如果使用 vim：按 `Esc`，输入 `:wq`，按 `Enter`

**对于 bash 用户**：

```bash
# 编辑 bash 配置文件
nano ~/.bashrc
```

**在文件末尾添加相同的内容**：

```bash
# Claude Code CLI 便捷命令
claudeai() {
    npx @anthropic-ai/claude-code "$@"
}
```

#### 步骤 3：重新加载配置

```bash
# 重新加载 zsh 配置
source ~/.zshrc

# 或重新加载 bash 配置
source ~/.bashrc
```

#### 步骤 4：验证安装

```bash
# 测试新命令
claudeai --version
```

**预期输出**：
```
2.1.72 (Claude Code)
```

---

### 方法二：全局安装（需要管理员权限）

#### 步骤 1：尝试全局安装

```bash
# 尝试全局安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code
```

**可能遇到的问题**：

```bash
npm error code EPERM
npm error syscall mkdir
npm error path /usr/local/lib/node_modules/@anthropic-ai
```

**说明**：权限不足，需要使用 sudo

#### 步骤 2：使用 sudo 安装

```bash
# 使用 sudo 全局安装
sudo npm install -g @anthropic-ai/claude-code
```

**输入密码后等待安装完成**

#### 步骤 3：验证安装

```bash
# 检查命令是否可用
claude --version
```

**预期输出**：
```
2.1.72 (Claude Code)
```

---

## 验证安装

### 基本验证

```bash
# 1. 检查版本
claudeai --version
# 或 claude --version（如果使用全局安装）

# 2. 查看帮助信息
claudeai --help

# 3. 测试基本功能
claudeai --help | head -20
```

### 功能测试

```bash
# 启动 Claude Code 交互模式
claudeai

# 在交互模式中，可以：
# - 输入代码问题
# - 请求代码优化
# - 获取编程建议
# - 按 Ctrl+D 退出
```

---

## 常见问题

### Q1: npx 命令不存在

**问题**：
```bash
zsh: command not found: npx
```

**解决方案**：
```bash
# 重新安装 Node.js
# 访问 https://nodejs.org/
# 下载并安装最新 LTS 版本

# 安装完成后验证
node --version
npm --version
npx --version
```

### Q2: claudeai 命令在新终端中不可用

**问题**：
```bash
zsh: command not found: claudeai
```

**解决方案**：
```bash
# 1. 检查配置文件是否正确
cat ~/.zshrc | grep claudeai

# 2. 如果没有找到，重新添加
echo 'claudeai() { npx @anthropic-ai/claude-code "$@"; }' >> ~/.zshrc

# 3. 重新加载配置
source ~/.zshrc

# 4. 再次测试
claudeai --version
```

### Q3: 网络连接问题

**问题**：
```bash
npx: ERR! request to https://registry.npmjs.org/... failed
```

**解决方案**：
```bash
# 1. 检查网络连接
ping -c 1 registry.npmjs.org

# 2. 如果网络有问题，使用国内镜像
npm config set registry https://registry.npmmirror.com

# 3. 再次尝试
npx @anthropic-ai/claude-code --version
```

### Q4: 权限问题

**问题**：
```bash
Error: EACCES: permission denied
```

**解决方案**：
```bash
# 方案 1：使用 sudo
sudo npm install -g @anthropic-ai/claude-code

# 方案 2：使用 npx（推荐）
claudeai() { npx @anthropic-ai/claude-code "$@"; }
```

### Q5: 版本冲突

**问题**：
```bash
系统中已有 /usr/local/bin/claude 命令
```

**解决方案**：
```bash
# 1. 使用不同的命令名称
claudeai() { npx @anthropic-ai/claude-code "$@"; }

# 2. 或卸载旧的 claude 命令
sudo rm /usr/local/bin/claude

# 3. 或重新安装
sudo npm install -g @anthropic-ai/claude-code --force
```

---

## 进阶使用

### 常用命令

```bash
# 查看版本
claudeai --version

# 查看帮助
claudeai --help

# 启动交互模式
claudeai

# 执行单次查询
claudeai "帮我写一个 Python 函数来计算斐波那契数列"

# 指定模型
claudeai --model claude-3-5-sonnet "解释一下 React 的生命周期"

# 查看可用模型
claudeai --list-models
```

### 集成到编辑器

#### VS Code 集成

1. 安装 Claude Code 扩展
2. 配置 API 密钥
3. 使用快捷键调用

#### Vim/Neovim 集成

```bash
# 安装 vim 插件
# 在 ~/.vimrc 或 ~/.config/nvim/init.vim 中添加

" Claude Code 集成
command! -nargs=1 ClaudeCode execute '!claudeai <args>'
```

### 自动化脚本

```bash
# 创建自动化脚本
cat > ~/claude-helper.sh << 'EOF'
#!/bin/bash

# Claude Code 自动化助手
# 用法：./claude-helper.sh "你的问题"

if [ -z "$1" ]; then
    echo "用法: $0 \"你的问题\""
    exit 1
fi

claudeai "$1"
EOF

chmod +x ~/claude-helper.sh

# 使用示例
./claude-helper.sh "帮我优化这段代码"
```

### 批量处理

```bash
# 批量处理多个文件
for file in *.js; do
    echo "处理文件: $file"
    claudeai "优化这个文件: $file" < "$file" > "optimized_$file"
done
```

---

## 总结

### 推荐安装方式

| 方式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **npx + 函数** | ✅ 无需管理员权限<br>✅ 自动更新<br>✅ 配置简单 | 首次运行需要下载 | ⭐⭐⭐⭐⭐ |
| **全局安装** | ✅ 命令响应快<br>✅ 无需每次下载 | ❌ 需要管理员权限<br>❌ 需要手动更新 | ⭐⭐⭐ |

### 最终配置

**推荐配置**（适用于大多数用户）：

```bash
# 在 ~/.zshrc 中添加
claudeai() {
    npx @anthropic-ai/claude-code "$@"
}

# 重新加载配置
source ~/.zshrc

# 验证安装
claudeai --version
```

### 使用建议

1. **日常使用**：使用 `claudeai` 命令
2. **交互模式**：直接运行 `claudeai` 进入交互模式
3. **单次查询**：`claudeai "你的问题"`
4. **批量处理**：结合 shell 脚本使用

### 故障排除

如果遇到问题，按以下顺序检查：

1. ✅ 检查网络连接
2. ✅ 检查 Node.js 版本
3. ✅ 检查配置文件
4. ✅ 重新加载配置
5. ✅ 重启终端

---

## 附录

### 相关资源

- **Claude 官方文档**：https://docs.anthropic.com/
- **Node.js 下载**：https://nodejs.org/
- **npm 文档**：https://docs.npmjs.com/

### 版本历史

- **v2.1.72**：当前稳定版本
- **v2.1.71**：上一个稳定版本
- **v2.1.70**：修复了若干 bug

### 系统要求

- **操作系统**：macOS 10.15+ / Linux / Windows
- **Node.js**：v16.0.0 或更高版本
- **npm**：v8.0.0 或更高版本
- **网络**：需要互联网连接（首次使用时）

---

## 快速参考

### 一键安装（推荐）

```bash
# 复制以下命令到终端执行
echo 'claudeai() { npx @anthropic-ai/claude-code "$@"; }' >> ~/.zshrc && source ~/.zshrc && claudeai --version
```

### 常用命令速查

```bash
claudeai --version          # 查看版本
claudeai --help            # 查看帮助
claudeai                  # 启动交互模式
claudeai "问题"            # 单次查询
```

### 配置文件位置

```bash
~/.zshrc                 # zsh 配置文件
~/.bashrc                # bash 配置文件
~/.config/claude/         # Claude 配置目录
```

---

**安装完成！现在您可以使用 `claudeai` 命令来访问 Claude Code 了。**
