# DeepL 翻译并发架构设计

## 📋 文档信息

- **创建日期**: 2025-01-15
- **架构版本**: v1.0
- **相关服务**: DeepL Translation API (Free & Pro)
- **并发模式**: 真并发 (True Concurrency)
- **并发数量**: 10
- **批次大小**: 30条/批（优化后）
- **请求延迟**: 0ms

---

## 🎯 背景与动机

### 当前实现现状

DeepL翻译服务目前采用**串行批量翻译**方式：

```typescript
// 当前实现：串行发送
for (let i = 0; i < texts.length; i += BATCH_SIZE) {
  const batch = texts.slice(i, i + BATCH_SIZE);
  const result = await translateBatch(batch);  // 等待返回后再发送下一批
  results.push(...result);

  // 批次间延迟
  if (stage === 'batch' && i + BATCH_SIZE < texts.length) {
    await delay(this.batchDelay);  // 50ms
  }
}

// 性能问题：
// 10批次 × 1000ms = 10000ms
```

**现有优化**：
- ✅ 原生批量支持（50条/请求）
- ✅ 双端点架构（免费/付费）
- ✅ AbortSignal取消支持
- ✅ 细化错误处理（403/413/429/456/529）
- ❌ 批次间串行等待（性能瓶颈）

### 官方API特性

**核心发现：DeepL官方API支持并发请求，但有明确的QPS限制**

1. **QPS硬限制**：**50请求/秒**（免费和付费相同）
   - 来源：GitHub Issue #33（DeepL官方回复）
   - 超过50 QPS会触发HTTP 429错误
   - 触发后进入指数退避，可能导致超时

2. **社区验证**：**10并发最佳实践**
   - 15并发：全部超时失败 ❌
   - 10并发：稳定运行（≈26 QPS）✅
   - 留有48%安全余量

3. **请求约束**：
   - 最大请求体：128 KiB（官方限制）
   - 实际安全值：76 KiB（社区测试）
   - 最多文本数：50条/请求（官方限制）

4. **免费/付费一致性**：
   - QPS限制：都是50 QPS
   - 并发策略：完全相同
   - 唯一区别：月度字符配额（500K vs. 1M+）

**API限制对比表**：

| 限制类型 | 免费层 | 付费层 | 来源 |
|---------|-------|--------|------|
| **QPS限制** | **50请求/秒** | **50请求/秒** | GitHub Issue #33（官方） |
| 单次请求文本数 | 50条 | 50条 | 官方文档 |
| 单次请求体大小 | 128 KiB | 128 KiB | 官方文档 |
| 实际安全值 | 76 KiB | 76 KiB | 社区测试 |
| 月度字符配额 | 500,000 | 1,000,000+ | 官方文档 |
| 推荐并发数 | 10 | 10 | 社区验证 |

### 性能提升潜力

**串行执行耗时**：
```
T_serial = N × T_batch
例：10批次 × 1000ms = 10000ms
```

**并发执行耗时**：
```
T_concurrent = ceil(N / C) × T_batch
例：ceil(10 / 10) × 1000ms = 1000ms

性能提升：10000 / 1000 = 10倍
```

---

## 🏗️ 核心概念

### 1. 真并发模式（DeepL采用）

**真并发（Promise.all同时执行）**：
```typescript
// Promise.all真正并行发送
const promises = batches.map(batch => translateBatch(batch));
const results = await Promise.all(promises);  // 并行等待

// 时间轴：
// t=0ms:    [Batch1] [Batch2] [Batch3] ... [Batch10]  ← 同时发送
// t=1000ms: [Result1][Result2][Result3]...[Result10]  ← 同时返回

// 特点：
// ✅ 请求真正同时发送
// ✅ 性能最大化（10x提升）
// ✅ 适用于官方API（有QPS限制）
// ⚠️ 需要控制并发数（避免超过50 QPS）
```

**流水线并发（Google采用，DeepL不需要）**：
```typescript
// 有延迟地发送，避免同时到达
for (let i = 0; i < batches.length; i++) {
  if (i > 0) await delay(100);  // 延迟100ms
  promises.push(translateBatch(batches[i]));  // 不等待
}
const results = await Promise.all(promises);

// 时间轴：
// t=0ms:    [Batch1]
// t=100ms:         [Batch2]
// t=200ms:                [Batch3]
// t=1000ms: [Result1]
// t=1100ms:        [Result2]
// t=1200ms:               [Result3]

// 特点：
// ⚠️ 假并发（避免被识别为机器人）
// ⚠️ 适用于非官方端点（如Google免费翻译）
// ✅ DeepL是官方API，不需要这种模式
```

**DeepL为什么选择真并发**：
1. ✅ 官方API，不会被识别为机器人
2. ✅ 有明确的50 QPS限制（可控）
3. ✅ 社区验证10并发稳定
4. ✅ 性能最大化（10倍提升）

### 2. 分组并发策略

当批次数量 > 并发数时，采用**分组并发**：

