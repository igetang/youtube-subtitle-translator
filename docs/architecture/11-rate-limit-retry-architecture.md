# Rate Limit智能处理架构优化设计

**版本**: v1.0
**日期**: 2025-11-07
**作者**: Claude Code
**状态**: 设计阶段

---

## 📋 目录

1. [核心目标](#1-核心目标)
2. [整体架构](#2-整体架构)
3. [详细设计](#3-详细设计)
4. [代码结构](#4-代码结构)
5. [实施计划](#5-实施计划)
6. [测试方案](#6-测试方案)
7. [风险评估](#7-风险评估)
8. [成功标准](#8-成功标准)

---

## 1. 核心目标

### 1.1 业务目标

- ✅ 解决长视频翻译触发rate limit导致永久失败的问题
- ✅ 提升用户体验：urgent完成后立即激活UI
- ✅ 支持用户中途操作（关闭、切换视频）

### 1.2 技术目标

- ✅ 智能延迟：基于实际触发时间动态计算
- ✅ 自动重试：429错误自动恢复，无需用户干预
- ✅ 优雅降级：重试失败后合理提示
- ✅ 代码复用：3个translator共用同一套逻辑

### 1.3 适用范围

**需要优化的翻译服务**：
- DeepSeek
- Gemini
- DeepL

**无需优化的翻译服务**（经测试未发现rate limit）：
- Google免费翻译
- Microsoft免费翻译

---

## 2. 整体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     handle-toggle-translate-v4.ts               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Stage 5.1: Urgent翻译                                     │   │
│  │   → 完成后立即设置ACTIVE状态 ⭐新增                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Stage 5.2: Batch翻译（后台执行）                          │   │
│  │   → 调用TwoPhaseTranslatorV4                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 用户操作处理                                              │   │
│  │   - 关闭翻译 → 清理同tab所有会话 ⭐新增                  │   │
│  │   - 开启翻译 → 清理同tab旧会话 ⭐新增                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   TwoPhaseTranslatorV4                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ translateBatch()                                          │   │
│  │   → 调用具体translator.translate()                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Translator (DeepSeek/Gemini/DeepL)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ translate()                                               │   │
│  │   for (批次) {                                            │   │
│  │     ⭐ RetryHandler.executeWithRetry(() => {              │   │
│  │         翻译单个批次                                      │   │
│  │       })                                                  │   │
│  │   }                                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ⭐ RetryHandler（新增）                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ executeWithRetry()                                        │   │
│  │   - 执行操作                                              │   │
│  │   - 捕获429错误                                           │   │
│  │   - 智能计算延迟（60s窗口算法）⭐                         │   │
│  │   - 自动重试（最多3次）                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户点击翻译
    ↓
PENDING状态
    ↓
Urgent翻译（2-3秒）
    ↓
⭐ ACTIVE状态（按钮立即恢复）
    ↓
Batch翻译（后台）
    ├─ 正常执行 → 实时推送更新
    ├─ 触发429 → 智能延迟 → 自动重试 → 成功
    ├─ 重试3次仍失败 → INACTIVE + 错误提示
    └─ 用户关闭 → 中断会话 → INACTIVE
```

---

## 3. 详细设计

### 3.1 RetryHandler（核心组件）⭐

**职责**：
- 执行带429重试的异步操作
- 智能计算延迟时间（60秒窗口算法）
- 支持AbortSignal中断
- 统一日志输出

**位置**：`src/shared/utils/retry-handler.ts`

#### 3.1.1 接口设计

```typescript
/**
 * 智能重试处理器
 * 基于60秒滑动窗口的rate limit智能延迟算法
 */
export class RetryHandler {
  // 配置常量
  private static readonly MAX_RETRIES = 3;           // 最大重试次数
  private static readonly MIN_DELAY_MS = 5000;       // 最小延迟5秒
  private static readonly MAX_DELAY_MS = 20000;      // 最大延迟20秒（边界检查）
  private static readonly RATE_LIMIT_WINDOW_MS = 60000;  // rate limit窗口60秒

  /**
   * 执行带智能重试的操作
   *
   * @param operation 要执行的异步操作
   * @param options 配置选项
   * @returns 操作结果
   * @throws 非429错误或重试耗尽后的429错误
   */
  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      signal: AbortSignal;           // 中断信号
      serviceName: string;            // 服务名称（用于日志）
      batchNumber?: number;           // 批次号（可选，用于日志）
      totalBatches?: number;          // 总批次数（可选，用于日志）
      maxRetries?: number;            // 最大重试次数（可选，默认3）
    }
  ): Promise<T>;

  /**
   * 计算智能延迟时间（60秒窗口算法）
   *
   * 算法逻辑：
   * 1. 第一次429：delay = 60s - (现在 - 批次开始时间)
   * 2. 后续429：delay = 60s - (现在 - 上次429时间)
   * 3. 边界检查：0 < delay <= 20s 才使用，否则用5s兜底
   *
   * @param retryCount 当前重试次数
   * @param batchStartTime 批次开始时间戳
   * @param last429Time 上次429时间戳
   * @returns 延迟毫秒数
   */
  private static calculateSmartDelay(
    retryCount: number,
    batchStartTime: number,
    last429Time: number
  ): number;

  /**
   * 支持signal中断的延迟
   * @param ms 延迟毫秒数
   * @param signal 中断信号
   */
  private static async delayWithSignal(
    ms: number,
    signal: AbortSignal
  ): Promise<void>;
}
```

#### 3.1.2 智能延迟算法

**核心思想**：
- API的rate limit通常是"60秒内最多N次请求"
- 触发429时，说明60秒窗口内请求过多
- 计算距离窗口开始的时间，等到窗口结束再重试

**算法实现**：

```typescript
private static calculateSmartDelay(
  retryCount: number,
  batchStartTime: number,
  last429Time: number
): number {
  const now = Date.now();
  let delay: number;

  if (retryCount === 1) {
    // 第一次429：基于批次开始时间
    const elapsed = now - batchStartTime;
    delay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsed;
  } else {
    // 后续429：基于上次429时间
    const elapsedSinceLast = now - last429Time;

    if (elapsedSinceLast >= RetryHandler.RATE_LIMIT_WINDOW_MS) {
      // 窗口已过，用最小延迟
      return RetryHandler.MIN_DELAY_MS;
    }

    delay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsedSinceLast;
  }

  // ⭐ 边界检查：0 < delay <= 20s
  if (delay > 0 && delay <= RetryHandler.MAX_DELAY_MS) {
    return delay;
  }

  // 异常情况，用5秒兜底
  return RetryHandler.MIN_DELAY_MS;
}
```

**算法示例**：

| 场景 | 批次开始时间 | 触发429时间 | elapsed | 计算delay | 实际delay | 说明 |
|------|-------------|------------|---------|-----------|-----------|------|
| 场景1 | 0s | 40s | 40s | 60-40=20s | 20s ✅ | 正好在边界 |
| 场景2 | 0s | 50s | 50s | 60-50=10s | 10s ✅ | 正常计算 |
| 场景3 | 0s | 59s | 59s | 60-59=1s | 1s ✅ | 最小有效值 |
| 场景4 | 0s | 30s | 30s | 60-30=30s | 5s ⚠️ | 超过20s，用兜底 |
| 场景5 | 0s | 61s | 61s | 60-61=-1s | 5s ⚠️ | 负数，用兜底 |

**边界检查原理**：
- `delay > 0`：确保不是负数（不应该发生，但防御性编程）
- `delay <= 20s`：避免等待时间过长影响用户体验
- 不满足条件时，使用5秒兜底值（安全且合理）

#### 3.1.3 完整实现

```typescript
import { TranslationError } from '@shared/types/translation-errors';

/**
 * 智能重试处理器
 *
 * 核心功能：
 * 1. 捕获429错误并自动重试
 * 2. 基于60秒滑动窗口智能计算延迟时间
 * 3. 支持AbortSignal中断
 * 4. 统一日志输出
 */
export class RetryHandler {
  // ========== 配置常量 ==========
  private static readonly MAX_RETRIES = 3;                // 最大重试次数
  private static readonly MIN_DELAY_MS = 5000;            // 最小延迟5秒
  private static readonly MAX_DELAY_MS = 20000;           // 最大延迟20秒
  private static readonly RATE_LIMIT_WINDOW_MS = 60000;   // rate limit窗口60秒

  /**
   * 执行带智能重试的操作
   */
  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      signal: AbortSignal;
      serviceName: string;
      batchNumber?: number;
      totalBatches?: number;
      maxRetries?: number;
    }
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? RetryHandler.MAX_RETRIES;
    let retryCount = 0;
    const batchStartTime = Date.now();
    let last429Time = 0;

    while (retryCount <= maxRetries) {
      try {
        // 执行操作
        return await operation();

      } catch (error: any) {
        // 检查是否为429错误
        const is429 = error instanceof TranslationError && error.httpStatus === 429;

        if (!is429) {
          // 非429错误，直接抛出
          throw error;
        }

        retryCount++;

        // 检查是否超过最大重试次数
        if (retryCount > maxRetries) {
          const batchInfo = this.formatBatchInfo(options.batchNumber, options.totalBatches);
          console.error(
            `[${options.serviceName}] ❌ ${batchInfo}重试${maxRetries}次后仍失败（rate limit）`
          );
          throw error;
        }

        // ⭐ 计算智能延迟
        const now = Date.now();
        const delay = this.calculateSmartDelay(retryCount, batchStartTime, last429Time, now);
        last429Time = now;

        // 打印重试日志
        const batchInfo = this.formatBatchInfo(options.batchNumber, options.totalBatches);
        console.warn(
          `[${options.serviceName}] ⚠️ ${batchInfo}触发rate limit，` +
          `智能延迟${(delay / 1000).toFixed(1)}秒后重试（第${retryCount}次）`
        );

        // 检查signal状态
        if (options.signal.aborted) {
          throw new DOMException('重试已取消', 'AbortError');
        }

        // 延迟后重试
        await this.delayWithSignal(delay, options.signal);
      }
    }

    // 理论上不会到这里
    throw new Error('RetryHandler: 不应该到达这里');
  }

  /**
   * 计算智能延迟时间（60秒窗口算法）
   */
  private static calculateSmartDelay(
    retryCount: number,
    batchStartTime: number,
    last429Time: number,
    now: number
  ): number {
    let delay: number;

    if (retryCount === 1) {
      // 第一次429：基于批次开始时间
      const elapsed = now - batchStartTime;
      delay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsed;
    } else {
      // 后续429：基于上次429时间
      const elapsedSinceLast = now - last429Time;

      if (elapsedSinceLast >= RetryHandler.RATE_LIMIT_WINDOW_MS) {
        // 窗口已过，用最小延迟
        return RetryHandler.MIN_DELAY_MS;
      }

      delay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsedSinceLast;
    }

    // 边界检查：0 < delay <= 20s
    if (delay > 0 && delay <= RetryHandler.MAX_DELAY_MS) {
      return delay;
    }

    // 异常情况，用5秒兜底
    return RetryHandler.MIN_DELAY_MS;
  }

  /**
   * 支持signal中断的延迟
   */
  private static async delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
        resolve();
      }, ms);

      const abortHandler = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abortHandler);
        reject(new DOMException('延迟已取消', 'AbortError'));
      };

      signal.addEventListener('abort', abortHandler);
    });
  }

  /**
   * 格式化批次信息（用于日志）
   */
  private static formatBatchInfo(batchNumber?: number, totalBatches?: number): string {
    if (batchNumber && totalBatches) {
      return `批次${batchNumber}/${totalBatches} `;
    }
    return '';
  }
}
```

---

### 3.2 Translator改造

**改造范围**：
- `src/background/components/deepseek-translator.ts`
- `src/background/components/gemini-translator.ts`
- `src/background/components/deepl-translator.ts`

**改造原则**：
- ✅ 保持原有代码结构
- ✅ 只包装批次翻译逻辑
- ✅ 不修改API调用、数据转换等核心逻辑
- ✅ 保留原有日志和性能分析

#### 3.2.1 改造模式

**改造前**：

```typescript
// 原来的代码
for (let i = 0; i < texts.length; i += BATCH_SIZE) {
  const batch = texts.slice(i, i + BATCH_SIZE);

  // 批次翻译逻辑
  const messages = this.buildPrompt(batch, ...);
  const response = await this.callAPI(messages, signal, ...);
  const translations = this.parseResponse(response);

  results.push(...translations);
}
```

**改造后**：

```typescript
// 改造后的代码
import { RetryHandler } from '@shared/utils/retry-handler';

