# Gemini 翻译并发架构设计

## 📋 文档信息

- **创建日期**: 2025-01-15
- **架构版本**: v1.0
- **相关服务**: Google Gemini API (Free & Paid Tiers)
- **并发模式**: 免费层流水线并发 / 付费层真并发
- **批次大小**: 80条/批
- **统一接口**: 是

---

## 🎯 背景与动机

### 当前实现现状

Gemini翻译服务目前采用**串行批量翻译**方式：

```typescript
// 当前实现：串行发送
for (let i = 0; i < texts.length; i += this.modelConfig.batchSize) {
  const batch = texts.slice(i, i + this.modelConfig.batchSize);
  const result = await translateBatch(batch);  // 等待返回后再发送下一批
  results.push(...result);

  // 批次间延迟（仅batch阶段）
  if (stage === 'batch' && i + this.modelConfig.batchSize < texts.length) {
    await delay(this.batchDelay);  // 免费层3000ms（优化后）
  }
}

// 性能问题：
// 免费层：10批 × (3秒延迟 + 1秒响应) = 40秒（优化后）
// 付费层：10批 × (0秒延迟 + 1秒响应) = 10秒
```

**现有优化**：
- ✅ YAML格式（id + text结构，强制一对一对应）
- ✅ 批次大小80条（利用1M token上下文窗口）
- ✅ AbortSignal取消支持
- ✅ 细化错误处理（400/401/403/404/429/500/502/503/504）
- ✅ 动态maxOutputTokens估算
- ❌ 批次间串行等待（性能瓶颈）

### 官方API特性

**核心发现：Gemini免费层和付费层的RPM限制差距100倍**

**Gemini 2.5 Flash & Flash-Lite 官方限制**：

| Tier | RPM | TPM | RPD | 说明 |
|------|-----|-----|-----|------|
| **免费层** | **10** | 250,000 | 250 | 每6秒只能发1个请求（优化：实际3秒/次） |
| **Tier 1（付费）** | **1,000** | 1,000,000 | 10,000 | 每秒可发16.7个请求 |
| Tier 2 | 2,000 | 3,000,000 | 100,000 | 消费$250+ |
| Tier 3（企业） | 10,000 | 8,000,000 | 无限制 | 消费$1000+ |

**关键特性**：

1. **免费层极低RPM限制：10请求/分钟**
   - 10 RPM = 每6秒只能发1个请求
   - **不适合真并发**（即使1并发也会触发429）
   - **适合流水线并发**（延迟发送）

2. **付费层显著提升：1000 RPM**
   - 1000 RPM = 每秒可发16.7个请求
   - **适合真并发**（5-10并发）

3. **无法从API检测tier**
   - API响应无tier字段
   - 响应头无rate limit信息
   - 唯一方式：用户在Popup中手动选择

4. **tier升级条件**：
   - Tier 1：绑定信用卡即可
   - Tier 2：消费$250 + 30天
   - Tier 3：消费$1000 + 30天

### 性能提升潜力

**免费层（流水线并发 vs. 串行）**：
```
串行执行：
  10批 × (3秒延迟 + 1秒响应) = 40秒（优化后）

流水线并发：
  t=0s:  [Batch 1] 发送
  t=3s:  [Batch 2] 发送
  t=6s:  [Batch 3] 发送
  ...
  t=27s: [Batch 10] 发送
  t=28s: [Batch 1] 返回（假设1秒响应）

  总耗时：9批 × 3秒延迟 + 1秒响应 = 28秒
  性能提升：(40 - 28) / 40 = 30%
```

**付费层（真并发 vs. 串行）**：
```
串行执行：
  10批 × 1秒 = 10秒

真并发（5并发）：
  Round 1: [Batch 1-5] 同时发送 → 1秒
  Round 2: [Batch 6-10] 同时发送 → 1秒

  总耗时：2秒
  性能提升：10 / 2 = 5倍
```

---

## 🏗️ 核心概念

### 1. 统一并发架构策略 ⭐

**关键设计理念**：免费和付费都使用并发架构，只是延迟参数不同

**免费层 = 流水线并发（类似Google免费翻译）**
```typescript
{
  enableConcurrentTranslation: true,
  concurrencyLimit: 999,       // 一轮发送所有批次
  requestDelay: 3000           // 每批延迟3秒（优化后）
}

// 执行逻辑：
for (let i = 0; i < batches.length; i++) {
  if (i > 0) await delay(3000);  // 延迟3秒（优化后）
  promises.push(translateBatch(batches[i]));  // 不等待
}
const results = await Promise.all(promises);  // 统一收集

// 特点：
// ✅ 符合10 RPM限制（优化：每3秒发1个请求）
// ✅ 比串行快21%（节省并发等待时间）
// ✅ 复用流水线并发代码
```

**付费层 = 真并发（类似DeepSeek）**
```typescript
{
  enableConcurrentTranslation: true,
  concurrencyLimit: 5,         // 5并发
  requestDelay: 0              // 无延迟
}

// 执行逻辑：
for (let i = 0; i < batches.length; i += concurrency) {
  const group = batches.slice(i, i + concurrency);  // 每轮5批
  const results = await Promise.all(
    group.map(batch => translateBatch(batch))
  );
}

// 特点：
// ✅ 真正同时发送5个请求
// ✅ 性能提升5倍
// ✅ 符合1000 RPM限制（5并发 ≈ 300 RPM）
```

**对比表**：

