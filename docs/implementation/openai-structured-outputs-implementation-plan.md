# OpenAI Structured Outputs 实施方案

## 📋 文档信息

- **方案名称**: OpenAI Structured Outputs 双轨制实施方案
- **版本**: v1.0
- **创建日期**: 2025-10-31
- **目标**: 实现新旧翻译方案共存，通过开关控制切换
- **实施人**: Codex

---

## 🎯 目标与范围

### 核心目标
1. **解决数量不匹配问题**: 利用OpenAI的Structured Outputs（JSON Schema）硬约束，从根本上保证"N in = N out"
2. **新旧方案共存**: 保留当前编号标记方案，新增Structured Outputs方案
3. **用户可控切换**: 通过配置开关 `useStructuredOutputs` 控制使用哪种方案
4. **零破坏性**: 不影响现有功能，完全向后兼容

### 不在范围内
- ❌ 窗口化兜底机制（去掉，保持Fail Fast原则）
- ❌ 其他翻译服务（仅针对OpenAI）
- ❌ UI界面改动（开关通过配置文件控制）

---

## 📐 架构设计

### 调用链路
```
用户点击翻译
    ↓
handle-toggle-translate-v4.ts
    ↓
TwoPhaseTranslatorV4.translateUrgent/translateBatch()
    ↓
TwoPhaseTranslatorV4.callTranslationAPI()  [line 833-1005]
    ↓
OpenAITranslator.translate()  [line 99-247]
    ↓
    ├── [旧方案] translate_legacy()  ← 当前实现逻辑
    │       ↓
    │   callOpenAIAPI_legacy()
    │       ↓
    │   OpenAI API (编号标记: "[0] text")
    │
    └── [新方案] translate_structured()  ← 新增实现
            ↓
        buildBatchSchema()  ← 生成JSON Schema
            ↓
        callOpenAIAPI_structured()
            ↓
        OpenAI API (Structured Outputs: {id, text})
```

### 数据流对比

#### 旧方案（编号标记）
```typescript
输入: ["Hello", "World"]
    ↓ 添加编号
["[0] Hello", "[1] World"]
    ↓ JSON.stringify
'["[0] Hello", "[1] World"]'
    ↓ OpenAI API
'["[0] 你好", "[1] 世界"]'
    ↓ JSON.parse + 去编号
["你好", "世界"]
```

#### 新方案（Structured Outputs）
```typescript
输入: ["Hello", "World"]
    ↓ 构建结构化数据
{
  targetLang: "中文",
  items: [
    {id: "0", text: "Hello"},
    {id: "1", text: "World"}
  ]
}
    ↓ OpenAI API + JSON Schema约束
{
  translations: [
    {id: "0", translation: "你好"},
    {id: "1", translation: "世界"}
  ]
}
    ↓ 提取translation字段
["你好", "世界"]
```

---

## 🔧 实施步骤

### 步骤1：修改用户偏好类型定义

**文件**: `src/shared/types/user-preferences-types.ts`

**位置**: 第34-67行（TranslationServiceComplete接口）

**修改内容**:

```typescript
// 在 TranslationServiceComplete 接口中添加新字段
export interface TranslationServiceComplete {
  // ... 现有字段（省略）

  // === OpenAI实验性参数 ===
  useImmersiveFormat?: boolean;                 // 是否使用沉浸式格式（\n\n分隔）而非JSON格式
  useStructuredOutputs?: boolean;               // ✅ 新增：是否使用Structured Outputs（JSON Schema硬约束）
}
```

**位置**: 第106-116行（OpenAI模板配置）

**修改内容**:

```typescript
[TranslationServiceType.OPENAI]: {
  type: TranslationServiceType.OPENAI,
  name: 'OpenAI GPT',
  model: 'gpt-5-mini',
  availableModels: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
  temperature: 1,  // GPT-5系列只支持默认值1
  maxTokens: 128000,
  rpm: 60,
  tpm: 40000,
  useImmersiveFormat: false,      // 默认使用JSON格式（带编号）
  useStructuredOutputs: false     // ✅ 新增：默认使用旧方案（编号标记）
},
```

---

### 步骤2：重构OpenAITranslator类

**文件**: `src/background/components/openai-translator.ts`

#### 2.1 添加开关变量和Schema类型定义

**位置**: 第71-88行（类定义和构造函数）