const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

for (let i = 0; i < texts.length; i += BATCH_SIZE) {
  const batch = texts.slice(i, i + BATCH_SIZE);
  const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

  // ⭐ 使用RetryHandler包装批次翻译
  const translations = await RetryHandler.executeWithRetry(
    async () => {
      // 原来的批次翻译逻辑（完全不变）
      const messages = this.buildPrompt(batch, ...);
      const response = await this.callAPI(messages, signal, ...);
      return this.parseResponse(response);
    },
    {
      signal,
      serviceName: 'DeepSeekTranslator',  // 或 'GeminiTranslator' / 'DeepLTranslator'
      batchNumber,
      totalBatches
    }
  );

  results.push(...translations);
}
```

#### 3.2.2 DeepSeek改造示例

```typescript
// src/background/components/deepseek-translator.ts

// ⭐ 新增导入
import { RetryHandler } from '@shared/utils/retry-handler';

export class DeepSeekTranslator {
  // ... 其他代码不变 ...

  public async translate(
    texts: string[],
    sourceLangName: string,
    targetLangName: string,
    stage: 'urgent' | 'batch',
    signal: AbortSignal
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    console.log(
      `[DeepSeekTranslator] → 翻译 ${texts.length}条 | ${stage}阶段 | ` +
      `${sourceLangName} → ${targetLangName}`
    );

    const results: string[] = [];
    const totalBatches = Math.ceil(texts.length / DeepSeekTranslator.BATCH_SIZE);

    // 分批处理
    for (let i = 0; i < texts.length; i += DeepSeekTranslator.BATCH_SIZE) {
      if (signal.aborted) {
        throw this.createFatalError('error_translation_switch_provider');
      }

      const batch = texts.slice(i, i + DeepSeekTranslator.BATCH_SIZE);
      const batchNumber = Math.floor(i / DeepSeekTranslator.BATCH_SIZE) + 1;

      // ⭐ 使用RetryHandler包装批次翻译
      const translations = await RetryHandler.executeWithRetry(
        async () => {
          // 原来的批次翻译逻辑（完全不变）
          const messages = this.buildTranslationPrompt(
            batch,
            sourceLangName,
            targetLangName
          );

          const estimatedMaxTokens = TokenEstimator.estimateOutputTokens(
            batch.join(DeepSeekTranslator.SEPARATOR),
            DeepSeekTranslator.MAX_TOKENS
          );

          const { content } = await this.callAPI(messages, signal, estimatedMaxTokens);
          const translations = content.split(DeepSeekTranslator.SEPARATOR);

          // 验证数量
          if (translations.length !== batch.length) {
            throw this.createFatalError('error_translation_switch_provider');
          }

          return translations.map(t => t.trim());
        },
        {
          signal,
          serviceName: 'DeepSeekTranslator',
          batchNumber,
          totalBatches
        }
      );

      results.push(...translations);

      // 批次间延迟（仅batch阶段）
      if (stage === 'batch' && i + DeepSeekTranslator.BATCH_SIZE < texts.length) {
        await this.delayWithSignal(DeepSeekTranslator.BATCH_DELAY_MS, signal);
      }
    }

    console.log(`[DeepSeekTranslator] ✅ 翻译完成: ${results.length}/${texts.length}条`);
    return results;
  }

