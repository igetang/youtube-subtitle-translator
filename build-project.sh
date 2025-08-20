#!/bin/bash

cd /mnt/e/chrome/8.19

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