**修改内容**:

```typescript
/**
 * OpenAI翻译器类 - V4架构
 */
export class OpenAITranslator {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private modelConfig: typeof MODEL_CONFIGS[string];
  private useStructuredOutputs: boolean;  // ✅ 新增：方案切换开关

  /**
   * 构造函数
   * @param apiKey OpenAI API密钥
   * @param model 模型名称
   * @param temperature 温度参数（GPT-5系列固定为1，此参数保留用于测试）
   * @param useStructuredOutputs 是否使用Structured Outputs（默认false）
   */
  constructor(
    apiKey: string,
    model: string,
    temperature: number = 1.0,
    useStructuredOutputs: boolean = false  // ✅ 新增参数
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-5-mini'];
    this.useStructuredOutputs = useStructuredOutputs;  // ✅ 保存开关

    // 打印当前使用的方案
    console.log(`[OpenAITranslator] 初始化: 模型=${model}, 方案=${useStructuredOutputs ? 'Structured Outputs' : '编号标记'}`);
  }

  // ... 其他方法
}
```

#### 2.2 添加Structured Outputs相关类型定义

**位置**: 第27行之后（MODEL_CONFIGS定义后）

**新增内容**:

```typescript
/**
 * Structured Outputs - 输入数据结构
 */
interface StructuredInput {
  targetLang: string;
  items: Array<{
    id: string;
    text: string;
  }>;
}

/**
 * Structured Outputs - 输出数据结构
 */
interface StructuredOutput {
  translations: Array<{
    id: string;
    translation: string;
  }>;
}

/**
 * Structured Outputs - JSON Schema定义
 */
interface BatchSchema {
  name: string;
  schema: {
    type: string;
    additionalProperties: boolean;
    properties: {
      translations: {
        type: string;
        minItems: number;
        maxItems: number;
        items: {
          type: string;
          additionalProperties: boolean;
          properties: {
            id: { type: string };
            translation: { type: string };
          };
          required: string[];
        };
      };
    };
    required: string[];
  };
  strict: boolean;
}
```

#### 2.3 重构translate方法（统一入口）

**位置**: 第99-247行（当前translate方法）

**修改策略**: 将当前实现改名为 `translate_legacy()`，新建统一入口 `translate()`

**新的translate方法**:

```typescript
/**
 * 翻译文本数组 - V4架构接口（统一入口）
 * @param texts 待翻译的文本数组
 * @param sourceLang 源语言代码 (YouTube标准)
 * @param targetLang 目标语言代码 (YouTube标准)
 * @param stage 翻译阶段 ('urgent' | 'batch')
 * @param signal AbortSignal用于中断请求
 * @returns 翻译后的文本数组
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

  if (signal.aborted) {
    throw new DOMException('OpenAI 翻译开始前已取消', 'AbortError');
  }

  console.log(
    `[OpenAITranslator] → 开始翻译: ${texts.length}条字幕 (${stage}阶段) ` +
    `| 方案: ${this.useStructuredOutputs ? 'Structured Outputs' : '编号标记'}`
  );

  // 根据开关选择方案
  if (this.useStructuredOutputs) {
    return this.translate_structured(texts, sourceLang, targetLang, stage, signal);
  } else {
    return this.translate_legacy(texts, sourceLang, targetLang, stage, signal);
  }
}
```

#### 2.4 保留旧方案实现（改名为translate_legacy）

**位置**: 第99-247行后

**修改内容**: 将当前的 `translate` 方法改名为 `translate_legacy`，并改为 `private`

```typescript
/**
 * 翻译文本数组 - 旧方案（编号标记）
 * @private
 */
private async translate_legacy(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  stage: 'urgent' | 'batch',
  signal: AbortSignal
): Promise<string[]> {
  // 🔄 将当前第107-246行的代码完整复制到这里
  // 包括：
  // 1. 清理换行符
  // 2. 添加编号标记 [0] [1]
  // 3. JSON.stringify
  // 4. 构建messages
  // 5. 调用callOpenAIAPI
  // 6. 解析JSON
  // 7. 去除编号
  // 8. 验证数量

  // ... 当前实现的全部代码（省略，保持不变）
}
```

**⚠️ 重要提示**: `translate_legacy` 方法的实现与当前 `translate` 方法完全相同，只是改名和改为private。