  // ... 其他方法不变 ...
}
```

#### 3.2.3 Gemini改造要点

Gemini有YAML转换和性能分析，需要保留：

```typescript
// ⭐ 使用RetryHandler包装
const translations = await RetryHandler.executeWithRetry(
  async () => {
    // ⏱️ 性能分析：记录各环节耗时
    const perfStart = performance.now();

    // 1. 转换为YAML格式
    const t1 = performance.now();
    const yamlInput = this.convertToYAML(batch);
    const t2 = performance.now();

    // 2. 构建prompt
    const prompt = this.buildTranslationPrompt(yamlInput, batch.length, sourceLangName, targetLangName);
    const t3 = performance.now();

    // 3. 估算maxOutputTokens
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(yamlInput).length;
    const estimatedOutputTokens = Math.ceil((inputBytes / 2.5) * 1.5);
    const maxOutputTokens = Math.min(estimatedOutputTokens, this.modelConfig.maxOutput);

    // 4. 调用Gemini API
    const responseText = await this.callGeminiAPI(prompt, signal, maxOutputTokens);
    const t4 = performance.now();

    // 5. 解析YAML结果
    const translations = this.parseYAMLResponse(responseText, batch.length);
    const t5 = performance.now();

    // ⏱️ 性能统计（保留原有日志）
    const perfTotal = t5 - perfStart;
    console.log(
      `[GeminiTranslator] ⏱️ 批次${batchNumber}性能分析: 总耗时${perfTotal.toFixed(0)}ms | ` +
      `YAML转换=${(t2-t1).toFixed(0)}ms, Prompt构建=${(t3-t2).toFixed(0)}ms, ` +
      `API调用=${(t4-t3).toFixed(0)}ms (${((t4-t3)/perfTotal*100).toFixed(1)}%), ` +
      `YAML解析=${(t5-t4).toFixed(0)}ms`
    );

    // 验证数量
    if (translations.length !== batch.length) {
      throw new TranslationError(...);
    }

    return translations;
  },
  {
    signal,
    serviceName: 'GeminiTranslator',
    batchNumber,
    totalBatches
  }
);
```

#### 3.2.4 DeepL改造要点

DeepL类似DeepSeek，但有计费字符统计，需要保留：

```typescript
// ⭐ 使用RetryHandler包装
const batchTranslations = await RetryHandler.executeWithRetry(
  async () => {
    // 原来的API调用逻辑
    const requestBody: DeepLRequest = {
      text: batch,
      target_lang: targetLang,
      source_lang: sourceLang !== 'auto' ? sourceLang : undefined,
      formality: this.formality as any,
      split_sentences: this.splitSentences,
      preserve_formatting: this.preserveFormatting,
      model_type: this.modelType as any,
      show_billed_characters: this.showBilledCharacters
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      await this.handleAPIError(response);
    }

    const data: DeepLResponse = await response.json();

    // 计费字符统计（保留）
    if (data.billed_characters) {
      totalBilledCharacters += data.billed_characters;
    }

    return data.translations.map(t => t.text);
  },
  {
    signal,
    serviceName: 'DeepLTranslator',
    batchNumber,
    totalBatches
  }
);
```

---

### 3.3 UI状态管理优化

**改动位置**：`src/background/handle-toggle-translate-v4.ts`

#### 3.3.1 改动1：urgent完成后立即ACTIVE

**位置**：Line ~933（urgent翻译完成后）

```typescript
// 发送紧急翻译
if (urgentSubtitles && urgentSubtitles.length > 0) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'TRANSLATION_UPDATE',
      data: {
        updateType: 'urgent',
        translatedSubtitles: urgentSubtitles
      }
    });
    console.log(`[service-worker-v4] ✓ 已发送 ${urgentSubtitles.length} 条紧急翻译`);
  } catch (err) {
    console.error('[service-worker-v4] 发送紧急翻译失败:', err);
  }
}

