# Qwen-MT翻译API实现指南

> 最后更新：2025-10-23
> 状态：✅ 批量翻译已验证可行
> 版本：V4架构兼容（AbortSignal + 统一存储）
> 官方文档：https://help.aliyun.com/zh/model-studio/machine-translation

## 📋 概述

本文档提供阿里通义千问 Qwen-MT 翻译 API 的完整实现指南，符合项目 V4 架构规范。Qwen-MT 是基于 Qwen3 优化的专业翻译模型，支持 92 种语言互译，提供术语干预、翻译记忆库等高级功能。采用 OpenAI 兼容 API，可与现有翻译服务无缝集成。

## 🔑 核心特性

- **专业翻译质量**：基于 Qwen3-MT 优化，旗舰模型多语言综合效果优秀
- **OpenAI 兼容 API**：标准 chat/completions 端点，与 OpenAI/Gemini 接口一致
- **✅ 批量翻译支持**：使用 `\n` 分隔多条文本，单次请求翻译多条字幕（已验证可行）
- **自动语言检测**：source_lang 支持 `"auto"`，API 自动检测源语言
- **高性价比**：北京地域输入 ¥0.0018/千tokens，100万 tokens 免费额度（90天，用完后按量付费）
- **高级功能**：支持术语干预（terms）、翻译记忆库（tm_list）、领域提示（domains）
- **V4 架构集成**：完整支持 AbortSignal、两阶段翻译、统一缓存

## 📊 定价与限额

### 北京地域（默认使用）⭐

| 项目 | 值 | 说明 |
|------|-----|------|
| **输入价格** | ¥0.0018/千tokens | 中文约 1.5-2 字符/token |
| **输出价格** | ¥0.0054/千tokens | 输出价格为输入的 3 倍 |
| **免费额度** | 各100万tokens（90天有效期）| 约可翻译 55 个视频 |
| **API 端点** | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | OpenAI兼容格式 |
| **RPM** | 60 次/分钟 | Requests Per Minute |
| **TPM** | 23,797 tokens/分钟 | Tokens Per Minute |

### 新加坡地域（不推荐）❌

| 项目 | 值 | 说明 |
|------|-----|------|
| **输入价格** | ¥0.018055/千tokens | **北京地域的 10 倍** ⚠️ |
| **输出价格** | ¥0.05409/千tokens | **北京地域的 10 倍** ⚠️ |
| **免费额度** | 无 | 无免费额度 |
| **API 端点** | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` | 仅国内受限时使用 |

### 模型规格

| 参数 | qwen-mt-plus | 说明 |
|------|-------------|------|
| **上下文长度** | 16,384 tokens | 输入 + 输出总和 |
| **最大输入** | 8,192 tokens | 单次请求输入限制 |
| **最大输出** | 8,192 tokens | 单次请求输出限制 |
| **支持语言** | 92 种 | 包含中英日韩等主流语言 |

### 成本估算示例

**场景1：翻译 100 条字幕**
```
输入: 100条 × 30字符 ÷ 2 字符/token = 1,500 tokens
输出: 1,500 tokens
成本 = (1500/1000) × 0.0018 + (1500/1000) × 0.0054
     = 0.0027 + 0.0081 = ¥0.0108（约 1 分钱）
```

**场景2：翻译 1000 条字幕**
```
输入: 15,000 tokens
输出: 15,000 tokens
成本 = (15000/1000) × 0.0018 + (15000/1000) × 0.0054
     = 0.027 + 0.081 = ¥0.108（约 10.8 分）