| 特性 | 免费层（流水线） | 付费层（真并发） |
|-----|---------------|----------------|
| 并发模式 | 流水线并发 | 真并发 |
| `concurrencyLimit` | 999 | 5 |
| `requestDelay` | 3000ms（优化后） | 0ms |
| 请求发送方式 | 延迟发送 | 同时发送 |
| 性能提升 | 21% | 5倍 |
| RPM利用率 | 100%（10 RPM） | 30%（300/1000 RPM） |

### 2. 免费/付费简化策略

**设计决策：只区分 `free` vs `paid`，不区分Tier 1/2/3**

**理由**：

1. **Tier 1已足够**
   - Tier 1的1000 RPM远超我们需求（5并发 ≈ 300 RPM）
   - Tier 2/3的更高RPM对用户价值不大

2. **简化用户选择**
   - Popup中已有"免费/付费"选项
   - 无需复杂的Tier 1/2/3选择

3. **统一配置逻辑**
   ```typescript
   tier: 'free'  → 流水线并发（3秒延迟，优化后）
   tier: 'paid'  → 真并发（5并发）
   ```

4. **无法自动检测tier**
   - Gemini API响应不包含tier信息
   - 用户手动选择是唯一可靠方式

### 3. 流水线并发详解

**流水线并发（Pipeline Concurrency）**：

```typescript
/**
 * 流水线并发执行
 * @param batches 批次数组
 * @param requestDelay 批次间延迟（ms）
 */
async function translateBatchPipeline(batches, requestDelay) {
  const promises = [];

  // Phase 1: 流水线发送（有延迟）
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) {
      await delay(requestDelay);  // 延迟后再发送
    }
    promises.push(translateBatch(batches[i]));  // 不等待返回
  }

  // Phase 2: Promise.all统一收集
  const results = await Promise.all(promises);
  return results;  // 顺序与batches一致
}

// 时间轴示例（10批，3秒延迟，优化后）：
// t=0s:     [Batch 1] 发送
// t=3s:              [Batch 2] 发送
// t=6s:                      [Batch 3] 发送
// ...
// t=27s:                                     [Batch 10] 发送
// t=28s:    [Batch 1] 返回 ← 第1个Promise resolve
// t=31s:             [Batch 2] 返回 ← 第2个Promise resolve
// ...
// t=55s:                                    [Batch 10] 返回 ← 最后一个Promise resolve
```

**与真并发对比**：

| 特性 | 流水线并发 | 真并发 |
|-----|-----------|--------|
| 发送方式 | 延迟发送 | 同时发送 |
| 适用场景 | 免费层（低RPM） | 付费层（高RPM） |
| 性能提升 | 小（21%） | 大（5倍） |
| RPM压力 | 低（符合限制） | 中（需控制并发数） |
| 代码实现 | `translateBatchPipeline` | `translateBatchConcurrent` |

### 4. 分组并发策略（付费层）

当批次数量 > 并发数时，采用**分组并发**：

```typescript
/**
 * 分组真并发执行（付费层）
 * @param batches 总批次数组（如10批）
 * @param concurrency 并发数（如5）
 */
async function executeGroupedConcurrency(batches, concurrency) {
  const results = [];

  // 分成多轮执行：10批 ÷ 5并发 = 2轮
  for (let i = 0; i < batches.length; i += concurrency) {
    const group = batches.slice(i, i + concurrency);  // 每轮5批
    const groupResults = await Promise.all(
      group.map(batch => translateBatch(batch))
    );
    results.push(...groupResults);
  }

  return results;  // 顺序与batches一致
}

// 示例：
// 输入：10批次，并发5
// 执行：
//   Round 1: [0, 1, 2, 3, 4] → 并行执行 → 1000ms
//   Round 2: [5, 6, 7, 8, 9] → 并行执行 → 1000ms
// 总耗时：2000ms（串行需10000ms）
// 性能提升：5x
```

### 5. Promise.all顺序保证

**核心机制**：Promise.all返回的数组顺序与输入Promise数组顺序**严格一致**，与实际完成时间无关。

```typescript
// 即使返回顺序是乱的
const promises = [
  fetch('/api/1'),  // 耗时500ms → 第3个返回
  fetch('/api/2'),  // 耗时100ms → 第1个返回
  fetch('/api/3'),  // 耗时300ms → 第2个返回
];

const results = await Promise.all(promises);

// results数组顺序与promises严格对应：
// results[0] = /api/1的结果
// results[1] = /api/2的结果
// results[2] = /api/3的结果
```

**内部实现原理**：
```typescript
// Promise.all的内部逻辑（简化版）
Promise.all = function(promises) {
  return new Promise((resolve, reject) => {
    const results = new Array(promises.length);  // 预分配数组
    let completed = 0;

    promises.forEach((promise, index) => {
      promise.then(result => {
        results[index] = result;  // 使用index保证顺序
        completed++;
        if (completed === promises.length) {
          resolve(results);
        }
      }).catch(reject);
    });
  });
};
```

---

## 📐 架构设计

### 1. 并发配置

**user-preferences-types.ts 配置**：

```typescript
[TranslationServiceType.GEMINI]: {
  type: TranslationServiceType.GEMINI,
  name: 'Google Gemini',
  model: 'gemini-2.5-flash-lite',
  availableModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  temperature: 0,
  maxTokens: 65536,

  // 用户选择tier（Popup中已有选项）
  tier: 'free',  // 'free' | 'paid'

  // 🔥 并发配置（根据tier运行时设置）
  enableConcurrentTranslation: true,   // 默认启用
  concurrencyLimit: 999,               // 默认免费层（运行时调整）
  requestDelay: 3000,                  // 默认免费层（优化后，运行时调整）

  // ⚠️ 兼容性保留（并发模式下忽略）
  batchDelay: 3000,                    // 优化后
  rpm: 60,
  tpm: 120000
}
```

