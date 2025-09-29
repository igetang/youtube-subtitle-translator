# DeepSeek AI翻译API实现指南

> 最后更新：2025-09-29
> 状态：🚧 架构设计完成，待实现
> 版本：V4架构兼容

## 📋 概述

本文档提供 DeepSeek 翻译 API 的落地指南，包括认证、调用、批量优化、节流策略与最佳实践。DeepSeek API 与 OpenAI 兼容，适合作为中文场景的低成本翻译备选方案。

## 🔑 核心特性

- **低成本**：输入（cache miss）$0.28/百万 token，输出 $0.42/百万 token，cache hit $0.028
- **默认模型**：`deepseek-chat`（DeepSeek-V3.2-Exp 非思考模式）
- **中文优化**：对中英互译表现稳定，适合字幕翻译场景
- **OpenAI 兼容**：支持 OpenAI SDK / API 生态（`https://api.deepseek.com`）
- **大上下文**：上下文窗口 128K token，默认输出 4K，可配置到 8K
- **轻限流**：官方不设置硬性 rate limit，可自行按 200 ms 节奏节流

## 📊 模型规格

| 模型 | 模式 | 上下文 | 默认输出 | 最大输出 | 价格（输入 cache miss / hit / 输出） |
|------|------|--------|----------|----------|-----------------------------------|
| `deepseek-chat` | 非思考模式（推荐用于翻译） | 128K | 4K | 8K | $0.28 / $0.028 / $0.42 |
> 数据来源：DeepSeek 官方文档（2025-09-29）。
## 🏗️ 架构设计

### 基础配置

| 参数 | 值 | 说明 |
|------|-----|------|
| API 基础地址 | `https://api.deepseek.com` | 兼容 OpenAI SDK，可选 `/v1` |
| 推荐模型 | `deepseek-chat` | DeepSeek-V3.2-Exp 非思考模式 |
| 默认温度 | 内部固定 `1.3` | 不向用户暴露 |
| 输出上限 | 默认 4K，`max_tokens` 可调到 8K | 超过会被截断 |
| 节流建议 | 每批后延迟 ≥ 200 ms | 官方无硬限流，建议自行节流 |

> 响应体包含 `usage.prompt_tokens` / `completion_tokens` / `total_tokens` 字段，可直接记录用量。

### 调用流程

```mermaid
graph LR
    A[准备 API Key / Base URL] --> B[紧急字幕翻译]
    B --> C[批量分组 (≤20 条)]
    C --> D[DeepSeek Chat API]
    D --> E[解析译文 + 统计 token]
    E --> F[延迟 requestDelayMs]
    F -->|下一批| C
    D -.失败.-> G[指数退避 + 重试]
```

## 📝 实现代码

### 1. TypeScript实现（推荐用于Chrome扩展）

```typescript
/**
 * DeepSeek翻译服务实现
 * @file deepseek-translator.ts
 */

interface DeepSeekConfig {
  apiKey: string;           // API密钥
  model: string;            // 模型名称，默认 deepseek-chat
  temperature: number;      // 内部固定 1.3（不暴露给用户）
  maxOutputTokens: number;  // 单次最大输出 token（默认 4000，可提到 8000）
  maxBatchSize: number;     // 单批最大字幕条数（默认 20 ）
  timeout: number;          // 请求超时
  requestDelayMs: number;   // 批次之间的最小延迟（自带节流）
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface DeepSeekResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DeepSeekTranslator {
  private config: DeepSeekConfig = {
    apiKey: '',
    model: 'deepseek-chat',
    temperature: 1.3,
    maxOutputTokens: 8000,
    maxBatchSize: 20,
    timeout: 10000,
    requestDelayMs: 200
  };

  constructor(apiKey: string, customConfig?: Partial<DeepSeekConfig>) {
    this.config = {
      ...this.config,
      apiKey,
      ...customConfig
    };
  }

  /**
   * 构建翻译提示词
   */
  private buildTranslationPrompt(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): DeepSeekMessage[] {
    // 使用明确的分隔符处理批量翻译
    const separator = '\n---\n';
    const combinedText = texts.join(separator);

    return [
      {
        role: 'system',
        content: `You are a professional translator. Translate from ${sourceLang} to ${targetLang}.
                  Keep the same format and structure.
                  If there are multiple texts separated by "---", translate each one and keep the separator.
                  Return ONLY the translation without any explanation.`
      },
      {
        role: 'user',
        content: combinedText
      }
    ];
  }

  /**
   * 调用DeepSeek API
   */
  private async callAPI(messages: DeepSeekMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxOutputTokens,
          stream: false
        } as DeepSeekRequest),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DeepSeek API错误 (${response.status}): ${error}`);
      }

      const data: DeepSeekResponse = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('DeepSeek API返回格式错误');
      }

      console.log(`[DeepSeekTranslator] Token使用: 输入=${data.usage.prompt_tokens}, 输出=${data.usage.completion_tokens}, 总计=${data.usage.total_tokens}`);

      return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('DeepSeek API请求超时');
      }

      throw error;
    }
  }

  /**
   * 批量翻译文本
   */
  public async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<string[]> {
    const results: string[] = [];
    const separator = '\n---\n';

    // 分批处理
    for (let i = 0; i < texts.length; i += this.config.maxBatchSize) {
      const batch = texts.slice(i, i + this.config.maxBatchSize);

      try {
        console.log(`[DeepSeekTranslator] 翻译批次 ${Math.floor(i / this.config.maxBatchSize) + 1}: ${batch.length} 条字幕`);

        const messages = this.buildTranslationPrompt(batch, sourceLang, targetLang);
        const response = await this.callAPI(messages);

        // 分割响应
        const translations = response.split(separator);

        // 验证数量匹配
        if (translations.length !== batch.length) {
          console.warn(`[DeepSeekTranslator] 批次翻译数量不匹配: 期望${batch.length}, 实际${translations.length}`);
          // 降级处理：逐条翻译
          for (const text of batch) {
            const singleTranslation = await this.translateSingle(text, sourceLang, targetLang);
            results.push(singleTranslation);
          }
        } else {
          results.push(...translations.map(t => t.trim()));
        }
      } catch (error) {
        console.error(`[DeepSeekTranslator] 批次翻译失败:`, error);

        // 降级处理：逐条翻译
        for (const text of batch) {
          try {
            const singleTranslation = await this.translateSingle(text, sourceLang, targetLang);
            results.push(singleTranslation);
          } catch (singleError) {
            console.error(`[DeepSeekTranslator] 单条翻译失败:`, singleError);
            results.push(''); // 失败项返回空字符串
          }
        }
      }

      // 批次间延迟
      if (i + this.config.maxBatchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, this.config.requestDelayMs));
      }
    }

    return results;
  }

  /**
   * 翻译单条文本
   */
  public async translateSingle(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `Translate from ${sourceLang} to ${targetLang}. Return only the translation.`
      },
      {
        role: 'user',
        content: text
      }
    ];

    return await this.callAPI(messages);
  }
}
```

### 2. 集成到V4架构

```typescript
/**
 * 集成到two-phase-translator-v4.ts
 */

