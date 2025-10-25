# OpenAI翻译API实现指南

> 最后更新：2025-10-07
> 状态：✅ 已实施，JSON格式方案
> 版本：V4架构 + JSON优化

## 📋 概述

本文档提供OpenAI翻译API的完整实现指南，基于项目V4架构规范，复用Google/Microsoft的智能断句和文本处理逻辑，实现与现有翻译服务一致的用户体验。

## 📝 V4架构优化方案（1-13条）

### ✅ 优化1：V4架构完整适配

**实现内容**：
- 添加 `AbortSignal` 支持，可中断翻译
- 区分 `urgent`（紧急）和 `batch`（批量）阶段
- 集成V4超时机制

**代码结构**：
```typescript
public async translate(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  stage: 'urgent' | 'batch',  // 阶段区分
  signal: AbortSignal          // 取消支持
): Promise<string[]>
```

---

### ✅ 优化2：同权多模型支持

**支持模型**：
- `gpt-5`（旗舰，$1.25/$10）
- `gpt-5-mini`（默认，$0.25/$2）
- `gpt-5-nano`（极速，$0.05/$0.40）

**用户偏好配置**：
```typescript
'openai': {
  type: 'openai',
  name: 'OpenAI GPT',
  apiKey: '',
  model: 'gpt-5-mini',                // 默认
  availableModels: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
  customModel: null,
  temperature: 0.3,
  maxTokens: 128000                   // 官方最大输出限制
}
```

---

### ✅ 优化3：批次大小优化（复用IntelligentSegmenter）

**实现方式**：
- 复用项目现有的 `IntelligentSegmenter` 类
- 修改 `MAX_BATCH_SIZE` 为 160
- 完全复用时间间隔智能断句逻辑

**断句规则**：
1. 160条硬断点（强制分批）
2. 强断点：gap > 2秒
3. 弱断点：maxGap - minGap > 400ms
4. 最小批次：10条

**代码**：
```typescript
// intelligent-segmenter.ts
class IntelligentSegmenter {
  private static readonly MAX_BATCH_SIZE = 160;  // 改为160
  // 其他逻辑完全复用
}

// two-phase-translator-v4.ts
const segmenter = new IntelligentSegmenter();
const batches = segmenter.createSmartBatches(subtitles);
```

---

### ✅ 优化4：文本拼接与拆分（复用Google/Microsoft逻辑）

**处理流程**：
```typescript
// 1. 清理单条字幕内的换行符
const cleanedTexts = texts.map(text => text.replace(/\n/g, ' ').trim());

// 2. 用单换行符拼接
const combined = cleanedTexts.join('\n');

// 3. 构建提示词
const messages = [
  {
    role: "system",
    content: `You are a professional subtitle translator.
Translate from ${sourceLang} to ${targetLang}.
Input contains multiple subtitles separated by newlines.
Each line is one subtitle. Keep the same number of lines.
Do not add explanations.`
  },
  {
    role: "user",
    content: combined
  }
];

// 4. 翻译后拆分
const translations = translatedCombined.split(/\r?\n/).map(t => t.trim());

// 5. 验证数量
if (translations.length !== texts.length) {
  throw new Error('翻译数量不匹配');
}
```

**不使用**：
- ❌ `|||SEP|||` 特殊分隔符
- ❌ 双换行符 `\n\n`

> ⚠️ **实施变更**：原设计采用换行符分隔，但实测发现GPT会自动合并不完整句子（如14条→13条）。最终采用**JSON数组格式**，详见优化14。

---

### ✅ 优化5：动态超时机制

**超时设置**（实际实施值）：
- urgent阶段：15秒
- batch阶段：单批15秒，总超时 = 批数 × 15秒

**实现位置**：
```typescript
// handle-toggle-translate-v4.ts
if (serviceType === 'openai') {
  // 紧急翻译
  timeoutMs: 15000  // 15秒

  // 批量翻译
  estimatedBatches = Math.ceil(subtitleCount / 160);
  perBatchTimeout = 15000;
  batchTotalTimeout = estimatedBatches * 15000;
}

// two-phase-translator-v4.ts
if (service.type === 'openai') {
  perBatchTimeout = 15000;  // 单批15秒
}

// abort-timeout-controller.ts
private static readonly DEFAULT_TIMEOUT = 15000;  // 默认15秒
```

> ⚠️ **实施调整**：原设计5秒，实测发现OpenAI API响应时间通常在5-10秒，考虑到网络波动和模型处理时间，调整为15秒以保证成功率。

---

### ❌ 优化6：Rate Limit响应头自动更新

**决定**：暂不实现

**原因**：
- 已有200ms批次间隔
- 已有160条/批限制
- 足够避免限流

**处理**：在本文档中说明Rate Limit策略即可

**Rate Limit策略说明**：
- 批次间隔：200ms（与Google/Microsoft一致）
- 批次大小：160条（避免频繁请求）
- 自然节流：避免触发429错误

---

### ✅ 优化7：Temperature开放给用户

**参数设置**：
- 默认值：0.3（字幕翻译推荐）
- 范围：0-1（用户可调）
- Popup UI显示滑块

**UI实现**：
```html
<div class="setting-item">
  <label>翻译风格:</label>
  <div class="temperature-slider">
    <span class="hint-left">精确</span>
    <input type="range" id="openai-temperature"
           min="0" max="1" step="0.1" value="0.3">
    <span class="hint-right">创意</span>
  </div>
  <div class="temp-value">
    当前: <span id="temp-value">0.3</span>
    <small>（推荐0.2-0.4用于字幕）</small>
  </div>
</div>
```

---

### ✅ 优化8：统一存储架构

**存储位置**：
- API Key存储在 `translationService.apiKey`
- 与DeepSeek保持一致
- 不单独存储

**正确方式**：
```typescript
{
  type: 'openai',
  apiKey: '',           // 存储在这里
  model: 'gpt-5-mini',
  temperature: 0.3
}
```

**错误方式**（不要这样做）：
```typescript
// ❌ 不要单独存储
await chrome.storage.local.set({ openaiApiKey: apiKey });
```

---

### ✅ 优化9：语言代码规范化

**使用YouTube标准代码**：
```typescript
private mapLanguageCode(code: string): string {
  const mapping: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-Hans': 'zh',
    'zh-Hant': 'zh',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'es': 'es',
    'fr': 'fr',
    'de': 'de',
    'ru': 'ru',
    'ar': 'ar',
    'pt': 'pt',
    'it': 'it',
    'vi': 'vi',
    'th': 'th',
    'id': 'id'
  };
  return mapping[code] || code;
}
```

**不使用全名**（错误）：
```typescript
// ❌ 不要这样
'zh-Hans': 'Simplified Chinese'
```

---

### ✅ 优化10：错误处理细化

**HTTP状态码细分**：
```typescript
if (!response.ok) {
  switch (response.status) {
    case 401:
    case 403:
      throw new Error('OpenAI API密钥无效，请检查设置');
    case 429:
      throw new Error('OpenAI API速率限制，请稍后重试');
    case 500:
    case 502:
    case 503:
      throw new Error('OpenAI服务暂时不可用');
    default:
      throw new Error(`OpenAI API错误 (${response.status}): ${errorText}`);
  }
}

// AbortError处理
if (error.name === 'AbortError') {
  throw new DOMException('OpenAI API请求被取消', 'AbortError');
}
```

---

### ✅ 优化11：API测试功能

**测试函数**：
```typescript
// service-worker.ts
async function testOpenAIService(
  apiKey: string,
  model: string
): Promise<{success: boolean, message: string}> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: 'API Key无效' };
      }
      return { success: false, message: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `测试成功，消耗 ${data.usage.total_tokens} tokens`
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '测试失败'
    };
  }
}
```

---

### ✅ 优化12：移除流式响应