```

**免费额度利用**：
```
100万 tokens ÷ 18,000 tokens/视频（300条字幕）≈ 55 个视频
```

### 与其他服务价格对比

| 服务 | 输入价格 | 输出价格 | 100条成本 | 相对成本 |
|------|----------|----------|----------|----------|
| **Qwen-MT-Plus** | ¥0.0018 | ¥0.0054 | ¥0.0108 | 基准 |
| OpenAI GPT-4o-mini | ¥0.00175 | ¥0.014 | ¥0.024 | 2.2x |
| DeepL Pro | ¥0.025/条 | - | ¥2.5 | 231x |
| Google Translate | 免费 | - | ¥0 | - |

> 数据来源：官网截图（2025-10-23）
>
> **重要**：Qwen 按 **tokens** 计费，中文约 1.5-2 字符/token，英文约 4 字符/token。

## ✅ 批量翻译验证结果

### 验证时间
2025-10-23

### 测试方法
使用浏览器控制台测试脚本，向 Qwen-MT API 发送5条英文字幕，使用 `\n` 分隔符连接。

### 测试输入
```
Hello
How are you
Good morning
Thank you
Goodbye
```

### API 返回结果
```
你好
你好吗
早上好
谢谢
再见
```

### 验证结论
✅ **批量翻译可行**
- API 正确保留了 `\n` 分隔符
- 按 `\n` 分割后数量完全匹配（5条）
- 每条翻译正确对应输入
- 翻译质量正常

### 性能预估
基于验证结果，批量翻译性能预估：
- **100条字幕**：约 3-5 秒（4次API调用，批次大小30条，批次间延迟200ms）
- **300条字幕**：约 10-15 秒（10次API调用）
- **网络请求**：大幅减少（100条仅需4次请求 vs 逐条需100次）

### 智能断句策略

使用 `IntelligentSegmenter` 进行批量翻译前的智能断句：

**断句规则**：
1. **硬断点**：30条字幕（强制分批）
2. **强断点**：时间间隔 > 2秒
3. **弱断点**：maxGap - minGap > 400ms
4. **最小批次**：10条

**示例**：
```typescript
// 100条字幕，智能断句后可能分为：
// [30条] + [28条（gap>2s）] + [30条] + [12条]
// 而不是机械的 [30, 30, 30, 10]
```

## 🏗️ 架构设计

### 基础配置

| 参数 | 值 | 说明 |
|------|-----|------|
| **端点（北京）** | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | 默认使用 |
| **端点（新加坡）** | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` | 不推荐 |
| **认证方式** | `Authorization: Bearer sk-xxxxxx` | 标准 Bearer Token |
| **请求方法** | `POST` | JSON body |
| **模型名称** | `qwen-mt-plus` | 固定值 |
| 批次大小 | 30 条字幕/批 | 使用 IntelligentSegmenter 智能断句 |
| 批次间延迟 | 200ms（仅 batch 阶段）| urgent 阶段无延迟 |
| 存储位置 | `qwenApiKey` | UserPreferences |
| source_lang | `"auto"` 或语言代码 | 自动检测或指定 |
| target_lang | 语言代码（必需）| 目标语言 |

### 支持的语言代码

**常用语言代码**：

| 语言 | 代码 | YouTube代码 | 映射关系 |
|------|------|------------|---------|
| 中文 | `zh` | `zh-CN`, `zh-Hans`, `zh-Hant` | 统一映射为 `zh` |
| 英文 | `en` | `en`, `en-US`, `en-GB` | 统一映射为 `en` |
| 日文 | `ja` | `ja` | 直接使用 |
| 韩文 | `ko` | `ko` | 直接使用 |
| 法文 | `fr` | `fr` | 直接使用 |
| 西班牙文 | `es` | `es` | 直接使用 |
| 德文 | `de` | `de` | 直接使用 |
| 自动检测 | `auto` | - | 仅 source_lang 可用 |

> 完整支持 92 种语言，详见官方文档

### API 请求格式（OpenAI兼容）

#### 请求头

```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer sk-xxxxxxxxxxxxxxxxxx'
}
```

#### 请求体（批量翻译）

```javascript
{
  "model": "qwen-mt-plus",
  "messages": [
    {
      "role": "user",
      "content": "第一句字幕\n第二句字幕\n第三句字幕"  // 用 \n 分隔
    }
  ],
  "translation_options": {
    "source_lang": "auto",      // 自动检测或指定语言
    "target_lang": "zh"         // 目标语言（必需）
  }
}
```

