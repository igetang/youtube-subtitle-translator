#!/bin/bash

echo "=== 安装 nvm ==="
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

echo "=== 重新加载环境 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "=== 安装 Node.js LTS ==="
nvm install --lts
nvm use --lts

echo "=== 验证安装 ==="
node --version
npm --version

echo "=== 设置默认版本 ==="
nvm alias default node

echo "=== 完成！==="