```typescript
/**
 * 分组并发执行
 * @param batches 总批次数组（如20批）
 * @param concurrency 并发数（如10）
 * @returns 所有批次的翻译结果（顺序一致）
 */
async function executeGroupedConcurrency(batches, concurrency) {
  const results = [];

  // 分成多轮执行：20批 ÷ 10并发 = 2轮
  for (let i = 0; i < batches.length; i += concurrency) {
    const group = batches.slice(i, i + concurrency);  // 每轮10批
    const groupResults = await Promise.all(
      group.map(batch => translateBatch(batch))
    );
    results.push(...groupResults);
  }

  return results;  // 顺序与batches一致
}

// 示例：
// 输入：20批次，并发10
// 执行：
//   Round 1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] → 并行执行 → 1000ms
//   Round 2: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] → 并行执行 → 1000ms
// 总耗时：2000ms（串行需20000ms）
// 性能提升：10x
```

### 3. QPS控制机制

**50 QPS限制分析**：

```typescript
// 并发数与QPS的关系
QPS = 并发数 / 单次请求耗时

假设单次请求耗时：1秒

并发1:  QPS = 1 / 1 = 1
并发5:  QPS = 5 / 1 = 5
并发10: QPS = 10 / 1 = 10  ✅ 推荐
并发20: QPS = 20 / 1 = 20
并发50: QPS = 50 / 1 = 50  ⚠️ 极限值
并发60: QPS = 60 / 1 = 60  ❌ 超限，触发429
```

**10并发的选择理由**：

| 并发数 | 理论QPS | QPS利用率 | 安全余量 | 社区验证 | 性能提升 | 推荐度 |
|--------|---------|----------|---------|---------|---------|--------|
| 5 | 5 | 10% | 90% | ✅ | 5x | 🟡 过于保守 |
| **10** | **10** | **20%** | **80%** | **✅** | **10x** | **🟢 推荐** |
| 15 | 15 | 30% | 70% | ❌ 超时 | 15x | 🔴 不稳定 |
| 20 | 20 | 40% | 60% | ❌ | 20x | 🔴 风险高 |

**关键发现**：
- 10并发 ≈ 10-26 QPS（取决于请求耗时）
- 远低于50 QPS限制
- 留有80%安全余量
- 社区GitHub Issue #33验证稳定

### 4. 批次大小优化：50条 → 30条

**为什么减少批次大小**：

**原因1：降低单次失败影响**
```
50条/批：单批失败 → 损失50条翻译
30条/批：单批失败 → 损失30条翻译（减少40%损失）
```

**原因2：降低76 KiB超限风险**
```
50条/批：
  安全阈值 = 62,259字符 ÷ 50 = 1,245字符/条
  超过1,245字符/条会触发413错误

30条/批：
  安全阈值 = 62,259字符 ÷ 30 = 2,075字符/条  ✅ 提升67%
  更大的安全余量
```

**原因3：更细粒度的并发控制**
```
场景：100条字幕

50条/批：
  100 ÷ 50 = 2批
  并发10时只能同时处理2批（并发度低）

30条/批：
  100 ÷ 30 = 4批
  并发10时可以同时处理4批（并发度更高）
```

**性能影响分析**：

```
场景1：150条字幕

50条/批 + 10并发：
  150 ÷ 50 = 3批
  ceil(3 / 10) = 1轮
  耗时：1000ms

30条/批 + 10并发：
  150 ÷ 30 = 5批
  ceil(5 / 10) = 1轮
  耗时：1000ms  ✅ 相同

场景2：300条字幕

50条/批 + 10并发：
  300 ÷ 50 = 6批
  ceil(6 / 10) = 1轮
  耗时：1000ms

30条/批 + 10并发：
  300 ÷ 30 = 10批
  ceil(10 / 10) = 1轮
  耗时：1000ms  ✅ 相同

场景3：600条字幕

50条/批 + 10并发：
  600 ÷ 50 = 12批
  ceil(12 / 10) = 2轮
  耗时：2000ms

30条/批 + 10并发：
  600 ÷ 30 = 20批
  ceil(20 / 10) = 2轮
  耗时：2000ms  ✅ 相同

场景4：900条字幕

50条/批 + 10并发：
  900 ÷ 50 = 18批
  ceil(18 / 10) = 2轮
  耗时：2000ms

30条/批 + 10并发：
  900 ÷ 30 = 30批
  ceil(30 / 10) = 3轮
  耗时：3000ms  ⚠️ 慢1秒（但字幕很少超过900条）
```

**76 KiB安全性对比**：

| 批次大小 | 每条安全阈值 | 典型字幕 | 超长字幕 | 风险评估 |
|---------|------------|---------|---------|---------|
| 50条 | 1,245字符/条 | ✅ 安全（50-200字符） | ⚠️ 风险（500+字符） | 🟡 中低 |
| **30条** | **2,075字符/条** | **✅ 安全** | **✅ 安全（500-1000字符）** | **🟢 低** |

**结论**：30条/批在绝大多数场景下性能相同，但更安全、更灵活！

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