**关键说明**：
- ✅ HTTP 请求：`translation_options` **直接放在顶层**（不需要 `extra_body` 包装）
- ✅ Python SDK：需要 `extra_body={"translation_options": {...}}`
- ✅ 批量翻译：用 `\n` 连接多条字幕
- ✅ 消息数组：必须有且仅有 1 条消息，role 固定为 `"user"`

#### 高级参数（可选）

```javascript
{
  "model": "qwen-mt-plus",
  "messages": [...],
  "translation_options": {
    "source_lang": "en",
    "target_lang": "zh",

    // 术语干预（强制特定词汇翻译）
    "terms": [
      { "source": "API", "target": "应用程序接口" },
      { "source": "token", "target": "令牌" }
    ],

    // 翻译记忆库（提供参考翻译）
    "tm_list": [
      { "source": "Hello world", "target": "你好世界" }
    ],

    // 领域提示（英文关键词）
    "domains": ["technology"]  // 可选: medical, legal, finance
  }
}
```

### API 响应格式

```javascript
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "qwen-mt-plus",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "翻译的第一句\n翻译的第二句\n翻译的第三句"  // 用 \n 分隔
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,       // 输入 tokens
    "completion_tokens": 50,    // 输出 tokens
    "total_tokens": 150         // 总 tokens
  }
}
```

**提取翻译结果**：

```javascript
const translatedText = response.choices[0]?.message?.content;
if (!translatedText) {
  throw new Error('Qwen API 返回内容为空');
}

const translations = translatedText.split('\n');

// 验证数量匹配
if (translations.length !== originalTexts.length) {
  throw new Error(`翻译数量不匹配: 期望${originalTexts.length}条，实际${translations.length}条`);
}
```

## 💾 缓存策略

### 缓存键规则

```typescript
const cacheKey = `${videoId}_${sourceLang}_${targetLang}_qwen`;
```

**组成部分**：
- `videoId`：视频 ID（唯一标识视频）
- `sourceLang`：源语言代码（如 `en`, `ja`）
- `targetLang`：目标语言代码（如 `zh`, `en`）
- 服务标识：固定为 `qwen`（不包含模型名）

**示例**：
```typescript
// 示例1：英文视频翻译成中文
const cacheKey = "dQw4w9WgXcQ_en_zh_qwen";

// 示例2：日文视频翻译成中文
const cacheKey = "abc123xyz_ja_zh_qwen";
```

### 缓存读写流程

```typescript
// 1. 尝试读取缓存
const cachedTranslations = await TranslationCacheManager.getCache(
  videoId,
  sourceLang,
  targetLang,
  'qwen'
);

if (cachedTranslations) {
  console.log('[QwenTranslator] ✓ 缓存命中');
  return cachedTranslations;
}

// 2. 缓存未命中，调用API翻译
const translations = await translator.translate(...);

// 3. 保存到缓存
await TranslationCacheManager.setCache(
  videoId,
  sourceLang,
  targetLang,
  'qwen',
  translations
);
```

### 注意事项

**当前实现**：
- ✅ 缓存不区分是否使用高级功能（terms/tm_list/domains）
- ✅ 相同视频、相同语言对的翻译直接复用

**未来优化**（如果使用高级功能）：
- 如果使用 terms/tm_list/domains，需要在缓存键中添加标识
- 例如：`${videoId}_${sourceLang}_${targetLang}_qwen_terms`

## 🔧 实现步骤

### Phase 1-1: 更新类型定义

**文件**: `src/shared/types/user-preferences-types.ts`

```typescript
export type TranslationService =
  | 'openai'
  | 'gemini'
  | 'deepl'
  | 'qwen';  // 添加 Qwen

export interface UserPreferences {
  // ... 现有字段 ...
  qwenApiKey?: string;  // 添加 Qwen API Key
}
```

