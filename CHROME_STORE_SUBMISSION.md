# 📋 Chrome Web Store 提交信息

**产品名称：** YouTube字幕翻译助手
**产品ID：** peclkmijbopfkhdlgdalgfdmlapmbnki
**版本号：** 1.0.0
**提交日期：** 2025-11-16

---

## 一、基本信息

### 扩展名称
```
YouTube字幕翻译助手
```

### 简短描述 (132字符以内)
```
为YouTube视频提供实时字幕翻译功能的Chrome扩展
```

### 详细描述 (完整版)
```
YouTube字幕翻译助手 - 让全球视频尽在掌握

🎯 核心功能
• 实时字幕翻译：为任何YouTube视频提供即时翻译
• 双语字幕显示：同时显示原文和译文，方便对照学习
• 多翻译服务支持：集成Google翻译、微软翻译、DeepL、OpenAI、DeepSeek、Gemini等多种翻译引擎
• 智能语言识别：自动检测视频原始语言

✨ 主要特色
• 🆓 免费使用：内置Google和Microsoft免费翻译服务，无需配置即可使用
• 🎯 精准翻译：支持多种AI翻译服务，翻译质量优异
• 🌍 多语言支持：支持60+种语言互译
• ⚡ 即时响应：翻译实时生成，无需等待
• 🎨 界面友好：简洁美观的设置界面，操作直观

🔧 支持的翻译服务
• Google Translate (免费)
• Microsoft Translator (免费)
• DeepL API (需API密钥)
• OpenAI API (需API密钥)
• DeepSeek API (需API密钥)
• Gemini API (需API密钥)
• Qwen API (需API密钥)

📖 使用场景
• 学习外语：通过双语字幕提高语言学习效率
• 观看国际内容：轻松理解各国YouTube视频
• 教育培训：辅助教学和学习
• 工作研究：快速获取国际资讯和技术内容

🔐 隐私保护
• 不收集用户个人信息
• API密钥仅保存在本地浏览器
• 翻译数据不会上传到第三方服务器（除了选择的翻译服务本身）
```

### 类别
```
主类别：生产力工具 (Productivity)
```

### 语言
```
• 简体中文 (zh_CN) - 默认语言
• English (en)
• 繁体中文 (zh_TW)
```

---

## 二、截图信息（按顺序上传）

### 截图1：双语字幕实时翻译（主功能展示）⭐
**文件路径：** `/home/k/chrome-9.15/picture/screenshot-1-1280x800.png`

**标题（中文）：**
```
双语字幕实时翻译
```

**标题（英文）：**
```
Real-time Bilingual Subtitle Translation
```

**说明（中文）：**
```
在YouTube视频页面上实时显示原文和译文双语字幕，支持多种语言互译
```

**说明（英文）：**
```
Real-time display of bilingual subtitles on YouTube videos with support for multiple languages
```

---

### 截图2：灵活的翻译设置（设置界面）
**文件路径：** `/home/k/chrome-9.15/picture/screenshot-2-1280x800.png`

**标题（中文）：**
```
灵活的翻译设置
```

**标题（英文）：**
```
Flexible Translation Settings
```

**说明（中文）：**
```
简洁的设置界面，支持自定义源语言、目标语言、字幕类型和翻译服务
```

**说明（英文）：**
```
Clean settings interface with customizable source language, target language, subtitle type, and translation service
```

---

## 三、版本信息

### 版本号
```
1.0.0
```

### 版本说明（更新日志）
```
首次发布版本

主要功能：
✅ 实时字幕翻译
✅ 双语字幕显示
✅ 支持7种翻译服务
✅ 智能语言识别
✅ 本地数据存储
✅ 翻译缓存优化

技术特性：
• 采用 Manifest V3 架构
• Service Worker 后台处理
• 高性能批量翻译
• 智能超时保护
• 多语言国际化支持
```

---

## 四、权限说明

### 需要的权限及使用原因