**测试验证**：可使用 `/test-deepseek-concurrent.html` 工具验证（已在DeepSeek并发中测试通过）。

---

## 📐 架构设计

### 1. 并发配置

**user-preferences-types.ts 配置**：

```typescript
[TranslationServiceType.DEEPL]: {
  type: TranslationServiceType.DEEPL,
  name: 'DeepL',
  model: 'latency_optimized',
  availableModels: ['latency_optimized', 'quality_optimized', 'prefer_quality_optimized'],
  temperature: null,
  maxTokens: null,
  rpm: null,                            // 官方未公布RPM
  tpm: null,                            // 按字符计费，无TPM

  // DeepL特有参数
  tier: 'free',                         // 'free' | 'pro'
  formality: 'default',
  splitSentences: "0",
  preserveFormatting: false,
  showBilledCharacters: true,

  // 🔥 并发配置（新增）
  enableConcurrentTranslation: true,    // 启用并发
  concurrencyLimit: 10,                 // 10并发（社区验证）
  requestDelay: 0,                      // 真并发（无延迟）

  // ⚠️ 兼容性保留（并发模式下忽略）
  batchDelay: 50                        // 串行模式下的延迟
}
```

**关键设计决策**：

| 配置项 | 值 | 理由 |
|-------|-----|------|
| `enableConcurrentTranslation` | `true` | 启用真并发模式 |
| `concurrencyLimit` | `10` | 社区验证稳定值，26 QPS < 50 QPS |
| `requestDelay` | `0` | 真并发无需延迟（非流水线） |
| `tier` | `'free'` / `'pro'` | **不影响并发策略**（QPS限制相同） |
| `batchDelay` | `50` | 兼容性保留（串行模式下使用） |

**免费/付费统一策略** ⭐：

```typescript
// ✅ 新设计：免费和付费的并发策略完全一致
[TranslationServiceType.DEEPL]: {
  tier: 'free',  // 用户选择，但不影响并发配置
  enableConcurrentTranslation: true,  // 免费/付费都启用
  concurrencyLimit: 10,               // 免费/付费都是10
  requestDelay: 0                     // 免费/付费都是真并发
}

// ❌ 旧设计（废弃）：区分免费/付费延迟
batchDelay: tier === 'free' ? 1000 : 200
```

**理由**：
- 官方QPS限制相同（都是50 QPS）
- 社区验证结果相同（10并发稳定）
- 简化配置逻辑

### 2. 批次大小修改

**deepl-translator.ts 修改**：

```typescript
export class DeepLTranslator {
  // 🔥 修改批次大小：50 → 30
  private static readonly BATCH_SIZE = 30;  // 从50改为30

  // 其他常量不变
  private static readonly FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate';
  private static readonly PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';
  private static readonly FREE_BATCH_DELAY_MS = 50;
  private static readonly PRO_BATCH_DELAY_MS = 50;

  // ... 其余代码无需修改
}
```

**影响范围**：
```typescript
// 所有使用BATCH_SIZE的地方自动生效：
for (let i = 0; i < texts.length; i += DeepLTranslator.BATCH_SIZE) {
  const batch = texts.slice(i, i + DeepLTranslator.BATCH_SIZE);  // 自动改为30条
  // ...
}
```

### 3. 核心逻辑（复用现有）

**TwoPhaseTranslatorV4 并发判断逻辑**：

```typescript
class TwoPhaseTranslatorV4 {
  private static readonly CONCURRENCY_CONFIG = {
    DEEPSEEK: 10,
    OPENAI: 10,
    GEMINI: 5,
    MICROSOFT_FREE: 5,
    DEEPL: 10,  // 🔥 DeepL配置（自动读取）
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
      // 流水线并发（Google）
      console.log(`[TwoPhaseTranslatorV4] 使用流水线并发模式（并发数: ${concurrency}, 延迟: ${requestDelay}ms）`);
      return this.translateBatchPipeline(subtitles, config, concurrency, requestDelay);
    }

    if (concurrency > 0) {
      // 真并发（DeepSeek, Microsoft, DeepL, OpenAI, Gemini）
      console.log(`[TwoPhaseTranslatorV4] 使用真并发模式（并发数: ${concurrency}）`);
      return this.translateBatchConcurrent(subtitles, config, concurrency);
    }

    // 串行（降级方案）
    console.log('[TwoPhaseTranslatorV4] 使用串行模式');
    return this.translateBatchSerial(subtitles, config);
  }

  /**
   * 真并发模式（Promise.all）
   */
  private async translateBatchConcurrent(
    subtitles: SubtitleEntry[],
    config: TranslationConfig,
    concurrency: number
  ): Promise<SubtitleEntry[]> {
    // 1. 调用DeepL的translate方法获取批次
    // DeepL内部会按30条/批拆分
    const batches = this.splitIntoBatches(subtitles, config);

    console.log(`[TwoPhaseTranslatorV4] 真并发翻译: ${batches.length}批 | 并发: ${concurrency}`);

    // 2. 分组并发执行
    const allResults: SubtitleEntry[] = [];

    for (let i = 0; i < batches.length; i += concurrency) {
      const group = batches.slice(i, i + concurrency);
      const round = Math.floor(i / concurrency) + 1;
      const totalRounds = Math.ceil(batches.length / concurrency);

      console.log(`[TwoPhaseTranslatorV4] Round ${round}/${totalRounds}: 并发${group.length}批`);

      // Promise.all并行执行
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

    // 2. 服务预设值
    const serviceType = config.service;
    const presetConcurrency = this.CONCURRENCY_CONFIG[serviceType];

    if (presetConcurrency !== undefined) {
      return presetConcurrency;
    }

    // 3. 配置启用但无限制值
    if (config.enableConcurrentTranslation === true) {
      return 0;  // 串行降级
    }

    // 4. 未启用并发
    return 0;
  }
}
```