#### 2.5 实现新方案（translate_structured）

**位置**: `translate_legacy` 方法之后

**新增内容**:

```typescript
/**
 * 翻译文本数组 - 新方案（Structured Outputs）
 * @private
 */
private async translate_structured(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  stage: 'urgent' | 'batch',
  signal: AbortSignal
): Promise<string[]> {
  console.log(`[OpenAITranslator] 使用Structured Outputs方案`);

  try {
    // 1. 清理每条字幕的内部换行符
    const cleanedTexts = texts.map(text => text.replace(/\n/g, ' ').trim());

    // 2. 构建结构化输入数据
    const items = cleanedTexts.map((text, index) => ({
      id: String(index),  // 使用索引作为id
      text: text
    }));

    // 3. 转换目标语言代码为英文名称（Chat API要求）
    const targetLangName = LanguageCodeMapper.toEnglishName(targetLang);

    // 4. 构建输入数据
    const inputData: StructuredInput = {
      targetLang: targetLangName,
      items: items
    };

    // 5. 生成JSON Schema（动态设置minItems/maxItems）
    const schema = this.buildBatchSchema(items.length);

    // 6. 构建messages（简化的Prompt）
    const messages = [
      {
        role: "system",
        content: `You are a professional subtitle translator.
Translate ${items.length} subtitles from ${sourceLang} to ${targetLangName}.
Keep the original order and ids. Do NOT merge or split items.
Output will be validated by the JSON schema.`
      },
      {
        role: "user",
        content: JSON.stringify(inputData)
      }
    ];

    // 打印合并日志
    console.log(
      `[OpenAITranslator] 模型=${this.model}, ` +
      `翻译: ${sourceLang} → ${targetLangName}, ` +
      `Schema约束: minItems=${items.length}, maxItems=${items.length}`
    );

    if (signal.aborted) {
      throw new DOMException('OpenAI 翻译已取消', 'AbortError');
    }

    // 7. 调用API（带Structured Outputs）
    const responseText = await this.callOpenAIAPI_structured(messages, schema, signal);

    // 8. 解析结构化响应
    let structuredOutput: StructuredOutput;
    try {
      structuredOutput = JSON.parse(responseText);
      console.debug(
        `[debug][OpenAITranslator] ✓ JSON解析成功，收到${structuredOutput.translations.length}条翻译`
      );
    } catch (parseError) {
      console.error(`[OpenAITranslator] ❌ JSON解析失败`, parseError);
      console.error(`[OpenAITranslator] 📄 OpenAI原始响应:`, responseText);
      throw new TranslationError(
        `OpenAI Structured Outputs 解析失败: ${parseError}`,
        'retryable',
        'openai'
      );
    }

    // 9. 验证返回类型
    if (!structuredOutput.translations || !Array.isArray(structuredOutput.translations)) {
      throw new TranslationError(
        `OpenAI Structured Outputs 响应格式错误：缺少translations数组`,
        'retryable',
        'openai'
      );
    }

    const translations = structuredOutput.translations;

    // 10. 验证数量（理论上OpenAI已保证，但安全起见仍需检查）
    if (translations.length !== texts.length) {
      console.error(`[OpenAITranslator] 输入数据(全部${texts.length}条):`, items);
      console.error(`[OpenAITranslator] AI返回结果(全部${translations.length}条):`, translations);
      console.error(`[OpenAITranslator] API原始响应:`, responseText);

      throw new TranslationError(
        `OpenAI Structured Outputs 数量不匹配：期望${texts.length}条，实际${translations.length}条`,
        'retryable',
        'openai'
      );
    }

    // 11. 验证id顺序和覆盖
    const inputIds = items.map(item => item.id);
    const outputIds = translations.map(t => t.id);
    const idsMatch = inputIds.length === outputIds.length &&
                     inputIds.every((id, index) => id === outputIds[index]);

    if (!idsMatch) {
      console.error(`[OpenAITranslator] id顺序不匹配`);
      console.error(`  期望ids:`, inputIds);
      console.error(`  实际ids:`, outputIds);

      throw new TranslationError(
        `OpenAI Structured Outputs id顺序不匹配`,
        'retryable',
        'openai'
      );
    }

    // 12. 提取translation字段
    const finalTranslations = translations.map(t => t.translation);

    console.log(`[OpenAITranslator] ✓ Structured Outputs翻译完成: ${finalTranslations.length}条字幕`);
    return finalTranslations;

  } catch (error) {
    console.error(`[OpenAITranslator] ✗ Structured Outputs翻译失败:`, error);
    throw error;
  }
}
```

