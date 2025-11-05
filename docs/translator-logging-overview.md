# 翻译模型日志概览

| 翻译模型 | 主要代码位置 | 日志内容形式 | 默认行为 / 开关 |
| --- | --- | --- | --- |
| DeepLTranslator | `src/background/components/deepl-translator.ts` | 初始化参数、批次规模、计费字符、批次完成情况（不输出字幕文本） | 默认启用；无字幕详情日志 |
| DeepSeekTranslator | `src/background/components/deepseek-translator.ts` | 在 `DEBUG_TRANSLATION=true` 时打印原文拼接、API原文、双语对照等完整字幕；否则只输出批次级信息 | 默认 `DEBUG_TRANSLATION=false` |
| QwenTranslator | `src/background/components/qwen-translator.ts` | `CAPTION_TRANSLATION_DEBUG=true` 时打印输入字幕数组、合并字符串、API原文、译文全文等；否则仅记录批次耗时/成功 | 默认 `CAPTION_TRANSLATION_DEBUG=false` |
| OpenAITranslator | `src/background/components/openai-translator.ts` | 正常情况下输出模型配置、完成条数；出现异常（数量不匹配、解析失败等）时 `console.error` 原始输入、返回数组、API响应 | 无统一开关，只有错误分支会 dump 字幕 |
| GeminiTranslator | `src/background/components/gemini-translator.ts` | 记录批次大小、Prompt 长度、性能分析（耗时、token 估算）；不输出字幕文本 | 默认启用，无字幕详情日志 |
| MicrosoftTranslator | `src/background/components/microsoft-translator.ts` | 输出调用路径、优化流程、缺失文本警告等；不打印字幕内容 | 默认启用，日志较轻 |
| Google 免费翻译 | `src/background/components/two-phase-translator-v4.ts` (`translateWithGoogleEndpoints`) | 共用 `TwoPhaseTranslatorV4` 的阶段日志；内部不输出字幕详情，仅在错误时抛异常 | 默认无详细字幕日志；无调试开关 |