**关键优势**：
- ✅ 无需新增代码（复用DeepSeek架构）
- ✅ 自动选择真并发模式（`requestDelay = 0`）
- ✅ 支持分组并发（20批 → 2轮×10并发）
- ✅ DeepL内部自动按30条/批拆分

### 4. DeepL内部拆分逻辑

**deepl-translator.ts 的translate方法**：

```typescript
export class DeepLTranslator {
  private static readonly BATCH_SIZE = 30;  // 🔥 修改为30

  /**
   * 批量翻译文本（支持 AbortSignal 和两阶段翻译）
   */
  public async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    const results: string[] = [];

    // 分批处理（30 条/批）
    for (let i = 0; i < texts.length; i += DeepLTranslator.BATCH_SIZE) {
      if (signal.aborted) {
        throw new DOMException('DeepL 翻译已取消', 'AbortError');
      }

      const batch = texts.slice(i, i + DeepLTranslator.BATCH_SIZE);  // 30条

      console.log(
        `[DeepLTranslator] → 翻译批次 ${Math.floor(i / DeepLTranslator.BATCH_SIZE) + 1}: ` +
        `${batch.length}条 | ${this.tier} | ${stage}阶段`
      );

      // 调用 DeepL API
      const response = await this.callAPI(batch, sourceLang, targetLang, signal);
      const translations = response.translations.map(t => t.text);

      // 验证数量匹配
      if (translations.length !== batch.length) {
        throw new TranslationError(
          `DeepL 翻译数量不匹配：期望${batch.length}条，实际${translations.length}条`,
          'retryable',
          'deepl'
        );
      }

      results.push(...translations);

      // 批次间延迟（仅 batch 阶段，串行模式）
      // ⚠️ 并发模式下，外层Promise.all控制并发，这里的延迟被忽略
      if (stage === 'batch' && i + DeepLTranslator.BATCH_SIZE < texts.length) {
        console.debug(`[debug][DeepLTranslator] 批次间延迟 ${this.batchDelay}ms`);
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
  批次1: texts[0-29]   ┐
  批次2: texts[30-59]  │
  批次3: texts[60-89]  ├─ Promise.all并发执行
  ...                  │
  批次10: texts[270-299]┘

内层（DeepLTranslator）：
  每个批次内部：
    - 构建请求体（30条文本）
    - 调用DeepL API
    - 验证返回数量
    - 返回翻译结果

  ⚠️ 批次间延迟在并发模式下被忽略
```

### 5. 调试日志

**关键日志输出**：

```typescript
// 1. 并发模式选择
console.log('[TwoPhaseTranslatorV4] 使用真并发模式（并发数: 10）');

// 2. 批次信息
console.log('[TwoPhaseTranslatorV4] 真并发翻译: 20批 | 并发: 10');

// 3. 每轮执行
console.log('[TwoPhaseTranslatorV4] Round 1/2: 并发10批');
console.log('[TwoPhaseTranslatorV4] Round 2/2: 并发10批');

// 4. 详细批次（debug级别）
console.debug('[debug][TwoPhaseTranslatorV4] 批次1: 发送30条');
console.log('[DeepLTranslator] → 翻译批次 1: 30条 | free | batch阶段');
console.debug('[debug][TwoPhaseTranslatorV4] 批次1: ✓ 返回30条');

// 5. 计费信息
console.log('[DeepLTranslator] 💰 计费字符数: 1,245');

// 6. 完成统计
console.log('[TwoPhaseTranslatorV4] ✓ 真并发完成: 600条');
```

**完整日志示例**（600条字幕）：

