# Google翻译流水线并发架构设计

**文档版本：** v1.0
**创建日期：** 2025-11-01
**作者：** Claude Code
**状态：** 设计阶段

---

## 📋 目录

1. [背景与动机](#背景与动机)
2. [核心概念](#核心概念)
3. [架构设计](#架构设计)
4. [技术实现](#技术实现)
5. [性能分析](#性能分析)
6. [风险评估](#风险评估)
7. [实施计划](#实施计划)

---

## 背景与动机

### 当前Google翻译实现

#### API调用方式
```javascript
// 非官方Google翻译端点
endpoint 1: https://translate.googleapis.com/translate_a/single
endpoint 2: https://translate.googleapis.com/translate_a/t

// 调用参数
GET请求 + URLSearchParams {
  client: 'gtx',           // 客户端标识
  sl: sourceLanguage,      // 源语言 (auto支持自动检测)
  tl: targetLanguage,      // 目标语言
  dt: 't',                 // 数据类型
  q: combinedText          // 用\n连接的文本
}
```

#### 文本处理流程
```javascript
// 合并阶段
texts = ['Hello', 'World', 'Goodbye']
  ↓
combinedText = 'Hello\nWorld\nGoodbye'  // 用\n合并

// 翻译阶段
response = '你好\n世界\n再见'

// 分割阶段
split('\n') → ['你好', '世界', '再见']
  ↓
normalizeGoogleTranslations()  // 容错处理
```

#### 现有问题

1. **性能瓶颈**
   ```
   串行处理：10批次 × 1秒/批 = 10秒
   ```

2. **真并发风险**
   - 非官方端点，速率限制不透明
   - 同时发送10个请求 → 高风险触发429限流
   - 可能导致IP被封，影响用户体验

3. **\n分隔符冲突**
   ```javascript
   // 原文包含\n时
   texts = ['Hello\nWorld', 'Goodbye']
   combinedText = 'Hello\nWorld\nGoodbye'  // 3个\n，但只有2条字幕

   // 需要容错机制
   normalizeGoogleTranslations()  // 已实现
   ```

---

## 核心概念

### 什么是流水线并发（Pipeline Concurrency）

**定义：** 不同于同时发送多个请求的真并发，流水线并发按固定间隔依次发送请求，但不等待单个请求返回，而是通过Promise.all统一收集所有结果。

### 对比三种执行模式

#### 模式1：串行执行（当前）

```
时间轴：
0.0s: 发送批次1
1.0s: ✅ 收到批次1 → 发送批次2
2.0s: ✅ 收到批次2 → 发送批次3
3.0s: ✅ 收到批次3 → 发送批次4
...
10.0s: ✅ 收到批次10 → 完成

总耗时 = 10秒
```

**代码特征：**
```javascript
for (let i = 0; i < batches.length; i++) {
  const result = await translateBatch(batches[i]);  // 等待返回
  results.push(result);
}
```

#### 模式2：真并发（DeepSeek当前方式）

```
时间轴：
0.0s: 同时发送批次1-10 (10个并发请求)
1.0s: ✅ 批次3返回
1.1s: ✅ 批次1返回
1.2s: ✅ 批次7返回
...
2.0s: ✅ 批次10返回 (最慢的) → 完成

总耗时 = 2秒
```

**代码特征：**
```javascript
const promises = batches.map(batch => translateBatch(batch));  // 同时创建10个Promise
const results = await Promise.all(promises);
```

**Google风险：** ⚠️ 高（同时10个请求，易触发反爬虫）

#### 模式3：流水线并发（新方案）

```
时间轴：
0.0s: 发送批次1
0.1s: 发送批次2
0.2s: 发送批次3
0.3s: 发送批次4
...
0.9s: 发送批次10
1.0s: ✅ 批次1返回
1.1s: ✅ 批次2返回
1.2s: ✅ 批次3返回
...
1.9s: ✅ 批次10返回 → 完成

总耗时 = 发送时间 + 最慢响应时间 = 0.9s + 1s = 1.9秒
```

**代码特征：**
```javascript
const promises = [];
for (let i = 0; i < batches.length; i++) {
  if (i > 0) await delay(100);  // 🔑 延迟发送，不等待返回
  promises.push(translateBatch(batches[i]));
}
const results = await Promise.all(promises);
```

**Google风险：** ✅ 低（有间隔，模拟人工）

---

## 架构设计

### 配置扩展

#### 新增字段：requestDelay

```typescript
// src/shared/types/user-preferences-types.ts

export interface TranslationServiceComplete {
  // ... 现有字段

  // === 并发翻译配置 ===
  enableConcurrentTranslation?: boolean;  // 是否启用并发
  concurrencyLimit?: number;              // 并发限制
  requestDelay?: number;                  // 🆕 请求间延迟（毫秒）
}
```

#### Google配置

```typescript
[TranslationServiceType.GOOGLE_FREE]: {
  type: TranslationServiceType.GOOGLE_FREE,
  name: 'Google 翻译（免费）',
  model: null,
  temperature: null,
  rpm: 100,
  tpm: null,

  // 🔑 流水线并发配置
  enableConcurrentTranslation: true,   // 启用并发
  concurrencyLimit: 999,               // 设置很大 = 一轮发完所有批次
  requestDelay: 100                    // 每批次间隔100ms
}
```

**配置说明：**
- `concurrencyLimit: 999`：表示不分轮，一次性发完所有批次
- `requestDelay: 100`：每个批次间隔100ms发送
- 如果有30个批次：发送耗时 = 30 × 0.1s = 3秒

### 执行模式路由

#### translateBatch路由逻辑

```typescript
public async translateBatch(...) {
  const concurrency = this.getConcurrencyLimit();
  const requestDelay = this.getRequestDelay();

  // 路由1：串行模式
  if (concurrency === 0) {
    return this.translateBatchSerial(...);
  }

  // 路由2：流水线并发模式（有延迟）
  if (requestDelay > 0) {
    return this.translateBatchPipeline(...);  // 🆕 新方法
  }

  // 路由3：真并发模式（无延迟）
  return this.translateBatchConcurrent(...);
}
```

### 架构分层

```
┌─────────────────────────────────────────────────┐
│         translateBatch (路由器)                 │
│  根据配置选择执行模式                           │
└───────────┬─────────────────────────────────────┘
            │
      ┌─────┴─────┬─────────────┬────────────────┐
      │           │             │                │
      ▼           ▼             ▼                ▼
 串行模式    流水线并发   真并发模式        其他
 Serial      Pipeline    Concurrent         ...
 (Google)    (Google)    (DeepSeek)
```

---

## 技术实现

### 核心方法：translateBatchPipeline

```typescript
/**
 * 流水线并发批量翻译
 * 按固定间隔依次发送请求，但不等待返回，最后统一收集结果
 *
 * 适用场景：
 * - 非官方API端点（如Google免费翻译）
 * - 需要避免触发速率限制
 * - 仍希望提升性能
 */
private async translateBatchPipeline(
  subtitles: Array<{ ... }>,
  urgentResults: Array<any>,
  sourceLanguageName: string,
  sourceLanguageCode: string,
  preferences: any,
  signal: AbortSignal
): Promise<Array<{ ... }>> {

  // 检查信号
  if (signal.aborted) {
    throw new DOMException('批量翻译开始前已取消', 'AbortError');
  }

  const results: any[] = [];
  const serviceType = preferences.translationService?.type;
  const normalizedSourceLanguageCode =
    sourceLanguageCode && sourceLanguageCode.trim() !== '' ? sourceLanguageCode : 'auto';

  try {
    // 延迟启动（避免与紧急翻译冲突）
    await this.delayWithSignal(TwoPhaseTranslatorV4.BATCH_START_DELAY, signal);

    const batchSubtitles = subtitles;

    // 如果紧急翻译已覆盖全部字幕，跳过批量翻译
    if (urgentResults.length === subtitles.length) {
      console.log('[TwoPhaseTranslatorV4] 紧急翻译已覆盖全部字幕，跳过批量翻译');
      return urgentResults;
    }

    // 使用智能分段创建批次
    const batchesWithMeta = this.segmenter.createSmartBatches(batchSubtitles);
    const batches = batchesWithMeta.map(batch => batch.subtitles);

    // 获取配置
    const requestDelay = this.getRequestDelay();
    const perBatchTimeout = this.getBatchTimeout();

    const sourceLabel = this.getSourceLanguageLabel(
      serviceType,
      sourceLanguageName,
      normalizedSourceLanguageCode
    );
    const targetLabel = this.getTargetLanguageLabel(serviceType, preferences.targetLang);

    console.log(
      `[TwoPhaseTranslatorV4] → 批量翻译: ${subtitles.length}条 | 流水线并发 | ${batches.length}批次 | 间隔${requestDelay}ms | ${sourceLabel} → ${targetLabel}`
    );

    // 🔑 流水线发送阶段
    const promises: Promise<any>[] = [];
    let sendStartTime = Date.now();

    for (let i = 0; i < batches.length; i++) {
      // 检查主信号
      if (signal.aborted) {
        throw new DOMException(`批量翻译在批次 ${i + 1} 发送前被取消`, 'AbortError');
      }

      const batch = batches[i];
      const texts = batch.map(sub => sub.text.replace(/\n/g, ' ').trim());

      // 延迟发送（除第一个批次外）
      if (i > 0 && requestDelay > 0) {
        await this.delayWithSignal(requestDelay, signal);
      }

      // 创建批次超时信号
      let batchSignal: AbortSignal;
      try {
        const timeoutSignal = AbortSignal.timeout(perBatchTimeout);
        batchSignal = AbortSignal.any([signal, timeoutSignal]);
      } catch (e) {
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

      // 🔑 立即创建Promise（开始执行），不等待返回
      const batchPromise = (async () => {
        const sendTime = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3
        });

        try {
          const translatedTexts = await this.callTranslationAPI(
            texts,
            preferences.translationService,
            sourceLanguageName,
            normalizedSourceLanguageCode,
            preferences.targetLang,
            batchSignal,
            { stage: 'batch', batchIndex: i + 1, batchCount: batches.length }
          );

          const returnTime = new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
          });

          return {
            success: true,
            batchIndex: i,
            batch,
            texts,
            translatedTexts,
            sendTime,
            returnTime
          };

        } catch (error: any) {
          const returnTime = new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
          });

          return {
            success: false,
            batchIndex: i,
            error,
            sendTime,
            returnTime
          };
        }
      })();

      promises.push(batchPromise);

      console.debug(`[debug][TwoPhaseTranslatorV4] 📤 批次${i + 1}/${batches.length} 已发送`);
    }

    const sendEndTime = Date.now();
    const sendDuration = sendEndTime - sendStartTime;
    console.debug(`[debug][TwoPhaseTranslatorV4] ✓ 所有批次发送完成，耗时${sendDuration}ms`);

    // 🔑 Promise.all统一等待所有结果
    console.debug(`[debug][TwoPhaseTranslatorV4] ⏳ 等待所有批次返回...`);
    const batchResults = await Promise.all(promises);

    const totalDuration = Date.now() - sendStartTime;
    console.debug(`[debug][TwoPhaseTranslatorV4] ✓ 所有批次返回完成，总耗时${totalDuration}ms`);

    // 打印返回顺序分析
    console.debug(`[debug][TwoPhaseTranslatorV4] 📊 返回顺序分析:`);
    const sortedByReturnTime = [...batchResults].sort((a, b) =>
      a.returnTime.localeCompare(b.returnTime)
    );
    sortedByReturnTime.forEach((result, idx) => {
      const status = result.success ? '✅' : '❌';
      const delay = result.returnTime ?
        `(发送${result.sendTime} → 返回${result.returnTime})` : '';
      console.debug(`  ${idx + 1}. 批次${result.batchIndex + 1} ${status} ${delay}`);
    });

    // 处理结果（按逻辑顺序）
    for (const result of batchResults) {
      if (!result.success) {
        const errorMsg = result.error.name === 'TimeoutError' || result.error.message === '批次翻译超时'
          ? '翻译超时'
          : result.error.message || '翻译失败';

        console.debug(`[debug][TwoPhaseTranslatorV4] 批次 ${result.batchIndex + 1}/${batches.length} 失败: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // 构建结果
      if (result.success && result.batch && result.texts && result.translatedTexts) {
        result.batch.forEach((sub: any, idx: number) => {
          const translatedText = result.translatedTexts![idx] || sub.text;
          const originalIndex = subtitles.indexOf(sub);

          if (originalIndex !== -1) {
            results.push({
              index: originalIndex,
              originalText: result.texts![idx],
              translatedText: translatedText,
              isUrgent: false
            });
          }
        });
      }
    }

    // 汇总报告
    console.log(`[TwoPhaseTranslatorV4] ✓ 流水线并发翻译完成: ${results.length} 条 | 总耗时${totalDuration}ms`);

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('[TwoPhaseTranslatorV4] ✗ 批量翻译被取消');
    }
    throw error;
  }

  return results;
}
```

### 辅助方法：getRequestDelay

```typescript
/**
 * 获取请求间延迟时间（用于流水线并发）
 * @returns 延迟时间（毫秒），0表示无延迟
 */
private getRequestDelay(): number {
  const service = this.translationService;
  return service?.requestDelay ?? 0;
}
```

### 路由器方法修改

```typescript
public async translateBatch(...): Promise<...> {
  const concurrency = this.getConcurrencyLimit();
  const requestDelay = this.getRequestDelay();

  // 🔑 新增：检测流水线模式
  if (concurrency > 0 && requestDelay > 0) {
    console.debug(`[debug][TwoPhaseTranslatorV4] 使用流水线并发模式（间隔${requestDelay}ms）`);
    return this.translateBatchPipeline(
      subtitles,
      urgentResults,
      sourceLanguageName,
      sourceLanguageCode,
      preferences,
      signal
    );
  }

  // 原有逻辑
  if (concurrency > 0) {
    console.debug(`[debug][TwoPhaseTranslatorV4] 使用并发翻译模式（并发数: ${concurrency}）`);
    return this.translateBatchConcurrent(...);
  } else {
    console.debug('[debug][TwoPhaseTranslatorV4] 使用串行翻译模式');
    return this.translateBatchSerial(...);
  }
}
```

---

## 性能分析

### 理论性能计算

#### 假设条件
- 批次数量：10
- 单批次响应时间：1000ms
- 流水线间隔：100ms

#### 各模式耗时

**串行模式：**
```
总耗时 = 批次数 × 响应时间
       = 10 × 1000ms
       = 10000ms (10秒)
```

**真并发模式：**
```
总耗时 = 最慢批次响应时间
       ≈ 1000ms (1秒)

风险：⚠️ 高（同时10个请求）
```

**流水线并发模式：**
```
发送阶段：(批次数 - 1) × 间隔时间
        = 9 × 100ms
        = 900ms

等待阶段：最慢批次响应时间
        = 1000ms

总耗时 = max(发送阶段, 等待阶段)
       = max(900ms, 1000ms)
       = 1900ms (1.9秒)

风险：✅ 低（有间隔）
```

#### 性能提升

| 模式 | 耗时 | 性能提升 | 风险等级 |
|------|------|---------|---------|
| 串行 | 10秒 | 基准 | ✅ 无风险 |
| 流水线并发 | 1.9秒 | **5.3倍** | ✅ 低风险 |
| 真并发 | 1秒 | 10倍 | ⚠️ 高风险 |

### 实际场景分析

#### 场景1：短视频（100条字幕）

```
批次数：100 / 10 = 10批次

串行模式：
  10批次 × 1秒 = 10秒

流水线并发：
  发送：9 × 0.1s = 0.9秒
  等待：1秒
  总计：1.9秒

性能提升：5.3倍
```

#### 场景2：长视频（300条字幕）

```
批次数：300 / 10 = 30批次

串行模式：
  30批次 × 1秒 = 30秒

流水线并发：
  发送：29 × 0.1s = 2.9秒
  等待：1秒
  总计：3.9秒

性能提升：7.7倍
```

**规律：批次越多，流水线并发的优势越明显**

### 并发间隔优化

#### 间隔时间对比

| 间隔(ms) | 10批次耗时 | 30批次耗时 | 风险等级 | 推荐度 |
|----------|-----------|-----------|---------|--------|
| 50 | 1.45s | 2.45s | ⚠️ 中 | ⭐⭐ |
| 100 | 1.9s | 3.9s | ✅ 低 | ⭐⭐⭐⭐⭐ |
| 200 | 2.8s | 6.8s | ✅ 极低 | ⭐⭐⭐ |
| 500 | 5.5s | 15.5s | ✅ 无 | ⭐ |

**推荐：100ms** - 平衡性能与安全性

---

## 风险评估

### Google API限流风险

#### 风险因素

1. **请求频率**
   - 串行：10请求/10秒 = 1请求/秒 ✅ 安全
   - 流水线：10请求/1秒 = 10请求/秒 ⚠️ 中等
   - 真并发：10请求/0.01秒 = 1000请求/秒 ❌ 危险

2. **请求模式识别**
   - 串行：间隔1秒，像人工 ✅
   - 流水线：间隔0.1秒，像快速人工 ⚠️
   - 真并发：同时发送，明显机器人 ❌

3. **IP限制**
   - Google可能基于IP限制总请求数
   - 流水线相比真并发，触发概率低得多

#### 风险等级评定

| 风险 | 串行 | 流水线并发 | 真并发 |
|------|------|-----------|--------|
| 429限流 | ✅ 低 | ⚠️ 中 | ❌ 高 |
| IP封禁 | ✅ 无 | ✅ 极低 | ⚠️ 中 |
| 请求失败 | ✅ <1% | ⚠️ <5% | ❌ >20% |

**结论：流水线并发风险可接受**

### 失败降级策略

#### 检测机制

```typescript
// 检测429或速率限制错误
if (error.message.includes('429') ||
    error.message.includes('rate limit') ||
    error.message.includes('Too Many Requests')) {

  console.warn('[TwoPhaseTranslatorV4] ⚠️ 检测到速率限制，建议降低并发');

  // 可选：记录失败率
  this.recordFailureRate(serviceType, 'rate_limit');
}
```

#### 降级方案

**Phase 1（当前）：**
- 检测到429 → 直接失败，提示用户
- 用户手动重试

**Phase 2（未来）：**
- 检测到429 → 自动降级为串行模式
- 重试失败的批次
- 提示用户"已切换到稳定模式"

---

## 实施计划

### Phase 1：核心实现（当前）

**目标：** 实现Google流水线并发基础功能

**任务清单：**

1. **配置扩展**
   - [ ] TranslationServiceComplete新增requestDelay字段
   - [ ] GOOGLE_FREE模板配置（enableConcurrentTranslation: true, requestDelay: 100）
   - [ ] TypeScript类型验证

2. **核心方法实现**
   - [ ] 实现getRequestDelay()辅助方法
   - [ ] 实现translateBatchPipeline()核心方法
   - [ ] 修改translateBatch()路由逻辑

3. **测试验证**
   - [ ] 功能测试：翻译结果正确性
   - [ ] 性能测试：耗时对比（串行 vs 流水线）
   - [ ] 顺序测试：Promise.all结果顺序保证
   - [ ] 风险测试：监控429错误率

4. **代码提交**
   - [ ] TypeScript编译通过
   - [ ] Git commit提交
   - [ ] 更新架构文档

### Phase 2：优化与监控（未来）

**目标：** 提升稳定性和用户体验

**任务清单：**

1. **智能降级**
   - [ ] 检测429错误自动降级
   - [ ] 失败率统计（>10%触发警告）
   - [ ] 用户提示"已切换到稳定模式"

2. **动态间隔调整**
   - [ ] 根据失败率动态调整requestDelay
   - [ ] 成功率高 → 减小间隔（提速）
   - [ ] 失败率高 → 增大间隔（降风险）

3. **用户配置**
   - [ ] Popup中添加"Google并发模式"开关
   - [ ] 高级选项：自定义requestDelay
   - [ ] 说明文档：风险提示

### Phase 3：扩展到其他服务（未来）

**目标：** Microsoft等免费API也支持流水线并发

**任务清单：**

1. **Microsoft免费翻译**
   - [ ] 调研API特性和限制
   - [ ] 设计流水线并发参数
   - [ ] 实现和测试

2. **其他免费服务**
   - [ ] 识别适合流水线并发的服务
   - [ ] 统一架构扩展

---

## 附录

### A. Promise.all顺序保证原理

```javascript
// Promise.all内部实现（简化版）
function PromiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = new Array(promises.length);  // 🔑 预分配数组
    let completedCount = 0;

    promises.forEach((promise, index) => {
      promise.then(value => {
        results[index] = value;  // 🔑 按索引存储
        completedCount++;
        if (completedCount === promises.length) {
          resolve(results);
        }
      }).catch(reject);
    });
  });
}
```

**关键：**
- 预分配数组长度
- 按索引存储结果
- 与完成时间无关

### B. 延迟发送 vs 延迟等待

#### 错误理解（延迟等待）
```javascript
// ❌ 这会退化为串行
for (let i = 0; i < batches.length; i++) {
  const result = await translateBatch(batches[i]);
  results.push(result);
  await delay(100);  // 延迟在等待后，没意义
}
```

#### 正确理解（延迟发送）
```javascript
// ✅ 流水线并发
const promises = [];
for (let i = 0; i < batches.length; i++) {
  if (i > 0) await delay(100);  // 🔑 延迟在发送前
  promises.push(translateBatch(batches[i]));  // 不await，立即发送
}
const results = await Promise.all(promises);  // 统一等待
```

### C. 性能提升公式

```
设：
  N = 批次数量
  T = 单批次响应时间
  D = 请求间延迟

串行耗时：
  T_serial = N × T

流水线并发耗时：
  T_pipeline = (N - 1) × D + T

性能提升：
  Speedup = T_serial / T_pipeline
          = (N × T) / ((N - 1) × D + T)

当 N >> 1 且 D << T 时：
  Speedup ≈ T / D

示例（T=1000ms, D=100ms）：
  Speedup ≈ 1000 / 100 = 10倍

实际：
  Speedup = (10 × 1000) / (9 × 100 + 1000)
          = 10000 / 1900
          ≈ 5.3倍
```

### D. 参考资料

1. **Promise.all文档**
   - MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all

2. **Google Translate API（非官方）**
   - 社区讨论：速率限制经验分享

3. **反爬虫策略**
   - 请求频率识别
   - IP限流机制

---

**文档结束**