#### 2.6 新增buildBatchSchema方法

**位置**: `translate_structured` 方法之后

**新增内容**:

```typescript
/**
 * 构建批量翻译的JSON Schema
 * @param itemCount 字幕条数
 * @returns JSON Schema对象
 */
private buildBatchSchema(itemCount: number): BatchSchema {
  return {
    name: "SubtitleBatch",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        translations: {
          type: "array",
          minItems: itemCount,  // 🔥 强制返回N条
          maxItems: itemCount,  // 🔥 不多不少
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              translation: { type: "string" }
            },
            required: ["id", "translation"]
          }
        }
      },
      required: ["translations"]
    },
    strict: true
  };
}
```

#### 2.7 重构callOpenAIAPI方法

**位置**: 第283-370行（当前callOpenAIAPI方法）

**修改策略**: 将当前实现改名为 `callOpenAIAPI_legacy`，新建 `callOpenAIAPI_structured`

**callOpenAIAPI_legacy（旧方案调用）**:

```typescript
/**
 * 调用OpenAI API - 旧方案（无Schema约束）
 * @private
 */
private async callOpenAIAPI_legacy(
  messages: any[],
  signal: AbortSignal,
  maxCompletionTokens: number
): Promise<string> {
  // 🔄 将当前第288-370行的代码完整复制到这里
  // 包括：
  // 1. 构建requestBody（无response_format）
  // 2. fetch请求
  // 3. 错误处理
  // 4. 解析响应
  // 5. Token统计

  // ... 当前实现的全部代码（省略，保持不变）
}
```

**callOpenAIAPI_structured（新方案调用）**:

**位置**: `callOpenAIAPI_legacy` 方法之后

**新增内容**:

```typescript
/**
 * 调用OpenAI API - 新方案（Structured Outputs）
 * @private
 */
private async callOpenAIAPI_structured(
  messages: any[],
  schema: BatchSchema,
  signal: AbortSignal
): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';

  // 构建请求体（包含response_format）
  const requestBody = {
    model: this.model,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: schema
    },
    stream: false,
    temperature: this.temperature,      // GPT-5系列会忽略此参数
    reasoning_effort: 'minimal',        // 保持最快速度
    verbosity: 'low'                    // 提高输出完整性
  };

  console.debug(
    `[debug][OpenAITranslator] API请求: model=${this.model}, ` +
    `Schema=${schema.name}, minItems=${schema.schema.properties.translations.minItems}`
  );

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error) {
    handleFetchError(error, 'openai', 'OpenAI API 网络请求失败');
  }

  if (!response.ok) {
    await this.handleAPIError(response);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new TranslationError(
      'OpenAI API 返回内容解析失败',
      'retryable',
      'openai',
      response.status
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    // 添加详细调试信息
    console.error('[OpenAITranslator] API返回结构异常:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      firstChoice: data.choices?.[0],
      hasMessage: !!data.choices?.[0]?.message,
      messageContent: data.choices?.[0]?.message?.content,
      finishReason: data.choices?.[0]?.finish_reason,
      fullResponse: data
    });

    throw new TranslationError(
      'OpenAI API 返回内容为空',
      'retryable',
      'openai',
      response.status
    );
  }

  // Token使用统计
  if (data.usage) {
    const actualInput = data.usage.prompt_tokens;
    const actualOutput = data.usage.completion_tokens;
    const actualTotal = data.usage.total_tokens;

    console.log(
      `[OpenAITranslator] 📊 Token用量: ` +
      `输入${actualInput}, 输出${actualOutput}, 总计${actualTotal}`
    );
  }

  return content;
}
```

---

### 步骤3：修改TwoPhaseTranslatorV4调用逻辑

**文件**: `src/background/components/two-phase-translator-v4.ts`

**位置**: 第863-883行（OpenAI翻译器实例化）

**修改内容**:

```typescript
// 根据翻译服务类型调用不同的API
if (service.type === 'openai') {
  // 使用OpenAI翻译（V4架构）
  if (!service.apiKey) {
    throw new Error('OpenAI API密钥未配置');
  }

  const translator = new OpenAITranslator(
    service.apiKey,
    service.model || 'gpt-5-mini',
    service.temperature || 1.0,
    service.useStructuredOutputs || false  // ✅ 新增：传递开关参数
  );

  const stage = options?.stage ?? 'batch';

  // 调用翻译（传递stage和signal）
  translatedTexts = await translator.translate(
    texts,
    sourceLang,
    targetLang,
    stage,
    signal
  );
```

---

## 🧪 测试方案

### 测试1：验证开关切换

**步骤**:
1. 修改配置文件，设置 `useStructuredOutputs: false`
2. 启动扩展，翻译字幕
3. 检查日志，应显示 "方案: 编号标记"
4. 修改配置文件，设置 `useStructuredOutputs: true`
5. 重启扩展，翻译字幕
6. 检查日志，应显示 "方案: Structured Outputs"

**期望结果**:
- 日志正确显示当前使用的方案
- 两种方案都能正常工作

---

### 测试2：数量匹配测试

**测试用例**:

| 场景 | 字幕内容 | 期望行为 |
|------|---------|---------|
| 正常情况 | 100条不同字幕 | 返回100条译文 |
| 相邻重复 | ["Hello", "Hello", "World"] | 返回3条译文（不合并） |
| 空数组 | [] | 返回[] |
| 单条字幕 | ["Hello"] | 返回["..."] |
| 大批次 | 200条字幕 | 返回200条译文 |

**验证方法**:
```typescript
// 在translate方法返回前添加断言
console.assert(
  translations.length === texts.length,
  `数量不匹配: ${translations.length} !== ${texts.length}`
);
```

---

### 测试3：错误处理测试

**测试用例**:

| 错误类型 | 触发方式 | 期望行为 |
|---------|---------|---------|
| API密钥错误 | 使用无效密钥 | 抛出fatal错误，显示"API密钥无效" |
| 网络超时 | 断网情况 | 抛出retryable错误 |
| JSON解析失败 | 模拟非法响应 | 打印原始响应，抛出错误 |
| Schema约束失败 | OpenAI无法满足约束 | OpenAI API层面报错 |

---

### 测试4：性能对比测试

**测试数据**: 100条字幕，每条约20字

**对比指标**:

| 指标 | 旧方案（编号标记） | 新方案（Structured Outputs） |
|------|-------------------|---------------------------|
| 首字响应时间 | ~1.5s | ~1.5-2s |
| 总耗时 | ~5s | ~5-5.5s |
| Token消耗（输入） | ~1500 | ~1500 |
| Token消耗（输出） | ~1200 | ~1300 (+8%) |
| 数量匹配成功率 | ~95% | ~99.9% |

**记录方法**:
```typescript
const startTime = Date.now();
const result = await translator.translate(...);
const endTime = Date.now();
console.log(`耗时: ${endTime - startTime}ms`);
```

---

## 📊 实施检查清单

### 代码修改
- [ ] `user-preferences-types.ts`: 添加 `useStructuredOutputs` 字段
- [ ] `openai-translator.ts`: 添加类型定义（StructuredInput/Output/BatchSchema）
- [ ] `openai-translator.ts`: 修改构造函数，添加 `useStructuredOutputs` 参数
- [ ] `openai-translator.ts`: 重构 `translate()` 为统一入口
- [ ] `openai-translator.ts`: 当前实现改名为 `translate_legacy()`
- [ ] `openai-translator.ts`: 新增 `translate_structured()`
- [ ] `openai-translator.ts`: 新增 `buildBatchSchema()`
- [ ] `openai-translator.ts`: 当前 `callOpenAIAPI` 改名为 `callOpenAIAPI_legacy()`
- [ ] `openai-translator.ts`: 新增 `callOpenAIAPI_structured()`
- [ ] `two-phase-translator-v4.ts`: 修改OpenAI实例化，传递 `useStructuredOutputs`

### 测试验证
- [ ] 测试1: 开关切换
- [ ] 测试2: 数量匹配（5个用例）
- [ ] 测试3: 错误处理（4个用例）
- [ ] 测试4: 性能对比
- [ ] 回归测试: 确保旧方案不受影响

### 文档更新
- [ ] 更新 `openai-translator.ts` 文件头注释，添加v4.4.0版本说明
- [ ] 更新 `CHANGELOG.md`，记录新增功能
- [ ] 更新 `docs/guides/openai-translate-implementation.md`

