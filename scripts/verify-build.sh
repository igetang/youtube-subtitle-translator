#!/bin/bash

# 构建验证脚本 - 用于验证文件名优化和重构结果
# 创建日期: 2025-01-27
# 用途: 确保构建输出符合文件名规范和路径要求

set -e  # 遇到错误立即退出

echo "🔍 开始验证构建结果..."
echo "===================="

# 检查dist目录是否存在
if [ ! -d "dist" ]; then
  echo "❌ dist目录不存在，请先运行构建命令"
  exit 1
fi

echo "✅ dist目录存在"

# 检查必要文件存在性
echo "📂 检查核心文件..."
required_files=("background.js" "content-script.js" "main-world.js" "sidepanel.html" "sidepanel.js" "manifest.json")

for file in "${required_files[@]}"; do
  if [ ! -f "dist/$file" ]; then
    echo "❌ 缺少核心文件: $file"
    exit 1
  else
    echo "  ✅ $file"
  fi
done

# 检查文件结构规范
echo "📁 检查文件结构规范..."

# 检查sidepanel文件位置一致性
if [ -f "dist/sidepanel/sidepanel.html" ]; then
  echo "⚠️  发现旧的子目录HTML文件: dist/sidepanel/sidepanel.html"
  echo "   建议: 重构应该将HTML文件移到根目录"
fi

# 检查assets目录结构
if [ ! -d "dist/assets" ]; then
  echo "⚠️  assets目录不存在，可能影响样式加载"
else
  echo "  ✅ assets目录存在"
  
  # 检查CSS文件
  if [ ! -f "dist/assets/sidepanel.css" ]; then
    echo "  ⚠️  sidepanel.css不在assets目录中"
  else
    echo "  ✅ sidepanel.css在正确位置"
  fi
fi

# 检查icons目录
if [ ! -d "dist/icons" ]; then
  echo "⚠️  icons目录不存在"
else
  echo "  ✅ icons目录存在"
fi

# 检查HTML中的script引用
echo "🔗 检查脚本引用..."
if [ -f "dist/sidepanel.html" ]; then
  if grep -q "sidepanel.js" dist/sidepanel.html; then
    echo "  ✅ sidepanel.html正确引用sidepanel.js"
  else
    echo "  ❌ sidepanel.html未正确引用sidepanel.js"
    echo "     检查HTML内容中是否包含正确的script标签"
    exit 1
  fi
fi

# 检查manifest.json中的资源引用
echo "📋 检查manifest资源引用..."
if [ -f "dist/manifest.json" ]; then
  # 检查无效资源引用
  invalid_resources=("control-panel.js" "preload-helper.js")
  for resource in "${invalid_resources[@]}"; do
    if grep -q "$resource" dist/manifest.json; then
      echo "  ❌ 发现无效资源引用: $resource"
      echo "     请从manifest.json的web_accessible_resources中移除"
      exit 1
    fi
  done
  
  # 检查必要资源引用
  if grep -q "main-world.js" dist/manifest.json; then
    echo "  ✅ main-world.js正确引用"
  else
    echo "  ⚠️  manifest.json中缺少main-world.js引用"
  fi
  
  # 检查sidepanel路径
  if grep -q '"default_path": "sidepanel.html"' dist/manifest.json; then
    echo "  ✅ sidepanel路径配置正确"
  else
    echo "  ❌ sidepanel路径配置错误"
    echo "     应该是: \"default_path\": \"sidepanel.html\""
    exit 1
  fi
fi

# 检查vite配置是否符合规范
echo "⚙️  检查构建配置..."
if [ -f "vite.config.ts" ]; then
  # 检查是否还有HTML入口配置
  if grep -q "sidepanel.*\.html" vite.config.ts; then
    echo "  ❌ vite.config.ts中仍有HTML入口配置"
    echo "     重构后应使用TS入口: sidepanel/sidepanel.ts"
    exit 1
  else
    echo "  ✅ vite.config.ts配置符合TS入口规范"
  fi
  
  # 检查是否有正确的TS入口配置
  if grep -q "sidepanel.*\.ts" vite.config.ts; then
    echo "  ✅ 检测到TS入口配置"
  else
    echo "  ⚠️  未检测到sidepanel的TS入口配置"
  fi
fi

# 文件大小检查（可选）
echo "📊 文件大小检查..."
large_files=$(find dist/ -type f -size +5M 2>/dev/null | head -5)
if [ ! -z "$large_files" ]; then
  echo "  ⚠️  发现较大文件（>5MB）:"
  echo "$large_files" | while read file; do
    size=$(du -h "$file" | cut -f1)
    echo "    - $file ($size)"
  done
  echo "     建议检查是否包含不必要的大文件"
fi

# 统计信息
echo "📈 构建统计..."
total_files=$(find dist/ -type f | wc -l)
total_size=$(du -sh dist/ | cut -f1)
echo "  📁 总文件数: $total_files"
echo "  📦 总大小: $total_size"

echo "===================="
echo "🎉 构建验证完成！"

# 提供优化建议
echo ""
echo "💡 优化建议:"
echo "1. 确保所有主要文件都在dist根目录"
echo "2. 资源文件应统一放在assets/或icons/目录"
echo "3. 定期清理manifest.json中的无效资源引用"
echo "4. 保持文件命名的一致性（使用连字符分隔）"
echo ""
echo "📚 相关文档: docs/REFACTOR_PLAN.md" 