```
[TwoPhaseTranslatorV4] 使用真并发模式（并发数: 10）
[TwoPhaseTranslatorV4] 真并发翻译: 20批 | 并发: 10
[TwoPhaseTranslatorV4] Round 1/2: 并发10批
[debug][TwoPhaseTranslatorV4] 批次1: 发送30条
[DeepLTranslator] → 翻译批次 1: 30条 | free | batch阶段
[debug][TwoPhaseTranslatorV4] 批次2: 发送30条
[DeepLTranslator] → 翻译批次 2: 30条 | free | batch阶段
... (批次3-10同时发送)
[debug][TwoPhaseTranslatorV4] 批次1: ✓ 返回30条
[DeepLTranslator] 💰 计费字符数: 1,245
[debug][TwoPhaseTranslatorV4] 批次2: ✓ 返回30条
... (批次3-10陆续返回)
[TwoPhaseTranslatorV4] Round 2/2: 并发10批
[debug][TwoPhaseTranslatorV4] 批次11: 发送30条
... (批次11-20同时发送)
[TwoPhaseTranslatorV4] ✓ 真并发完成: 600条
```

---

## 📊 性能分析

### 1. 理论性能计算

**场景1：10批次（300条字幕），每批1秒**

| 模式 | 计算公式 | 耗时 | 性能提升 |
|-----|---------|------|---------|
| 串行 | 10 × 1000ms | 10000ms | - |
| 并发10 | ceil(10 / 10) × 1000ms | 1000ms | **10x** |

**场景2：20批次（600条字幕），每批800ms**

| 模式 | 计算公式 | 耗时 | 性能提升 |
|-----|---------|------|---------|
| 串行 | 20 × 800ms | 16000ms | - |
| 并发10 | ceil(20 / 10) × 800ms | 1600ms | **10x** |

**场景3：30批次（900条字幕），每批1000ms**

| 模式 | 计算公式 | 耗时 | 性能提升 |
|-----|---------|------|---------|
| 串行 | 30 × 1000ms | 30000ms | - |
| 并发10 | ceil(30 / 10) × 1000ms | 3000ms | **10x** |

**场景4：5批次（150条字幕），每批1200ms**

| 模式 | 计算公式 | 耗时 | 性能提升 |
|-----|---------|------|---------|
| 串行 | 5 × 1200ms | 6000ms | - |
| 并发10 | ceil(5 / 10) × 1200ms | 1200ms | **5x** |

**关键发现**：
- 批次数 ≥ 并发数（10批）：性能提升接近10x
- 批次数 < 并发数（5批）：性能提升 = 批次数（5x）
- 并发数越大，性能提升越明显（但受QPS限制）

### 2. 批次大小对比（30条 vs. 50条）

**场景：300条字幕，每批1000ms**

| 批次大小 | 批次数量 | 并发轮数 | 耗时 | 性能差异 |
|---------|---------|---------|------|---------|
| 50条 | 300 ÷ 50 = 6批 | ceil(6 / 10) = 1轮 | 1000ms | - |
| **30条** | **300 ÷ 30 = 10批** | **ceil(10 / 10) = 1轮** | **1000ms** | **相同** ✅ |

**场景：600条字幕，每批1000ms**

| 批次大小 | 批次数量 | 并发轮数 | 耗时 | 性能差异 |
|---------|---------|---------|------|---------|
| 50条 | 600 ÷ 50 = 12批 | ceil(12 / 10) = 2轮 | 2000ms | - |
| **30条** | **600 ÷ 30 = 20批** | **ceil(20 / 10) = 2轮** | **2000ms** | **相同** ✅ |

**场景：900条字幕，每批1000ms**

| 批次大小 | 批次数量 | 并发轮数 | 耗时 | 性能差异 |
|---------|---------|---------|------|---------|
| 50条 | 900 ÷ 50 = 18批 | ceil(18 / 10) = 2轮 | 2000ms | - |
| **30条** | **900 ÷ 30 = 30批** | **ceil(30 / 10) = 3轮** | **3000ms** | **慢1秒** ⚠️ |

**结论**：
- ✅ 绝大多数场景（<900条字幕）：性能相同
- ⚠️ 极端场景（900+条字幕）：30条/批略慢（但字幕很少超过900条）
- ✅ 安全性提升67%（每条阈值从1245→2075字符）

### 3. 实际性能预期

**用户体验改善**：

| 字幕数量 | 批次数量 | 原始耗时 | 优化后耗时 | 性能提升 | 用户感知 |
|---------|---------|---------|-----------|---------|---------|
| 60条 | 2批 | 2秒 | <1秒 | 2x | ⭐⭐⭐⭐ 快速 |
| 150条 | 5批 | 5秒 | 1秒 | 5x | ⭐⭐⭐⭐⭐ 即时 |
| 300条 | 10批 | 10秒 | 1秒 | 10x | ⭐⭐⭐⭐⭐ 极速 |
| 600条 | 20批 | 20秒 | 2秒 | 10x | ⭐⭐⭐⭐⭐ 显著提升 |
| 900条 | 30批 | 30秒 | 3秒 | 10x | ⭐⭐⭐⭐⭐ 可接受 |

**网络波动影响**：
```
假设网络延迟在500-1500ms波动：
- 串行：波动累积（10批 × 波动 = 最差15秒）
- 并发10：波动影响小（1轮 × 波动 = 最差1.5秒）
```

### 4. QPS监控

**10并发的QPS分布**：