**简化为非流式**：
```typescript
// 删除约300行流式处理代码
const payload = {
  model: this.model,
  messages: messages,
  temperature: this.temperature,
  max_tokens: 128000,   // 官方最大输出限制
  stream: false         // 非流式
};

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.apiKey}`
  },
  body: JSON.stringify(payload),
  signal  // AbortSignal支持
});

const data = await response.json();
const content = data.choices[0].message.content;
const translations = content.split(/\r?\n/).map(t => t.trim());
```

**删除的内容**：
- ❌ `callOpenAIStreamingAPI` 方法
- ❌ 流式读取逻辑（reader.read()）
- ❌ SSE格式解析（`data: [DONE]`）

---

### ✅ 优化13：模型配置映射表与GPT-5参数优化

**配置定义**：
```typescript
const MODEL_CONFIGS: Record<string, {
  contextWindow: number;
  maxOutput: number;
  pricing: {
    input: number;    // $/百万tokens
    output: number;
  };
}> = {
  'gpt-5': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 1.25, output: 10.0 }
  },
  'gpt-5-mini': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 0.25, output: 2.0 }
  },
  'gpt-5-nano': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 0.05, output: 0.40 }
  }
};

// 使用
const config = MODEL_CONFIGS[this.model];
console.log(`[OpenAI] 上下文窗口: ${config.contextWindow} tokens`);
console.log(`[OpenAI] 最大输出: ${config.maxOutput} tokens`);
```

**GPT-5系列特殊优化参数**（实际实施）：
```typescript
// 针对GPT-5系列的性能优化
const isGPT5 = this.model.startsWith('gpt-5');
const requestBody: any = {
  model: this.model,
  messages: messages,
  max_completion_tokens: maxCompletionTokens,
  stream: false
};

if (isGPT5) {
  // GPT-5专属优化参数
  requestBody.reasoning_effort = 'minimal';  // 强制快速路径，避免深度推理
  requestBody.verbosity = 'low';             // 减少不必要的输出
  // 注意：GPT-5系列不支持temperature参数
} else {
  requestBody.temperature = this.temperature;  // 仅非GPT-5模型支持
}
```

> ⚠️ **重要发现**：
> 1. **reasoning_effort: 'minimal'** - 显著降低延迟，避免GPT-5进入深度推理模式
> 2. **verbosity: 'low'** - 减少不必要的verbose输出，提升响应速度
> 3. **temperature限制** - GPT-5系列模型不支持自定义temperature参数，设置会导致错误

---

### ✅ 优化14：JSON数组格式方案（实施变更）

**问题背景**：
原设计使用换行符分隔字幕（优化4），但实测发现GPT会自动合并语义不完整的句子：
- 输入14条字幕 → 输出13条（自动合并了2条）
- 原因：字幕按时间切分，单条字幕可能只是半个句子，GPT认为应该合并

**解决方案**：JSON数组格式
```typescript
// 1. 构建JSON输入
const cleanedTexts = texts.map(text => text.replace(/\n/g, ' ').trim());
const jsonInput = JSON.stringify(cleanedTexts);

// 2. 强化Prompt - 多重强调规则
const messages = [
  {
    role: "system",
    content: `You are a professional subtitle translator.
Translate from ${sourceLang} to ${targetLang}.

INPUT FORMAT: JSON array containing ${texts.length} subtitle strings
OUTPUT FORMAT: JSON array with EXACTLY ${texts.length} translated strings

CRITICAL RULES:
1. Input array length = ${texts.length}, output array length MUST = ${texts.length}
2. Each input element corresponds to ONE output element (same index)
3. Subtitles are time-based segments - ONE sentence may span MULTIPLE elements
4. Do NOT merge array elements even if they form a complete sentence
5. Do NOT split array elements even if they contain multiple sentences
6. Preserve array structure: index N input → index N output

EXAMPLES:
✅ CORRECT:
Input:  ["Hello", "world", "How are"]
Output: ["你好", "世界", "你好吗"]

❌ WRONG (merging):
Input:  ["Hello", "world", "How are"]
Output: ["你好世界", "你好吗"]  ← 错误：合并了前两个元素

❌ WRONG (splitting):
Input:  ["Hello world", "How are you"]
Output: ["你好", "世界", "你好吗"]  ← 错误：拆分了第一个元素

IMPORTANT: Output ONLY the JSON array, no explanations.`
  },
  {
    role: "user",
    content: jsonInput
  }
];

// 3. 解析JSON输出（带错误处理）
let translations: string[];
try {
  translations = JSON.parse(responseText);
  if (!Array.isArray(translations)) {
    throw new Error('返回结果不是数组');
  }
} catch (parseError) {
  console.warn('[OpenAI] JSON解析失败，尝试提取...', parseError);
  // 尝试从文本中提取JSON数组
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    translations = JSON.parse(jsonMatch[0]);
  } else {
    throw new Error(`无法解析JSON响应: ${responseText.substring(0, 200)}`);
  }
}