**Tier配置映射表（代码中硬编码）**：

```typescript
const GEMINI_TIER_CONFIGS = {
  free: {
    rpm: 10,
    tpm: 250000,
    rpd: 250,
    enableConcurrentTranslation: true,
    concurrencyLimit: 999,              // 流水线并发：一轮发送所有批次
    requestDelay: 3000                  // 每批延迟3秒（优化后）
  },
  paid: {
    rpm: 1000,                          // Tier 1的限制
    tpm: 1000000,
    rpd: 10000,
    enableConcurrentTranslation: true,
    concurrencyLimit: 5,                // 真并发：5并发
    requestDelay: 0                     // 无延迟
  }
};

/**
 * 根据tier获取并发配置
 */
function getGeminiConcurrencyConfig(tier: 'free' | 'paid') {
  return GEMINI_TIER_CONFIGS[tier] || GEMINI_TIER_CONFIGS.free;
}
```

**关键设计决策**：

| 配置项 | 免费层 | 付费层 | 理由 |
|-------|-------|--------|------|
| `enableConcurrentTranslation` | `true` | `true` | 统一使用并发接口 |
| `concurrencyLimit` | `999` | `5` | 免费流水线发全部，付费限5并发 |
| `requestDelay` | `3000`（优化后） | `0` | 免费每3秒发1个，付费无延迟 |
| `tier` | 用户选择 | 用户选择 | 无法从API检测，必须手动 |

### 2. 核心逻辑（复用现有）

**TwoPhaseTranslatorV4 并发判断逻辑**：

```typescript
class TwoPhaseTranslatorV4 {
  private static readonly CONCURRENCY_CONFIG = {
    DEEPSEEK: 10,
    OPENAI: 10,
    GEMINI: 5,              // 付费层配置（作为fallback）
    MICROSOFT_FREE: 5,
    DEEPL: 10,
    BATCH_TIMEOUT_MS: 8000
  };

  /**
   * 批量翻译入口（自动选择并发模式）
   */
  public async translateBatch(
    subtitles: SubtitleEntry[],
    config: TranslationConfig
  ): Promise<SubtitleEntry[]> {
    const concurrency = this.getConcurrencyLimit(config);
    const requestDelay = this.getRequestDelay(config);

    // 判断并发模式
    if (concurrency > 0 && requestDelay > 0) {
      // 流水线并发（Google免费、Gemini免费）
      console.log(`[TwoPhaseTranslatorV4] 使用流水线并发模式（并发数: ${concurrency}, 延迟: ${requestDelay}ms）`);
      return this.translateBatchPipeline(subtitles, config, concurrency, requestDelay);
    }

    if (concurrency > 0) {
      // 真并发（DeepSeek, Microsoft, DeepL, Gemini付费, OpenAI）
      console.log(`[TwoPhaseTranslatorV4] 使用真并发模式（并发数: ${concurrency}）`);
      return this.translateBatchConcurrent(subtitles, config, concurrency);
    }

    // 串行（降级方案）
    console.log('[TwoPhaseTranslatorV4] 使用串行模式');
    return this.translateBatchSerial(subtitles, config);
  }

  /**
   * 流水线并发模式（免费层Gemini）
   */
  private async translateBatchPipeline(
    subtitles: SubtitleEntry[],
    config: TranslationConfig,
    concurrency: number,
    requestDelay: number
  ): Promise<SubtitleEntry[]> {
    // 1. 拆分批次
    const batches = this.splitIntoBatches(subtitles, config);

    console.log(`[TwoPhaseTranslatorV4] 流水线并发翻译: ${batches.length}批 | 延迟: ${requestDelay}ms`);

    const promises = [];

    // 2. 流水线发送
    for (let i = 0; i < batches.length; i++) {
      if (i > 0) {
        console.debug(`[debug][TwoPhaseTranslatorV4] 批次延迟: ${requestDelay}ms`);
        await this.delay(requestDelay);
      }

      console.debug(`[debug][TwoPhaseTranslatorV4] 批次${i + 1}: 发送${batches[i].length}条`);
      promises.push(this.executeBatch(batches[i], config, i));
    }

    // 3. Promise.all统一收集
    const results = await Promise.all(promises);
    const allResults = results.flat();

    console.log(`[TwoPhaseTranslatorV4] ✓ 流水线并发完成: ${allResults.length}条`);
    return allResults;
  }

  /**
   * 真并发模式（付费层Gemini）
   */
  private async translateBatchConcurrent(
    subtitles: SubtitleEntry[],
    config: TranslationConfig,
    concurrency: number
  ): Promise<SubtitleEntry[]> {
    const batches = this.splitIntoBatches(subtitles, config);

    console.log(`[TwoPhaseTranslatorV4] 真并发翻译: ${batches.length}批 | 并发: ${concurrency}`);

    const allResults: SubtitleEntry[] = [];

    // 分组并发执行
    for (let i = 0; i < batches.length; i += concurrency) {
      const group = batches.slice(i, i + concurrency);
      const round = Math.floor(i / concurrency) + 1;
      const totalRounds = Math.ceil(batches.length / concurrency);

      console.log(`[TwoPhaseTranslatorV4] Round ${round}/${totalRounds}: 并发${group.length}批`);

      const promises = group.map((batch, index) =>
        this.executeBatch(batch, config, i + index)
      );

      const results = await Promise.all(promises);
      allResults.push(...results.flat());
    }

    console.log(`[TwoPhaseTranslatorV4] ✓ 真并发完成: ${allResults.length}条`);
    return allResults;
  }

  /**
   * 获取并发限制
   */
  private getConcurrencyLimit(config: TranslationConfig): number {
    // 1. 用户自定义（优先级最高）
    if (config.concurrencyLimit !== undefined && config.concurrencyLimit > 0) {
      return config.concurrencyLimit;
    }

    // 2. Gemini特殊处理：根据tier动态设置
    if (config.service === TranslationServiceType.GEMINI) {
      const tierConfig = getGeminiConcurrencyConfig(config.tier || 'free');
      return tierConfig.concurrencyLimit;
    }

    // 3. 服务预设值
    const presetConcurrency = this.CONCURRENCY_CONFIG[config.service];
    if (presetConcurrency !== undefined) {
      return presetConcurrency;
    }

    // 4. 未启用并发
    return 0;
  }

  /**
   * 获取请求延迟
   */
  private getRequestDelay(config: TranslationConfig): number {
    // Gemini特殊处理：根据tier动态设置
    if (config.service === TranslationServiceType.GEMINI) {
      const tierConfig = getGeminiConcurrencyConfig(config.tier || 'free');
      return tierConfig.requestDelay;
    }

    return config.requestDelay ?? 0;
  }
}
```

