#!/bin/bash

set -euo pipefail

# 使用脚本所在目录作为项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "=== 加载 nvm 环境 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if [ -f ".nvmrc" ]; then
  NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
  if [ -n "$NODE_VERSION" ]; then
    echo "=== 切换到 Node.js $NODE_VERSION ==="
    nvm install "$NODE_VERSION" >/dev/null
    nvm use "$NODE_VERSION"
  fi
fi

echo "=== 当前 Node.js / npm 版本 ==="
node --version
npm --version

echo "=== 清理 node_modules（npm ci 会自动处理） ==="
rm -rf node_modules

echo "=== 安装依赖（基于 package-lock.json） ==="
npm ci

echo "=== 构建项目 ==="
npm run build