// 4. 验证数量（强制检查）
if (translations.length !== texts.length) {
  console.error(`[OpenAI] ❌ 翻译数量不匹配: 期望${texts.length}条，实际${translations.length}条`);
  console.error(`[OpenAI] 原始输入(全部${texts.length}条):`, cleanedTexts);
  console.error(`[OpenAI] 返回结果(全部${translations.length}条):`, translations);
  console.error(`[OpenAI] API原始响应:`, responseText);
  throw new Error(`翻译数量不匹配: 期望${texts.length}条，实际${translations.length}条`);
}
```

**效果评估**：
- ✅ 大幅改善：从经常出现11→10、14→13，到绝大多数情况正确
- ⚠️ 仍有偶发：由于模型随机性，仍可能偶尔出现合并（<5%概率）
- ✅ 可诊断：详细日志记录所有输入输出，便于排查问题

**关键要素**：
1. **多重强调**：在Prompt中用5条规则+3个例子反复强调不要合并
2. **明确数量**：在Prompt中显式写明 `${texts.length}` 作为硬约束
3. **错误示范**：用❌ WRONG例子明确告诉模型什么是错误的
4. **严格验证**：输出数量不符直接抛出错误并记录完整日志

**局限性**：
- 模型仍有自主性，无法100%保证不合并（AI行为不可完全控制）
- 建议：在UI上提示用户如遇到字幕数量不匹配可重试

---

## 📊 优化方案汇总

| 编号 | 优化项 | 状态 | 优先级 | 代码改动 |
|------|--------|------|--------|----------|
| 1 | V4架构适配 | ✅ 实现 | P0 | ~50行 |
| 2 | 同权多模型 | ✅ 实现 | P0 | ~30行 |
| 3 | 批次大小优化 | ✅ 实现 | P0 | 修改1常量 |
| 4 | 文本拼接拆分 | ⚠️ 变更为JSON | P0 | 见优化14 |
| 5 | 动态超时机制 | ✅ 实现（15s） | P1 | ~30行 |
| 6 | Rate Limit | ❌ 不实现 | - | 0行 |
| 7 | Temperature开放 | ✅ 实现 | P1 | ~40行 |
| 8 | 统一存储架构 | ✅ 实现 | P1 | ~10行 |
| 9 | 语言代码规范化 | ✅ 实现 | P1 | ~30行 |
| 10 | 错误处理细化 | ✅ 实现 | P1 | ~30行 |
| 11 | API测试功能 | ✅ 实现 | P1 | ~50行 |
| 12 | 移除流式响应 | ✅ 实现 | P0 | 删除300行，新增30行 |
| 13 | 模型配置+GPT-5优化 | ✅ 实现 | P2 | ~40行 |
| 14 | JSON数组格式 | ✅ 实现（实施变更） | P0 | ~60行 |

**总计**：删除~300行，新增~390行，净增约90行，架构更清晰，翻译更可靠。

---

## 🎯 核心参数确认（实际实施值）

| 参数 | 值 | 说明 |
|------|-----|------|
| **可选模型** | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | 三个同权模型 |
| **默认模型** | `gpt-5-mini` | 性价比最优 |
| **max_completion_tokens** | 动态估算 | 公式: `(totalChars / 2.5) × 1.2` |
| **temperature** | `0.3`（默认），0-1可调 | 仅非GPT-5模型支持 |
| **reasoning_effort** | `'minimal'` | GPT-5专属，强制快速路径 |
| **verbosity** | `'low'` | GPT-5专属，减少输出 |
| **batch_size** | `160` | IntelligentSegmenter |
| **format** | JSON Array | 实施变更，替代换行符 |
| **stream** | `false` | 非流式 |
| **超时（urgent）** | `15秒` | 实施调整（原设计5秒） |
| **超时（batch单批）** | `15秒` | 实施调整（原设计5秒） |
| **超时（batch总计）** | `批数 × 15秒` | 动态计算 |

---

## 🎯 设计理念

- **用户体验极简化**：只暴露必要的3个配置项（API Key、Model、Temperature）
- **内部处理智能化**：复用IntelligentSegmenter智能断句，复用Google/Microsoft文本处理逻辑
- **与现有服务一致性**：操作体验与Google/Microsoft翻译保持一致

## 🔑 核心特性

### 用户可见特性
- **API密钥配置**：支持用户自有API Key
- **模型选择**：多种模型可选（详见模型对比表）
- **翻译风格调节**：Temperature滑块（精确↔创意）
- **使用量追踪**：实时显示Token使用量

### 内部自动特性
- **智能批处理**：充分利用 400K 长上下文窗口
- **Rate Limit管理**：从API响应自动获取和调整
- **错误自动重试**：指数退避策略
- **Token优化**：动态计算max_tokens参数

## 📊 可用模型对比（已核实 2025-09-29）

| 模型 | 上下文窗口 | 最大输出 | 价格（入/出，$/百万tokens） | Tier1 限额（RPM / TPM） | 特点 | 推荐场景 |
|------|-----------|---------|--------------------------------|-------------------------|------|---------|
| **gpt-5** | 400K | 128K | $1.25 / $10.00 | 500 / 500K | 旗舰级推理 + Reasoning Token | 严苛质量、术语一致性要求 |
| **gpt-5-mini** | 400K | 128K | $0.25 / $2.00 | 500 / 500K | 默认性价比方案（400K上下文） | ✅ 日常字幕翻译默认选项 |
| **gpt-5-nano** | 400K | 128K | $0.05 / $0.40 | 500 / 200K | 最低成本、最低延迟 | 高频字幕刷新 / 低预算场景 |

> 价格与限额来自 2025-09-29 OpenAI 官方模型页；“Tier1” 指常见付费入门档位。缓存输入价格（如 $0.125/百万）可从对应页面获取并填充到配置表中。

## 🏗️ 架构设计

### 1. 用户配置层（Popup界面）

```typescript
interface OpenAIUserConfig {
  apiKey: string;        // 必需：API密钥
  model: string;         // 必需：模型选择
  temperature: number;   // 可调：翻译风格 (0-1, 默认0.3)
}

// 支持的模型列表（按推荐顺序排序）
const SUPPORTED_MODELS = [
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano'
];
```

#### UI界面设计
```html
<!-- 极简的用户界面 -->
<div class="openai-config">
  <!-- API密钥 -->
  <div class="setting-item">
    <label>API密钥:</label>
    <input type="password" id="openai-api-key" placeholder="sk-...">
    <button id="test-openai-key">测试</button>
  </div>

  <!-- 模型选择 -->
  <div class="setting-item">
    <label>模型:</label>
    <select id="openai-model">
j      <option value="gpt-5-mini" selected>GPT-5 mini (默认 $0.25/$2)</option>
      <option value="gpt-5">GPT-5 (旗舰 $1.25/$10)</option>
      <option value="gpt-5-nano">GPT-5 nano (极速 $0.05/$0.40)</option>
    </select>
    <div class="model-info" id="model-info">
      <!-- 动态显示模型信息 -->
      <small>上下文: 400K tokens | 最大输出: 128K tokens</small>
    </div>
  </div>

  <!-- Temperature滑块 -->
  <div class="setting-item">
    <label>翻译风格:</label>
    <div class="temperature-slider">
      <span class="temp-hint-left">精确</span>
      <input type="range" id="openai-temperature"
             min="0" max="1" step="0.1" value="0.3">
      <span class="temp-hint-right">创意</span>
    </div>
    <div class="temp-value">当前: <span id="temp-value">0.3</span></div>
  </div>

  <!-- 使用量显示 -->
  <div class="usage-display">
    <span>本次使用:</span>
    <span id="session-tokens">0 tokens</span>
  </div>
</div>
```

### 2. 内部自动管理层

#### 固定参数（最佳实践）
```typescript
const FIXED_PARAMS = {
  top_p: 0.8,                              // 平衡多样性
  presence_penalty: 0,                      // 字幕翻译不需要
  frequency_penalty: 0,                     // 字幕翻译不需要
  response_format: { type: "json_object" }, // 结构化输出
  stream: false                            // 批量处理不需要流
}
```

#### 动态管理参数
```typescript
interface DynamicParams {
  // 从API响应获取（每次调用自动更新）
  rateLimits: {
    maxRPM: number;           // 首次调用获取
    maxTPM: number;           // 首次调用获取
    remainingRequests: number; // 每次调用更新
    remainingTokens: number;   // 每次调用更新
    resetTime: Date;          // 重置时间
  };

  // 根据输入动态计算
  max_tokens: number;         // 基于输入文本长度估算

  // 根据模型自动设置
  modelConfig: {
    contextWindow: number;  // 上下文窗口大小
    maxOutput: number;      // 最大输出tokens
    encoding: string;       // tokenizer编码
  }
}
```

## 📝 实现代码

### 1. OpenAI翻译器核心类

```typescript
// 模型配置映射
const MODEL_CONFIGS: Record<string, {
  contextWindow: number;
  maxOutput: number;
  pricing: {
    input: number;
    cachedInput: number;
    output: number;
  };
  rateLimits: {
    tier1: { rpm: number; tpm: number };
    tier2: { rpm: number; tpm: number };
    tier3: { rpm: number; tpm: number };
  };
  encoding: string;
}> = {
  'gpt-5': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 1.25, cachedInput: 0.125, output: 10.0 },
    rateLimits: {
      tier1: { rpm: 500, tpm: 500_000 },
      tier2: { rpm: 5_000, tpm: 1_000_000 },
      tier3: { rpm: 5_000, tpm: 2_000_000 }
    },
    encoding: 'auto'
  },
  'gpt-5-mini': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 0.25, cachedInput: 0.025, output: 2.0 },
    rateLimits: {
      tier1: { rpm: 500, tpm: 500_000 },
      tier2: { rpm: 5_000, tpm: 2_000_000 },
      tier3: { rpm: 5_000, tpm: 4_000_000 }
    },
    encoding: 'auto'
  },
  'gpt-5-nano': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    pricing: { input: 0.05, cachedInput: 0.005, output: 0.40 },
    rateLimits: {
      tier1: { rpm: 500, tpm: 200_000 },
      tier2: { rpm: 5_000, tpm: 2_000_000 },
      tier3: { rpm: 5_000, tpm: 4_000_000 }
    },
    encoding: 'auto'
  },
};

export class OpenAITranslator {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private sessionTokens: number = 0;
  private rateLimits: any = null;
  private modelConfig: any;