**关键优势**：
- ✅ 无需新增代码（复用现有流水线并发和真并发逻辑）
- ✅ 根据tier自动选择模式（免费→流水线，付费→真并发）
- ✅ 统一接口（都通过并发架构处理）

### 3. Gemini内部逻辑（无需修改）

**gemini-translator.ts 的translate方法**：

```typescript
export class GeminiTranslator {
  private modelConfig = {
    batchSize: 80,  // 80条/批
    // ...
  };

  /**
   * 翻译文本数组（被外层并发逻辑调用）
   */
  public async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    const results: string[] = [];

    // 分批处理（80条/批）
    for (let i = 0; i < texts.length; i += this.modelConfig.batchSize) {
      const batch = texts.slice(i, i + this.modelConfig.batchSize);

      // 调用Gemini API
      const yamlInput = this.convertToYAML(batch);
      const prompt = this.buildTranslationPrompt(yamlInput, batch.length, sourceLang, targetLang);
      const responseText = await this.callGeminiAPI(prompt, signal, maxOutputTokens);
      const translations = this.parseYAMLResponse(responseText, batch.length);

      results.push(...translations);

      // ⚠️ 批次间延迟（并发模式下被外层控制，这里的延迟会被忽略）
      if (stage === 'batch' && i + this.modelConfig.batchSize < texts.length) {
        await this.delayWithSignal(this.batchDelay, signal);
      }
    }

    return results;
  }
}
```

**并发模式下的执行流程**：

```
外层（TwoPhaseTranslatorV4）：
  免费层流水线：
    批次1: texts[0-79]   → t=0s发送
    批次2: texts[80-159] → t=6s发送
    批次3: texts[160-239] → t=12s发送
    ...
    Promise.all统一收集

  付费层真并发：
    Round 1: [批次1-5] → 同时发送
    Round 2: [批次6-10] → 同时发送

内层（GeminiTranslator）：
  每个批次内部：
    - 构建YAML输入（80条文本）
    - 调用Gemini API
    - 解析YAML响应
    - 返回翻译结果

  ⚠️ 批次间延迟在并发模式下被外层控制
```

### 4. 调试日志

**免费层（流水线并发）日志**：

```typescript
// 1. 并发模式选择
console.log('[TwoPhaseTranslatorV4] 使用流水线并发模式（并发数: 999, 延迟: 3000ms）');  // 优化后

// 2. 批次信息
console.log('[TwoPhaseTranslatorV4] 流水线并发翻译: 10批 | 延迟: 3000ms');  // 优化后

// 3. 每批发送（debug级别）
console.debug('[debug][TwoPhaseTranslatorV4] 批次延迟: 3000ms');  // 优化后
console.debug('[debug][TwoPhaseTranslatorV4] 批次1: 发送80条');
console.log('[GeminiTranslator] → 开始翻译: 80条字幕 (batch阶段)');

// 4. 完成统计
console.log('[TwoPhaseTranslatorV4] ✓ 流水线并发完成: 800条');
```

**付费层（真并发）日志**：

```typescript
// 1. 并发模式选择
console.log('[TwoPhaseTranslatorV4] 使用真并发模式（并发数: 5）');

// 2. 批次信息
console.log('[TwoPhaseTranslatorV4] 真并发翻译: 10批 | 并发: 5');

// 3. 每轮执行
console.log('[TwoPhaseTranslatorV4] Round 1/2: 并发5批');
console.log('[TwoPhaseTranslatorV4] Round 2/2: 并发5批');

// 4. 详细批次（debug级别）
console.debug('[debug][TwoPhaseTranslatorV4] 批次1: 发送80条');
console.log('[GeminiTranslator] → 开始翻译: 80条字幕 (batch阶段)');
console.debug('[debug][TwoPhaseTranslatorV4] 批次1: ✓ 返回80条');

// 5. 完成统计
console.log('[TwoPhaseTranslatorV4] ✓ 真并发完成: 800条');
```

---

## 📊 性能分析

### 1. 理论性能计算

**场景1：800条字幕（80条/批 = 10批），每批1秒**（优化后：3秒延迟）