import { DeepSeekTranslator } from './deepseek-translator';

export class TwoPhaseTranslatorV4 {
  private deepseekTranslator: DeepSeekTranslator | null = null;

  /**
   * 初始化DeepSeek翻译器
   */
  private async initDeepSeekTranslator(): Promise<void> {
    // 从存储获取API Key
    const { deepseekApiKey } = await chrome.storage.local.get('deepseekApiKey');

    if (deepseekApiKey) {
      this.deepseekTranslator = new DeepSeekTranslator(deepseekApiKey, {
        maxBatchSize: 20,
        temperature: 1.3,
        maxOutputTokens: 8000,
        requestDelayMs: 200
      });
    }
  }

  /**
   * 执行翻译
   */
  private async performTranslation(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    service: TranslationServiceType
  ): Promise<{ [id: string]: string }> {
    const results: { [id: string]: string } = {};

    switch (service) {
      case 'deepseek':
        if (!this.deepseekTranslator) {
          await this.initDeepSeekTranslator();
        }

        if (!this.deepseekTranslator) {
          throw new Error('DeepSeek API密钥未配置');
        }

        try {
          const translations = await this.deepseekTranslator.translate(
            texts,
            this.mapLanguageCode(sourceLang, 'deepseek'),
            this.mapLanguageCode(targetLang, 'deepseek')
          );

          texts.forEach((text, index) => {
            results[index.toString()] = translations[index];
          });
        } catch (error) {
          console.error('[TwoPhaseTranslatorV4] DeepSeek翻译失败:', error);
          throw error;
        }
        break;

      // ... 其他翻译服务
    }

    return results;
  }

  /**
   * 语言代码映射
   */
  private mapLanguageCode(code: string, service: 'deepseek' | 'google' | 'microsoft'): string {
    if (service === 'deepseek') {
      // DeepSeek使用标准语言代码
      const mapping: Record<string, string> = {
        'zh-CN': 'Chinese Simplified',
        'zh-TW': 'Chinese Traditional',
        'zh-Hans': 'Chinese Simplified',
        'zh-Hant': 'Chinese Traditional',
        'en': 'English',
        'ja': 'Japanese',
        'ko': 'Korean',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ru': 'Russian',
        'ar': 'Arabic',
        'pt': 'Portuguese'
      };
      return mapping[code] || code;
    }

    // 其他服务的映射...
    return code;
  }
}
```

### 3. Popup设置界面集成

```typescript
/**
 * 添加到popup.ts
 */

// DeepSeek API设置部分
const deepseekSection = document.createElement('div');
deepseekSection.className = 'api-settings-section';
deepseekSection.innerHTML = `
  <div class="setting-group">
    <h3>DeepSeek AI翻译设置</h3>
    <div class="api-key-input">
      <input type="password"
             id="deepseek-api-key"
             placeholder="输入DeepSeek API Key">
      <button id="save-deepseek-key">保存</button>
    </div>
    <div class="api-info">
      <p>🔗 获取API Key：<a href="https://platform.deepseek.com" target="_blank">platform.deepseek.com</a></p>
      <p>✨ 特点：中文翻译质量优秀，上下文 128K token，输出可自定义到 8K token</p>
      <p>⚙️ 内部固定 temperature = 1.3，不向用户暴露</p>
    </div>
  </div>
`;