// ⭐ 新增：立即激活UI（提升用户体验，避免按钮长时间PENDING）
console.debug('[service-worker-v4] → 紧急翻译完成，设置状态为 ACTIVE');
await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);
console.log('[service-worker-v4] ✅ 翻译已激活（批量翻译将在后台继续）');
```

**理由**：
- urgent翻译通常2-3秒完成
- 用户看到前后字幕后，按钮应该立即恢复
- batch翻译在后台继续，用户无感知

---

#### 3.3.2 改动2：清理同tab旧会话（开启翻译时）

**位置**：Line ~223（创建新会话前）

```typescript
console.log('[service-worker-v4] 开启翻译，创建会话:', sessionId);

// ⭐ 新增：清理同tab的所有旧会话
// 场景：用户在batch翻译进行中切换了视频
const activeSessionIds = abortTimeoutManager.getActiveSessionIds();
const tabPrefix = `translate_${tabId}_`;
const oldSessions = activeSessionIds.filter(
  id => id.startsWith(tabPrefix) && id !== sessionId
);

if (oldSessions.length > 0) {
  console.log(
    `[service-worker-v4] 检测到 ${oldSessions.length} 个同tab旧会话，先清理:`,
    oldSessions
  );
  oldSessions.forEach(sid => {
    abortTimeoutManager.abortSession(sid, '新翻译任务开始');
  });
}

