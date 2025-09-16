#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../dist/background.js');

console.log('[Fix Service Worker] 开始处理文件:', filePath);

try {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalLength = content.length;
  
  console.log('[Fix Service Worker] 原始文件大小:', originalLength);

  // 方法1：查找modulepreload polyfill的特征模式并移除
  // Vite的polyfill通常包含 modulepreload 和 document/window 引用
  const polyfillPattern = /^[^]*?const\s+\w+\s*=\s*\(function\s*\(\)\s*\{[^}]*modulepreload[^}]*\}\)\(\)[^;]*;/;
  const polyfillMatch = content.match(polyfillPattern);
  
  if (polyfillMatch) {
    console.log('[Fix Service Worker] 找到modulepreload polyfill，移除中...');
    content = content.replace(polyfillPattern, '');
  }

  // 方法2：如果方法1失败，查找包含document或window的函数定义并移除
  // 但要保留正常的业务代码
  if (content.includes('document.querySelector') || content.includes('window.document')) {
    console.log('[Fix Service Worker] 发现document/window引用，清理中...');
    
    // 找到第一个不包含document/window的const定义
    const lines = content.split('\n');
    let firstGoodLine = -1;
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i];
      // 找到第一个看起来像正常业务代码的行
      if (line.match(/^(var|const|let)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=/) &&
          !line.includes('document') && 
          !line.includes('window') &&
          !line.includes('modulepreload') &&
          !line.includes('return ')) {
        firstGoodLine = i;
        break;
      }
    }
    
    if (firstGoodLine > 0) {
      console.log('[Fix Service Worker] 移除前', firstGoodLine, '行的polyfill代码');
      content = lines.slice(firstGoodLine).join('\n');
    }
  }

  // 验证：确保文件以有效的JavaScript开始
  const startCheck = content.substring(0, 100);
  console.log('[Fix Service Worker] 文件开头预览:', startCheck.substring(0, 50) + '...');
  
  if (!startCheck.match(/^(var|const|let|import|export|class|function|\/)/)) {
    console.warn('[Fix Service Worker] ⚠️ 警告：文件可能不是以有效的JavaScript开始');
  }

  // Write the cleaned content back
  fs.writeFileSync(filePath, content);
  
  const newLength = content.length;
  console.log('[Fix Service Worker] 新文件大小:', newLength);
  console.log('[Fix Service Worker] 减少了', originalLength - newLength, '字节');
  console.log('[Fix Service Worker] ✅ 处理完成');
  
} catch (error) {
  console.error('[Fix Service Worker] ❌ 处理失败:', error);
  process.exit(1);
}