### Phase 1-2: 创建 QwenTranslator 类

**文件**: `src/background/components/qwen-translator.ts`

```typescript
/**
 * Qwen-MT 翻译器（阿里通义千问机器翻译）
 *
 * 核心特性：
 * - OpenAI 兼容 API（chat/completions 端点）
 * - 批量翻译（\n 分隔符）
 * - AbortSignal 支持
 * - 自动语言检测（source_lang: "auto"）
 * - 智能断句（IntelligentSegmenter）
 *
 * 技术规格：
 * - 模型：qwen-mt-plus（旗舰翻译模型）
 * - 端点：北京地域（默认）
 * - 批次大小：30条/批（使用 IntelligentSegmenter 智能断句）
 * - 批次间延迟：200ms（仅 batch 阶段）
 * - 速率限制：60 RPM, 23,797 TPM
 */
export class QwenTranslator {
  private static readonly BEIJING_ENDPOINT =
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  private static readonly SINGAPORE_ENDPOINT =
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
  private static readonly BATCH_SIZE = 30;        // 智能断句最大批次
  private static readonly BATCH_DELAY_MS = 200;   // batch 阶段延迟

  private apiKey: string;
  private model: 'qwen-mt-plus';
  private endpoint: string;

  constructor(
    apiKey: string,
    region: 'beijing' | 'singapore' = 'beijing'
  ) {
    this.apiKey = apiKey;
    this.model = 'qwen-mt-plus';
    this.endpoint = region === 'beijing'
      ? QwenTranslator.BEIJING_ENDPOINT
      : QwenTranslator.SINGAPORE_ENDPOINT;

    console.debug(
      `[debug][QwenTranslator] 初始化: region=${region}, ` +
      `batchSize=${QwenTranslator.BATCH_SIZE}, ` +
      `batchDelay=${QwenTranslator.BATCH_DELAY_MS}ms`
    );
  }

  /**
   * 主翻译方法
   *
   * @param texts 待翻译文本数组
   * @param sourceLang 源语言（'auto' 或具体语言代码）
   * @param targetLang 目标语言代码
   * @param stage 翻译阶段（'urgent' 或 'batch'）
   * @param signal AbortSignal 用于取消翻译
   * @returns 翻译结果数组
   */
  public async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const results: string[] = [];

    // 分批处理
    for (let i = 0; i < texts.length; i += QwenTranslator.BATCH_SIZE) {
      // 检查取消信号
      if (signal.aborted) {
        throw new DOMException('Qwen翻译已取消', 'AbortError');
      }

      const batch = texts.slice(i, i + QwenTranslator.BATCH_SIZE);
      const batchNumber = Math.floor(i / QwenTranslator.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(texts.length / QwenTranslator.BATCH_SIZE);

      console.log(
        `[QwenTranslator] → 翻译批次 ${batchNumber}/${totalBatches}: ` +
        `${batch.length}条 | qwen-mt-plus | ${stage}阶段`
      );

      // 调用 API 翻译单批
      const translations = await this.translateBatch(
        batch,
        sourceLang,
        targetLang,
        signal
      );

      results.push(...translations);

      // 批次间延迟（仅 batch 阶段，urgent 阶段无延迟）
      if (stage === 'batch' && i + QwenTranslator.BATCH_SIZE < texts.length) {
        await this.delayWithSignal(QwenTranslator.BATCH_DELAY_MS, signal);
      }
    }

    console.log(`[QwenTranslator] ✓ 翻译完成: 共${results.length}条`);
    return results;
  }

  /**
   * 单批翻译
   */
  private async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    signal: AbortSignal
  ): Promise<string[]> {
    // 构建请求体（OpenAI 兼容格式）
    const requestBody = {
      model: this.model,
      messages: [{
        role: 'user',
        content: texts.join('\n')  // 用 \n 连接
      }],
      translation_options: {
        source_lang: sourceLang === 'auto' ? 'auto' : this.mapLanguage(sourceLang),
        target_lang: this.mapLanguage(targetLang)
      }
    };

    console.debug(
      `[debug][QwenTranslator] 请求: ${texts.length}条字幕, ` +
      `${sourceLang} → ${targetLang}`
    );

    // 发送请求
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal  // AbortSignal 支持
    });

    // 错误处理
    if (!response.ok) {
      await this.handleAPIError(response);
    }

    // 解析响应
    const data = await response.json();
    const translatedText = data.choices[0]?.message?.content;

    if (!translatedText) {
      throw new Error('Qwen API 返回内容为空');
    }

    // 分割翻译结果
    const translations = translatedText.split('\n');

    // 验证数量匹配
    if (translations.length !== texts.length) {
      console.error(
        `[QwenTranslator] ❌ 翻译数量不匹配: ` +
        `期望${texts.length}条，实际${translations.length}条`
      );
      throw new Error(
        `翻译数量不匹配: 期望${texts.length}条，实际${translations.length}条`
      );
    }

    console.debug(
      `[debug][QwenTranslator] ✓ 批次翻译成功: ${translations.length}条`
    );
    return translations;
  }

  /**
   * 语言代码映射（YouTube → Qwen）
   */
  private mapLanguage(ytCode: string): string {
    const mapping: Record<string, string> = {
      // 中文
      'zh-CN': 'zh',
      'zh-Hans': 'zh',
      'zh-Hant': 'zh',

      // 英文
      'en': 'en',
      'en-US': 'en',
      'en-GB': 'en',

      // 日文
      'ja': 'ja',

      // 韩文
      'ko': 'ko',

      // 法文
      'fr': 'fr',

      // 西班牙文
      'es': 'es',

      // 德文
      'de': 'de',

      // 泰文
      'th': 'th',

      // 印尼文
      'id': 'id',

      // 越南文
      'vi': 'vi',

      // 阿拉伯文
      'ar': 'ar'
    };

    return mapping[ytCode] || ytCode;
  }

  /**
   * API 错误处理
   */
  private async handleAPIError(response: Response): Promise<never> {
    let errorMessage = '未知错误';

    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.message || '未知错误';
    } catch {
      // JSON 解析失败
    }

    switch (response.status) {
      case 401:
      case 403:
        throw new Error('Qwen API 密钥无效或已过期');

      case 429:
        throw new Error('Qwen API 速率限制（超出 RPM 或 TPM）');

      case 400:
        throw new Error(`Qwen API 请求参数错误: ${errorMessage}`);

      case 500:
      case 502:
      case 503:
        throw new Error('Qwen API 服务器错误，请稍后重试');

      default:
        throw new Error(`Qwen API 错误 (${response.status}): ${errorMessage}`);
    }
  }

  /**
   * 可取消的延迟
   */
  private async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('延迟被取消', 'AbortError'));
      });
    });
  }
}
```