  constructor(apiKey: string, model: string, temperature: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-5-mini'];

    console.log(`[OpenAI] 使用模型: ${model}`);
    console.log(`[OpenAI] 上下文窗口: ${this.modelConfig.contextWindow} tokens`);
    console.log(`[OpenAI] 最大输出: ${this.modelConfig.maxOutput} tokens`);
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<string[]> {
    // 构建请求
    const request = this.buildRequest(texts, sourceLang, targetLang);

    try {
      // 发送请求
      const response = await this.callAPI(request);

      // 自动更新rate limits（内部使用）
      this.updateRateLimits(response.headers);

      // 更新使用量显示（用户可见）
      this.sessionTokens += response.data.usage.total_tokens;
      this.updateUsageDisplay();

      // 解析响应
      return this.parseResponse(response.data);

    } catch (error: any) {
      if (error.status === 429) {
        // 自动处理rate limit，用户无感知
        await this.handleRateLimit(error);
        return this.translateBatch(texts, sourceLang, targetLang);
      }
      throw error;
    }
  }

  private buildRequest(texts: string[], sourceLang: string, targetLang: string) {
    return {
      model: this.model,
      temperature: this.temperature,     // 唯一用户可调参数

      // 固定的最佳实践参数
      top_p: 0.8,
      presence_penalty: 0,
      frequency_penalty: 0,
      response_format: { type: "json_object" },

      // 动态计算的参数
      max_tokens: this.calculateMaxTokens(texts),

      // 消息构建
      messages: [
        {
          role: "system",
          content: `You are a professional subtitle translator.
                   Translate accurately while preserving timing markers.
                   Return JSON format: {"translations": [{"index": 0, "text": "translated text"}]}`
        },
        {
          role: "user",
          content: `Translate from ${sourceLang} to ${targetLang}:\n${
            texts.map((t, i) => `${i}: ${t}`).join('\n')
          }`
        }
      ]
    };
  }

  private async callAPI(request: any): Promise<any> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(request)
    });

    const data = await response.json();

    if (!response.ok) {
      throw { status: response.status, ...data };
    }

    return { headers: response.headers, data };
  }

  private calculateMaxTokens(texts: string[]): number {
    // 基于字符估算输入token（粗略估算）
    const charCount = texts.join(' ').length;
    const estimatedInput = Math.ceil(charCount / 3); // 平均3字符/token

    // 翻译通常是1.5倍长度
    const estimatedOutput = Math.ceil(estimatedInput * 1.5);

    // 确保不超过模型的最大输出限制
    const modelMaxOutput = this.modelConfig.maxOutput;

    // 确保总token不超过上下文窗口
    const contextWindow = this.modelConfig.contextWindow;
    const systemPromptTokens = 100; // 系统提示词估算
    const safeMargin = 100; // 安全边界

    const availableForOutput = contextWindow - estimatedInput - systemPromptTokens - safeMargin;

    return Math.min(estimatedOutput, modelMaxOutput, availableForOutput);
  }

  private parseResponse(data: any): string[] {
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);

    if (!parsed.translations || !Array.isArray(parsed.translations)) {
      throw new Error('Invalid response structure');
    }

    return parsed.translations
      .sort((a: any, b: any) => a.index - b.index)
      .map((t: any) => t.text);
  }

  private updateRateLimits(headers: Headers): void {
    this.rateLimits = {
      remainingRequests: parseInt(headers.get('x-ratelimit-remaining-requests') || '0'),
      remainingTokens: parseInt(headers.get('x-ratelimit-remaining-tokens') || '0'),
      resetRequests: new Date(parseInt(headers.get('x-ratelimit-reset-requests') || '0') * 1000),
      resetTokens: new Date(parseInt(headers.get('x-ratelimit-reset-tokens') || '0') * 1000)
    };
  }

  private async handleRateLimit(error: any): Promise<void> {
    const headers = error.headers;
    if (headers) {
      this.updateRateLimits(headers);
      const waitTime = Math.max(
        this.rateLimits.resetRequests.getTime() - Date.now(),
        this.rateLimits.resetTokens.getTime() - Date.now()
      );
      console.log(`[OpenAI] Rate limit hit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      // 没有headers信息，使用指数退避
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  private updateUsageDisplay(): void {
    chrome.runtime.sendMessage({
      type: 'UPDATE_OPENAI_USAGE',
      data: { tokens: this.sessionTokens }
    });
  }
}
```

### 2. API Key测试功能

```typescript
export async function testOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[OpenAI] API Key有效，测试消耗:', data.usage.total_tokens, 'tokens');
      return true;
    }

    if (response.status === 401) {
      console.error('[OpenAI] API Key无效');
    }

    return false;
  } catch (error) {
    console.error('[OpenAI] API Key测试失败:', error);
    return false;
  }
}
```

### 3. 集成到现有翻译系统

```typescript
// 在 two-phase-translator-v4.ts 中添加
class TwoPhaseTranslatorV4 {
  private openaiTranslator?: OpenAITranslator;

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    preferences: any
  ): Promise<string[]> {
    const service = preferences.translationService;

    if (service === 'google-free') {
      return this.translateWithGoogle(texts, sourceLang, targetLang);
    } else if (service === 'microsoft-free') {
      return this.translateWithMicrosoft(texts, sourceLang, targetLang);
    } else if (service === 'openai') {
      // 初始化OpenAI翻译器
      if (!this.openaiTranslator) {
        this.openaiTranslator = new OpenAITranslator(
          preferences.apiKey,
          preferences.model || 'gpt-5-mini',
          preferences.temperature || 0.3
        );
      }
      return this.openaiTranslator.translateBatch(texts, sourceLang, targetLang);
    }
  }
}
```

## 🔄 API调用流程

```mermaid
graph TD
    A[开始翻译] --> B{检查Rate Limit}
    B -->|可用| C[构建请求]
    B -->|超限| D[等待重置]
    D --> C
    C --> E[调用API]
    E --> F{响应状态}
    F -->|成功| G[更新Rate Limit]
    F -->|429错误| H[从响应头获取等待时间]
    F -->|其他错误| I[错误处理]
    G --> J[解析JSON响应]
    H --> D
    J --> K[返回翻译结果]
    K --> L[更新Token使用量]
```

## ⚡ 批处理优化

### 与其他服务对比

| 服务 | 批处理方式 | 单次限制 | 优化策略 |
|------|-----------|---------|----------|
| **谷歌** | URL参数，`\|SEP\|`分隔 | URL长度（~2000字符） | 小批量多请求 |
| **微软** | JSON数组 | 10条/请求，5000字符/条 | 5000字符窗口 |
| **OpenAI** | 上下文对话 | ≥128K tokens | 大批量少请求 |

### OpenAI批处理优势

为保持与谷歌/微软管线一致，我们在 OpenAI 模型上采用同样的“紧急 → 批量”流程，并加入额外的安全边界：

- **紧急翻译**：沿用现有代码里的前/后范围配置，暂不锁定具体条数，方便调试；紧急请求通常在 40 条以内，直接按估算 token 校验即可。
- **批量翻译断点**：每批最多 160 条字幕，达到上限立即切下一批；在批次内结合 token 预算做智能断句。
- **token 安全线**：按 128K token 预算估算批次，超过模型上下文就拆分下一批。
- **Rate Limit 友好**：利用 `MODEL_CONFIGS` 中的 RPM / TPM，在批次之间加延迟（默认 `60_000 / RPM` 并乘以安全系数），并根据响应头的剩余额度动态调整。

```typescript
interface OpenAIBatch {
  subtitles: Subtitle[];
  tokenBudget: number;
}

interface OpenAIModelConfig {
  contextWindow: number;
  maxOutput: number;
  pricing: {
    input: number;
    cachedInput: number;
    output: number;
  };
  rateLimits: {
    tier1: { rpm: number; tpm: number };
    tier2: { rpm: number; tpm: number };
    tier3: { rpm: number; tpm: number };
  };
  encoding: string;
}

interface RateLimitSnapshot {
  remainingRequests: number;
  remainingTokens: number;
  resetRequestTs?: number;
  resetTokenTs?: number;
}

const SUBTITLE_MAX_PER_BATCH = 160;      // 单批固定上限
const SUBTITLE_HARD_CAP = 160;           // 额外保护（保持一致）

// 批处理优化器
class OpenAIBatchOptimizer {
  optimizeBatch(subtitles: Subtitle[], model: string): OpenAIBatch[] {
    const modelConfig = MODEL_CONFIGS[model];
    const batches: OpenAIBatch[] = [];
    let cursor = 0;

    while (cursor < subtitles.length) {
      const windowEnd = Math.min(cursor + SUBTITLE_MAX_PER_BATCH, subtitles.length);
      const windowSubs = subtitles.slice(cursor, windowEnd);

      const groups = this.splitWithinWindow(windowSubs, modelConfig);
      batches.push(...groups);

      cursor = windowEnd;
    }

    return batches;
  }

  private splitWithinWindow(subtitles: Subtitle[], config: OpenAIModelConfig): OpenAIBatch[] {
    const result: OpenAIBatch[] = [];
    let current: Subtitle[] = [];

    for (const subtitle of subtitles) {
      const exceedsHardCap = current.length >= SUBTITLE_HARD_CAP;

      if (exceedsHardCap) {
        if (current.length > 0) {
          result.push(this.buildBatch(current, config));
          current = [];
        }
      }

      current.push(subtitle);
    }

    if (current.length > 0) {
      result.push(this.buildBatch(current, config));
    }

    return result;
  }

  private buildBatch(subtitles: Subtitle[], config: OpenAIModelConfig): OpenAIBatch {
    const tokensEstimate = this.estimateTokens(subtitles, config);
    return {
      subtitles,
      tokenBudget: Math.min(tokensEstimate, config.maxOutput)
    };
  }

  private estimateTokens(subtitles: Subtitle[], config: OpenAIModelConfig): number {
    const joined = subtitles.map(s => s.text.replace(/\n/g, ' ').trim()).join(' ');
    const charCount = joined.length;
    const estimatedInput = Math.ceil(charCount / 3);  // 平均三字符一 token

    const estimatedOutput = Math.ceil(estimatedInput * 1.5);
    const safeContext = Math.floor(config.contextWindow * 0.6);
    const safeOutput = Math.floor(config.maxOutput * 0.8);

    return Math.min(safeContext, safeOutput, estimatedOutput);
  }
}

// 结合 Rate Limit 计算批次间延迟（保持和谷歌/微软一致的节流策略）
function computeBatchDelayMs(model: string, remainingHeaders?: RateLimitSnapshot): number {
  const config = MODEL_CONFIGS[model];
  const baseDelay = Math.ceil(60_000 / config.rateLimits.tier1.rpm);
  const safetyDelay = Math.max(baseDelay, 200);

  if (!remainingHeaders) {
    return Math.floor(safetyDelay * 1.1);
  }

  const { remainingRequests, resetRequestTs } = remainingHeaders;
  if (remainingRequests <= 1 && resetRequestTs) {
    const wait = Math.max(0, resetRequestTs - Date.now());
    return wait + safetyDelay;
  }

  return Math.floor(safetyDelay * 1.1);
}
```

## 🚨 错误处理架构

### 错误分类哲学

OpenAI错误处理遵循**两级分类系统**（与DeepSeek/DeepL保持一致）：

```typescript
// translation-errors.ts 中已定义
export type TranslationErrorCategory = 'fatal' | 'retryable';
```

- **fatal（致命错误）**：需要用户干预才能解决，无法自动恢复
  - API密钥问题（401、403）
  - 账户余额不足（402）
  - 请求参数错误（400、422）
  - 其他未知错误

- **retryable（可重试错误）**：临时性问题，稍后可能成功
  - 速率限制（429）
  - 服务器错误（500、503）
  - 网络连接问题
  - JSON解析失败
  - 数据验证错误

- **特殊处理：AbortError**：
  - **不进行分类**，直接抛出到上层
  - 区分超时（`message.includes('timeout')`）和用户取消
  - 由 `timeout-errors.ts` 统一处理

### 统一错误工具

OpenAI Translator 复用 `src/shared/types/translation-errors.ts` 中的通用工具：

```typescript
import {
  TranslationError,
  TranslationErrorCategory,
  handleFetchError,
} from '@/shared/types/translation-errors';
```

- `TranslationError`：统一封装错误信息，`service` 必须传入 `'openai'`
- `handleFetchError`：处理 `fetch` 抛出的网络错误，自动识别 `AbortError`
- `TranslationError.category`：使用 `fatal` / `retryable` 两级分类

### 完整错误分类表

#### 1. API错误（7种）

| HTTP状态码 | 错误类型 | 分类 | 用户提示 | 说明 |
|-----------|---------|------|---------|------|
| 400 | Bad Request | `fatal` | OpenAI 请求参数错误，请检查设置 | 请求格式不正确 |
| 401 | Invalid Authentication | `fatal` | OpenAI API密钥无效，请检查设置 | API Key错误或过期 |
| 402 | Insufficient Balance | `fatal` | OpenAI 账户余额不足，请充值 | ⭐最重要的用户错误 |
| 422 | Unprocessable Entity | `fatal` | OpenAI 暂时不支持当前设置的语种 | 不支持的语言对 |
| 429 | Rate Limit Exceeded | `retryable` | OpenAI API 请求过于频繁，请稍后重试 | 超出速率限制 |
| 500 | Internal Server Error | `retryable` | OpenAI 服务暂时不可用，请稍后重试 | 服务器内部错误 |
| 503 | Service Unavailable | `retryable` | OpenAI 服务暂时不可用，请稍后重试 | 服务过载/维护中 |

> 数据来源：OpenAI API官方文档 + OpenAI Python客户端异常类型

#### 2. 客户端错误（5种）

| 错误类型 | 分类 | 检测位置 | 用户提示 | 说明 |
|---------|------|---------|---------|------|
| 网络连接失败 | `retryable` | `fetch()` catch块 | 网络连接失败，请检查网络设置 | DNS解析失败、连接超时等 |
| JSON解析失败 | `retryable` | `response.json()` catch块 | OpenAI 翻译服务响应异常，请重试 | 返回内容不是有效JSON |
| 响应格式错误 | `retryable` | 格式验证阶段 | OpenAI 翻译服务响应异常，请重试 | 缺少必要字段（choices/content） |
| 翻译数量不匹配 | `retryable` | 数据验证阶段 | OpenAI 翻译服务响应异常，请重试 | 返回译文数量 ≠ 输入数量 |
| AbortError（超时） | 特殊 | 各阶段signal检查 | 网络超时，请检查网络连接后重试 | 15秒超时触发 |
| AbortError（用户取消） | 特殊 | 各阶段signal检查 | （不显示） | 用户主动取消 |

### 错误检测流程（5个关键点）

```typescript
/**
 * callOpenAIAPI方法中的5个错误检测点
 */
private async callOpenAIAPI(
  messages: any[],
  signal: AbortSignal,
  maxCompletionTokens: number
): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';
  let response: Response;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 检测点1: fetch()网络请求（网络错误 + AbortError）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        max_completion_tokens: maxCompletionTokens,
        stream: false,
        ...(this.model.startsWith('gpt-5')
          ? { reasoning_effort: 'minimal', verbosity: 'low' }
          : { temperature: this.temperature })
      }),
      signal  // 关键：使用AbortSignal
    });
  } catch (error) {
    handleFetchError(error, 'openai', 'OpenAI API 网络请求失败');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 检测点2: HTTP状态码检查（API错误）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!response.ok) {
    await this.handleAPIError(response);  // 单独方法处理
  }

  let data: any;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 检测点3: JSON解析（解析错误）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  try {
    data = await response.json();
  } catch (error) {
    throw new TranslationError(
      'OpenAI API 返回内容解析失败',
      'retryable',
      'openai',
      response.status
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 检测点4: 响应格式验证（格式错误）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new TranslationError(
      'OpenAI API 返回内容为空',
      'retryable',
      'openai',
      response.status
    );
  }

  // Token使用统计（可选）
  if (data.usage) {
    const actualInput = data.usage.prompt_tokens;
    const actualOutput = data.usage.completion_tokens;
    const actualTotal = data.usage.total_tokens;
    console.debug(
      `[debug][OpenAITranslator] 📊 Token实际用量: ` +
      `输入${actualInput}, 输出${actualOutput}, 总计${actualTotal}`
    );
  }

  return content;
}
```

### handleAPIError方法设计

```typescript
/**
 * 处理OpenAI API错误
 * 根据HTTP状态码和错误响应体进行分类
 */
private async handleAPIError(response: Response): Promise<never> {
  let errorMessage = '未知错误';
  let errorCode: string | undefined;

  // 尝试解析错误响应体
  try {
    const errorData = await response.json();
    errorMessage = errorData.error?.message || errorData.message || '未知错误';
    errorCode = errorData.error?.code || errorData.code;
  } catch {
    // JSON解析失败，使用默认错误消息
    errorMessage = await response.text().catch(() => '未知错误');
  }

  const status = response.status;

  // 根据HTTP状态码分类错误
  switch (status) {
    case 400:
      throw new TranslationError(
        'OpenAI 请求参数错误，请检查设置',
        'fatal',
        'openai',
        status,
        errorCode
      );

    case 401:
    case 403:
      throw new TranslationError(
        'OpenAI API密钥无效，请检查设置',
        'fatal',
        'openai',
        status,
        errorCode
      );

    case 402:
      // ⭐最重要的用户错误
      throw new TranslationError(
        'OpenAI 账户余额不足，请前往官网充值',
        'fatal',
        'openai',
        status,
        errorCode
      );

    case 422:
      throw new TranslationError(
        'OpenAI 暂时不支持当前设置的语种',
        'fatal',
        'openai',
        status,
        errorCode
      );

    case 429:
      throw new TranslationError(
        'OpenAI API 请求过于频繁，请稍后重试',
        'retryable',
        'openai',
        status,
        errorCode
      );

    case 500:
    case 503:
      throw new TranslationError(
        'OpenAI 服务暂时不可用，请稍后重试',
        'retryable',
        'openai',
        status,
        errorCode
      );

    default:
      throw new TranslationError(
        `OpenAI API 错误 (${status}): ${errorMessage}`,
        'fatal',
        'openai',
        status,
        errorCode
      );
  }
}
```

### translate方法中的signal检查

```typescript
/**
 * 翻译方法中的AbortSignal检查（3个位置）
 */
public async translate(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  stage: 'urgent' | 'batch',
  signal: AbortSignal
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 位置1: 方法入口检查
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (signal.aborted) {
    throw new DOMException('OpenAI翻译开始前已取消', 'AbortError');
  }

  console.log(`[OpenAITranslator] → 开始翻译: ${texts.length}条字幕 (${stage}阶段)`);

  try {
    // 1. 清理每条字幕的内部换行符
    const cleanedTexts = texts.map(text => text.replace(/\n/g, ' ').trim());

    // 2. 添加编号标记（帮助AI保持一对一对应）
    const numberedTexts = cleanedTexts.map((text, i) => `[${i}] ${text}`);

    // 3. 转换为JSON数组格式
    const jsonInput = JSON.stringify(numberedTexts);

    // 4. 构建messages（JSON格式）
    const messages = [
      {
        role: "system",
        content: `You are a professional subtitle translator.
Translate from ${sourceLang} to ${targetLang}.

INPUT FORMAT: JSON array containing ${texts.length} numbered subtitle strings
OUTPUT FORMAT: JSON array with EXACTLY ${texts.length} translated strings (keep the numbers!)

CRITICAL RULES:
1. Each subtitle has a number like [0], [1], [2]... Keep these numbers in your output!
2. Input has ${texts.length} items, output MUST have ${texts.length} items
3. Translate ONLY the text after the number, keep the number prefix
4. NEVER skip or merge items - every input [n] must have a corresponding output [n]
5. Return ONLY the JSON array, NO explanations`
      },
      {
        role: "user",
        content: jsonInput
      }
    ];

    // 5. 调用API（动态计算max_completion_tokens，考虑JSON额外开销）
    const jsonOverhead = texts.length * 4;
    const estimatedOutputTokens = this.estimateOutputTokens(jsonInput, jsonOverhead);
    const responseText = await this.callOpenAIAPI(messages, signal, estimatedOutputTokens);

    // 6. 解析JSON结果
    let numberedTranslations: string[];
    try {
      numberedTranslations = JSON.parse(responseText);
    } catch (parseError) {
      console.warn(`[OpenAITranslator] ⚠️  JSON解析失败，尝试提取JSON部分`, parseError);

      // 容错：提取JSON数组部分
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          numberedTranslations = JSON.parse(jsonMatch[0]);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          throw new TranslationError(
            `JSON提取失败: ${errorMsg}`,
            'retryable',
            'openai'
          );
        }
      } else {
        throw new TranslationError(
          `无法从响应中找到JSON数组`,
          'retryable',
          'openai'
        );
      }
    }

    // 7. 验证返回类型和数量
    if (!Array.isArray(numberedTranslations)) {
      throw new TranslationError(
        `OpenAI返回的不是数组: ${typeof numberedTranslations}`,
        'retryable',
        'openai'
      );
    }

    // 8. 去除编号，提取纯翻译文本
    const translations = numberedTranslations.map((item, index) => {
      const cleaned = item.replace(/^\[\d+\]\s*/, '');
      const expectedPrefix = `[${index}]`;
      if (!item.startsWith(expectedPrefix)) {
        console.warn(`[OpenAITranslator] ⚠️ 编号不匹配: 期望 ${expectedPrefix}`);
      }
      return cleaned;
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 检测点5: 翻译数量验证
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (translations.length !== texts.length) {
      console.error(
        `[OpenAITranslator] ❌ 翻译数量不匹配: ` +
        `期望${texts.length}条，实际${translations.length}条`
      );
      console.error(`[OpenAITranslator] 原始输入:`, cleanedTexts);
      console.error(`[OpenAITranslator] 带编号结果:`, numberedTranslations);
      console.error(`[OpenAITranslator] API原始响应:`, responseText);

      throw new TranslationError(
        `翻译数量不匹配: 期望${texts.length}条，实际${translations.length}条`,
        'retryable',
        'openai'
      );
    }

    console.log(`[OpenAITranslator] ✓ 翻译完成: ${translations.length}条字幕`);
    return translations;

  } catch (error) {
    console.error(`[OpenAITranslator] ✗ 翻译失败:`, error);
    throw error;
  }
}
```

> 注：OpenAI翻译器使用JSON格式单次处理所有字幕，不像DeepSeek/DeepL分批，因此没有"位置2: 循环入口检查"和"位置3: 延迟期间检查"。

### 错误处理执行流程图

```mermaid
graph TB
    Start[开始翻译] --> CheckSignal1{signal.aborted?}
    CheckSignal1 -->|是| AbortStart[抛出AbortError: 开始前已取消]
    CheckSignal1 -->|否| Prepare[准备翻译: 清理文本 + 添加编号 + 构建JSON]

    Prepare --> CallAPI[调用callOpenAIAPI]

    CallAPI --> Fetch{fetch请求}
    Fetch -->|网络错误| CatchFetch[catch块]
    CatchFetch --> IsAbort1{error.name === 'AbortError'?}
    IsAbort1 -->|是| ThrowAbort1[直接抛出AbortError]
    IsAbort1 -->|否| ThrowNetwork[抛出TranslationError<br/>service='openai'<br/>category: retryable<br/>网络连接失败]

    Fetch -->|成功| CheckStatus{response.ok?}
    CheckStatus -->|否| HandleAPIError[handleAPIError方法]

    HandleAPIError --> ParseError{解析错误响应}
    ParseError --> SwitchStatus{HTTP状态码}

    SwitchStatus -->|400| Throw400[TranslationError<br/>service='openai'<br/>fatal: 请求参数错误]
    SwitchStatus -->|401/403| Throw401[TranslationError<br/>service='openai'<br/>fatal: 密钥无效]
    SwitchStatus -->|402| Throw402[TranslationError<br/>service='openai'<br/>fatal: 余额不足 ⭐]
    SwitchStatus -->|422| Throw422[TranslationError<br/>service='openai'<br/>fatal: 语种不支持]
    SwitchStatus -->|429| Throw429[TranslationError<br/>service='openai'<br/>retryable: 速率限制]
    SwitchStatus -->|500/503| Throw500[TranslationError<br/>service='openai'<br/>retryable: 服务器错误]
    SwitchStatus -->|其他| ThrowOther[TranslationError<br/>service='openai'<br/>fatal: 未知错误]

    CheckStatus -->|是| ParseJSON{response.json}
    ParseJSON -->|解析失败| ThrowJSON[TranslationError<br/>service='openai'<br/>retryable: JSON解析失败]
    ParseJSON -->|成功| ExtractContent{提取content字段}

    ExtractContent -->|内容为空| ThrowEmpty[TranslationError<br/>service='openai'<br/>retryable: 返回内容为空]
    ExtractContent -->|成功| ParseTranslations{解析JSON数组}

    ParseTranslations -->|解析失败| TryExtract{尝试提取JSON}
    TryExtract -->|提取失败| ThrowExtract[TranslationError<br/>service='openai'<br/>retryable: 无法提取JSON]
    TryExtract -->|提取成功| ValidateArray

    ParseTranslations -->|成功| ValidateArray{是否为数组?}
    ValidateArray -->|否| ThrowNotArray[TranslationError<br/>service='openai'<br/>retryable: 返回不是数组]
    ValidateArray -->|是| StripNumbers[去除编号标记]

    StripNumbers --> ValidateCount{数量匹配?}
    ValidateCount -->|不匹配| ThrowCount[TranslationError<br/>service='openai'<br/>retryable: 数量不匹配]
    ValidateCount -->|匹配| Success[返回结果]

    style Throw402 fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style ThrowAbort1 fill:#ffd43b,stroke:#f59f00
    style AbortStart fill:#ffd43b,stroke:#f59f00
    style Throw429 fill:#74c0fc,stroke:#1c7ed6
    style Throw500 fill:#74c0fc,stroke:#1c7ed6
    style ThrowNetwork fill:#74c0fc,stroke:#1c7ed6
    style ThrowJSON fill:#74c0fc,stroke:#1c7ed6
    style ThrowCount fill:#74c0fc,stroke:#1c7ed6
    style ThrowEmpty fill:#74c0fc,stroke:#1c7ed6
    style ThrowExtract fill:#74c0fc,stroke:#1c7ed6
    style ThrowNotArray fill:#74c0fc,stroke:#1c7ed6
```

### 与timeout-errors.ts的集成

OpenAI错误最终会被上层（handle-toggle-translate-v4.ts）捕获并转换为用户友好的提示：

```typescript
/**
 * 在 handle-toggle-translate-v4.ts 中的错误处理
 */
import { getUserFriendlyMessage, getErrorLevel, ErrorLevel } from '../shared/types/timeout-errors';

try {
  // ... 翻译逻辑
} catch (error: any) {
  let userMessage = '翻译失败，请稍后重试';
  let errorLevel = ErrorLevel.ERROR;

  // 1. AbortError（用户取消）
  if (isAbortError(error)) {
    userMessage = '';  // 不显示消息
    errorLevel = ErrorLevel.INFO;
    console.log('[service-worker-v4] 用户取消翻译');
  }
  // 2. AbortError（超时）
  else if (isTimeoutError(error)) {
    userMessage = '网络超时，请检查网络连接后重试';
    errorLevel = ErrorLevel.WARNING;
    console.log('[service-worker-v4] 超时错误');
  }
  // 3. TranslationError（来自 OpenAI）
  else if (error instanceof TranslationError && error.service === 'openai') {
    userMessage = error.message;
    errorLevel = error.category === 'fatal' ? ErrorLevel.ERROR : ErrorLevel.WARNING;

    // 特殊提示：余额不足
    if (error.status === 402) {
      console.error('[service-worker-v4] ⚠️ OpenAI余额不足');
    }
  }
  // 4. 其他未知错误
  else {
    userMessage = getUserFriendlyMessage(error);
  }

  // 更新状态并通知用户
  await RuntimeStateManager.getInstance().updateTranslateActiveState(
    tabId,
    'inactive',
    userMessage
  );
}
```

### 架构设计要点总结

1. **错误分类明确**：fatal（5种）vs retryable（7种）vs AbortError（特殊）
2. **errorCode提取**：为402等关键错误提供更精确的分类依据
3. **5个检测点**：网络 → HTTP状态 → JSON解析 → 格式验证 → 数量验证
4. **单次处理**：JSON格式一次性翻译所有字幕，无需循环中的signal检查
5. **AbortError直接抛出**：不包装，由上层统一处理
6. **用户提示友好化**：翻译器抛出的 `TranslationError`（service=`'openai'`）消息直接面向用户
7. **与项目集成**：复用timeout-errors.ts工具函数

> 说明：OpenAI 翻译器在抛出 `TranslationError`（service=`'openai'`）时应直接提供用户友好的消息（例如"OpenAI 账户余额不足，请前往官网充值"），上层不会再做二次映射。

## 📊 Rate Limit管理

### 自动获取和更新

```typescript
// 每次API响应都包含最新的限制信息
Response Headers:
{
  'x-ratelimit-limit-requests': '5000',      // 例如：Tier2 gpt-5
  'x-ratelimit-limit-tokens': '1000000',     // TPM 限制
  'x-ratelimit-remaining-requests': '4999',  // 剩余请求
  'x-ratelimit-remaining-tokens': '985000',  // 剩余 tokens
  'x-ratelimit-reset-requests': '1738000000', // 重置时间（Unix 秒）
  'x-ratelimit-reset-tokens': '1738000000'
}

### 常用模型限额速查

| 模型 | Tier1 RPM | Tier1 TPM | Tier2 RPM | Tier2 TPM | 备注 |
|------|-----------|-----------|-----------|-----------|------|
| gpt-5 | 500 | 500K | 5,000 | 1,000K | Tier3 提升至 2,000K |
| gpt-5-mini | 500 | 500K | 5,000 | 2,000K | Tier3 维持 4,000K |
| gpt-5-nano | 500 | 200K | 5,000 | 2,000K | Tier3 同 4,000K |
```

### 动态调整策略

1. **首次调用**：不知道限制，调用后从响应获取
2. **后续调用**：提前检查剩余配额
3. **接近限制**：自动计算等待时间
4. **429错误**：从错误响应获取精确等待时间

## 🎯 Temperature参数说明

| 值 | 风格 | 适用场景 |
|----|------|---------|
| 0.0-0.2 | 精确直译 | 技术文档、法律文本 |
| 0.3-0.4 | 标准翻译 | 字幕、一般内容（推荐） |
| 0.5-0.6 | 自然翻译 | 对话、口语内容 |
| 0.7-1.0 | 创意翻译 | 文学作品、诗歌 |

## 📈 性能优化建议

### 模型选择指南

| 使用场景 | 推荐模型 | 理由 |
|---------|---------|------|
| **旗舰质量 / 高准确度** | gpt-5 | 400K 上下文 + Reasoning Token，适合术语敏感内容 |
| **默认日常字幕翻译** | gpt-5-mini | 400K 上下文 + 中等成本，响应足够快 |
| **高并发 / 低预算** | gpt-5-nano | $0.05/$0.40 定价，可服务快速刷新字幕 |

### 优化建议

1. **批量策略**：
   - gpt-5 / gpt-5-mini：400K 上下文，可一次分配 500~600 条字幕

2. **Token优化**：
   - 使用简洁的系统提示词（<100 tokens）
   - 批量处理减少系统消息开销
   - 避免重复的上下文信息

3. **Temperature设置**：
   - 字幕翻译：0.2-0.3（保持一致性）
   - 创意内容：0.5-0.7（更自然的表达）
   - 技术文档：0.0-0.1（精确翻译）

4. **错误处理**：
   - 实现智能重试机制
   - 根据错误类型自动降级模型
   - 缓存成功的翻译结果

## 🔍 调试和监控

### 日志格式
```javascript
[OpenAI] 模型: gpt-5-mini
[OpenAI] 批次: 50条字幕, 估算1500 tokens
[OpenAI] Rate Limit: 4999/5000 RPM, 449500/450000 TPM
[OpenAI] 响应: 200 OK, 耗时: 1.2s
[OpenAI] 使用: 1650 tokens (输入:1200, 输出:450)
[OpenAI] 会话总计: 3250 tokens
```

### 监控指标
- Token使用量（避免超支）
- 响应时间（优化批次大小）
- 错误率（调整重试策略）
- Rate Limit使用率（优化请求频率）

## ✅ 测试清单

- [ ] API Key验证
- [ ] 单条字幕翻译
- [ ] 批量字幕翻译
- [ ] Rate Limit处理
- [ ] 429错误自动重试
- [ ] Token使用量显示
- [ ] Temperature效果测试
- [ ] 模型切换测试
- [ ] 长字幕分割处理
- [ ] 网络错误恢复

## 💡 实施经验教训

### 1. Token估算的重要性

**问题**：最初使用 `字符数 × 8.4` 公式估算token，导致严重overestimate（实际需要1458 tokens，估算出9929 tokens，500%+误差）

**根本原因**：
- 混淆了"字符计数"和"token计数"的概念
- OpenAI使用BPE（Byte Pair Encoding）算法
- Token不是字符也不是单词，而是语义单元

**实测数据**（基于实际API响应）：
- 输入：1182字符 → 319 tokens（约3.7字符/token）
- 输出：1458 tokens
- 中英混合文本：约2.5字符/token（经验值）

**最终公式**：
```typescript
const estimatedInputTokens = totalChars / 2.5;      // 基于实测
const estimatedOutputTokens = estimatedInputTokens * 1.2;  // 20%缓冲
```

**关键学习**：
- 不要设置上下限（如500-4000），因为批处理逻辑已经控制大小
- 基于实际API响应数据调整，而不是理论推导
- 不同语言组合有不同的字符/token比率

### 2. max_completion_tokens对延迟的影响

**发现**：设置过大的 `max_completion_tokens` 会显著增加API延迟

**原理**：OpenAI会根据这个值预留计算资源，即使实际生成远少于这个值

**实测对比**：
- 设置16000 tokens → 20+秒响应时间
- 优化到1500 tokens → 5-7秒响应时间

**优化建议**：
- 根据实际输入动态估算，而不是使用固定上限
- 宁可稍微紧一点（1.2倍缓冲），也不要过度宽松（2倍缓冲）

### 3. GPT自动合并字幕的本质

**问题**：即使用JSON格式+强化Prompt，仍有<5%概率出现合并

**根本原因**：
- 字幕是按时间切分的，单条可能是半句话
- GPT的语言模型倾向于"修正"不完整的句子
- 这是模型内在行为，无法100%消除

**解决思路演进**：
1. ❌ 换行符分隔 → 经常合并（30%+）
2. ⚠️ JSON数组 + 基础规则 → 偶尔合并（10-15%）
3. ✅ JSON数组 + 多重强调 + 错误示范 → 极少合并（<5%）

**关键要素**：
- 在Prompt中显式写明数量：`${texts.length}`
- 用❌ WRONG例子展示什么是错误行为
- 多角度重复规则（CRITICAL RULES 1-6）
- 详细日志记录，便于诊断

**用户体验处理**：
- UI提示用户如遇数量不匹配可重试
- 大部分情况下重试能解决（模型随机性）

### 4. GPT-5系列的特殊性

**发现**：GPT-5不支持 `temperature` 参数，设置会报错

**优化参数**：
```typescript
if (model.startsWith('gpt-5')) {
  reasoning_effort: 'minimal',  // 避免深度推理模式
  verbosity: 'low'               // 减少verbose输出
} else {
  temperature: 0.3
}
```

**效果**：
- 显著降低GPT-5的响应延迟
- 避免进入不必要的深度推理

### 5. 超时设置的权衡

**原设计**：5秒
**实施调整**：15秒

**原因**：
- OpenAI API实际响应时间：5-10秒
- 网络波动：±2-3秒
- 设置5秒会导致超时率过高（>30%）
- 设置15秒平衡了成功率和用户体验

**建议**：宁可稍微宽松，也不要频繁超时导致重试

### 6. 基于实测数据而非理论设计

**经验**：
- 理论公式往往与实际偏差较大
- 优先从控制台日志提取实际API响应数据
- 基于真实数据调整参数
- 保留详细日志用于持续优化

**实施流程**：
1. 部署初版（使用保守参数）
2. 记录实际API响应数据（input tokens, output tokens, 响应时间）
3. 分析数据找出规律
4. 调整公式和参数
5. 重复2-4直到优化完成

---

## 📚 参考资源

- [OpenAI API文档](https://platform.openai.com/docs/api-reference)
- [Chat Completions指南](https://platform.openai.com/docs/guides/chat-completions)
- [Rate Limits说明](https://platform.openai.com/docs/guides/rate-limits)
- [Token计算工具](https://platform.openai.com/tokenizer)

## ✅ 实施完成状态

- [x] 实现OpenAITranslator类（已完成，JSON格式）
- [x] 集成到two-phase-translator-v4.ts（已完成）
- [x] 添加到Popup配置界面（已完成）
- [x] 实现动态Token估算（已完成，基于实测数据）
- [x] GPT-5性能优化（reasoning_effort + verbosity）
- [x] 超时优化（15秒）
- [x] JSON格式防合并方案（<5%失败率）

## 🔄 待优化项（可选）

1. **Token使用量统计**：在Popup显示会话总消耗
2. **成本预警功能**：设置预算上限提醒
3. **自定义系统提示词**：高级用户自定义翻译风格
4. **缓存优化**：利用OpenAI的Prompt Caching减少成本
5. **批处理策略调优**：根据更多实测数据调整160条上限

---

## 📅 更新历史

- **2025-10-25**：添加完整的错误处理架构设计章节
  - 统一使用 TranslationError + handleFetchError
  - 12种错误完整分类表（7个API + 5个客户端）
  - 5个错误检测点详细说明
  - handleAPIError方法架构设计
  - signal检查位置说明（单次处理，无循环）
  - 错误处理执行流程图（Mermaid）
  - 与timeout-errors.ts集成说明
- **2025-10-07**：架构优化，JSON格式方案，GPT-5参数优化
- **2025-09-29**：核实 GPT-5 系列规格，补充160条批量策略
- **2025-09-26**：创建初始文档，完成 API 调研和实现设计

---

*本文档已完成错误处理架构设计，符合项目统一规范，可直接用于实现*