| 模式 | Tier | 计算公式 | 耗时 | 性能提升 |
|-----|------|---------|------|---------|
| **串行** | 免费 | 10批 × (3秒延迟 + 1秒响应) | **40秒** | - |
| **流水线并发** | 免费 | 9批 × 3秒延迟 + 1秒响应 | **28秒** | **30%** ✅ |
| **串行** | 付费 | 10批 × 1秒 | **10秒** | - |
| **真并发（5并发）** | 付费 | ceil(10 / 5) × 1秒 | **2秒** | **5倍** ⚡ |

**场景2：400条字幕（80条/批 = 5批），每批1秒**（优化后：3秒延迟）

| 模式 | Tier | 计算公式 | 耗时 | 性能提升 |
|-----|------|---------|------|---------|
| 串行 | 免费 | 5批 × (3秒延迟 + 1秒响应) | 20秒 | - |
| 流水线并发 | 免费 | 4批 × 3秒延迟 + 1秒响应 | **13秒** | **35%** ✅ |
| 串行 | 付费 | 5批 × 1秒 | 5秒 | - |
| 真并发（5并发） | 付费 | ceil(5 / 5) × 1秒 | **1秒** | **5倍** ⚡ |

**场景3：160条字幕（80条/批 = 2批），每批1秒**（优化后：3秒延迟）

| 模式 | Tier | 计算公式 | 耗时 | 性能提升 |
|-----|------|---------|------|---------|
| 串行 | 免费 | 2批 × (3秒延迟 + 1秒响应) | 8秒 | - |
| 流水线并发 | 免费 | 1批 × 3秒延迟 + 1秒响应 | **4秒** | **50%** ✅ |
| 串行 | 付费 | 2批 × 1秒 | 2秒 | - |
| 真并发（5并发） | 付费 | ceil(2 / 5) × 1秒 | **1秒** | **2倍** ⚡ |

**关键发现**：
- **免费层流水线并发**：批次越多，性能提升越明显（30%-50%，优化后）
- **付费层真并发**：批次数 ≥ 并发数时，性能提升接近5倍

### 2. RPM利用率分析

**免费层（10 RPM）**：

| 批次数 | 串行耗时 | 流水线耗时 | RPM使用 | RPM利用率 |
|--------|---------|-----------|---------|----------|
| 2批 | 14秒 | 7秒 | 2请求/7秒 ≈ 17 RPM | ❌ 超限 |
| 5批 | 35秒 | 25秒 | 5请求/25秒 ≈ 12 RPM | ❌ 超限 |
| 10批 | 70秒 | 55秒 | 10请求/55秒 ≈ 11 RPM | ❌ 超限 |

⚠️ **重要发现**：免费层流水线并发虽然性能提升，但**可能超过10 RPM限制**！

**修正方案**：
```typescript
// 修正后的免费层配置
free: {
  concurrencyLimit: 999,
  requestDelay: 6000,  // 6秒延迟确保10 RPM

  // 实际RPM计算：
  // N批 × 6秒延迟 = (N-1) × 6 + 响应时间
  // 10批：9 × 6 + 1 = 55秒 → 10/55秒 = 10.9 RPM ⚠️ 略超

  // 安全方案：增加延迟到6.5秒
  requestDelay: 6500   // 确保严格符合10 RPM
}
```

**付费层（1000 RPM）**：

| 并发数 | 批次数 | 耗时 | RPM使用 | RPM利用率 |
|--------|--------|------|---------|----------|
| 5 | 10批 | 2秒 | 10请求/2秒 = 300 RPM | 30% ✅ |
| 5 | 20批 | 4秒 | 20请求/4秒 = 300 RPM | 30% ✅ |
| 10 | 10批 | 1秒 | 10请求/1秒 = 600 RPM | 60% ⚠️ |
| 10 | 20批 | 2秒 | 20请求/2秒 = 600 RPM | 60% ⚠️ |

**结论**：5并发是付费层的最佳选择（30% RPM利用率，留70%安全余量）

### 3. 实际性能预期

**用户体验改善**：

| 字幕数量 | 免费层串行 | 免费层流水线 | 付费层真并发 | 用户感知 |
|---------|-----------|------------|-------------|---------|
| 160条 (2批) | 14秒 | 7秒 | 1秒 | ⭐⭐⭐⭐ 快速 |
| 400条 (5批) | 35秒 | 25秒 | 1秒 | ⭐⭐⭐⭐⭐ 即时 |
| 800条 (10批) | 70秒 | 55秒 | 2秒 | ⭐⭐⭐⭐⭐ 极速 |
| 1600条 (20批) | 140秒 | 110秒 | 4秒 | ⭐⭐⭐⭐⭐ 显著提升 |

**网络波动影响**：
```
假设网络延迟在500-1500ms波动：
- 串行：波动累积（10批 × 波动 = 最差15秒）
- 流水线：波动影响小（并发收集，最差1.5秒）
- 真并发：波动影响最小（1轮 × 波动 = 最差1.5秒）
```

---

## ⚠️ 风险评估

### 1. 风险等级

| 风险类型 | 免费层 | 付费层 | 缓解措施 |
|---------|-------|--------|---------|
| **RPM限制触发429** | 🟡 中 | 🟢 低 | 免费增加延迟到6.5秒，付费5并发=30% RPM |
| **TPM限制触发429** | 🟢 低 | 🟢 低 | 80条/批远低于250K TPM |
| **流水线延迟过长** | 🟡 中 | - | 免费层用户体验稍差（可接受） |
| **并发失败影响多批次** | 🟡 中 | 🟡 中 | Phase 2实现Promise.allSettled |
| **用户tier选择错误** | 🟡 中 | 🟡 中 | 429错误提示检查tier设置 |

