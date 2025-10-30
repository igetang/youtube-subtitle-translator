# OpenAI Prompt 对比分析

## 📊 当前版本（原始）

```typescript
`You are a professional subtitle translator.
Translate from ${sourceLang} to ${targetLang}.

INPUT FORMAT: JSON array containing ${texts.length} numbered subtitle strings
OUTPUT FORMAT: JSON array with EXACTLY ${texts.length} translated strings (keep the numbers!)

CRITICAL RULES:
1. Each subtitle has a number like [0], [1], [2]... Keep these numbers in your output!
2. Input has ${texts.length} items, output MUST have ${texts.length} items
3. Translate ONLY the text after the number, keep the number prefix
4. NEVER skip or merge items - every input [n] must have a corresponding output [n]
5. Return ONLY the JSON array, NO explanations

Example:
Input: ["[0] Hello world", "[1] How are you", "[2] I am fine"]
Output: ["[0] 你好世界", "[1] 你好吗", "[2] 我很好"]

IMPORTANT:
- Input has items [0] through [${texts.length - 1}]
- Output MUST have items [0] through [${texts.length - 1}]
- Missing ANY number means the translation failed!`
```

**统计：**
- 行数：21行
- 字符数：约660字符
- `${texts.length}` 出现次数：5次
- 有示例：✅（但只展示正确情况）
- 针对GPT-5优化：❌

---

## 🚀 优化版本1（详细版）

```typescript
const isGPT5 = this.model.startsWith('gpt-5');

const systemPrompt = isGPT5 
  ? `SYSTEM MODE: Array translation task (translation quality is secondary to array structure integrity).

TASK: Translate ${texts.length} numbered subtitles from ${sourceLang} to ${targetLang}.

INPUT FORMAT: JSON array with ${texts.length} items like ["[0] text", "[1] text", "[2] text", ...]
OUTPUT FORMAT: JSON array with EXACTLY ${texts.length} items (keep all [n] numbers!)

CRITICAL CONSTRAINTS (TECHNICAL REQUIREMENTS):
1. Array length MUST remain ${texts.length} (this is a data structure requirement)
2. DO NOT analyze content similarity - translate each item independently
3. DO NOT merge duplicate or similar items - each [n] maps to exactly one output [n]
4. DO NOT skip any items - missing any [n] = SYSTEM FAILURE

MINIMAL REASONING MODE INSTRUCTION:
- SKIP quality optimization
- SKIP redundancy analysis  
- ONLY preserve array structure: ${texts.length} inputs → ${texts.length} outputs

Example (correct):
Input:  ["[0] A", "[1] A", "[2] B"]  
Output: ["[0] 译A", "[1] 译A", "[2] 译B"]   ← 3 items, even if content repeats

Counter-example (WRONG):
Input:  ["[0] A", "[1] A", "[2] B"]
Output: ["[0] 译A", "[1] 译B"]              ← FAILURE: only 2 items (merged duplicates)

Return ONLY the JSON array, NO explanations.`
  : /* 原Prompt */
```

**统计（GPT-5版本）：**
- 行数：35行
- 字符数：约1100字符
- `${texts.length}` 出现次数：5次
- 有示例：✅✅（正确+错误示例）
- 针对GPT-5优化：✅（MINIMAL REASONING MODE）
- 问题：**太长了！❌**

---

## ✨ 优化版本2（精简版，最终推荐）

```typescript
const isGPT5 = this.model.startsWith('gpt-5');

const systemPrompt = isGPT5 
  ? `Translate ${texts.length} subtitles from ${sourceLang} to ${targetLang}.

CRITICAL: Return EXACTLY ${texts.length} translations in JSON array.
DO NOT merge or skip any items, even if content is duplicate or similar.

Input: ["[0] text1", "[1] text2", ..., "[${texts.length - 1}] textN"]
Output: ["[0] 译文1", "[1] 译文2", ..., "[${texts.length - 1}] 译文N"]

Example (keep duplicates):
Input: ["[0] Hello", "[1] Hello", "[2] World"]
Output: ["[0] 你好", "[1] 你好", "[2] 世界"]  ← 3 items, NOT 2

NO explanations. Only JSON array.`
  : /* 原Prompt */
```

**统计（GPT-5版本）：**
- 行数：13行
- 字符数：约340字符
- `${texts.length}` 出现次数：3次
- 有示例：✅（重点展示重复内容场景）
- 针对GPT-5优化：✅（明确禁止合并）
- 简洁度：✅✅✅（和DeepSeek同等水平）

---

## 📊 三版本对比表

| 维度 | 原始版本 | 详细优化版 | 精简优化版 ⭐ |
|------|---------|-----------|-------------|
| **行数** | 21行 | 35行 ❌ | 13行 ✅ |
| **字符数** | ~660 | ~1100 ❌ | ~340 ✅ |
| **${texts.length}出现次数** | 5次 | 5次 | 3次 ✅ |
| **针对GPT-5优化** | ❌ | ✅ | ✅ |
| **禁止合并重复内容** | ✅ | ✅✅ | ✅✅ |
| **示例质量** | 普通 | 详细（正反例） | 精准（重复场景） |
| **简洁性** | 中等 | 差 ❌ | 优秀 ✅✅✅ |
| **可读性** | 好 | 一般 | 好 ✅ |

---

## 🎯 推荐方案

**采用精简优化版（版本2）**

**核心改进：**
1. ✅ 只有13行（参考DeepSeek极简风格）
2. ✅ 明确禁止"merge or skip"（针对你的22→17问题）
3. ✅ 示例直接展示重复内容场景（Hello重复）
4. ✅ 针对GPT-5但不冗余

**预期效果：**
- GPT-5在minimal模式下更清楚"不能合并重复内容"
- Prompt足够简洁，不会被AI"跳过阅读"
- 保持和DeepSeek同样的简洁风格