| 单次请求耗时 | 实际QPS | QPS利用率 | 安全余量 | 状态 |
|------------|---------|----------|---------|------|
| 2000ms (慢) | 10 / 2 = 5 | 10% | 90% | 🟢 非常安全 |
| 1000ms (正常) | 10 / 1 = 10 | 20% | 80% | 🟢 安全 |
| 500ms (快) | 10 / 0.5 = 20 | 40% | 60% | 🟡 中等 |
| 200ms (极快) | 10 / 0.2 = 50 | 100% | 0% | 🔴 极限 |

**关键发现**：
- 正常网络（1秒/请求）：QPS = 10，远低于50限制 ✅
- 快速网络（500ms/请求）：QPS = 20，仍有60%余量 ✅
- 极端情况（200ms/请求）：QPS = 50，触及极限 ⚠️

**缓解措施**：
- Phase 2：监控429错误频率
- 如频繁触发429：自动降级为5并发
- 用户可手动调整并发数

---

## ⚠️ 风险评估

### 1. 风险等级

| 风险类型 | 等级 | 说明 | 缓解措施 |
|---------|-----|------|---------|
| **50 QPS限制触发429** | 🟡 中低 | 10并发≈10-26 QPS，留有余量 | 监控429频率，可降为5并发 |
| **76 KiB请求体超限** | 🟢 低 | 30条/批，阈值2075字符/条 | Phase 2添加预检查 |
| **并发失败影响多批次** | 🟡 中 | Promise.all一批失败→全组失败 | Phase 2实现Promise.allSettled |
| **免费配额消耗过快** | 🟢 低 | 并发不增加字符消耗 | 显示计费字符数监控 |
| **网络抖动** | 🟢 低 | 并发减少整体耗时 | 超时8秒自动中止 |

### 2. 对比其他服务

| 服务 | 并发模式 | 并发数 | QPS限制 | 请求体限制 | 风险等级 |
|-----|---------|-------|--------|-----------|---------|
| DeepSeek | 真并发 | 10 | 无 | 无 | 🟢 极低 |
| Microsoft | 真并发 | 5 | 无（字符限流） | 50,000字符 | 🟢 低 |
| **DeepL** | **真并发** | **10** | **50 QPS** | **76 KiB** | **🟡 中低** |
| Google | 流水线 | 999 | 未知 | 未知 | 🟡 中 |
| OpenAI | 真并发 | 10 | TPM限制 | Token限制 | 🟢 低 |
| Gemini | 真并发 | 5 | 60 RPM | Token限制 | 🟢 低 |

**DeepL风险评估**：
- ✅ 官方API，低于Google非官方端点风险
- ✅ 明确的QPS限制，可控
- ⚠️ 高于DeepSeek/Microsoft（无QPS限制）
- ✅ 社区验证10并发稳定

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
    throw new TranslationError(
      'DeepL请求过于频繁，请稍后重试或降低并发数',
      'retryable',
      'deepl',
      429
    );
  }

  throw error;
}
```

**失败影响**：
- 1批失败 → 整组（10批）失败 → 用户看到错误提示
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

      // 如果是429错误，建议降低并发
      if (error.status === 429) {
        console.warn('[TwoPhaseTranslatorV4] 建议降低并发数至5');
      }
    }
  }
}

// 返回所有成功的结果
return succeeded.flatMap(r => r.value);
```

### 4. 429错误特殊处理

**触发条件**：
- QPS超过50
- 10并发 + 极快网络（<200ms/请求）可能触发

**检测机制**：
```typescript
private handle429Error(error: TranslationError) {
  // 记录429错误
  console.error('[DeepLTranslator] ⚠️ 触发速率限制（429）');
  console.warn('[DeepLTranslator] 当前并发数: 10，建议降为5');

  // Phase 2: 自动降级
  this.autoReduceConcurrency();
}
```

**用户提示**：
```
❌ DeepL翻译失败：请求过于频繁

建议：
1. 点击重试按钮（系统会自动降低并发数）
2. 或在设置中手动调整并发数为5
3. 或稍等片刻再试（速率限制1分钟后重置）
```

---

## 🛠️ 实施计划

### Phase 1：基础并发（当前实现）

**目标**：启用DeepL真并发，优化批次大小，验证稳定性

**步骤**：

**1. 修改批次大小**（2分钟）
```typescript
// 文件：src/background/components/deepl-translator.ts
// 第69行

// 修改前
private static readonly BATCH_SIZE = 50;

// 修改后
private static readonly BATCH_SIZE = 30;  // 🔥 从50改为30
```

**2. 修改并发配置**（3分钟）
```typescript
// 文件：src/shared/types/user-preferences-types.ts

[TranslationServiceType.DEEPL]: {
  type: TranslationServiceType.DEEPL,
  name: 'DeepL',
  model: 'latency_optimized',
  availableModels: ['latency_optimized', 'quality_optimized', 'prefer_quality_optimized'],
  temperature: null,
  maxTokens: null,
  rpm: null,
  tpm: null,

  tier: 'free',
  formality: 'default',
  splitSentences: "0",
  preserveFormatting: false,
  showBilledCharacters: true,

  // 🔥 新增并发配置
  enableConcurrentTranslation: true,
  concurrencyLimit: 10,
  requestDelay: 0,

  batchDelay: 50
}
```

