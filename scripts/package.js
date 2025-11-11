#!/usr/bin/env node

/**
 * Chrome扩展打包脚本（Node.js版本）
 * 不依赖系统zip命令，使用Node.js原生模块打包
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

console.log('🚀 开始打包Chrome扩展...\n');

// 1. 清理旧的构建文件
console.log('📦 步骤1: 清理旧的构建文件...');
try {
  if (fs.existsSync('dist')) {
    execSync('rm -rf dist/', { stdio: 'inherit' });
  }
  if (fs.existsSync('extension-release.zip')) {
    fs.unlinkSync('extension-release.zip');
  }
  console.log('✓ 清理完成\n');
} catch (error) {
  console.error('清理失败:', error.message);
  process.exit(1);
}

// 2. 完整构建
console.log('🔨 步骤2: 构建扩展程序...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✓ 构建完成\n');
} catch (error) {
  console.error('构建失败:', error.message);
  process.exit(1);
}

// 3. 删除不需要的文件
console.log('🧹 步骤3: 清理不必要的文件...');
try {
  // 删除 .map 文件
  const deleteMapFiles = (dir) => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        deleteMapFiles(filePath);
      } else if (file.endsWith('.map')) {
        fs.unlinkSync(filePath);
      } else if (file.includes('test')) {
        fs.unlinkSync(filePath);
      }
    });
  };

  deleteMapFiles('dist');
  console.log('  - 已删除 .map 文件');
  console.log('  - 已删除测试文件');
  console.log('✓ 清理完成\n');
} catch (error) {
  console.error('清理失败:', error.message);
}

// 4. 打包为zip
console.log('📦 步骤4: 打包为zip文件...');

const output = fs.createWriteStream('extension-release.zip');
const archive = archiver('zip', {
  zlib: { level: 9 } // 最高压缩级别
});

output.on('close', () => {
  const stats = fs.statSync('extension-release.zip');
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('✓ 打包完成\n');
  console.log('✨ 打包成功！\n');
  console.log('📊 文件信息:');
  console.log(`  文件名: extension-release.zip`);
  console.log(`  大小: ${fileSizeInMB} MB`);
  console.log(`  位置: ${path.resolve('extension-release.zip')}\n`);
  console.log('🎉 发布包已生成: extension-release.zip\n');
  console.log('📝 下一步操作:');
  console.log('  1. 在Chrome中测试: chrome://extensions → 加载已解压的扩展程序 → 选择dist目录');
  console.log('  2. 访问Chrome Web Store: https://chrome.google.com/webstore/devconsole');
  console.log('  3. 上传 extension-release.zip\n');
});

archive.on('error', (err) => {
  console.error('打包失败:', err);
  process.exit(1);
});

archive.pipe(output);

// 添加dist目录下的所有文件
archive.directory('dist/', false);

archive.finalize();
