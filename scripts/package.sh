#!/bin/bash

# Chrome扩展打包脚本
# 用途：自动构建并打包Chrome扩展为可发布的zip文件

set -e  # 遇到错误立即退出

echo "🚀 开始打包Chrome扩展..."
echo ""

# 1. 清理旧的构建文件
echo "📦 步骤1: 清理旧的构建文件..."
rm -rf dist/
rm -f extension-release.zip
echo "✓ 清理完成"
echo ""

# 2. 完整构建
echo "🔨 步骤2: 构建扩展程序..."
npm run build
echo "✓ 构建完成"
echo ""

# 3. 删除不需要的文件
echo "🧹 步骤3: 清理不必要的文件..."
cd dist

# 删除source map文件（生产环境不需要）
find . -name "*.map" -type f -delete
echo "  - 已删除 .map 文件"

# 删除测试文件
find . -name "*test*.js" -type f -delete
echo "  - 已删除测试文件"

cd ..
echo "✓ 清理完成"
echo ""

# 4. 打包为zip
echo "📦 步骤4: 打包为zip文件..."
cd dist
zip -r ../extension-release.zip ./* -x "*.DS_Store" -x "*__MACOSX*"
cd ..
echo "✓ 打包完成"
echo ""

# 5. 显示打包信息
echo "✨ 打包成功！"
echo ""
echo "📊 文件信息:"
ls -lh extension-release.zip
echo ""
echo "📋 打包内容预览:"
unzip -l extension-release.zip | head -20
echo ""
echo "🎉 发布包已生成: extension-release.zip"
echo ""
echo "📝 下一步操作:"
echo "  1. 在Chrome中测试: chrome://extensions → 加载已解压的扩展程序 → 选择dist目录"
echo "  2. 访问Chrome Web Store: https://chrome.google.com/webstore/devconsole"
echo "  3. 上传 extension-release.zip"
echo ""