**3. 验证逻辑**（无需修改）
- 确认 `TwoPhaseTranslatorV4.translateBatch` 会自动选择真并发模式
- 确认 `getConcurrencyLimit` 能正确读取配置

**4. 测试**（30分钟）

测试场景：

| 场景 | 字幕数量 | 批次数量 | 预期耗时 | 验证点 |
|-----|---------|---------|---------|--------|
| 小批量 | 60条 | 2批 | <1秒 | 基本并发功能 |
| 中批量 | 300条 | 10批 | 1秒 | 分组并发（1轮×10） |
| 大批量 | 600条 | 20批 | 2秒 | 分组并发（2轮×10） |
| 超大批量 | 900条 | 30批 | 3秒 | 多轮并发（3轮×10） |
| 网络波动 | 300条 | 10批 | 1-2秒 | 超时机制 |

**5. 日志验证**（检查点）

期望看到的日志：
```
✓ [TwoPhaseTranslatorV4] 使用真并发模式（并发数: 10）
✓ [TwoPhaseTranslatorV4] 真并发翻译: 10批 | 并发: 10
✓ [TwoPhaseTranslatorV4] Round 1/1: 并发10批
✓ [DeepLTranslator] → 翻译批次 1: 30条 | free | batch阶段
✓ [DeepLTranslator] 💰 计费字符数: 1,245
✓ [TwoPhaseTranslatorV4] ✓ 真并发完成: 300条
```

**6. 提交代码**
```bash
git add src/background/components/deepl-translator.ts
git add src/shared/types/user-preferences-types.ts
git commit -m "feat: 启用DeepL真并发（10并发）+ 优化批次大小（30条）

主要改动：
1. 批次大小优化：50条 → 30条
   - 降低单次失败影响（40%）
   - 提升76 KiB安全阈值（67%：1245→2075字符/条）
   - 更细粒度并发控制

2. 并发配置：enableConcurrentTranslation=true, concurrencyLimit=10
   - 模式：真并发（复用DeepSeek架构）
   - 性能：10x提升
   - QPS：10-26 QPS（留48%安全余量）
   - 免费/付费：统一策略（QPS限制相同）

3. 风险评估：
   - 50 QPS限制：🟡 中低（社区验证10并发稳定）
   - 76 KiB限制：🟢 低（30条/批，阈值2075字符）
   - 并发失败：🟡 中（Phase 2优化）

技术细节：
- 社区验证：GitHub Issue #33（10并发稳定）
- 零新增代码（完全复用架构）
- 免费/付费统一配置

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin feature/concurrent-translation
```

**预期成果**：
- ✅ DeepL翻译性能提升10倍
- ✅ 批次大小更安全（30条）
- ✅ 无需新增代码（复用现有架构）
- ✅ 免费/付费统一策略

### Phase 2：容错优化（未来迭代）

**目标**：支持部分成功、429自动降级

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

**3. 429自动降级**
```typescript
if (error.status === 429) {
  this.concurrencyLimit = Math.max(1, this.concurrencyLimit - 5);
  console.warn(`[DeepL] 降低并发数至: ${this.concurrencyLimit}`);
}
```

**4. 76 KiB预检查**
```typescript
const estimatedSize = JSON.stringify(requestBody).length;
if (estimatedSize > 76 * 1024) {
  // 自动减少批次大小
  const reducedBatchSize = Math.floor(BATCH_SIZE * 0.7);
}
```

**5. 用户提示优化**
```
"翻译完成：300/320条成功，20条失败（速率限制）"
```

**预期成果**：
- ✅ 部分成功场景下不会全部失败
- ✅ 429自动降级，用户无感知
- ✅ 76 KiB自动处理
- ✅ 用户体验更友好

### Phase 3：智能优化（长期规划）

**目标**：动态并发、QPS监控、性能仪表板

**步骤**：

**1. 网络监测**
```typescript
const latency = measureLatency();
const concurrency = latency < 500 ? 10 : 5;
```

**2. QPS监控**
```typescript
class QPSMonitor {
  private requests: number[] = [];

  public getCurrentQPS(): number {
    const now = Date.now();
    const lastSecond = this.requests.filter(t => now - t < 1000);
    return lastSecond.length;
  }
}
```

**3. 自适应并发**
```typescript
if (currentQPS > 40) {
  concurrency = Math.max(5, concurrency - 1);
} else if (currentQPS < 20 && failureRate < 0.1) {
  concurrency = Math.min(15, concurrency + 1);
}
```

**4. 性能仪表板**
```
DeepL翻译统计：
- 当前并发数：10
- 实时QPS：12
- 成功率：98.5%
- 本月字符消耗：124,567 / 500,000
```