---

## 🔍 关键实现细节

### 细节1：Schema中的minItems/maxItems

```typescript
// ✅ 正确：运行时动态设置
const schema = {
  properties: {
    translations: {
      minItems: items.length,  // 运行时赋值
      maxItems: items.length
    }
  }
};

// ❌ 错误：硬编码固定值
minItems: 100  // 不能写死
```

---

### 细节2：id字段类型

```typescript
// ✅ 正确：统一使用string
id: String(index)  // "0", "1", "2" ...

// ❌ 错误：使用number
id: index  // 0, 1, 2（会导致Schema类型不匹配）
```

---

### 细节3：additionalProperties必须为false

```typescript
// ✅ 正确：严格模式
schema: {
  type: "object",
  additionalProperties: false,  // 🔥 必须加
  properties: { ... }
}

// ❌ 错误：缺少约束
schema: {
  type: "object",
  properties: { ... }
}
```

---

### 细节4：空数组处理

```typescript
// 在translate_structured开头添加
if (texts.length === 0) {
  console.log('[OpenAITranslator] 输入为空，直接返回');
  return [];
}
```

---

### 细节5：日志打印规范

```typescript
// 主要操作：使用console.log
console.log('[OpenAITranslator] ✓ Structured Outputs翻译完成');

// 详细步骤：使用console.debug
console.debug('[debug][OpenAITranslator] Schema约束: minItems=100');

// 错误信息：使用console.error
console.error('[OpenAITranslator] ❌ JSON解析失败');
```

---

## 🚀 实施顺序建议

### 第1次提交（基础架构）
1. 修改 `user-preferences-types.ts`（添加开关）
2. 修改 `openai-translator.ts` 构造函数（添加参数）
3. 添加类型定义（StructuredInput/Output/BatchSchema）

### 第2次提交（旧方案重构）
1. 将 `translate()` 改名为 `translate_legacy()`
2. 将 `callOpenAIAPI()` 改名为 `callOpenAIAPI_legacy()`
3. 新建统一入口 `translate()`（先只调用legacy）
4. 测试确保旧方案不受影响

### 第3次提交（新方案实现）
1. 实现 `translate_structured()`
2. 实现 `buildBatchSchema()`
3. 实现 `callOpenAIAPI_structured()`
4. 在 `translate()` 中添加开关逻辑
5. 测试新方案

### 第4次提交（集成和优化）
1. 修改 `two-phase-translator-v4.ts` 调用
2. 添加详细日志
3. 完善错误处理
4. 性能对比测试

---

## ⚠️ 注意事项

### 1. 向后兼容
- ✅ 默认使用旧方案（useStructuredOutputs: false）
- ✅ 不删除任何现有代码
- ✅ 旧方案性能不受影响

### 2. 错误处理
- 新方案失败时：直接抛出错误（不回退到旧方案）
- 理由：让用户明确知道新方案的问题

### 3. Token消耗
- 新方案输出Token增加约8%（多了id字段）
- 可接受范围内

### 4. Schema约束限制
- `minItems/maxItems` 必须相等
- `strict: true` 必须设置
- `additionalProperties: false` 必须设置

---

## 📝 配置示例

### 启用Structured Outputs

**方法1：直接修改配置文件**

```json
{
  "translationService": {
    "type": "openai",
    "model": "gpt-5-mini",
    "apiKey": "sk-...",
    "useStructuredOutputs": true
  }
}
```

**方法2：通过Popup UI（待实现）**

未来可以在Popup中添加"实验性功能"选项。

---

## 🎯 成功标准

1. ✅ 两种方案可正常切换，无报错
2. ✅ 新方案数量匹配成功率 >99%
3. ✅ 旧方案性能不受影响
4. ✅ 所有测试用例通过
5. ✅ 代码可读性良好，注释完整

---

## 📞 问题反馈

如果在实施过程中遇到问题，请记录以下信息：

1. **错误现象**：具体的错误信息或异常行为
2. **复现步骤**：如何触发该问题
3. **日志输出**：相关的console日志
4. **当前配置**：useStructuredOutputs的值
5. **测试数据**：使用的字幕内容和数量

---

**文档版本**: v1.0
**最后更新**: 2025-10-31
**维护者**: Claude Code Team