// 保存API Key
document.getElementById('save-deepseek-key')?.addEventListener('click', async () => {
  const apiKey = (document.getElementById('deepseek-api-key') as HTMLInputElement).value;

  if (apiKey) {
    await chrome.storage.local.set({ deepseekApiKey: apiKey });
    alert('DeepSeek API Key已保存');
  }
});




```

## 🔧 配置选项

### 推荐配置

```javascript
const DEEPSEEK_CONFIG = {
  // API设置
  model: 'deepseek-chat',    // 默认使用非思考模式

  // 批量设置
  maxBatchSize: 20,          // 每批固定 20 条字幕
  requestDelayMs: 200,       // 批次间延迟，防止瞬时拥塞

  // 温度 / 输出
  temperature: 1.3,
  maxOutputTokens: 8000,     // 显式放宽到 8K 输出 token

  // 超时与重试
  timeout: 10000,
  maxRetries: 2,

  // 缓存设置
  cacheEnabled: true,
  cacheDuration: 86_400_000
};
```

## ⚡ 批量策略

- **紧急字幕**：沿用 V4 架构现有的前/后范围配置，紧急请求通常不会触碰 8K 输出上限。
- **批量字幕**：固定每批 20 条字幕，估算输出 token 后设置 `max_tokens = 8000`，若触发截断则缩减批次。
- **分隔符**：使用 `\n---\n` 等唯一标记拼接/拆分字幕，确保响应可按原顺序拆开。
- **节流**：官方无硬限流，仍建议每批结束 `await delay(200)`；若收到 429/网络错误，指数退避后重试。

## ⚠️ 注意事项

### 必要条件
1. **需要API Key**：必须在platform.deepseek.com注册获取
2. **需要付费**：虽然成本极低，但仍需付费（有免费额度）
3. **网络要求**：需要能访问api.deepseek.com

### 最佳实践
1. **批量优化**：
   - 固定每批 20 条字幕，结合 `max_tokens=8000`
   - 使用 `\n---\n` 等唯一分隔符保证可拆分
   - 批次间保持 ≥200 ms 延迟，避免长连接堆积

2. **缓存与使用统计**：
   - 实现翻译缓存，避免重复翻译
   - 利用响应头中的 usage 字段统计 token 和用量

3. **错误处理**：
   - API Key无效：提示用户检查设置
   - 配额用尽：提示用户充值
   - 网络错误：降级到其他翻译服务

4. **质量保证**：
   - Temperature 固定 1.3，保证风格稳定
   - 提供清晰的系统提示词
   - 批量失败时降级到单条翻译

## 📊 性能优化

### 1. 智能批处理

```typescript
// DeepSeek 固定每批 20 条字幕，避免触及 8K 输出上限
function calculateDeepSeekBatchSize(): number {
  return 20;
}
```

### 2. 缓存策略

```typescript
// 实现翻译缓存
class DeepSeekCache {
  private cache = new Map<string, { translation: string; timestamp: number }>();
  private maxAge = 86400000; // 24小时

  generateKey(text: string, from: string, to: string): string {
    return `deepseek_${from}_${to}_${text}`;
  }

  get(text: string, from: string, to: string): string | null {
    const key = this.generateKey(text, from, to);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.maxAge) {
      return cached.translation;
    }

    return null;
  }

  set(text: string, translation: string, from: string, to: string): void {
    const key = this.generateKey(text, from, to);
    this.cache.set(key, { translation, timestamp: Date.now() });
  }
}
```

### 3. 并发控制

```typescript
// 避免并发请求过多
class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private maxConcurrent = 2;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
```

## 🧪 测试验证

### 测试脚本

```bash
# 测试DeepSeek API
curl -X POST https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {
        "role": "system",
        "content": "Translate from English to Chinese Simplified. Return only translation."
      },
      {
        "role": "user",
        "content": "Hello world"
      }
    ],
    "temperature": 1.3
  }'
```

### 预期结果
```json
{
  "id": "chatcmpl-xxx",
  "model": "deepseek-chat",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "你好世界"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 4,
    "total_tokens": 24
  }
}
```

## 🔗 相关文档

- [API文档](../api/api.md#deepseek-ai翻译api)
- [决策日志](./decision-log.md#22-deepseek-ai翻译api集成-2025-09-26)
- [架构设计](../architecture/03-component-design.md)
- [微软翻译实现](./microsoft-translate-implementation.md)

## 📅 更新历史

- **2025-09-29**：核实 DeepSeek-V3.2-Exp 规格，补充 20 条批量策略、温度与节流建议
- **2025-09-26**：创建初始文档，完成API调研和实现设计

---

*本文档将随着实际实现和使用反馈持续更新*