### Phase 1-3: 集成到 two-phase-translator-v4.ts

```typescript
// src/background/components/two-phase-translator-v4.ts

import { QwenTranslator } from './qwen-translator';

export class TwoPhaseTranslatorV4 {
  constructor(
    serviceType: 'openai' | 'gemini' | 'deepl' | 'qwen',  // 添加 'qwen'
    apiKey: string,
    model?: string,
    deeplRegion?: 'free' | 'pro'
  ) {
    // ... 现有代码 ...

    // 根据服务类型配置批次大小
    if (serviceType === 'qwen') {
      this.segmenter = new IntelligentSegmenter(30);  // 30条/批
      console.debug('[debug][TwoPhaseTranslatorV4] 使用Qwen配置：30条/批');
    }
    // ... 其他服务类型 ...
  }

  private createTranslator():
    OpenAITranslator | GeminiTranslator | DeepLTranslator | QwenTranslator
  {
    switch (this.serviceType) {
      case 'qwen':
        return new QwenTranslator(
          this.apiKey,
          'beijing'  // 默认北京地域
        );

      // ... 其他服务类型 ...
    }
  }
}
```

### Phase 1-4: 修改 service-worker.ts

```typescript
// src/background/service-worker.ts

const {
  translationService,
  qwenApiKey,
  // ... 其他字段 ...
} = userPreferences;

if (translationService === 'qwen') {
  if (!qwenApiKey) {
    console.error('[service-worker-v4] ❌ Qwen API Key 未配置');
    // 更新状态为 INACTIVE
    await updateState(tabId, { translateActive: 'inactive' });
    return;
  }

  console.log('[service-worker-v4] 使用 Qwen 翻译服务 (qwen-mt-plus)');
  translator = new TwoPhaseTranslatorV4('qwen', qwenApiKey);
}
```

