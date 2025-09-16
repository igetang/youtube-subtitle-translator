#!/bin/bash

# 使用脚本所在目录作为项目根目录
PROJECT_DIR="$(dirname "$0")"
cd "$PROJECT_DIR"

echo "=== 加载 nvm 环境 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "=== 检查 Node.js 版本 ==="
node --version
npm --version

echo "=== 清理依赖 ==="
rm -rf node_modules package-lock.json

echo "=== 重新安装依赖 ==="
npm install

echo "=== 构建项目 ==="
npm run build