### 2. 对比其他服务

| 服务 | 免费层并发 | 付费层并发 | 免费/付费区别 | 风险 |
|-----|-----------|-----------|-------------|------|
| DeepSeek | 10 | 10 | 无区别 | 🟢 极低 |
| Microsoft | 5 | 5 | 无区别 | 🟢 低 |
| DeepL | 10 | 10 | 无区别（QPS相同） | 🟡 中低 |
| **Gemini** | **流水线（999/3秒）** | **真并发（5/0ms）** | **完全不同**⭐ | **🟡 中** |
| Google免费 | 流水线（999/100ms） | - | 无付费版 | 🟡 中 |

**Gemini风险评估**：
- ✅ 付费层风险低于DeepL（5并发 vs 10并发）
- ⚠️ 免费层风险适中（3秒延迟，20 RPM限速）
- ✅ 官方API，低于Google非官方端点风险

### 3. 失败场景处理

**当前设计（Phase 1）**：

```typescript
// Promise.all会在任意一个Promise失败时立即reject
try {
  const results = await Promise.all(promises);
  // 全部成功
} catch (error) {
  // 任意一批失败 → 整个翻译失败
  console.error('[TwoPhaseTranslatorV4] 并发翻译失败', error);

  // 特殊处理429错误
  if (error.status === 429) {
    // 检查是否是tier配置错误
    if (error.details?.quotaId?.includes('FreeTier') && config.tier === 'paid') {
      throw new TranslationError(
        'Gemini账户仍为免费层，请检查设置中的Tier选择',
        'fatal',
        'gemini',
        429
      );
    }

    throw new TranslationError(
      'Gemini请求过于频繁，请稍后重试',
      'retryable',
      'gemini',
      429
    );
  }

  throw error;
}
```

**失败影响**：
- 免费层：1批失败 → 整组失败 → 用户看到错误提示
- 付费层：1批失败 → 整组（5批）失败 → 用户看到错误提示
- 用户体验：明确知道翻译失败，可重试

**未来优化（Phase 2）**：

```typescript
// 使用Promise.allSettled支持部分成功
const results = await Promise.allSettled(promises);

const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');

if (failed.length > 0) {
  console.warn(`[TwoPhaseTranslatorV4] ${failed.length}批失败，尝试重试`);

  // 重试失败批次（仅串行重试1次）
  for (const failedResult of failed) {
    try {
      const retryResult = await this.executeBatch(failedResult.batch);
      succeeded.push({ status: 'fulfilled', value: retryResult });
    } catch (error) {
      console.error('[TwoPhaseTranslatorV4] 重试仍失败', error);

      // 如果是429错误，建议检查tier
      if (error.status === 429 && error.details?.quotaId?.includes('FreeTier')) {
        console.warn('[TwoPhaseTranslatorV4] 建议检查Gemini Tier设置');
      }
    }
  }
}

// 返回所有成功的结果
return succeeded.flatMap(r => r.value);
```

### 4. 429错误特殊处理

**免费层触发条件**：
- RPM超过10（流水线延迟不足6秒）
- TPM超过250K（极少触发）

**付费层触发条件**：
- RPM超过1000（5并发≈300 RPM，很难触发）
- TPM超过1M

**tier配置错误检测**：
```typescript
if (error.status === 429 && error.details?.quotaId?.includes('FreeTier')) {
  // 用户配置为paid，但API返回FreeTier错误
  if (config.tier === 'paid') {
    console.error('[Gemini] Tier配置错误：设置为paid但API返回FreeTier限制');
    throw new TranslationError(
      'Gemini账户tier配置错误\n' +
      '当前设置：付费层\n' +
      'API返回：免费层限制\n' +
      '请在Google AI Studio检查账户状态，或将设置改为免费层',
      'fatal',
      'gemini',
      429
    );
  }
}
```

---

## 🛠️ 实施计划

### Phase 1：基础并发（当前实现）

**目标**：启用Gemini免费/付费双模式并发，验证稳定性

**步骤**：

**1. 修改并发配置**（5分钟）
```typescript
// 文件：src/shared/types/user-preferences-types.ts

[TranslationServiceType.GEMINI]: {
  type: TranslationServiceType.GEMINI,
  name: 'Google Gemini',
  model: 'gemini-2.5-flash-lite',
  availableModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  temperature: 0,
  maxTokens: 65536,

  tier: 'free',  // 用户选择

  // 🔥 新增并发配置（默认免费层）
  enableConcurrentTranslation: true,
  concurrencyLimit: 999,
  requestDelay: 6500,  // 6.5秒确保10 RPM

  batchDelay: 6000,
  rpm: 60,
  tpm: 120000
}
```

**2. 添加tier配置映射**（10分钟）
```typescript
// 文件：src/shared/utils/gemini-tier-config.ts（新建）

export const GEMINI_TIER_CONFIGS = {
  free: {
    rpm: 10,
    tpm: 250000,
    rpd: 250,
    enableConcurrentTranslation: true,
    concurrencyLimit: 999,
    requestDelay: 6500  // 6.5秒确保10 RPM
  },
  paid: {
    rpm: 1000,
    tpm: 1000000,
    rpd: 10000,
    enableConcurrentTranslation: true,
    concurrencyLimit: 5,
    requestDelay: 0
  }
};

export function getGeminiConcurrencyConfig(tier: 'free' | 'paid') {
  return GEMINI_TIER_CONFIGS[tier] || GEMINI_TIER_CONFIGS.free;
}
```

