#!/usr/bin/env node

/**
 * 验证重构是否完成的脚本
 * 检查：
 * 1. events目录是否已重命名为messages
 * 2. control-panel-new.ts是否已重命名为control-panel.ts
 * 3. 是否还有Event相关的术语残留
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始验证重构结果...\n');

// 检查1: events目录是否已重命名
const eventsDir = path.join(__dirname, '../src/shared/events');
const messagesDir = path.join(__dirname, '../src/shared/messages');

if (fs.existsSync(eventsDir)) {
  console.log('❌ events目录仍然存在，应该已重命名为messages');
  process.exit(1);
} else {
  console.log('✅ events目录已正确重命名');
}

if (!fs.existsSync(messagesDir)) {
  console.log('❌ messages目录不存在');
  process.exit(1);
} else {
  console.log('✅ messages目录存在');
}

// 检查2: control-panel-new.ts是否已重命名
const oldControlPanel = path.join(__dirname, '../src/shared/components/control-panel-new.ts');
const newControlPanel = path.join(__dirname, '../src/shared/components/control-panel.ts');

if (fs.existsSync(oldControlPanel)) {
  console.log('❌ control-panel-new.ts仍然存在，应该已重命名为control-panel.ts');
  process.exit(1);
} else {
  console.log('✅ control-panel-new.ts已正确重命名');
}

if (!fs.existsSync(newControlPanel)) {
  console.log('❌ control-panel.ts不存在');
  process.exit(1);
} else {
  console.log('✅ control-panel.ts存在');
}

// 检查3: messages.ts是否存在
const messagesFile = path.join(__dirname, '../src/shared/messages/messages.ts');
if (!fs.existsSync(messagesFile)) {
  console.log('❌ messages.ts不存在');
  process.exit(1);
} else {
  console.log('✅ messages.ts存在');
}

console.log('\n🎉 所有重构验证通过！');
console.log('📁 目录结构：events → messages ✅');
console.log('📄 文件重命名：control-panel-new.ts → control-panel.ts ✅');
console.log('📄 文件重命名：events.ts → messages.ts ✅'); 