# 翻译模型日志概览

> 最后更新：2025-11-05
> 版本：V5架构日志规范

## 📊 日志规范表

| 翻译模型 | 主要代码位置 | 日志内容形式 | 默认行为 / 开关 | V5优化（2025-11-05）|
| --- | --- | --- | --- | --- |
| DeepLTranslator | `src/background/components/deepl-translator.ts` | 初始化参数、批次规模、计费字符、批次完成情况（不输出字幕文本） | 默认启用；无字幕详情日志 | 暂未优化 |
| DeepSeekTranslator ⭐ | `src/background/components/deepseek-translator.ts` | **V5优化后**：入口1条log + 出口1条debug（含Token统计）；`DEBUG_TRANSLATION=true`时打印详细调试信息 | 默认 `DEBUG_TRANSLATION=false` | **✅ 已优化**：日志从~15条→2条（↓87%） |
| QwenTranslator | `src/background/components/qwen-translator.ts` | `CAPTION_TRANSLATION_DEBUG=true` 时打印输入字幕数组、合并字符串、API原文、译文全文等；否则仅记录批次耗时/成功 | 默认 `CAPTION_TRANSLATION_DEBUG=false` |
| OpenAITranslator | `src/background/components/openai-translator.ts` | 正常情况下输出模型配置、完成条数；出现异常（数量不匹配、解析失败等）时 `console.error` 原始输入、返回数组、API响应 | 无统一开关，只有错误分支会 dump 字幕 |
| GeminiTranslator | `src/background/components/gemini-translator.ts` | 记录批次大小、Prompt 长度、性能分析（耗时、token 估算）；不输出字幕文本 | 默认启用，无字幕详情日志 |
| MicrosoftTranslator | `src/background/components/microsoft-translator.ts` | 输出调用路径、优化流程、缺失文本警告等；不打印字幕内容 | 默认启用，日志较轻 |
| Google 免费翻译 | `src/background/components/two-phase-translator-v4.ts` (`translateWithGoogleEndpoints`) | 共用 `TwoPhaseTranslatorV4` 的阶段日志；内部不输出字幕详情，仅在错误时抛异常 | 默认无详细字幕日志；无调试开关 | 暂未优化 |

## 🚀 DeepSeek V5日志优化详情（2025-11-05）

### 优化前（~15条日志）
```
[DeepSeekTranslator] 开始翻译 100 条字幕 (batch阶段)
[DeepSeekTranslator] 📝 翻译语言参数: en → Chinese
[debug][DeepSeekTranslator] 翻译批次 1/10: 10 条字幕
[debug][LanguageCodeMapper] en → English
[debug][LanguageCodeMapper] zh-CN → Chinese
[DeepSeekTranslator] 📝 翻译语言参数: en → Chinese
[debug][DeepSeekTranslator] 翻译批次 2/10: 10 条字幕
[debug][LanguageCodeMapper] en → English
[debug][LanguageCodeMapper] zh-CN → Chinese
... (重复8次)
[debug][DeepSeekTranslator] Token使用: 输入=1200, 输出=1650, 总计=2850
[DeepSeekTranslator] ✅ 翻译完成: 100/100 条成功
```

### 优化后（2条日志）⭐
```
[DeepSeekTranslator] → 翻译 100条 | batch阶段 | English → Chinese
[debug][DeepSeekTranslator] ✅ 翻译完成: 100/100条 | Token: 输入=1200, 估算=1800, 输出=1650, 余量=150
```

### 优化效果
- **日志数量**：15条 → 2条（减少 87%）
- **信息密度**：更高，一眼看懂全局
- **Token统计**：新增"估算"和"余量"信息
- **格式统一**：与Gemini等其他翻译器保持一致

### 关键改进点
1. **语言转换统一到顶层**：不再在翻译器内部重复打印
2. **批次日志合并**：10个批次不再分别打印
3. **Token信息增强**：显示估算值和余量，便于性能分析
4. **使用debug级别**：详细信息使用`console.debug`，避免刷屏

### 调试模式（DEBUG_TRANSLATION=true）
当需要详细调试时，可开启调试模式：
```typescript
// src/background/components/deepseek-translator.ts
private static readonly DEBUG_TRANSLATION = true;  // 🔧 开启调试
```

调试模式输出（仅开发使用）：
```
========== [DeepSeekTranslator] 批次1/10 (batch阶段) ==========
📥 原文拼接字符串 (共10条):
"Hello\n---\nWorld\n---\n..."
============================================================
🔄 译文返回字符串:
"你好\n---\n世界\n---\n..."
============================================================
📋 双语字幕对比 (原文10条 vs 译文10条):
[1/10]
  原文: Hello
  译文: 你好
[2/10]
  原文: World
  译文: 世界
...
```

