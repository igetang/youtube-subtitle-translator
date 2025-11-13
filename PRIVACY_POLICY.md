# Privacy Policy / 隐私政策

**Last Updated / 最后更新日期:** 2025-01-10

---

## English Version

### Introduction

YouTube Subtitle Translator ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension handles information when you use our service.

### Information We Collect

**We DO NOT collect, store, or transmit any personal information.**

The extension only processes data locally in your browser:

1. **User Preferences**
   - Translation service selection
   - Source and target language preferences
   - Subtitle display mode preferences
   - These are stored locally using Chrome's `chrome.storage.local` API

2. **API Keys**
   - API keys for translation services (OpenAI, DeepL, Gemini, etc.)
   - Stored locally in your browser only
   - Never transmitted to our servers (we don't have servers)
   - Only sent directly to the respective translation service providers when you use their services

3. **Translation Cache**
   - Translated subtitle text cached locally to improve performance
   - Stored in `chrome.storage.local`
   - Never leaves your device

### How We Use Information

- **User Preferences:** To remember your settings across browser sessions
- **API Keys:** To authenticate with translation services on your behalf
- **Translation Cache:** To avoid redundant API calls and improve performance

### Third-Party Services

The extension connects to the following third-party translation services based on your selection:

1. **OpenAI (ChatGPT)**
   - Privacy Policy: https://openai.com/policies/privacy-policy
   - Data sent: Subtitle text for translation
   - Your API key is used for authentication

2. **Google Translate API**
   - Privacy Policy: https://policies.google.com/privacy
   - Data sent: Subtitle text for translation
   - No API key required (uses public API)

3. **Microsoft Translator**
   - Privacy Policy: https://privacy.microsoft.com/privacystatement
   - Data sent: Subtitle text for translation
   - No API key required

4. **DeepL Translator**
   - Privacy Policy: https://www.deepl.com/privacy
   - Data sent: Subtitle text for translation
   - Your API key is used for authentication

5. **Google Gemini**
   - Privacy Policy: https://policies.google.com/privacy
   - Data sent: Subtitle text for translation
   - Your API key is used for authentication

6. **DeepSeek**
   - Privacy Policy: https://www.deepseek.com/privacy
   - Data sent: Subtitle text for translation
   - Your API key is used for authentication

7. **Alibaba Cloud Qwen**
   - Privacy Policy: https://www.alibabacloud.com/help/en/legal/product-terms/privacy-policy
   - Data sent: Subtitle text for translation
   - Your API key is used for authentication

**Important:** We are not responsible for how these third-party services handle your data. Please review their respective privacy policies.

### Data Security

- All data is stored locally in your browser using Chrome's secure storage API
- API keys are stored securely and only accessible by this extension
- No data is transmitted to any server controlled by us
- The extension only communicates with the translation services you choose to use

### Permissions Explanation

The extension requests the following permissions:

- **storage:** To save your preferences and API keys locally
- **tabs:** To detect when you're on a YouTube page
- **host_permissions (youtube.com):** To access and translate YouTube subtitles
- **host_permissions (translation APIs):** To send subtitle text to translation services

### Data Retention

- All data is stored locally in your browser
- Data persists until you:
  - Uninstall the extension
  - Clear your browser data
  - Manually delete settings from the extension

### Your Rights

You have the right to:
- Access your stored data (via Chrome DevTools)
- Delete your data (uninstall the extension or clear browser data)
- Control which translation services you use
- Revoke API keys at any time through the service providers

### Children's Privacy

This extension does not knowingly collect information from children under 13. The extension is not directed at children.

### Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be posted with an updated "Last Updated" date.

### Contact Us

If you have questions about this Privacy Policy, please contact us:
- GitHub Issues: [Your GitHub Repo URL]
- Email: [Your Support Email]

---

## 中文版本

### 简介

YouTube字幕翻译助手（"我们"或"本扩展"）致力于保护您的隐私。本隐私政策说明我们的Chrome扩展如何处理您使用服务时的信息。

### 我们收集的信息

**我们不收集、存储或传输任何个人信息。**

扩展仅在您的浏览器中本地处理数据：

1. **用户偏好设置**
   - 翻译服务选择
   - 源语言和目标语言偏好
   - 字幕显示模式偏好
   - 这些数据使用Chrome的 `chrome.storage.local` API本地存储

2. **API密钥**
   - 翻译服务的API密钥（OpenAI、DeepL、Gemini等）
   - 仅存储在您的浏览器本地
   - 从不传输到我们的服务器（我们没有服务器）
   - 仅在您使用相应服务时直接发送给翻译服务提供商

3. **翻译缓存**
   - 本地缓存已翻译的字幕文本以提高性能
   - 存储在 `chrome.storage.local`
   - 永不离开您的设备

### 我们如何使用信息

- **用户偏好：** 用于在浏览器会话之间记住您的设置
- **API密钥：** 用于代表您向翻译服务进行身份验证
- **翻译缓存：** 避免重复的API调用，提高性能

### 第三方服务

根据您的选择，扩展会连接到以下第三方翻译服务：

1. **OpenAI (ChatGPT)**
   - 隐私政策：https://openai.com/policies/privacy-policy
   - 发送数据：字幕文本用于翻译
   - 使用您的API密钥进行身份验证

2. **Google Translate API**
   - 隐私政策：https://policies.google.com/privacy
   - 发送数据：字幕文本用于翻译
   - 无需API密钥（使用公共API）

3. **Microsoft Translator**
   - 隐私政策：https://privacy.microsoft.com/privacystatement
   - 发送数据：字幕文本用于翻译
   - 无需API密钥

4. **DeepL Translator**
   - 隐私政策：https://www.deepl.com/privacy
   - 发送数据：字幕文本用于翻译
   - 使用您的API密钥进行身份验证

5. **Google Gemini**
   - 隐私政策：https://policies.google.com/privacy
   - 发送数据：字幕文本用于翻译
   - 使用您的API密钥进行身份验证

6. **DeepSeek**
   - 隐私政策：https://www.deepseek.com/privacy
   - 发送数据：字幕文本用于翻译
   - 使用您的API密钥进行身份验证

7. **阿里云通义千问**
   - 隐私政策：https://www.alibabacloud.com/help/zh/legal/product-terms/privacy-policy
   - 发送数据：字幕文本用于翻译
   - 使用您的API密钥进行身份验证

**重要：** 我们不对这些第三方服务如何处理您的数据负责。请查看它们各自的隐私政策。

### 数据安全

- 所有数据使用Chrome的安全存储API本地存储在您的浏览器中
- API密钥安全存储，仅本扩展可访问
- 没有数据传输到我们控制的任何服务器
- 扩展仅与您选择使用的翻译服务通信

### 权限说明

扩展请求以下权限：

- **storage:** 用于本地保存您的偏好设置和API密钥
- **tabs:** 用于检测您何时在YouTube页面
- **host_permissions (youtube.com):** 用于访问和翻译YouTube字幕
- **host_permissions (翻译API):** 用于向翻译服务发送字幕文本

### 数据保留

- 所有数据都本地存储在您的浏览器中
- 数据会一直保留，直到您：
  - 卸载扩展
  - 清除浏览器数据
  - 从扩展中手动删除设置

### 您的权利

您有权：
- 访问您存储的数据（通过Chrome DevTools）
- 删除您的数据（卸载扩展或清除浏览器数据）
- 控制使用哪些翻译服务
- 随时通过服务提供商撤销API密钥

### 儿童隐私

本扩展不会有意收集13岁以下儿童的信息。本扩展不针对儿童。

### 政策变更

我们可能会不时更新本隐私政策。任何更改都会发布并更新"最后更新日期"。

### 联系我们

如果您对本隐私政策有疑问，请联系我们：
- GitHub Issues: [您的GitHub仓库URL]
- 电子邮件: [您的支持邮箱]

---

**Note to Developer / 开发者注意：**

Before publishing, please:
1. Replace `[Your GitHub Repo URL]` with your actual GitHub repository URL
2. Replace `[Your Support Email]` with your support email address
3. Host this privacy policy on a public URL (GitHub Pages, your website, etc.)
4. Add the privacy policy URL to your Chrome Web Store listing

发布前请：
1. 将 `[您的GitHub仓库URL]` 替换为实际的GitHub仓库URL
2. 将 `[您的支持邮箱]` 替换为您的支持邮箱地址
3. 将此隐私政策托管到公开URL（GitHub Pages、您的网站等）
4. 将隐私政策URL添加到Chrome Web Store列表中