**预期成果**：
- ✅ 自动适应网络环境
- ✅ 最大化性能与稳定性
- ✅ 透明的性能监控

---

## 📚 参考资料

### 官方文档

1. **DeepL API Documentation**
   https://developers.deepl.com/docs/api-reference/translate
   - 翻译接口规范
   - 请求/响应格式
   - 语言代码映射

2. **DeepL Usage Limits**
   https://developers.deepl.com/docs/resources/usage-limits
   - 请求体大小限制：128 KiB
   - Header大小限制：16 KiB
   - 月度字符配额：免费500K，付费1M+

3. **DeepL Error Codes**
   https://developers.deepl.com/docs/api-reference/error-handling
   - 403：认证失败
   - 413：请求过大
   - 429：速率限制
   - 456：配额用完
   - 503/529：服务不可用

### 社区资源

1. **GitHub Issue #33 - Concurrent Request Limits**
   https://github.com/DeepLcom/deepl-node/issues/33
   - 官方回复：50 QPS限制
   - 社区验证：10并发稳定，15并发超时
   - 实际安全值：76 KiB请求体
   - 推荐超时：30秒

2. **GitHub Issue #9 - Rate Limit Best Practices**
   https://github.com/vsetka/deepl-translator/issues/9
   - 429错误处理
   - 指数退避策略
   - 成本控制建议

### 内部文档

1. **docs/guides/deepl-translate-implementation.md**
   DeepL翻译实现指南（完整API文档）

2. **11-deepseek-concurrent-architecture.md**
   DeepSeek并发架构设计（参考对比）

3. **12-google-pipeline-concurrent-architecture.md**
   Google流水线并发架构（对比非官方端点）

4. **13-microsoft-concurrent-architecture.md**
   Microsoft真并发架构（对比官方API）

### 代码文件

1. **src/background/components/deepl-translator.ts**
   DeepL翻译器实现（需修改BATCH_SIZE）

2. **src/background/components/two-phase-translator-v4.ts**
   并发翻译核心逻辑（复用）

3. **src/shared/types/user-preferences-types.ts**
   并发配置定义（需添加配置）

4. **src/shared/types/translation-errors.ts**
   错误处理类型定义

---

## 🎯 总结

### 核心设计决策

| 维度 | 决策 | 理由 |
|-----|------|------|
| **并发模式** | 真并发 | 官方API，明确50 QPS限制 |
| **并发数量** | 10 | 社区验证稳定，26 QPS < 50 QPS |
| **批次大小** | 30条 | 安全性提升67%，性能影响小 |
| **请求延迟** | 0ms | 真并发，无需延迟 |
| **免费/付费** | 统一策略 | QPS限制相同，配置简化 |
| **失败策略** | Fail Fast（Phase 1） | 明确告知用户，可重试 |
| **代码复用** | 100% | 无需新增代码 |

### 性能预期

```
典型场景：300条字幕

串行模式：
  300 ÷ 30 = 10批
  10批 × 1000ms = 10000ms

并发10模式：
  ceil(10 / 10) = 1轮
  1轮 × 1000ms = 1000ms

性能提升：10倍 ⚡
```

### 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 50 QPS限制 | 🟡 中低 | 10并发=26 QPS，留48%余量 |
| 76 KiB超限 | 🟢 低 | 30条/批，阈值2075字符 |
| 并发失败 | 🟡 中 | Phase 2实现容错 |
| 配额消耗 | 🟢 低 | 监控计费字符数 |

### 与其他服务对比

| 服务 | 模式 | 并发 | 批次 | QPS限制 | 风险 | 性能 |
|-----|------|------|------|--------|------|------|
| DeepSeek | 真并发 | 10 | - | 无 | 🟢 极低 | 10x |
| Microsoft | 真并发 | 5 | 优化器 | 无 | 🟢 低 | 5x |
| **DeepL** | **真并发** | **10** | **30条** | **50 QPS** | **🟡 中低** | **10x** |
| Google | 流水线 | 999 | - | 未知 | 🟡 中 | 5.3x |

### 关键优势

1. ✅ **性能提升10倍**：300条字幕从10秒降到1秒
2. ✅ **批次优化**：30条/批更安全（阈值+67%）
3. ✅ **零代码实现**：完全复用DeepSeek架构
4. ✅ **免费/付费统一**：QPS限制相同，配置简化
5. ✅ **社区验证**：10并发实测稳定（GitHub Issue #33）
6. ✅ **可回滚**：配置修改简单，可快速关闭并发

### 下一步行动

1. ✅ **立即执行**：修改配置和批次大小（5分钟）
2. ✅ **测试验证**：多场景测试稳定性（30分钟）
3. ✅ **提交代码**：创建分支并合并（10分钟）
4. ⏳ **监控观察**：生产环境观察1周
5. ⏳ **Phase 2**：实现容错优化（如需要）

---

**文档版本**: v1.0
**最后更新**: 2025-01-15
**维护者**: Claude Code
**状态**: ✅ 设计完成，待实施