#### 1. storage
**用途：**
```
用于保存用户的翻译设置（语言偏好、翻译服务配置等）和翻译缓存，提升用户体验
```

#### 2. tabs
**用途：**
```
用于检测用户是否在YouTube页面，确保翻译功能只在YouTube视频页面工作
```

#### 3. host_permissions (主机权限)

**YouTube域名：**
```
• *://*.youtube.com/*
  用于：获取YouTube视频字幕数据和页面信息
```

**翻译服务API域名：**
```
• https://translate.googleapis.com/*
  用于：调用Google翻译服务（免费）

• https://api.cognitive.microsofttranslator.com/*
• https://api-edge.cognitive.microsofttranslator.com/*
• https://edge.microsoft.com/*
  用于：调用微软翻译服务（免费）

• https://api-free.deepl.com/*
• https://api.deepl.com/*
  用于：调用DeepL翻译服务（用户选择并配置API密钥时）

• https://api.openai.com/*
  用于：调用OpenAI翻译服务（用户选择并配置API密钥时）

• https://generativelanguage.googleapis.com/*
  用于：调用Gemini翻译服务（用户选择并配置API密钥时）

• https://dashscope.aliyuncs.com/*
• https://dashscope-intl.aliyuncs.com/*
  用于：调用Qwen翻译服务（用户选择并配置API密钥时）
```

### ✅ 已修复的权限问题
```
❌ 已删除：notifications 权限（之前请求但未使用）
✅ 当前权限：仅包含实现功能所必需的最小权限集
```

---

## 五、隐私政策说明

### 数据收集与使用

#### 我们不收集的数据
```
❌ 不收集用户个人身份信息
❌ 不收集浏览历史
❌ 不收集视频观看记录
❌ 不上传数据到开发者服务器
```

#### 本地存储的数据
```
✅ 用户设置（语言偏好、翻译服务配置）- 仅保存在本地浏览器
✅ 翻译缓存 - 仅保存在本地浏览器，用于提升性能
✅ API密钥 - 仅保存在本地浏览器，永不上传
```

#### 第三方服务使用
```
本扩展需要调用第三方翻译API来提供翻译功能：

• Google翻译、微软翻译（免费服务）
• DeepL、OpenAI、DeepSeek、Gemini、Qwen（用户自选并配置）

数据流向：
字幕文本 → 用户选择的翻译服务 → 翻译结果返回

注意事项：
• 字幕内容会发送到用户选择的翻译服务进行翻译
• 我们不会额外收集、存储或分析这些翻译数据
• 各翻译服务的隐私政策请参考其官方说明
```

#### 数据安全
```
• 所有用户数据仅保存在本地浏览器
• API密钥使用浏览器安全存储机制
• 不存在数据上传到开发者服务器的行为
• 扩展代码透明，可供审查
```

---

## 六、支持信息

### 官方网站/仓库
```
https://github.com/igetang/youtube-subtitle-translator
```
✅ 已设置在 manifest.json 中

### 支持邮箱（可选）
```
[你的支持邮箱]
```

### 用户支持说明
```
如遇问题，用户可以：
1. 访问GitHub仓库提交Issue
2. 查看扩展内的使用说明
3. 通过邮箱联系开发者（如提供）
```

---

## 七、审核相关说明

### 本次提交修复的问题

#### 1. 功能无法运行问题 ✅
**违规行为参考ID：** Red Potassium

**问题：**
```
产品说明中阐述的 "Captions translation" 功能无法正常运行
```

**已修复：**
```
✅ 功能已测试并确认正常工作
✅ 免费翻译服务（Google、Microsoft）无需配置即可使用
✅ 提供了清晰的功能演示截图
```

#### 2. 未使用的权限问题 ✅
**违规行为参考ID：** Purple Potassium

**问题：**
```
请求但不使用以下权限：notifications
```

**已修复：**
```
✅ 已从 manifest.json 中删除 notifications 权限
✅ 仅保留必需权限：storage、tabs 和必要的 host_permissions
✅ 所有请求的权限都在实际使用中
```

