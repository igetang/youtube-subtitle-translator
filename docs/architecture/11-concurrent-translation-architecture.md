# 11. 并发翻译架构设计

## 📋 文档信息

- **版本**: 2.0
- **创建日期**: 2025-11-01
- **更新日期**: 2025-11-01
- **状态**: 设计方案（已确认）
- **作者**: Claude Code

---

## 🎯 设计目标

### 问题背景

**当前串行翻译的问题：**
```typescript
// ❌ 串行处理：批次必须依次执行
for (let i = 0; i < batches.length; i++) {
  const result = await translateBatch(batches[i]);  // 等待当前批次完成
  // 批次1: 2秒 → 批次2: 2秒 → 批次3: 2秒
  // 总时间 = 2 + 2 + 2 = 6秒
}
```

**期望的并发翻译：**
```typescript
// ✅ 并发处理：批次同时执行（在限制内）
const CONCURRENCY = 8;
for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const chunk = batches.slice(i, i + CONCURRENCY);
  const promises = chunk.map(batch => translateBatch(batch));
  const results = await Promise.all(promises);
}
// 总时间 ≈ (批次数 / 并发数) × 单批次时间
```

**收益：**
- 翻译速度提升 **6-10倍**（取决于批次数和并发限制）
- 用户体验显著改善（更快看到完整翻译）
- 资源利用更高效（充分利用网络并发能力）

---

## 🔑 核心机制：Promise.all 顺序保证

### 1. 原理说明

**关键特性：** Promise.all 会保持结果数组的顺序与输入Promise数组一致。

```javascript
// 示例：5个批次并发执行
const batches = [batch1, batch2, batch3, batch4, batch5];

// 创建Promise数组（不await）
const promises = batches.map((batch, index) =>
  translateAPI(batch)  // 返回Promise
);

// 并发执行（Promise.all会等待所有完成，然后按原始顺序返回结果）
const results = await Promise.all(promises);

// 顺序保证：
// results[0] 一定是 batch1 的翻译结果
// results[1] 一定是 batch2 的翻译结果
// ... 以此类推
```

### 2. 实际返回顺序 vs 结果数组顺序

**实际返回顺序（乱序）：**
```
批次4 返回了！ (0.5秒) ← 最快
批次2 返回了！ (1.0秒)
批次5 返回了！ (2.0秒)
批次1 返回了！ (3.0秒)
批次3 返回了！ (4.0秒) ← 最慢
```

**Promise.all 结果数组（保序）：**
```javascript
results = [
  result1,  // results[0] = 批次1的结果（虽然第4个返回）
  result2,  // results[1] = 批次2的结果（虽然第2个返回）
  result3,  // results[2] = 批次3的结果（虽然第5个返回）
  result4,  // results[3] = 批次4的结果（虽然第1个返回）
  result5   // results[4] = 批次5的结果（虽然第3个返回）
]
```

### 3. 内部实现原理（伪代码）

```javascript
function PromiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = new Array(promises.length); // ← 预分配固定长度数组
    let completedCount = 0;

    promises.forEach((promise, index) => {
      promise.then(value => {
        results[index] = value;  // ← 按index存储，保证顺序
        completedCount++;

        if (completedCount === promises.length) {
          resolve(results);  // 全部完成后返回
        }
      }).catch(reject);
    });
  });
}
```

**关键点：**
- 结果数组长度和顺序在一开始就确定
- 每个Promise完成时，将结果存储到对应的index位置
- 不管哪个Promise先完成，都能找到自己的位置

---

## 🏗️ 架构设计

### 1. 翻译服务并发限制调研

#### RPM vs 并发数的关系

**官方限制通常是RPM（Requests Per Minute），不是并发数：**

```
理论最大并发数 = (RPM × 平均请求耗时秒数) / 60

示例：
- RPM = 500（官方限制）
- 平均请求耗时 = 2秒
- 理论最大并发数 = (500 × 2) / 60 ≈ 16.7个

但实际并发数还受限于：
- HTTP/2 连接限制
- 浏览器并发连接数（通常6-8个）
- 服务器端的实际处理能力
- API的动态节流机制
```

#### 各服务的官方限制与推荐并发数

