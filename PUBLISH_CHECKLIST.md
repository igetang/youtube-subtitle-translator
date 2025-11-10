# Chrome Web Store 发布检查清单

## 📋 发布前检查（必做）

### ✅ 代码和构建
- [ ] 运行 `npm run build` 完整构建
- [ ] 在Chrome中加载dist目录测试（chrome://extensions → 加载已解压的扩展程序）
- [ ] 测试所有核心功能
  - [ ] 打开YouTube视频页面
  - [ ] 点击扩展图标打开Popup
  - [ ] 切换翻译开关
  - [ ] 测试多个翻译服务（OpenAI/Google/DeepL/Gemini等）
  - [ ] 测试双语字幕显示
  - [ ] 测试不同源语言选择
- [ ] 检查console没有error（warn可以有）
- [ ] 检查无内存泄漏

### 📦 打包文件
- [ ] 运行 `npm run package` 生成发布包
- [ ] 检查生成的 `extension-release.zip` 文件大小合理（通常<5MB）
- [ ] 解压zip检查文件结构正确
- [ ] 确认不包含开发文件（.git, node_modules, src源码等）

### 📝 商店资源准备

#### 必需资源
- [ ] 扩展图标（已有：16/48/128px）
- [ ] 至少1张截图（1280x800 或 640x400）
- [ ] 详细描述（中文和英文）
- [ ] 简短描述（132字符内）

#### 推荐资源
- [ ] 宣传瓦片图（440x280，1-5张）
- [ ] 大型宣传图（1400x560，1张）
- [ ] 3-5张功能截图

### 📄 文档和政策
- [ ] README.md 完整
- [ ] 隐私政策文档（如果收集数据或使用外部API）
- [ ] 用户协议（可选）

### 🔐 账号和支付
- [ ] 注册Chrome Web Store开发者账号（需要支付5美元注册费）
- [ ] 准备信用卡用于开发者注册

---

## 📸 需要准备的截图内容建议

### 截图1：主界面和翻译开关
- 打开YouTube视频
- 显示扩展Popup界面
- 突出显示翻译开关

### 截图2：翻译服务配置
- 展示支持的翻译服务列表
- 展示API密钥配置界面

### 截图3：双语字幕效果
- YouTube视频播放中
- 显示双语字幕效果（原文+译文）

### 截图4：语言选择
- 展示源语言和目标语言选择
- 突出自动检测功能

### 截图5：工作效果对比
- Before：原始字幕
- After：翻译后的字幕

---

## 🚀 发布流程

### 第一步：构建和打包
```bash
# 1. 完整构建
npm run build

# 2. 打包发布版本
npm run package

# 3. 测试打包文件
unzip -l extension-release.zip
```

### 第二步：上传到Chrome Web Store
1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 点击"新增项"
3. 上传 `extension-release.zip`
4. 填写商店列表信息
   - 名称：YouTube字幕翻译助手
   - 简短描述：（见 STORE_LISTING.md）
   - 详细描述：（见 STORE_LISTING.md）
   - 类别：生产工具 或 辅助功能
   - 语言：中文（简体）+ English
5. 上传截图和宣传图
6. 填写隐私设置
   - 使用外部API：是
   - 数据收集：否（API密钥存储在本地）
   - 隐私政策URL：（见 PRIVACY_POLICY.md）
7. 提交审核

### 第三步：等待审核
- 通常审核时间：1-3天
- 检查邮件通知
- 如被拒绝，根据反馈修改后重新提交

---

## ⚠️ 常见审核拒绝原因

1. **权限过度**：请求了不必要的权限
   - ✅ 我们只请求了必需权限（storage, tabs, notifications）

2. **隐私政策缺失**：使用外部API但没有隐私政策
   - ⚠️ 需要添加隐私政策URL

3. **截图质量差**：截图模糊或不清晰
   - 📸 确保截图清晰，分辨率符合要求

4. **描述误导**：功能描述与实际不符
   - ✅ 确保描述准确

5. **单一用途政策**：扩展做太多不相关的事
   - ✅ 我们专注于YouTube字幕翻译

---

## 📊 发布后

- [ ] 在多台设备测试安装
- [ ] 收集用户反馈
- [ ] 准备更新计划
- [ ] 监控错误报告
- [ ] 及时回复用户评论

---

## 🔗 有用的链接

- [Chrome Web Store 开发者控制台](https://chrome.google.com/webstore/devconsole)
- [发布政策文档](https://developer.chrome.com/docs/webstore/program-policies/)
- [最佳实践指南](https://developer.chrome.com/docs/webstore/best_practices/)
- [图片规格要求](https://developer.chrome.com/docs/webstore/images/)
