#!/usr/bin/env node

/**
 * 项目状态快速检查脚本
 * 用于新Claude Code会话快速了解项目状态
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('YouTube字幕翻译扩展 - 项目状态检查');
console.log('========================================\n');

// 1. Git状态
console.log('📊 Git状态:');
try {
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  const status = execSync('git status --short', { encoding: 'utf8' });
  const lastCommit = execSync('git log -1 --oneline', { encoding: 'utf8' }).trim();
  
  console.log(`  当前分支: ${branch}`);
  console.log(`  最新提交: ${lastCommit}`);
  if (status) {
    console.log('  未提交更改:');
    console.log(status.split('\n').map(line => '    ' + line).join('\n'));
  } else {
    console.log('  工作区干净 ✓');
  }
} catch (e) {
  console.log('  ❌ 无法获取Git状态');
}

// 2. 最近修改的文件
console.log('\n📝 最近修改的源文件 (最近24小时):');
try {
  const recentFiles = execSync(
    'find src -type f -name "*.ts" -mtime -1 2>/dev/null | head -10',
    { encoding: 'utf8', shell: true }
  ).trim();
  
  if (recentFiles) {
    recentFiles.split('\n').forEach(file => {
      console.log(`  - ${file}`);
    });
  } else {
    console.log('  无最近修改');
  }
} catch (e) {
  console.log('  ❌ 无法获取文件列表');
}

// 3. 检查关键文件
console.log('\n🔍 关键文件状态:');
const keyFiles = [
  'PROJECT_CONTEXT.md',
  'src/background/handle-toggle-translate-v4.ts',
  'src/background/components/two-phase-translator-v4.ts',
  'dist/service-worker.js'
];

keyFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    const modTime = new Date(stats.mtime);
    const now = new Date();
    const hoursDiff = Math.round((now - modTime) / (1000 * 60 * 60));
    console.log(`  ✓ ${file} (${hoursDiff}小时前修改)`);
  } else {
    console.log(`  ❌ ${file} 不存在`);
  }
});

// 4. TODO和FIXME
console.log('\n⚠️ 代码中的TODO/FIXME:');
try {
  const todos = execSync(
    'grep -r "TODO\\|FIXME" src --include="*.ts" 2>/dev/null | head -5',
    { encoding: 'utf8', shell: true }
  ).trim();
  
  if (todos) {
    todos.split('\n').forEach((line, i) => {
      const [file, ...content] = line.split(':');
      console.log(`  ${i + 1}. ${file.replace('src/', '')}:`);
      console.log(`     ${content.join(':').trim()}`);
    });
  } else {
    console.log('  无TODO/FIXME');
  }
} catch (e) {
  console.log('  无TODO/FIXME');
}

// 5. 构建状态
console.log('\n🏗️ 构建状态:');
if (fs.existsSync('dist/manifest.json')) {
  const distStats = fs.statSync('dist/manifest.json');
  const modTime = new Date(distStats.mtime);
  const now = new Date();
  const minsDiff = Math.round((now - modTime) / (1000 * 60));
  console.log(`  ✓ dist目录存在 (${minsDiff}分钟前构建)`);
} else {
  console.log('  ❌ 需要运行 npm run build');
}

// 6. 读取PROJECT_CONTEXT.md的当前Bug部分
console.log('\n🐛 当前正在解决的问题:');
try {
  const contextPath = path.join(process.cwd(), 'PROJECT_CONTEXT.md');
  if (fs.existsSync(contextPath)) {
    const content = fs.readFileSync(contextPath, 'utf8');
    const bugMatch = content.match(/### 正在解决的Bug[\s\S]*?(?=###|##|$)/);
    if (bugMatch) {
      const bugSection = bugMatch[0]
        .split('\n')
        .slice(1, 6)  // 取前几行
        .map(line => '  ' + line)
        .join('\n');
      console.log(bugSection);
    }
  } else {
    console.log('  PROJECT_CONTEXT.md 不存在');
  }
} catch (e) {
  console.log('  无法读取当前问题');
}

console.log('\n========================================');
console.log('提示: 详细信息请查看 PROJECT_CONTEXT.md');
console.log('========================================');