**3. 修改TwoPhaseTranslatorV4**（15分钟）
```typescript
// 文件：src/background/components/two-phase-translator-v4.ts

import { getGeminiConcurrencyConfig } from '@shared/utils/gemini-tier-config';

class TwoPhaseTranslatorV4 {
  private getConcurrencyLimit(config: TranslationConfig): number {
    // Gemini特殊处理
    if (config.service === TranslationServiceType.GEMINI) {
      const tierConfig = getGeminiConcurrencyConfig(config.tier || 'free');
      return tierConfig.concurrencyLimit;
    }

    // ... 其他逻辑
  }

  private getRequestDelay(config: TranslationConfig): number {
    // Gemini特殊处理
    if (config.service === TranslationServiceType.GEMINI) {
      const tierConfig = getGeminiConcurrencyConfig(config.tier || 'free');
      return tierConfig.requestDelay;
    }

    return config.requestDelay ?? 0;
  }
}
```

**4. 测试**（30分钟）

测试场景：

| 场景 | Tier | 字幕数量 | 批次数量 | 预期模式 | 预期耗时 |
|-----|------|---------|---------|---------|---------|
| 小批量免费 | free | 160条 | 2批 | 流水线 | 7秒 |
| 中批量免费 | free | 400条 | 5批 | 流水线 | 25秒 |
| 大批量免费 | free | 800条 | 10批 | 流水线 | 55-60秒 |
| 小批量付费 | paid | 160条 | 2批 | 真并发 | 1秒 |
| 中批量付费 | paid | 400条 | 5批 | 真并发 | 1秒 |
| 大批量付费 | paid | 800条 | 10批 | 真并发 | 2秒 |

**5. 日志验证**（检查点）

期望看到的日志（免费层）：
```
✓ [TwoPhaseTranslatorV4] 使用流水线并发模式（并发数: 999, 延迟: 6500ms）
✓ [TwoPhaseTranslatorV4] 流水线并发翻译: 10批 | 延迟: 6500ms
✓ [debug][TwoPhaseTranslatorV4] 批次延迟: 6500ms
✓ [GeminiTranslator] → 开始翻译: 80条字幕 (batch阶段)
✓ [TwoPhaseTranslatorV4] ✓ 流水线并发完成: 800条
```

期望看到的日志（付费层）：
```
✓ [TwoPhaseTranslatorV4] 使用真并发模式（并发数: 5）
✓ [TwoPhaseTranslatorV4] 真并发翻译: 10批 | 并发: 5
✓ [TwoPhaseTranslatorV4] Round 1/2: 并发5批
✓ [TwoPhaseTranslatorV4] Round 2/2: 并发5批
✓ [TwoPhaseTranslatorV4] ✓ 真并发完成: 800条
```

**6. 提交代码**
```bash
git add src/shared/types/user-preferences-types.ts
git add src/shared/utils/gemini-tier-config.ts  # 新建文件
git add src/background/components/two-phase-translator-v4.ts
git commit -m "feat: 启用Gemini免费/付费双模式并发

主要改动：
1. 免费层：流水线并发（999并发，6.5秒延迟）
   - 性能提升：21%-50%（批次越多越明显）
   - 符合10 RPM限制

2. 付费层：真并发（5并发，无延迟）
   - 性能提升：5倍
   - 符合1000 RPM限制（30%利用率）

3. 统一接口：免费和付费都使用并发架构
   - 复用流水线并发代码（类似Google免费翻译）
   - 复用真并发代码（类似DeepSeek）

4. 简化配置：只区分free/paid（不区分Tier 1/2/3）
   - 用户在Popup手动选择tier
   - 运行时动态应用配置

技术细节：
- 免费层RPM：10请求/分钟 → 6.5秒延迟
- 付费层RPM：1000请求/分钟 → 5并发≈300 RPM
- 批次大小：80条/批（1M token上下文窗口）

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin feature/concurrent-translation
```

**预期成果**：
- ✅ Gemini免费层性能提升21%-50%
- ✅ Gemini付费层性能提升5倍
- ✅ 统一并发接口（无需区分模式）
- ✅ 复用现有代码（零新增核心逻辑）

### Phase 2：容错优化（未来迭代）

**目标**：支持部分成功、tier配置错误检测

**步骤**：

**1. 实现Promise.allSettled**
```typescript
const results = await Promise.allSettled(promises);
const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');
```

**2. 失败批次重试**
```typescript
for (const failed of failedBatches) {
  await retry(failed, maxRetries: 1);
}
```

**3. Tier配置错误检测**
```typescript
if (error.status === 429 && error.details?.quotaId?.includes('FreeTier')) {
  if (config.tier === 'paid') {
    throw new TranslationError('Tier配置错误：设置为paid但API返回FreeTier限制');
  }
}
```

**4. 用户提示优化**
```
"翻译完成：800/850条成功，50条失败（速率限制）
建议：检查Gemini Tier设置或稍后重试"
```

**预期成果**：
- ✅ 部分成功场景下不会全部失败
- ✅ Tier配置错误自动检测
- ✅ 用户体验更友好

### Phase 3：自动tier检测（长期规划）

**目标**：尝试自动检测tier，减少用户配置负担

**步骤**：

**1. 发送探测请求**
```typescript
async function detectTier() {
  try {
    // 快速发送2个请求
    await Promise.all([testRequest(), testRequest()]);
    // 如果成功，说明至少是付费层
    return 'paid';
  } catch (error) {
    if (error.status === 429 && error.details?.quotaId?.includes('FreeTier')) {
      return 'free';
    }
    // 其他错误，默认免费层
    return 'free';
  }
}
```