// 创建新会话
const session = abortTimeoutManager.createSession(sessionId);
```

**理由**：
- 防止旧视频的batch翻译继续执行
- 节省API配额
- 避免会话泄漏

---

#### 3.3.3 改动3：清理同tab所有会话（关闭翻译时）

**位置**：Line ~201（关闭翻译）

```typescript
if (!newState) {
  console.log('[service-worker-v4] 关闭翻译');

  // ⭐ 修改：清理同tab的所有会话（不只是当前sessionId）
  // 原因：可能存在多个会话（切换视频后）
  const activeSessionIds = abortTimeoutManager.getActiveSessionIds();
  const tabPrefix = `translate_${tabId}_`;
  const tabSessions = activeSessionIds.filter(id => id.startsWith(tabPrefix));

  if (tabSessions.length > 0) {
    console.log(
      `[service-worker-v4] 中断 ${tabSessions.length} 个翻译会话:`,
      tabSessions
    );
    tabSessions.forEach(sid => {
      abortTimeoutManager.abortSession(sid, '用户主动关闭翻译');
    });
  }

  // 原有的单会话清理逻辑（保留作为兼容）
  if (abortTimeoutManager.hasSession(sessionId)) {
    console.log('[service-worker-v4] ✓ 会话已取消');
  }

  // 设置INACTIVE
  await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
  await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);

  return { success: true };
}
```

**理由**：
- 确保所有翻译任务都被中断
- 防止资源泄漏
- 用户体验更一致

---

#### 3.3.4 改动4：batch失败处理（清理字幕）

**位置**：Line ~1120（catch块）

```typescript
catch (error: any) {
  console.error('[service-worker-v4] 翻译失败:', error?.message || error);

  // ⭐ 设置INACTIVE（batch失败后退回未激活状态）
  console.debug('[service-worker-v4] → 批量翻译失败，设置状态为 INACTIVE');
  await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
  await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);

  // ⭐ 清理字幕（batch失败后清除所有翻译字幕）
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'CLEAR_TRANSLATION'
    });
    console.log('[service-worker-v4] ✓ 已清理翻译字幕');
  } catch (err) {
    console.error('[service-worker-v4] 清理字幕失败:', err);
  }

  // 返回错误信息
  const friendlyMessage = getUserFriendlyMessage(error);
  const userMessage = friendlyMessage ||
    chrome.i18n.getMessage('error_translation_failed') ||
    'Translation failed';

  // 清理会话
  session.abort('翻译失败');

  return {
    success: false,
    message: userMessage
  };
}
```

**理由**：
- 失败后完全退回到未激活状态
- 清理所有字幕（包括urgent已显示的）
- 明确反馈失败状态（INACTIVE）
- 错误信息友好提示

---

#### 3.3.5 改动5：删除重复的ACTIVE设置

**位置**：Line ~1107-1111（Stage 6完成时）

```typescript
// ❌ 删除这段（因为已经在urgent后设置了ACTIVE）
// console.debug('[service-worker-v4] → 设置状态为 ACTIVE');
// await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
// session.complete();
// await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);

// ✅ 改为：
console.debug('[service-worker-v4] → 批量翻译完成');
session.complete();  // 只标记会话完成
console.log('[service-worker-v4] ✅ 全部翻译已完成');

return {
  success: true,
  action: 'streamed',
  message: chrome.i18n.getMessage('status_translation_streamed') ||
    'Translation delivered via live updates'
};
```

**理由**：
- 避免重复设置ACTIVE（已在urgent后设置）
- 保持状态一致性
- 代码更清晰

---

## 4. 代码结构

### 4.1 新增文件

```
src/shared/utils/
└── retry-handler.ts              ⭐ 新增：智能重试处理器
```

### 4.2 修改文件

```
src/background/
├── handle-toggle-translate-v4.ts  ⭐ 修改：UI状态管理（5处改动）
└── components/
    ├── deepseek-translator.ts     ⭐ 修改：添加RetryHandler包装
    ├── gemini-translator.ts       ⭐ 修改：添加RetryHandler包装
    └── deepl-translator.ts        ⭐ 修改：添加RetryHandler包装