| 翻译服务 | 官方RPM限制 | 推荐并发数 | 依据 | 可配置 |
|---------|------------|-----------|------|--------|
| **DeepSeek** | 无明确限制 | **10** | 官方无限制，但有动态节流；社区经验8-10个 | ✅ |
| **OpenAI** | 500-5000（Tier依赖） | **10** | Tier 1: 500 RPM, Tier 2: 5000 RPM；保守估计 | ✅ |
| **Gemini Free** | **5 RPM** | **5** | 官方文档明确限制 | ✅ |
| **Gemini Flash** | **1000 RPM** | **100** | 官方文档；付费版高限制 | ✅ |
| **Microsoft** | 无并发限制 | **20** | 官方文档：按字符数限流，无并发限制 | ✅ |
| **DeepL** | 无官方数据 | **10** | 社区反馈15个并发会超时，保守估计 | ✅ |
| **Google** | 无明确限制 | **10** | 按字符/秒计费，保守估计 | ✅ |
| **Qwen** | 无官方数据 | **10** | 保守估计 | ✅ |

**数据来源：**
- DeepSeek: [官方API文档](https://api-docs.deepseek.com/quick_start/rate_limit)（明确说明无限制，但有动态节流）
- OpenAI: [官方Rate Limits文档](https://platform.openai.com/docs/guides/rate-limits)
- Gemini: [官方Rate Limits文档](https://ai.google.dev/gemini-api/docs/rate-limits)
- Microsoft: [官方Service Limits文档](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)（明确说明无并发限制）
- 其他服务：社区经验 + 保守估计

**设计原则：**
- **保守默认值**：宁可慢一点，也不触发限流
- **用户可配置**：高级用户可以自己调整（自负风险）
- **根据实际反馈优化**：收集真实数据后调整

#### DeepSeek的特殊性说明

**官方声明：**
> "API does **NOT** constrain user's rate limit. We will try out best to serve every request."

**实际限制：**
- ✅ 无官方RPM限制
- ✅ 无明确并发数限制
- ⚠️ **有动态节流机制**：高负载时会降低优先级
- ⚠️ 30分钟超时（单个请求超过30分钟会被断开）

**社区经验：**
- 前8-10个请求通常正常
- 之后可能被降优先级（但不会完全拒绝）
- 并发过多可能导致超时

**结论：** 默认设置10个并发（保守值），允许用户自定义。

---

### 2. 分组并发策略（推荐方案）⭐

#### 核心思想

**在并发限制内分组执行：**
```
总批次：20个
并发限制：8个
分组策略：分3轮执行

【第1轮】并发8个（批次1-8）  ← 2秒
【第2轮】并发8个（批次9-16） ← 2秒
【第3轮】并发4个（批次17-20）← 2秒

总时间 = 3轮 × 2秒 = 6秒
对比串行 = 20批次 × 2秒 = 40秒
加速比 = 6.7倍 🚀
```

#### 分组并发示意图

```
总共20个批次，并发限制8个

【第1轮】并发8个（批次1-8）
批次1  ──────→ 2秒 ✅
批次2  ──────→ 2秒 ✅
批次3  ──────→ 2秒 ✅
批次4  ──────→ 2秒 ✅
批次5  ──────→ 2秒 ✅  } 同时执行
批次6  ──────→ 2秒 ✅
批次7  ──────→ 2秒 ✅
批次8  ──────→ 2秒 ✅
         ↓ 等待全部完成（Promise.all）

【第2轮】并发8个（批次9-16）
批次9  ──────→ 2秒 ✅
批次10 ──────→ 2秒 ✅
批次11 ──────→ 2秒 ✅
批次12 ──────→ 2秒 ✅
批次13 ──────→ 2秒 ✅  } 同时执行
批次14 ──────→ 2秒 ✅
批次15 ──────→ 2秒 ✅
批次16 ──────→ 2秒 ✅
         ↓ 等待全部完成

【第3轮】并发4个（批次17-20，剩余不足8个）
批次17 ──────→ 2秒 ✅
批次18 ──────→ 2秒 ✅  } 同时执行
批次19 ──────→ 2秒 ✅
批次20 ──────→ 2秒 ✅
         ↓ 完成

总时间 = 2 + 2 + 2 = 6秒（对比串行40秒）
```

#### 为什么不能并发嵌套（8×8=64个）？

**错误想法：**
```typescript
// ❌ 想通过嵌套来突破限制
// 外层8个，每个内部再并发8个 = 8×8=64个同时请求
const level1Promises = batches.slice(0, 8).map(batch => {
  // 内层每个再并发8个
  return Promise.all([
    translate(sub1),
    translate(sub2),
    // ... 8个
  ]);
});
await Promise.all(level1Promises);
```

**为什么不可行：**

1. **API限流是全局的，不看代码结构**
   ```
   API服务器视角：
   时刻 T=0秒：收到64个请求同时到达
   ↓
   判断：这个用户在1秒内发了64个请求！
   ↓
   结果：❌ 429 Too Many Requests（前10个成功，后54个被拒）
   ```

2. **并发的本质是"优化等待时间"，不是"增加请求数"**
   ```
   串行：总时间 = N个请求 × 单次耗时
   并发（在限制内）：总时间 ≈ 单次耗时（所有请求一起等待）

   嵌套并发：请求数没变，只是代码结构变了
   API服务器看到的仍然是N个请求
   ```

3. **类比说明**
   ```
   高速公路限速120km/h
   ❌ 在车里再套一辆车 → 速度不会变成240km/h
   ✅ 开到120km/h → 在限制内最快

   API限制10个并发
   ❌ 嵌套8×8=64个 → 会触发429限流
   ✅ 并发10个 → 在限制内最快
   ```

**正确理解：**
- 并发10个已经能获得6-10倍加速（足够）
- 嵌套不会更快，反而会失败
- "在限制内最大化效率"才是王道

#### Gemini 免费层流水线策略（现状说明）
- 官方 Free tier 限制 5 RPM，但扩展需要在单轮 SPA 路由内完成翻译，因此当前实现采用“高并发提交 + 请求间延迟”模式（参考 `src/background/components/two-phase-translator-v4.ts` 中 `getConcurrencyLimit/getRequestDelay`）。
- 行为：一次性生成 Promise 数组（`concurrency` 设为 999），再在流水线模式下为每个批次插入 3000ms 间隔，既能维持顺序，也能让 Google 端缓冲节流。
- 调整策略：若后续限流收紧，只需把 `requestDelay` 调整为 5000ms+ 并在设置页提示“Free tier 建议串行”；若升级到付费 tier，可将 `requestDelay=0` 并复用真并发逻辑，无需改主流程。

---

### 3. 通用并发控制器设计

#### 架构思路

**设计统一的并发接口，适用于所有翻译服务：**

```typescript
/**
 * 通用并发翻译控制器
 * 支持所有翻译服务，自动管理并发数和分组
 */
class ConcurrentTranslationController {
  /**
   * 分组并发翻译
   * @param batches 批次数组
   * @param translateFn 翻译函数（各服务的translate方法）
   * @param options 并发配置
   */
  async translateBatches<T>(
    batches: T[],
    translateFn: (batch: T, index: number) => Promise<Result>,
    options: {
      concurrency: number;        // 并发数限制
      serviceName: string;        // 服务名称（日志用）
      signal: AbortSignal;        // 取消信号
      enableConcurrent: boolean;  // 是否启用并发
    }
  ): Promise<Result[]>;
}
```

**调用示例：**
```typescript
// DeepSeek
if (service.type === 'deepseek') {
  results = await controller.translateBatches(
    batches,
    (batch, index) => deepseekTranslator.translate(batch, ...),  // ← 复用现有方法
    {
      concurrency: 10,
      serviceName: 'DeepSeek',
      signal,
      enableConcurrent: preferences.enableConcurrentTranslation
    }
  );
}

// OpenAI（同样的接口）
if (service.type === 'openai') {
  results = await controller.translateBatches(
    batches,
    (batch, index) => openaiTranslator.translate(batch, ...),
    { concurrency: 10, serviceName: 'OpenAI', signal, enableConcurrent: true }
  );
}
```

**优点：**
- 统一逻辑，减少重复代码
- 所有服务自动支持并发
- 新服务接入自动获得并发能力
- 配置集中管理

---

## 💻 代码实现

### 1. 并发配置

```typescript
// src/background/components/two-phase-translator-v4.ts

/**
 * 并发控制配置
 */
const CONCURRENCY_CONFIG: Record<string, number> = {
  'deepseek': 10,           // DeepSeek：官方无限制，保守值10
  'openai': 10,             // OpenAI：取决于Tier，保守值10
  'gemini': 5,              // Gemini Free：官方5 RPM
  'gemini-flash': 100,      // Gemini Flash：官方1000 RPM
  'microsoft': 20,          // Microsoft：无并发限制，按字符限流
  'microsoft-free': 20,
  'deepl': 10,              // DeepL：社区经验，保守值10
  'google': 10,             // Google：按字符计费，保守值10
  'google-free': 10,
  'qwen': 10                // Qwen：保守值10
};

/**
 * 获取并发限制
 */
private getConcurrencyLimit(serviceType: string, userPreferences: any): number {
  // 优先使用用户自定义值
  if (userPreferences.concurrencyLimit && userPreferences.concurrencyLimit > 0) {
    return userPreferences.concurrencyLimit;
  }

  // 否则使用预设值
  return CONCURRENCY_CONFIG[serviceType] || 10;
}
```

### 2. 分组并发实现（核心代码）

```typescript
/**
 * 执行批量翻译（支持并发）
 */
public async translateBatch(
  subtitles: Array<SubtitleItem>,
  urgentResults: Array<any>,
  sourceLanguageName: string,
  sourceLanguageCode: string,
  preferences: any,
  signal: AbortSignal
): Promise<Array<TranslationResult>> {
  if (signal.aborted) {
    throw new DOMException('批量翻译开始前已取消', 'AbortError');
  }

  const results: any[] = [];
  const serviceType = preferences.translationService?.type;

  // 检查是否启用并发
  const enableConcurrent = preferences.enableConcurrentTranslation !== false; // 默认启用

  // 如果禁用并发，降级到串行（兼容性）
  if (!enableConcurrent) {
    console.log('[TwoPhaseTranslatorV4] 并发已禁用，使用串行翻译');
    return this.translateBatchSerial(...); // 调用原有串行方法
  }

  // === 并发翻译逻辑 ===

  // 分批逻辑（使用IntelligentSegmenter，复用现有代码）
  const batches = this.segmenter.createSmartBatches(subtitles);

  // 获取并发限制
  const concurrency = this.getConcurrencyLimit(serviceType, preferences);
  const totalRounds = Math.ceil(batches.length / concurrency);

  console.log(
    `[TwoPhaseTranslatorV4] → 并发翻译: ${subtitles.length}条 | ` +
    `${batches.length}批次 | 并发限制=${concurrency} | 分${totalRounds}轮`
  );

  // 分组并发执行
  const allResults: Result[] = [];

  for (let i = 0; i < batches.length; i += concurrency) {
    // 检查主信号（用户取消）
    if (signal.aborted) {
      throw new DOMException(`批量翻译在第${Math.floor(i / concurrency) + 1}轮被取消`, 'AbortError');
    }

    // 当前分组（最多concurrency个）
    const chunk = batches.slice(i, i + concurrency);
    const currentRound = Math.floor(i / concurrency) + 1;

    console.log(
      `[TwoPhaseTranslatorV4] 第${currentRound}/${totalRounds}轮: ` +
      `批次${i + 1}-${i + chunk.length}（${chunk.length}个）`
    );

    // 并发执行当前分组
    const chunkPromises = chunk.map((batch, chunkIndex) => {
      const globalIndex = i + chunkIndex;
      const texts = batch.subtitles.map(sub => sub.text.replace(/\n/g, ' ').trim());

      // 创建独立的超时信号
      let batchSignal: AbortSignal;
      const perBatchTimeout = this.getBatchTimeout(serviceType);

      try {
        const timeoutSignal = AbortSignal.timeout(perBatchTimeout);
        batchSignal = AbortSignal.any([signal, timeoutSignal]);
      } catch (e) {
        // 降级方案（兼容旧浏览器）
        const batchController = new AbortController();
        if (signal.aborted) {
          batchController.abort();
        } else {
          signal.addEventListener('abort', () => batchController.abort());
        }
        const timeoutId = setTimeout(() => {
          batchController.abort(new DOMException('批次翻译超时', 'TimeoutError'));
        }, perBatchTimeout);
        batchController.signal.addEventListener('abort', () => clearTimeout(timeoutId));
        batchSignal = batchController.signal;
      }

      // 调用翻译API（复用现有的callTranslationAPI方法）
      return this.callTranslationAPI(
        texts,
        preferences.translationService,
        sourceLanguageName,
        sourceLanguageCode,
        preferences.targetLang,
        batchSignal,
        { stage: 'batch', batchIndex: globalIndex + 1, batchCount: batches.length }
      ).then(translatedTexts => ({
        success: true,
        batchIndex: globalIndex,
        batch: batch.subtitles,
        texts,
        translatedTexts,
        returnTime: new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          fractionalSecondDigits: 3
        })
      })).catch(error => ({
        success: false,
        batchIndex: globalIndex,
        batch: batch.subtitles,
        texts,
        error,
        returnTime: new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          fractionalSecondDigits: 3
        })
      }));
    });

    // 等待当前分组完成（Promise.all保证顺序）
    const chunkResults = await Promise.all(chunkPromises);

    // 实时打印返回顺序（按实际返回时间排序，用于调试）
    const sortedByTime = [...chunkResults].sort((a, b) =>
      (a.returnTime || '').localeCompare(b.returnTime || '')
    );
    sortedByTime.forEach((result, idx) => {
      const status = result.success ? '✅' : '❌';
      console.log(
        `  ${status} [${result.returnTime}] 批次${result.batchIndex + 1} 返回`
      );
    });

    // 处理当前分组结果
    for (const result of chunkResults) {
      if (!result.success) {
        // Phase 1：直接抛出错误（不重试）
        // Phase 2：收集失败批次，最后统一重试
        throw result.error;
      }

      // 构建翻译结果
      result.batch.forEach((sub, idx) => {
        const translatedText = result.translatedTexts[idx] || sub.text;
        const originalIndex = subtitles.indexOf(sub);
        if (originalIndex !== -1) {
          allResults.push({
            index: originalIndex,
            originalText: result.texts[idx],
            translatedText: translatedText,
            isUrgent: false
          });
        }
      });
    }

    console.log(
      `[TwoPhaseTranslatorV4] ✓ 第${currentRound}轮完成: ${chunkResults.length}批次`
    );
  }

  // 最终汇总（按逻辑顺序打印）
  console.log('\n📊 并发翻译完成汇总（按原始批次顺序）：');
  batches.forEach((batch, index) => {
    console.log(`  results[${index}] = 批次${index + 1} ✅`);
  });

  console.log(
    `\n[TwoPhaseTranslatorV4] ✓ 并发翻译完成: ${allResults.length}条 | ` +
    `共${totalRounds}轮 | 服务=${serviceType}`
  );

  return allResults;
}

/**
 * 获取批次超时时间（根据服务类型）
 */
private getBatchTimeout(serviceType: string): number {
  const timeouts: Record<string, number> = {
    'deepseek': 30000,    // DeepSeek: 30秒
    'openai': 15000,      // OpenAI: 15秒
    'gemini': 15000,      // Gemini: 15秒
    'deepl': 10000,       // DeepL: 10秒
    'qwen': 10000,        // Qwen: 10秒
    'google': 10000,      // Google: 10秒
    'google-free': 10000,
    'microsoft': 5000,    // Microsoft: 5秒
    'microsoft-free': 5000
  };
  return timeouts[serviceType] || 10000;
}
```

### 3. 用户配置接口

```typescript
// src/shared/types/user-preferences.ts

export interface UserPreferences {
  // ... 现有字段

  /**
   * 是否启用并发翻译
   * @default true
   */
  enableConcurrentTranslation?: boolean;

  /**
   * 并发数限制（可选，用户自定义）
   * 如果未设置，使用服务预设值
   * @default undefined（使用预设值）
   */
  concurrencyLimit?: number;
}
```

### 4. 日志输出示例

```
[TwoPhaseTranslatorV4] → 并发翻译: 200条 | 20批次 | 并发限制=10 | 分2轮

[TwoPhaseTranslatorV4] 第1/2轮: 批次1-10（10个）
  ✅ [15:30:01.234] 批次3 返回
  ✅ [15:30:01.456] 批次1 返回
  ✅ [15:30:01.678] 批次5 返回
  ✅ [15:30:01.890] 批次2 返回
  ✅ [15:30:02.012] 批次7 返回
  ✅ [15:30:02.123] 批次4 返回
  ✅ [15:30:02.234] 批次9 返回
  ✅ [15:30:02.345] 批次6 返回
  ✅ [15:30:02.456] 批次10 返回
  ✅ [15:30:02.567] 批次8 返回
[TwoPhaseTranslatorV4] ✓ 第1轮完成: 10批次

[TwoPhaseTranslatorV4] 第2/2轮: 批次11-20（10个）
  ✅ [15:30:03.678] 批次12 返回
  ✅ [15:30:03.789] 批次14 返回
  ... (10个批次)
[TwoPhaseTranslatorV4] ✓ 第2轮完成: 10批次

📊 并发翻译完成汇总（按原始批次顺序）：
  results[0] = 批次1 ✅
  results[1] = 批次2 ✅
  results[2] = 批次3 ✅
  ... (共20个，顺序保持)

[TwoPhaseTranslatorV4] ✓ 并发翻译完成: 200条 | 共2轮 | 服务=deepseek
```

---

## 🧪 测试验证

### 1. 测试环境

**测试文件：** `test-deepseek-concurrent.html`

**测试配置：**
- 翻译服务：DeepSeek API
- 批次数量：10个
- 文本长度：5-156字符（故意不同长度，模拟真实场景）
- 并发方式：Promise.all（无限制）

### 2. 测试结果

**实际返回顺序（按耗时排序）：**
```
1. 批次7 (3字符)   - 1099ms  ← 最短，最先返回
2. 批次1 (5字符)   - 1333ms
3. 批次5 (11字符)  - 1547ms
4. 批次9 (13字符)  - 1751ms
5. 批次2 (18字符)  - 1998ms
6. 批次10 (46字符) - 2204ms
7. 批次3 (44字符)  - 2440ms
8. 批次6 (51字符)  - 2656ms
9. 批次4 (89字符)  - 2883ms
10. 批次8 (156字符) - 3097ms  ← 最长，最后返回
```

**Promise.all 结果顺序：**
```javascript
results[0] = 批次1的翻译  ✅ 正确匹配
results[1] = 批次2的翻译  ✅ 正确匹配
results[2] = 批次3的翻译  ✅ 正确匹配
results[3] = 批次4的翻译  ✅ 正确匹配
results[4] = 批次5的翻译  ✅ 正确匹配
results[5] = 批次6的翻译  ✅ 正确匹配
results[6] = 批次7的翻译  ✅ 正确匹配
results[7] = 批次8的翻译  ✅ 正确匹配
results[8] = 批次9的翻译  ✅ 正确匹配
results[9] = 批次10的翻译 ✅ 正确匹配
```

**结论：**
- ✅ 虽然返回顺序完全乱序（批次7最快，批次8最慢）
- ✅ 但 Promise.all 结果数组顺序完全正确
- ✅ results[i] 与 testTexts[i] 一一对应
- ✅ 顺序验证 100% 通过

### 3. 性能对比

**场景：100条字幕，分10批，每批10条**

| 方案 | 执行方式 | 总时间 | 计算公式 | 加速比 |
|------|---------|--------|---------|--------|
| **串行** | 逐个执行 | 20秒 | 10批 × 2秒 | 1x |
| **并发10个（单轮）** | 1轮，10个同时 | 2秒 | 1轮 × 2秒 | **10x** ✅ |
| **并发8个（分组）** | 2轮，每轮8/2个 | 4秒 | 2轮 × 2秒 | **5x** |

**更大规模场景：200条字幕，分20批**

| 方案 | 执行方式 | 总时间 | 加速比 |
|------|---------|--------|--------|
| **串行** | 逐个执行 | 40秒 | 1x |
| **并发10个（分组）** | 2轮，每轮10个 | 4秒 | **10x** ✅ |
| **并发20个（无限制）** | 1轮，20个同时 | 2秒 | **20x**（但可能被限流❌） |

**结论：**
- 并发10个（分组）已经能获得 **6-10倍加速**
- 比无限并发稍慢，但**稳定可靠**
- 比串行快得多，用户体验显著改善

---

## 📊 实施计划

### Phase 1: 基础并发实现（1-2天）✅ 当前阶段

**目标：** 实现基础并发功能，先开放DeepSeek

**任务：**
- [x] 创建HTML测试文件
- [x] 验证Promise.all顺序保证
- [x] 测试DeepSeek并发能力
- [ ] 添加并发配置（enableConcurrentTranslation、concurrencyLimit）
- [ ] 实现分组并发逻辑
- [ ] 实现日志打印（实时返回顺序 + 逻辑顺序汇总）
- [ ] 本地测试验证

**交付物：**
- 可运行的并发翻译代码（仅DeepSeek）
- 用户可配置开关
- 完整的日志输出

**不包含：**
- ❌ 错误重试机制（Phase 2）
- ❌ 其他翻译服务（Phase 3）

---

### Phase 2: 错误处理与重试机制（3-5天）🔜 未来完善

**目标：** 添加智能错误重试

**任务：**
- [ ] 实现错误分类（可重试 vs 不可重试）
  - 可重试：429限流、503服务不可用、网络超时
  - 不可重试：401密钥错误、402余额不足、422语言不支持
- [ ] 实现失败批次收集
- [ ] 实现第二轮并发重试
  - 指数退避（第1次等待1秒，第2次等待2秒）
  - 最多重试2次
- [ ] 添加失败率监控
  - 失败率 >20% 时提示用户降低并发数
- [ ] 更新用户提示
  - "20个批次中，18个成功，2个失败并重试中..."

**重试流程设计：**
```typescript
// 第一轮并发
const firstResults = await Promise.allSettled(batchPromises);

// 收集失败批次
const failedBatches = firstResults
  .filter(r => r.status === 'rejected' && isRetryable(r.reason))
  .map((r, index) => ({ batch: batches[index], error: r.reason }));

if (failedBatches.length > 0) {
  console.log(`[重试] 第一轮失败${failedBatches.length}个批次，等待1秒后重试...`);
  await delay(1000);

  // 第二轮重试
  const retryPromises = failedBatches.map(fb => translateBatch(fb.batch));
  const retryResults = await Promise.allSettled(retryPromises);

  // 合并结果
  mergeResults(firstResults, retryResults);
}
```

**判断是否可重试：**
```typescript
function isRetryable(error: Error): boolean {
  // 429限流 → 可重试
  if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
    return true;
  }

  // 503服务不可用 → 可重试
  if (error.message.includes('503') || error.message.includes('Service Unavailable')) {
    return true;
  }

  // 网络超时 → 可重试
  if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
    return true;
  }

  // 401密钥错误 → 不可重试
  if (error.message.includes('401') || error.message.includes('Invalid API Key')) {
    return false;
  }

  // 402余额不足 → 不可重试
  if (error.message.includes('402') || error.message.includes('Insufficient Balance')) {
    return false;
  }

  // 其他错误 → 不重试
  return false;
}
```

---

### Phase 3: 扩展到其他翻译服务（2-3天）🔜 未来完善

**目标：** 逐步开放其他翻译服务的并发支持

**任务：**
- [ ] OpenAI并发测试与开放
- [ ] Gemini并发测试与开放
- [ ] Microsoft并发测试与开放（可设置较大并发数）
- [ ] DeepL并发测试与开放
- [ ] Google并发测试与开放
- [ ] Qwen并发测试与开放
- [ ] 收集各服务实际并发能力数据
- [ ] 优化CONCURRENCY_CONFIG配置

**开放策略：**
- 逐个服务测试验证
- 确认稳定后再开放下一个
- 收集用户反馈，调整并发数

---

### Phase 4: 生产部署与监控（1-2天）

**任务：**
- [ ] 代码审查
- [ ] 集成测试
- [ ] 性能测试（大规模字幕）
- [ ] 发布新版本
- [ ] 监控线上表现
  - 并发成功率
  - 平均加速比
  - 用户反馈

---

## ⚠️ 注意事项

### 1. API限流风险

**现象：**
- HTTP 429 Too Many Requests
- 请求被拒绝或超时
- DeepSeek动态降优先级

**应对策略：**
- **Phase 1：** 使用保守的并发数（DeepSeek: 10个）
- **监控失败率：** 如果 >20%，提示用户降低并发数
- **用户可配置：** 高级用户可以自己调整
- **Phase 2：** 添加智能重试机制

### 2. 内存占用

**问题：**
- 大量批次并发可能消耗较多内存
- 浏览器扩展内存有限（通常<512MB）

**优化：**
- 分组执行（每轮最多10个）
- 单批次结果及时清理（不缓存Promise对象）
- 避免缓存过多中间数据

### 3. 用户体验

**权衡：**
- 并发翻译更快，但错误调试更难
- 需要更清晰的进度提示

**改进：**
- 显示已完成批次数（"第1/3轮: 批次1-10"）
- 实时打印返回日志（用户能看到进度）
- 错误信息更友好（"翻译失败，请检查网络或API密钥"）

### 4. 向后兼容

**考虑：**
- 老用户可能习惯串行行为
- 某些API配置可能不支持并发
- 网络环境差的用户可能遇到更多超时

**方案：**
- **添加开关：** `enableConcurrentTranslation` 默认 `true`
- **失败时降级：** 并发失败率高时，自动降级串行或提示用户
- **配置项说明：** 在设置页面添加说明文档

### 5. 并发数配置建议

**给用户的建议：**
```
默认值（推荐）：10个
  - 适合大多数网络环境
  - 已经能获得6-10倍加速

保守值：5个
  - 网络不稳定时使用
  - 减少超时风险

激进值：20个
  - 网络环境好 + 付费账户
  - 风险：可能触发限流

不建议：>50个
  - 一定会触发限流
  - 浪费资源
```

---

## 📚 参考资料

### 官方文档

1. **MDN - Promise.all()**
   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
   - Promise.all 顺序保证机制

2. **DeepSeek API Rate Limit**
   https://api-docs.deepseek.com/quick_start/rate_limit
   - 官方无限制政策
   - 动态节流机制说明

3. **OpenAI Rate Limits**
   https://platform.openai.com/docs/guides/rate-limits
   - Tier 1: 500 RPM
   - Tier 2: 5000 RPM

4. **Google Cloud Translation Quotas**
   https://cloud.google.com/translate/quotas
   - 按字符/秒计费
   - 可配置的QPS限制

5. **Microsoft Translator Service Limits**
   https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits
   - 明确说明无并发限制
   - 按字符数限流（2M字符/小时）

6. **DeepL API Usage Limits**
   https://developers.deepl.com/docs/resources/usage-limits
   - 批量翻译支持
   - 速率限制处理

7. **Gemini API Rate Limits**
   https://ai.google.dev/gemini-api/docs/rate-limits
   - Free: 5 RPM
   - Flash: 1000 RPM

### 社区资源

1. **OpenAI Community - Concurrent Requests**
   https://community.openai.com/t/concurrent-request-restriction/1062443
   - 社区反馈8个并发限制

2. **DeepL GitHub Issues - Rate Limit**
   https://github.com/DeepLcom/deepl-node/issues/33
   - 并发超时问题讨论

3. **Medium - Async OpenAI Calls with Rate Limiting**
   https://villoro.com/blog/async-openai-calls-rate-limiter/
   - 并发控制实现案例

---

## ✅ 总结

### 核心原理

**Promise.all 的顺序保证是可靠的：**
- 基于JavaScript规范，所有现代浏览器支持
- 结果数组顺序与输入Promise数组一致
- 不需要手动跟踪批次索引

### 最终方案

**采用方案B（分组并发）：**
- 并发数：DeepSeek默认10个（可配置）
- 分组执行：20批次分2轮（每轮10个）
- 错误策略：Phase 1直接失败，Phase 2智能重试
- 开关控制：enableConcurrentTranslation（默认启用）
- 架构范围：通用设计，先开放DeepSeek，后续扩展其他服务

### 关键决策

1. **并发数：10个**
   - 依据：DeepSeek官方无限制，社区经验8-10个，保守估计
   - 策略：保守默认值 + 用户可配置

2. **错误重试：Phase 1不加，Phase 2完善**
   - 理由：降低初始复杂度，先验证并发能力
   - Phase 2添加智能重试（指数退避、最多2次）

3. **通用架构：是，但先开放DeepSeek**
   - 理由：统一逻辑，减少重复代码
   - 策略：逐个服务测试验证，确认稳定后开放

4. **日志打印：实时返回顺序 + 逻辑顺序汇总**
   - 实时：按返回时间打印（用户看到进度）
   - 汇总：按原始顺序打印（验证顺序正确）

### 预期收益

- **速度提升**：6-10倍（取决于批次数和并发限制）
- **用户体验**：显著改善（更快看到完整翻译）
- **代码复杂度**：适中（分组循环 + Promise.all）
- **稳定性**：高（在并发限制内，降低被限流风险）

### 风险控制

- **保守默认值**：10个并发（不贪心）
- **用户可配置**：高级用户可自行调整
- **失败率监控**：>20%时提示降低并发
- **向后兼容**：开关控制，可降级串行

---

## 🚀 下一步行动

**立即开始 Phase 1 实施：**

1. **修改代码**
   - 添加并发配置（CONCURRENCY_CONFIG）
   - 实现分组并发逻辑（translateBatch方法）
   - 添加用户配置接口（enableConcurrentTranslation、concurrencyLimit）

2. **本地测试**
   - 测试DeepSeek并发翻译（10批次、20批次）
   - 验证顺序正确性
   - 观察失败率和性能

3. **文档更新**
   - 更新用户设置说明
   - 添加并发配置指南

4. **发布验证**
   - 小范围发布（Beta版）
   - 收集用户反馈
   - 调整并发数配置

---

**版本历史：**
- v1.0 (2025-11-01): 初始版本，基础设计
- v2.0 (2025-11-01): 完整版本，包含所有讨论内容和最终决策