### Phase 1-5: Popup UI - HTML

**文件**: `src/popup/popup.html`

```html
<!-- Qwen 设置面板 -->
<div id="qwen-settings" class="service-panel" style="display: none;">
  <div class="settings-group">
    <label for="qwen-api-key">
      <span class="label-text">Qwen API Key</span>
      <span class="label-hint">阿里云百炼控制台获取</span>
    </label>
    <div class="api-key-input-wrapper">
      <input
        type="password"
        id="qwen-api-key"
        placeholder="sk-xxxxxxxxxxxxxxxxxx"
        autocomplete="off"
      >
      <button id="qwen-toggle-visibility" class="toggle-visibility-btn" title="显示/隐藏">
        👁️
      </button>
    </div>
  </div>

  <div class="settings-group">
    <button id="qwen-test-connection" class="test-btn">
      <span class="btn-text">测试连接</span>
      <span class="btn-loading" style="display: none;">测试中...</span>
    </button>
    <div id="qwen-test-result" class="test-result"></div>
  </div>

  <div class="info-box">
    <p><strong>模型：</strong>qwen-mt-plus（旗舰翻译模型）</p>
    <p><strong>价格：</strong>输入 ¥0.0018/千tokens，输出 ¥0.0054/千tokens</p>
    <p><strong>免费额度：</strong>各100万tokens（90天有效期，用完后按量付费）</p>
    <p><strong>支持语言：</strong>92种语言互译</p>
    <p><strong>批量翻译：</strong>✅ 已验证可行（使用 \n 分隔符）</p>
    <p><strong>申请地址：</strong>
      <a href="https://bailian.console.aliyun.com/" target="_blank">
        阿里云百炼控制台
      </a>
    </p>
  </div>
</div>
```

### Phase 1-6: Popup UI - JavaScript

**文件**: `src/popup/popup.ts`