```

### 4.3 导入关系

```typescript
// deepseek-translator.ts
import { RetryHandler } from '@shared/utils/retry-handler';
import { TranslationError } from '@shared/types/translation-errors';
import { TokenEstimator } from '@shared/utils/token-estimator';

// gemini-translator.ts
import { RetryHandler } from '@shared/utils/retry-handler';
import { TranslationError } from '@shared/types/translation-errors';

// deepl-translator.ts
import { RetryHandler } from '@shared/utils/retry-handler';
import { TranslationError } from '@shared/types/translation-errors';
```

### 4.4 代码行数估算

| 文件 | 新增行数 | 修改行数 | 删除行数 |
|------|---------|---------|---------|
| retry-handler.ts | ~150 | 0 | 0 |
| deepseek-translator.ts | ~15 | ~20 | 0 |
| gemini-translator.ts | ~15 | ~25 | 0 |
| deepl-translator.ts | ~15 | ~20 | 0 |
| handle-toggle-translate-v4.ts | ~40 | ~10 | ~5 |
| **总计** | **~235** | **~75** | **~5** |

---

## 5. 实施计划

### 5.1 阶段划分

#### 🎯 Phase 1：核心工具类（1小时）

**任务**：
- [ ] 创建`src/shared/utils/retry-handler.ts`
- [ ] 实现`executeWithRetry()`方法
- [ ] 实现`calculateSmartDelay()`算法
- [ ] 实现`delayWithSignal()`方法
- [ ] 添加日志格式化方法
- [ ] 代码review

**验收标准**：
- ✅ 编译通过，无类型错误
- ✅ 智能延迟算法逻辑正确
- ✅ signal中断机制正常工作

---

#### 🎯 Phase 2：Translator改造（2小时）

**任务**：
- [ ] 改造DeepSeek（30分钟）
  - 导入RetryHandler
  - 包装批次翻译逻辑
  - 测试编译
- [ ] 改造Gemini（45分钟）
  - 导入RetryHandler
  - 包装批次翻译（保留YAML和性能日志）
  - 测试编译
- [ ] 改造DeepL（30分钟）
  - 导入RetryHandler
  - 包装批次翻译（保留计费统计）
  - 测试编译
- [ ] 代码review（15分钟）

**验收标准**：
- ✅ 3个translator编译通过
- ✅ 原有功能逻辑不变
- ✅ RetryHandler正确集成

---

#### 🎯 Phase 3：UI状态管理（1小时）

**任务**：
- [ ] urgent完成后立即ACTIVE（10分钟）
- [ ] 清理同tab旧会话 - 开启时（10分钟）
- [ ] 清理同tab所有会话 - 关闭时（10分钟）
- [ ] batch失败处理（10分钟）
- [ ] 删除重复ACTIVE设置（5分钟）
- [ ] 代码review（15分钟）

**验收标准**：
- ✅ 编译通过
- ✅ 状态转换逻辑正确
- ✅ 会话清理机制完善

---

#### 🎯 Phase 4：测试验证（2小时）

**任务**：
- [ ] 正常翻译测试（20分钟）
- [ ] 触发429测试（30分钟）
- [ ] 用户中途操作测试（30分钟）
- [ ] 边界情况测试（20分钟）
- [ ] 回归测试（20分钟）

**详细见第6节测试方案**

---

### 5.2 时间表

| 阶段 | 预计时间 | 累计时间 |
|------|---------|---------|
| Phase 1: RetryHandler | 1小时 | 1小时 |
| Phase 2: Translator改造 | 2小时 | 3小时 |
| Phase 3: UI状态管理 | 1小时 | 4小时 |
| Phase 4: 测试验证 | 2小时 | 6小时 |
| **总计** | **6小时** | - |

---

## 6. 测试方案

### 6.1 单元测试（可选）

```typescript
// retry-handler.test.ts
describe('RetryHandler', () => {
  describe('calculateSmartDelay', () => {
    it('第一次429：elapsed=40s → delay=20s', () => {
      const delay = RetryHandler['calculateSmartDelay'](
        1,  // retryCount
        Date.now() - 40000,  // batchStartTime（40秒前）
        0,  // last429Time
        Date.now()
      );
      expect(delay).toBe(20000);
    });

    it('第一次429：elapsed=30s → delay=30s > 20s → 返回5s', () => {
      const delay = RetryHandler['calculateSmartDelay'](
        1,
        Date.now() - 30000,
        0,
        Date.now()
      );
      expect(delay).toBe(5000);
    });

    it('第二次429：距上次10s → delay=50s > 20s → 返回5s', () => {
      const last429 = Date.now() - 10000;
      const delay = RetryHandler['calculateSmartDelay'](
        2,
        Date.now() - 50000,
        last429,
        Date.now()
      );
      expect(delay).toBe(5000);
    });

    it('第二次429：距上次45s → delay=15s', () => {
      const last429 = Date.now() - 45000;
      const delay = RetryHandler['calculateSmartDelay'](
        2,
        Date.now() - 60000,
        last429,
        Date.now()
      );
      expect(delay).toBe(15000);
    });

    it('第二次429：距上次61s → 窗口已过 → 返回5s', () => {
      const last429 = Date.now() - 61000;
      const delay = RetryHandler['calculateSmartDelay'](
        2,
        Date.now() - 70000,
        last429,
        Date.now()
      );
      expect(delay).toBe(5000);
    });
  });
});
```

---

### 6.2 集成测试

#### 测试场景1：正常翻译（无429）

**输入**：
- 100条字幕
- DeepSeek翻译服务
- 正常API调用

**操作**：
1. 点击翻译开关
2. 等待翻译完成

**预期结果**：
- ✅ 按钮状态：PENDING → ACTIVE（2-3秒）
- ✅ urgent翻译：前9+后30条快速显示
- ✅ batch翻译：正常完成，无重试日志
- ✅ 最终状态：ACTIVE
- ✅ 字幕显示：100条全部翻译

**验证点**：
- 无429错误日志
- 无重试日志
- 翻译总时长合理（约10-20秒）

---

#### 测试场景2：触发429后成功恢复

**输入**：
- 600条字幕（模拟触发429）
- DeepSeek翻译服务
- 人为限制API频率

**操作**：
1. 点击翻译开关
2. 观察日志输出
3. 等待翻译完成

**预期结果**：
- ✅ 按钮状态：PENDING → ACTIVE（2-3秒）
- ✅ urgent翻译：正常完成
- ✅ batch翻译：某批次触发429
- ✅ 重试日志：`⚠️ 批次XX/60 触发rate limit，智能延迟15.2秒后重试（第1次）`
- ✅ 延迟计算：在(0, 20s]范围内
- ✅ 重试成功：继续翻译
- ✅ 最终状态：ACTIVE
- ✅ 字幕显示：600条全部翻译

**验证点**：
- 延迟时间计算正确
- 重试次数 ≤ 3
- 最终翻译成功

---

#### 测试场景3：重试3次仍失败

**输入**：
- 持续触发429的情况
- 人为持续限制API

**操作**：
1. 点击翻译开关
2. 观察重试过程
3. 等待失败

**预期结果**：
- ✅ 按钮状态：PENDING → ACTIVE → INACTIVE
- ✅ urgent翻译：正常完成（字幕显示）
- ✅ batch翻译：触发429
- ✅ 重试3次：
  - 第1次：智能延迟X秒
  - 第2次：智能延迟Y秒
  - 第3次：智能延迟Z秒
- ✅ 第4次抛出错误：`❌ 批次XX/60 重试3次后仍失败（rate limit）`
- ✅ 状态变INACTIVE
- ✅ 错误提示：显示友好错误信息
- ✅ 字幕清理：所有翻译字幕被清除（包括urgent字幕）

**验证点**：
- 准确重试3次
- 所有字幕被清除
- 错误信息友好

---

#### 测试场景4：用户中途关闭

**操作**：
1. 开启翻译
2. urgent完成（按钮ACTIVE）
3. batch翻译进行中
4. 用户点击关闭

**预期结果**：
- ✅ 会话被中断：`中断 1 个翻译会话`
- ✅ batch翻译停止：抛出AbortError
- ✅ 状态变INACTIVE
- ✅ 字幕消失

**验证点**：
- signal.aborted正确触发
- 翻译立即停止
- 无残留任务

---

#### 测试场景5：切换视频

**操作**：
1. 视频A开启翻译
2. urgent完成（按钮ACTIVE）
3. batch翻译进行中（假设60批次，进行到第30批）
4. 切换到视频B
5. 视频B开启翻译

**预期结果**：
- ✅ 视频A会话被中断：`检测到 1 个同tab旧会话，先清理`
- ✅ 视频A的batch停止
- ✅ 视频B正常翻译：
  - PENDING → urgent → ACTIVE
  - batch翻译正常进行

**验证点**：
- 旧会话正确清理
- 新会话正常执行
- 无会话泄漏

---

### 6.3 边界测试

#### 边界1：延迟计算边界

| elapsed | 预期delay | 实际delay | 结果 |
|---------|----------|-----------|------|
| 59s | 60-59=1s | 1s | ✅ 最小有效值 |
| 60s | 60-60=0s | 5s | ✅ 边界兜底 |
| 61s | 60-61=-1s | 5s | ✅ 负数兜底 |
| 40s | 60-40=20s | 20s | ✅ 最大有效值 |
| 39s | 60-39=21s | 5s | ✅ 超出兜底 |
| 50s | 60-50=10s | 10s | ✅ 正常计算 |

**测试方法**：
- 单元测试验证calculateSmartDelay()
- 模拟不同elapsed值

---

#### 边界2：signal中断

**测试用例**：

1. **延迟过程中signal.abort()**
   - 操作：延迟5秒中，2秒时abort
   - 预期：抛出AbortError，延迟中断

2. **操作执行中signal.abort()**
   - 操作：API调用中abort
   - 预期：fetch抛出AbortError

3. **重试过程中signal.abort()**
   - 操作：第1次重试等待中abort
   - 预期：不进行第2次重试

---

#### 边界3：极端情况

**测试用例**：

1. **空字幕数组**
   - 输入：[]
   - 预期：立即返回[]，无API调用

2. **单条字幕**
   - 输入：1条
   - 预期：正常翻译，无批次循环

3. **超大字幕量**
   - 输入：10000条
   - 预期：正常分批，可能多次触发429并重试

---

## 7. 风险评估

### 7.1 潜在风险

| 风险 | 影响程度 | 发生概率 | 缓解措施 |
|------|---------|---------|---------|
| 延迟计算错误 | 中 | 低 | 充分测试边界条件，单元测试覆盖 |
| signal中断失效 | 高 | 低 | 每个延迟点都检查signal，测试验证 |
| 重试死循环 | 高 | 极低 | 严格限制MAX_RETRIES=3 |
| UI状态不一致 | 中 | 低 | 状态变更前后加日志，测试验证 |
| 旧会话未清理 | 中 | 低 | 开启/关闭时都清理同tab会话 |
| RetryHandler引入bug | 中 | 低 | 保持原有逻辑不变，只包装 |
| 性能下降 | 低 | 极低 | RetryHandler开销极小 |

### 7.2 回滚方案

如果出现严重问题，可以快速回滚：

#### 回滚步骤1：移除RetryHandler调用

```typescript
// 恢复为原来的代码
for (let i = 0; i < texts.length; i += BATCH_SIZE) {
  const batch = texts.slice(i, i + BATCH_SIZE);

  // 直接执行，不包装
  const messages = this.buildPrompt(batch, ...);
  const response = await this.callAPI(messages, signal, ...);
  const translations = this.parseResponse(response);

  results.push(...translations);
}
```

#### 回滚步骤2：撤销urgent后ACTIVE

```typescript
// 删除urgent后的ACTIVE设置
// 恢复在Stage 6设置ACTIVE
```

#### 回滚步骤3：保留会话清理逻辑

```typescript
// 这部分改动无风险，可以保留
// 会话清理机制是有益的优化
```

### 7.3 监控指标

**上线后监控**：
- 429错误频率
- 重试成功率
- 平均延迟时间
- 翻译成功率
- 用户投诉

---

## 8. 成功标准

### 8.1 功能指标

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 长视频翻译成功率 | 100% | 600条字幕视频能成功翻译 |
| 429自动恢复率 | ≥90% | 触发429后能自动恢复 |
| 按钮PENDING时间 | <5秒 | urgent完成后立即ACTIVE |
| 用户操作响应 | 100% | 关闭、切换能正确响应 |

### 8.2 性能指标

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 无429时翻译速度 | 不变 | 对比改造前后耗时 |
| 延迟计算耗时 | <10ms | 性能测试 |
| 重试次数 | ≤3次 | 日志验证 |
| 内存占用 | 不增加 | Chrome DevTools监控 |

### 8.3 代码质量

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 代码复用 | 1个工具类 | 3个translator共用RetryHandler |
| 可维护性 | 高 | 改动集中，逻辑清晰 |
| 日志完整性 | 100% | 关键节点有日志 |
| 类型安全 | 无错误 | TypeScript编译通过 |

### 8.4 用户体验

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 按钮响应速度 | 快 | urgent后立即ACTIVE |
| 错误提示友好 | 是 | 显示可理解的错误信息 |
| 部分成功可见 | 是 | 失败时保留urgent字幕 |
| 无感知重试 | 是 | 用户看不到重试过程 |

---

## 附录

### A. 相关文档

- [07-batch-translation-architecture.md](./07-batch-translation-architecture.md) - 批量翻译架构
- [08-abort-timeout-architecture.md](./08-abort-timeout-architecture.md) - AbortController超时架构
- [translation-services-error-codes.md](../translation-services-error-codes.md) - 翻译服务错误码

### B. 术语表

| 术语 | 定义 |
|------|------|
| Rate Limit | API速率限制，如"60秒内最多N次请求" |
| 429错误 | HTTP状态码，表示"请求过于频繁" |
| Urgent翻译 | 紧急翻译阶段，翻译前9+后30条字幕 |
| Batch翻译 | 批量翻译阶段，翻译全部字幕 |
| 滑动窗口 | 时间窗口会随时间推移而移动 |
| 智能延迟 | 基于实际触发时间动态计算的延迟 |

### C. 更新记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|---------|
| v1.0 | 2025-11-07 | Claude Code | 初始版本 |

---

**文档结束**