---

## 八、测试说明（供审核员参考）

### 如何测试翻译功能

#### 方法1：使用免费服务（推荐）⭐
```
1. 安装扩展
2. 打开任意带英文字幕的YouTube视频
   推荐测试视频：https://www.youtube.com/watch?v=dQw4w9WgXcQ
3. 点击视频下方的翻译按钮（或扩展图标）
4. 在Popup中选择：
   - 源语言：English
   - 目标语言：Simplified Chinese
   - 翻译服务：Google Translate (Free) 或 Microsoft Translator (Free)
   - 字幕类型：Bilingual
5. 点击翻译开关按钮
6. 即可在视频上看到双语字幕（原文 + 译文）
```

#### 方法2：使用API服务
```
需要配置对应翻译服务的API密钥
推荐使用DeepL免费API进行测试（需注册）
```

### 功能验证要点
```
✅ 字幕翻译功能正常工作
✅ 双语字幕正常显示
✅ 设置界面可正常配置
✅ 免费服务无需API密钥即可使用
✅ 翻译结果准确且实时更新
```

---

## 九、提交前检查清单 ✅

### 技术检查
- [x] manifest.json 格式正确（Manifest V3）
- [x] 已删除未使用的 notifications 权限
- [x] 所有权限都有明确的使用说明
- [x] 扩展在Chrome最新版本中测试通过
- [x] 无控制台错误或警告

### 内容检查
- [x] 扩展名称准确无误
- [x] 简短描述在132字符以内
- [x] 详细描述真实反映功能
- [x] 截图清晰且展示核心功能
- [x] 版本说明完整

### 隐私合规
- [x] 隐私政策说明完整
- [x] 明确说明数据收集与使用情况
- [x] 第三方服务使用已说明

### 待处理项
- [ ] 更新 manifest.json 中的 homepage_url 为真实GitHub地址（或删除）
- [ ] 准备推广素材图（可选）
- [ ] 设置支持邮箱（可选）

---

## 十、提交流程

### 步骤1：准备材料
```
✅ 扩展zip包（打包dist目录）
✅ 2张截图（picture/1.png, picture/2.png）
✅ 详细描述文本（从本文档复制）
✅ 隐私政策说明（从本文档复制）
```

### 步骤2：填写商店信息
```
1. 登录 Chrome Web Store 开发者后台
2. 找到产品：peclkmijbopfkhdlgdalgfdmlapmbnki
3. 点击"编辑"
4. 按照本文档填写各项信息
5. 上传新的截图
6. 上传新的扩展包
```

### 步骤3：提交审核
```
1. 确认所有信息填写完整
2. 勾选隐私政策确认
3. 点击"提交审核"
4. 等待审核结果（通常1-3个工作日）
```

---

## 十一、常见问题预案

### Q1: 如果审核员说功能无法运行怎么办？
**建议：**
```
在"提交说明"中明确写明：
"本扩展默认使用Google Translate和Microsoft Translator免费服务，
无需配置API密钥即可使用。测试时请选择这两个服务之一。"
```

### Q2: 如果需要提供演示视频？
**准备：**
```
可以录制一个30-60秒的演示视频，展示：
1. 打开YouTube视频
2. 点击翻译按钮
3. 选择翻译服务和语言
4. 显示双语字幕效果
```

### Q3: 隐私政策页面URL？
**选项：**
```
1. 在GitHub仓库创建 PRIVACY.md
2. 使用GitHub Pages托管
3. URL格式：https://[username].github.io/youtube-subtitle-translator/privacy
```

---

**最后更新：** 2025-11-16
**文档版本：** 1.0

---

**💡 重要提示：**
1. 提交前务必再次测试翻译功能
2. 确保在无API密钥情况下，Google/Microsoft服务能正常工作
3. 截图要清晰展示功能，避免使用模糊或误导性图片
4. 描述要真实，避免夸大宣传

**祝提交顺利！🚀**