```typescript
// Qwen 设置面板初始化
async function initQwenSettings() {
  const qwenApiKeyInput = document.getElementById('qwen-api-key') as HTMLInputElement;
  const qwenToggleBtn = document.getElementById('qwen-toggle-visibility') as HTMLButtonElement;
  const qwenTestBtn = document.getElementById('qwen-test-connection') as HTMLButtonElement;
  const qwenTestResult = document.getElementById('qwen-test-result') as HTMLDivElement;

  // 加载保存的 API Key
  const preferences = await UserPreferencesManager.getUserPreferences();
  if (preferences.qwenApiKey) {
    qwenApiKeyInput.value = preferences.qwenApiKey;
  }

  // API Key 显示/隐藏切换
  qwenToggleBtn?.addEventListener('click', () => {
    const isPassword = qwenApiKeyInput.type === 'password';
    qwenApiKeyInput.type = isPassword ? 'text' : 'password';
    qwenToggleBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  // API Key 输入事件
  qwenApiKeyInput?.addEventListener('input', async () => {
    const apiKey = qwenApiKeyInput.value.trim();
    await UserPreferencesManager.updateUserPreferences({ qwenApiKey: apiKey });
    console.log('[popup] Qwen API Key 已保存');
  });

  // 测试连接
  qwenTestBtn?.addEventListener('click', async () => {
    const apiKey = qwenApiKeyInput.value.trim();

    if (!apiKey) {
      showTestResult(qwenTestResult, 'error', '请先输入 API Key');
      return;
    }

    // 显示加载状态
    qwenTestBtn.disabled = true;
    qwenTestBtn.querySelector('.btn-text')!.style.display = 'none';
    qwenTestBtn.querySelector('.btn-loading')!.style.display = 'inline';
    qwenTestResult.textContent = '';

    try {
      // 调用测试翻译
      const testResponse = await fetch(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'qwen-mt-plus',
            messages: [{
              role: 'user',
              content: 'Hello'
            }],
            translation_options: {
              source_lang: 'auto',
              target_lang: 'zh'
            }
          })
        }
      );

      if (testResponse.ok) {
        const data = await testResponse.json();
        const translatedText = data.choices[0]?.message?.content;
        showTestResult(
          qwenTestResult,
          'success',
          `✓ 连接成功！测试翻译: "${translatedText}"`
        );
      } else {
        const errorData = await testResponse.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || errorData.message || '未知错误';
        showTestResult(
          qwenTestResult,
          'error',
          `✗ 连接失败 (${testResponse.status}): ${errorMsg}`
        );
      }
    } catch (error) {
      showTestResult(
        qwenTestResult,
        'error',
        `✗ 网络错误: ${error instanceof Error ? error.message : '未知错误'}`
      );
    } finally {
      // 恢复按钮状态
      qwenTestBtn.disabled = false;
      qwenTestBtn.querySelector('.btn-text')!.style.display = 'inline';
      qwenTestBtn.querySelector('.btn-loading')!.style.display = 'none';
    }
  });
}

// 翻译服务切换事件
translationServiceSelect?.addEventListener('change', async (e) => {
  const service = (e.target as HTMLSelectElement).value as TranslationService;

  // 隐藏所有面板
  document.querySelectorAll('.service-panel').forEach(panel => {
    (panel as HTMLElement).style.display = 'none';
  });

  // 显示对应面板
  if (service === 'qwen') {
    document.getElementById('qwen-settings')!.style.display = 'block';
  }
  // ... 其他服务 ...

  // 保存选择
  await UserPreferencesManager.updateUserPreferences({
    translationService: service
  });
});
```

### Phase 1-7: 添加到 manifest.json

**文件**: `manifest.json`

```json
{
  "host_permissions": [
    "https://dashscope.aliyuncs.com/*",
    "https://dashscope-intl.aliyuncs.com/*"
  ]
}
```

## ❌ 错误处理

### Fail Fast 原则

Qwen翻译器遵循 V4 架构的 Fail Fast 原则：
- ✅ 遇到错误立即抛出，不重试
- ✅ 由上层（AbortTimeoutManager）统一处理超时（5秒）
- ✅ 避免用户长时间等待

**为什么不重试？**

在字幕翻译场景中，重试会导致：
- ❌ 用户等待时间更长（5秒超时可能变成15秒）
- ❌ 用户体验差（不知道是在翻译还是在重试）
- ❌ 大部分错误重试无效（API Key错误、参数错误、服务器错误）

### 常见错误类型

| HTTP状态码 | 错误类型 | 处理策略 | 原因 |
|-----------|---------|---------|------|
| **401/403** | API Key无效 | 立即失败，提示用户重新配置 | 重试无意义 |
| **429** | 速率限制 | 立即失败，提示用户稍后再试 | 重试会触发更严格限制 |
| **400** | 请求参数错误 | 立即失败，记录详细错误信息 | 重试无意义 |
| **500/502/503** | 服务器错误 | 立即失败，提示用户稍后重试 | 阿里云服务问题 |
| **网络错误** | 连接失败 | AbortError，立即停止翻译流程 | 由 AbortSignal 处理 |

### 数据验证错误

