#!/bin/bash

set -euo pipefail

echo "=== 安装 / 更新 nvm ==="
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

echo "=== 重新加载 nvm 环境 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NVMRC_FILE="$ROOT_DIR/.nvmrc"

if [ ! -f "$NVMRC_FILE" ]; then
  echo "⚠️  未找到 .nvmrc，无法确定项目 Node 版本。"
  echo "    请手动运行：nvm install <version>"
  exit 1
fi

NODE_VERSION="$(cat "$NVMRC_FILE" | tr -d '[:space:]')"

if [ -z "$NODE_VERSION" ]; then
  echo "⚠️  .nvmrc 内容为空，无法确定 Node 版本。"
  exit 1
fi

echo "=== 安装项目要求的 Node.js 版本: $NODE_VERSION ==="
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"
nvm alias default "$NODE_VERSION"

echo "=== 当前 Node.js 版本 ==="
node --version
npm --version

echo "=== 环境准备完成，已切换到 $NODE_VERSION ==="