**2. 缓存tier结果**
```typescript
// 首次使用时检测，缓存结果
const cachedTier = await storage.get('geminiDetectedTier');
if (!cachedTier) {
  const detectedTier = await detectTier();
  await storage.set('geminiDetectedTier', detectedTier);
}
```

**3. 用户可覆盖**
```
Popup提示：
"检测到您的Gemini账户为：付费层
如检测错误，可在设置中手动修改"
```

**预期成果**：
- ✅ 自动检测tier，减少用户操作
- ✅ 检测结果缓存，避免重复探测
- ✅ 用户可手动覆盖

---

## 📚 参考资料

### 官方文档

1. **Gemini API Rate Limits**
   https://ai.google.dev/gemini-api/docs/rate-limits
   - 免费层：10 RPM / 250K TPM / 250 RPD
   - Tier 1：1000 RPM / 1M TPM / 10K RPD
   - Tier升级条件

2. **Gemini API Billing**
   https://ai.google.dev/gemini-api/docs/billing
   - Tier资格条件
   - 消费累计规则

3. **Gemini Models**
   https://ai.google.dev/gemini-api/docs/models/gemini
   - gemini-2.5-flash: 1M token上下文
   - gemini-2.5-flash-lite: 1M token上下文

### 社区资源

1. **Gemini API Free Tier Guide (2025)**
   https://blog.laozhang.ai/api-guides/gemini-api-free-tier/
   - 免费层详细说明
   - 限制对比

2. **Gemini Rate Limits Complete Guide**
   https://blog.laozhang.ai/ai-tools/gemini-api-rate-limits-guide/
   - 各tier详细对比
   - 最佳实践

### 内部文档

1. **12-google-pipeline-concurrent-architecture.md**
   Google流水线并发架构（参考对比）

2. **11-concurrent-translation-architecture.md**
   DeepSeek并发架构（真并发参考）

3. **13-microsoft-concurrent-architecture.md**
   Microsoft真并发架构

4. **14-deepl-concurrent-architecture.md**
   DeepL真并发架构（30条/批参考）

### 代码文件

1. **src/background/components/gemini-translator.ts**
   Gemini翻译器实现（无需修改）

2. **src/background/components/two-phase-translator-v4.ts**
   并发翻译核心逻辑（需修改tier判断）

3. **src/shared/types/user-preferences-types.ts**
   并发配置定义（需添加配置）

4. **src/shared/utils/gemini-tier-config.ts**
   Gemini tier配置映射（需新建）

---

## 🎯 总结

### 核心设计决策

| 维度 | 免费层 | 付费层 | 理由 |
|-----|--------|--------|------|
| **并发模式** | 流水线并发 | 真并发 | RPM差距100倍 |
| **并发数量** | 999 | 5 | 免费发全部，付费限5 |
| **请求延迟** | 6500ms | 0ms | 免费符合10 RPM，付费无限制 |
| **批次大小** | 80条 | 80条 | 1M token上下文窗口 |
| **Tier区分** | free / paid | - | 简化配置，无需Tier 1/2/3 |
| **代码复用** | 100% | 100% | 复用流水线/真并发代码 |

### 性能预期

```
典型场景：800条字幕（10批）

免费层串行：
  10批 × (6秒延迟 + 1秒响应) = 70秒

免费层流水线：
  9批 × 6.5秒延迟 + 1秒响应 = 59.5秒
  性能提升：15% ✅

付费层真并发：
  ceil(10 / 5) × 1秒 = 2秒
  性能提升：35倍 ⚡
```

### 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 免费层RPM超限 | 🟡 中 | 延迟6.5秒确保10 RPM |
| 付费层RPM超限 | 🟢 低 | 5并发=30% RPM，留70%余量 |
| Tier配置错误 | 🟡 中 | 429错误检测FreeTier提示 |
| 并发失败 | 🟡 中 | Phase 2实现容错 |

### 与其他服务对比

| 服务 | 免费模式 | 付费模式 | 免费/付费区别 | 性能提升 |
|-----|---------|---------|-------------|---------|
| DeepSeek | 真并发10 | 真并发10 | 无 | 10x / 10x |
| Microsoft | 真并发5 | 真并发5 | 无 | 5x / 5x |
| DeepL | 真并发10 | 真并发10 | 无（QPS相同） | 10x / 10x |
| **Gemini** | **流水线999/3s** | **真并发5/0ms** | **完全不同**⭐ | **43% / 35x** |
| Google免费 | 流水线999/100ms | - | 无付费版 | 5.3x / - |

### 关键优势

1. ✅ **统一并发接口**：免费和付费都用并发架构
2. ✅ **性能全面提升**：免费21%，付费35倍
3. ✅ **简化配置**：只区分free/paid（不需Tier 1/2/3）
4. ✅ **零新增代码**：完全复用流水线/真并发逻辑
5. ✅ **官方API**：低于Google非官方端点风险
6. ✅ **可回滚**：配置修改简单，可快速关闭并发

### 下一步行动

1. ✅ **立即执行**：修改配置和tier映射（15分钟）
2. ✅ **测试验证**：免费/付费多场景测试（30分钟）
3. ✅ **提交代码**：创建分支并合并（10分钟）
4. ⏳ **监控观察**：生产环境观察1周
5. ⏳ **Phase 2**：实现容错优化（如需要）

---

**文档版本**: v1.0
**最后更新**: 2025-01-15
**维护者**: Claude Code
**状态**: ✅ 设计完成，待实施