| 错误类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| **翻译数量不匹配** | `translations.length !== texts.length` | 抛出错误，终止翻译 |
| **空响应** | `!data.choices[0]?.message?.content` | 抛出错误，提示API返回异常 |
| **空输入** | `texts.length === 0` | 直接返回空数组 |

### 错误日志格式

```typescript
// 成功日志
console.log('[QwenTranslator] ✓ 翻译完成: 100条');

// 错误日志
console.error('[QwenTranslator] ❌ API错误 (401): API密钥无效');

// 警告日志
console.warn('[QwenTranslator] ⚠️ 翻译数量不匹配');

// 调试日志
console.debug('[debug][QwenTranslator] 批次间延迟 1000ms');
```

## ✅ 测试清单

### Phase 1 - 基础功能测试

- [ ] **API 连接测试**
  - [ ] 北京端点连通性
  - [ ] API Key 验证（有效/无效）
  - [ ] 响应格式正确性
  - [ ] 错误处理（401/429/500）

- [ ] **单批翻译测试**
  - [ ] 翻译 1 条字幕
  - [ ] 翻译 30 条字幕（满批次）
  - [ ] 验证翻译数量匹配
  - [ ] 验证翻译质量

- [ ] **语言支持测试**
  - [ ] 英文 → 中文
  - [ ] 日文 → 中文
  - [ ] 韩文 → 中文
  - [ ] 自动检测（source_lang: "auto"）

### Phase 2 - 批量翻译测试

- [ ] **多批次测试**
  - [ ] 100 条字幕（约4批次，使用智能断句）
  - [ ] 300 条字幕（约10批次，使用智能断句）
  - [ ] 批次间延迟验证（200ms，仅 batch 阶段）
  - [ ] 批次顺序正确性

- [ ] **AbortSignal 测试**
  - [ ] 翻译过程中取消
  - [ ] 批次间延迟中取消
  - [ ] 验证资源正确释放

### Phase 3 - 错误处理测试

- [ ] **API 错误测试**
  - [ ] 无效 API Key（401）
  - [ ] 速率限制（429）
  - [ ] 服务器错误（500）
  - [ ] 网络中断模拟

- [ ] **数据验证测试**
  - [ ] 空数组输入
  - [ ] 超长文本（>8192 tokens）
  - [ ] 特殊字符处理
  - [ ] 翻译数量不匹配

### Phase 4 - 集成测试

- [ ] **V4 架构集成**
  - [ ] 紧急翻译（前9后30）
  - [ ] 批量翻译（全部字幕）
  - [ ] 缓存读写验证
  - [ ] 状态管理验证

- [ ] **UI 集成测试**
  - [ ] Popup 配置面板显示
  - [ ] API Key 保存/读取
  - [ ] 测试连接功能
  - [ ] 错误提示显示

### Phase 5 - 性能测试

- [ ] **成本验证**
  - [ ] 100 条字幕成本估算
  - [ ] 1000 条字幕成本估算
  - [ ] Token 使用统计

- [ ] **速率限制验证**
  - [ ] 60 RPM 限制测试
  - [ ] 23,797 TPM 限制测试
  - [ ] 批次延迟有效性

## 📚 参考资料

### 官方文档

- **翻译模型文档**: https://help.aliyun.com/zh/model-studio/machine-translation
- **OpenAI 兼容模式**: https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope
- **API 调用总文档**: https://help.aliyun.com/zh/model-studio/use-qwen-by-calling-api
- **控制台**: https://bailian.console.aliyun.com/

### 内部文档

- **DeepL 实现指南**: `docs/guides/deepl-translate-implementation.md`
- **V4 架构文档**: `docs/architecture/08-abort-timeout-architecture.md`
- **批量翻译策略**: `docs/architecture/07-batch-translation-architecture.md`

---

**更新历史**:
- 2025-10-23 v1.1: 批量翻译验证成功，更新批次配置（30条/批，200ms延迟，智能断句）
- 2025-10-23 v1.0: 初始文档（整合 API 参考和调用方式对比，仅保留 qwen-mt-plus）
