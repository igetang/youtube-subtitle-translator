# OpenAI Structured Outputs 调用问题记录

## 🎯 概要
- **问题**：OpenAI Structured Outputs 返回的译文无法与发送的原文一一匹配。
- **影响范围**：Chrome 扩展 v4 架构下启用 `useStructuredOutputs = true` 的所有翻译调用。
- **当前状态**：已回退到编号标记（legacy）方案；Structured Outputs 暂未对外开放，等待后续修复。

---

## 🔍 问题现象
- 结构化响应中 `translations` 数组条数正确，但 `id` 值被模型改写，导致顺序错乱或丢失，例如：
  - `"id": "translation_not_used"`、`"id": "translation_type_missing"`。
  - `"id": "6"` 后再次出现 `"id": "0"`。
- 部分请求返回空内容（`choices[0].message.content === ''`），触发 “OpenAI API 返回内容为空”。
- 日志示例（`openai-translator.ts`）：
  ```
  [OpenAITranslator][structured] id顺序不匹配 expectedIds=["0","1",...,"18"] actualIds=["0","1","2","3","translation_not_used","9",...]
  [OpenAITranslator][structured] OpenAI原始响应(JSON字符串): {"translations":[{...}]}
  ```

---

## 📐 现行约束
- Structured Outputs Schema 强制：
  - `translations` 的 `minItems` 与 `maxItems` 等于原始字幕条数。
  - 每一项必须包含 `id` 和 `translation`。
- V4 代码在校验失败时立即抛出 `TranslationError('id顺序不匹配')`，终止会话以避免字幕错位。

---

## 🛠️ 临时处理策略
1. **回退方案**：`TwoPhaseTranslatorV4` 在实例化 `OpenAITranslator` 时传入 `useStructuredOutputs = false`，强制使用旧编号方案。
2. **批次调整**：
   - 单批字幕上限集中为常量 `OPENAI_BATCH_SIZE = 10`（便于后续统一修改）。
   - 批次间隔缩短至 `50ms`。
3. **日志增强**：Structured Outputs 分支保留方案、模型、阶段、批次、温度、估算/实际 tokens 以及原始返回 JSON，便于后续复现。

---

## 📝 待办事项
1. 调研 GPT-5 系列 Structured Outputs 对 `id` 字段的支持度，确认是否存在官方限制或推荐格式。
2. 评估自动重试 / fallback 机制：
   - 首次乱序 → 重试一次；
   - 仍失败 → 回退 legacy 并记录日志。
3. 按语言或字幕长度动态调整批次大小，观察成功率变化（目前乱序集中在俄语）。
4. 更新 UI/文档，提示 OpenAI Structured Outputs 暂停使用，避免用户误触。

---

## 📚 相关文件
- `src/background/components/openai-translator.ts`
- `src/background/components/two-phase-translator-v4.ts`
- `src/shared/types/user-preferences-types.ts`
- 时间线截图：`picture/1.png`
