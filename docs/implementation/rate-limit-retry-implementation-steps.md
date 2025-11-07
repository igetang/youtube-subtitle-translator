# Rate Limit Retry 机制 - 详细实现步骤

**创建时间**: 2025-11-07
**版本**: v1.0.0
**基于架构文档**: `docs/architecture/11-rate-limit-retry-architecture.md`

---

## 📋 目录

1. [实施概览](#实施概览)
2. [Phase 1: RetryHandler工具类](#phase-1-retryhandler工具类)
3. [Phase 2: 翻译器改造](#phase-2-翻译器改造)
4. [Phase 3: UI状态管理](#phase-3-ui状态管理)
5. [Phase 4: 测试验证](#phase-4-测试验证)
6. [编译与验证](#编译与验证)

---

## 实施概览

### 总体目标
为DeepSeek、Gemini、DeepL三个翻译服务实现智能重试机制,解决长视频(600+字幕)因批量翻译触发API速率限制(429错误)导致翻译永久失败的问题。

### 核心策略
- **紧急翻译(urgent)**: 触发限制立即失败(Fail Fast)
- **批量翻译(batch)**: 智能延迟 + 重试,最大重试3次
- **智能延迟算法**: 基于60秒滑动窗口计算精确延迟时间
- **UI状态优化**: 紧急翻译完成即设为ACTIVE,批量翻译后台继续

### 涉及文件
```
src/shared/utils/retry-handler.ts                    # 新建
src/background/components/deepseek-translator.ts     # 修改
src/background/components/gemini-translator.ts       # 修改
src/background/components/deepl-translator.ts        # 修改
src/background/handle-toggle-translate-v4.ts         # 修改
```

---

## Phase 1: RetryHandler工具类

### Step 1.1: 创建文件

**文件路径**: `src/shared/utils/retry-handler.ts`

**完整代码**:

```typescript
/**
 * @file retry-handler.ts
 * @description 统一的重试处理器，专门用于翻译服务的429错误处理
 * @version 1.0.0
 *
 * 核心特性:
 * - 基于60秒滑动窗口的智能延迟计算
 * - 支持AbortSignal中断
 * - 最大重试3次
 * - 延迟边界检查: 0 < delay <= 20s, 否则使用5s
 */

import { TranslationError } from '@shared/types/translation-errors';

/**
 * RetryHandler 重试处理器
 * 专门处理翻译API的429错误(Rate Limit)
 */
export class RetryHandler {
  // ========== 常量配置 ==========
  private static readonly MAX_RETRIES = 3;               // 最大重试次数
  private static readonly RATE_LIMIT_WINDOW_MS = 60000;  // 速率限制窗口: 60秒
  private static readonly MIN_DELAY_MS = 5000;           // 最小延迟: 5秒
  private static readonly MAX_DELAY_MS = 20000;          // 最大延迟: 20秒

  /**
   * 执行带重试的操作
   * @param operation 要执行的异步操作
   * @param options 配置选项
   * @returns 操作结果
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
    const { signal, serviceName, batchNumber, totalBatches, maxRetries = RetryHandler.MAX_RETRIES } = options;

    let retryCount = 0;
    let batchStartTime = Date.now();  // 记录批次开始时间
    let last429Time = 0;               // 记录上次429错误的时间

    while (retryCount <= maxRetries) {
      // 检查中断信号
      if (signal.aborted) {
        throw new Error('操作已取消');
      }

      try {
        // 执行操作
        const result = await operation();

        // 成功后打印日志(仅在发生过重试时)
        if (retryCount > 0) {
          console.log(
            `[${serviceName}] ✓ 重试成功: ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
            `重试次数: ${retryCount}/${maxRetries}`
          );
        }

        return result;
      } catch (error) {
        // 检查是否是429错误
        if (!RetryHandler.is429Error(error)) {
          // 非429错误直接抛出
          throw error;
        }

        // 达到最大重试次数
        if (retryCount >= maxRetries) {
          console.error(
            `[${serviceName}] ✗ 重试失败: ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
            `已达最大重试次数 ${maxRetries}`
          );
          throw error;
        }

        // 计算智能延迟
        const now = Date.now();
        retryCount++;
        const delay = RetryHandler.calculateSmartDelay(retryCount, batchStartTime, last429Time, now);
        last429Time = now;  // 更新上次429时间

        // 打印延迟日志
        console.log(
          `[${serviceName}] ⏳ 触发限速(429): ${RetryHandler.formatBatchInfo(batchNumber, totalBatches)} | ` +
          `重试 ${retryCount}/${maxRetries} | 延迟 ${(delay / 1000).toFixed(1)}s`
        );

        // 执行延迟
        await RetryHandler.delayWithSignal(delay, signal);
      }
    }

    // 理论上不会到这里,因为上面已经处理了所有情况
    throw new Error('重试逻辑错误');
  }

  /**
   * 智能延迟计算算法
   *
   * 算法说明:
   * 1. 第一次429: delay = 60s - (当前时间 - 批次开始时间)
   * 2. 后续429: delay = 60s - (当前时间 - 上次429时间)
   * 3. 边界检查: 如果 0 < delay <= 20s 则使用, 否则使用5s
   *
   * @param retryCount 当前重试次数(1-3)
   * @param batchStartTime 批次开始时间戳
   * @param last429Time 上次429错误时间戳
   * @param now 当前时间戳
   * @returns 延迟毫秒数
   */
  private static calculateSmartDelay(
    retryCount: number,
    batchStartTime: number,
    last429Time: number,
    now: number
  ): number {
    let delay: number;

    if (retryCount === 1) {
      // 第一次429: 基于批次开始时间计算
      const elapsed = now - batchStartTime;
      delay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsed;
    } else {
      // 后续429: 基于上次429时间计算
      const elapsedSinceLast = now - last429Time;

      // 如果距离上次429已经超过60秒,说明窗口已过,使用最小延迟
      if (elapsedSinceLast >= RetryHandler.RATE_LIMIT_WINDOW_MS) {
        return RetryHandler.MIN_DELAY_MS;
      }

      delay = RetryHandler.RATE_LIMIT_WINDOW_MS - elapsedSinceLast;
    }

    // 边界检查: 0 < delay <= 20s
    if (delay > 0 && delay <= RetryHandler.MAX_DELAY_MS) {
      return delay;
    }

    // 超出边界,使用最小延迟
    return RetryHandler.MIN_DELAY_MS;
  }

  /**
   * 支持中断的延迟函数
   * @param ms 延迟毫秒数
   * @param signal 中断信号
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
        reject(new Error('延迟被中断'));
      };

      signal.addEventListener('abort', abortHandler);
    });
  }

  /**
   * 检查错误是否是429错误
   * @param error 错误对象
   * @returns 是否是429错误
   */
  private static is429Error(error: unknown): boolean {
    if (error instanceof TranslationError) {
      return error.httpStatus === 429;
    }
    return false;
  }

  /**
   * 格式化批次信息
   * @param batchNumber 批次编号
   * @param totalBatches 总批次数
   * @returns 格式化字符串
   */
  private static formatBatchInfo(batchNumber?: number, totalBatches?: number): string {
    if (batchNumber !== undefined && totalBatches !== undefined) {
      return `批次 ${batchNumber}/${totalBatches}`;
    }
    return '批次未知';
  }
}
```

### Step 1.2: 验证文件创建

```bash
# 检查文件是否存在
ls -la src/shared/utils/retry-handler.ts

# 验证TypeScript语法
npx tsc --noEmit src/shared/utils/retry-handler.ts
```

---

## Phase 2: 翻译器改造

### Step 2.1: DeepSeek Translator

**文件**: `src/background/components/deepseek-translator.ts`

#### 2.1.1 添加导入

**位置**: 文件开头(在现有import之后)

**添加代码**:
```typescript
import { RetryHandler } from '@shared/utils/retry-handler';
```

#### 2.1.2 修改translate方法

**位置**: Line 114-214 (translate方法内的批次循环)

**修改前** (Line 114-204):
```typescript
// 分批处理（统一 10 条/批）
const totalBatches = Math.ceil(texts.length / DeepSeekTranslator.BATCH_SIZE);
for (let i = 0; i < texts.length; i += DeepSeekTranslator.BATCH_SIZE) {
  if (signal.aborted) {
    throw this.createFatalError('error_translation_switch_provider');
  }

  const batch = texts.slice(i, i + DeepSeekTranslator.BATCH_SIZE);
  const batchNumber = Math.floor(i / DeepSeekTranslator.BATCH_SIZE) + 1;

  // 🔧 调试日志：打印输入字幕（完整拼接字符串）
  const combinedInput = batch.join(DeepSeekTranslator.SEPARATOR);
  if (DeepSeekTranslator.DEBUG_TRANSLATION) {
    console.log(`\n========== [DeepSeekTranslator] 批次${batchNumber}/${totalBatches} (${stage}阶段) ==========`);
    console.log(`📥 原文拼接字符串 (共${batch.length}条):`);
    console.log(JSON.stringify(combinedInput));
    console.log(`${'='.repeat(60)}`);
  }

  // 构建提示词并调用 API（使用英文语言名称）
  const messages = this.buildTranslationPrompt(
    batch,
    sourceLangName,
    targetLangName
  );

  // 估算输出token（使用统一的TokenEstimator工具）
  const combinedText = batch.join(DeepSeekTranslator.SEPARATOR);
  const estimatedMaxTokens = TokenEstimator.estimateOutputTokens(
    combinedText,
    DeepSeekTranslator.MAX_TOKENS
  );

  const { content: response, usage } = await this.callAPI(messages, signal, estimatedMaxTokens);

  // 累计token使用
  if (usage) {
    totalInputTokens += usage.prompt_tokens;
    totalOutputTokens += usage.completion_tokens;
    totalEstimatedOutputTokens += estimatedMaxTokens;
  }

  // 🔧 调试日志：打印API返回的原始响应（完整字符串）
  if (DeepSeekTranslator.DEBUG_TRANSLATION) {
    console.log(`\n🔄 译文返回字符串:`);
    console.log(JSON.stringify(response));
    console.log(`${'='.repeat(60)}`);
    console.log(`🔍 响应长度: ${response.length}字符`);
    console.log(`🔍 分隔符"\\n---\\n"出现次数: ${(response.match(/\n---\n/g) || []).length}次 (期望${batch.length - 1}次)`);
    console.log(`${'='.repeat(60)}`);
  }

  // 解析响应
  const translations = response.split(DeepSeekTranslator.SEPARATOR);

  // 🔧 调试日志：打印双语对比
  if (DeepSeekTranslator.DEBUG_TRANSLATION) {
    console.log(`\n📋 双语字幕对比 (原文${batch.length}条 vs 译文${translations.length}条):`);
    const maxCount = Math.max(batch.length, translations.length);
    for (let idx = 0; idx < maxCount; idx++) {
      const original = batch[idx] || '【缺失】';
      const translated = translations[idx] || '【缺失】';
      console.log(`\n[${idx + 1}/${maxCount}]`);
      console.log(`  原文: ${original}`);
      console.log(`  译文: ${translated}`);
    }
    console.log(`${'='.repeat(60)}\n`);
  }

  // 验证数量匹配
  if (translations.length !== batch.length) {
    console.error(
      `[DeepSeekTranslator] ❌ 批次翻译数量不匹配: 期望${batch.length}, 实际${translations.length}`
    );
    // 🔧 详细错误信息
    if (DeepSeekTranslator.DEBUG_TRANSLATION) {
      console.error(`[DeepSeekTranslator] 🔍 详细对比:`);
      console.error(`  期望输入: ${batch.length}条`);
      console.error(`  实际输出: ${translations.length}条`);
      console.error(`  差异: ${translations.length - batch.length}条`);
    }
    throw this.createFatalError('error_translation_switch_provider');
  }

  results.push(...translations.map(t => t.trim()));

  // 批次间延迟（仅 batch 阶段）
  if (stage === 'batch' && i + DeepSeekTranslator.BATCH_SIZE < texts.length) {
    await this.delayWithSignal(DeepSeekTranslator.BATCH_DELAY_MS, signal);
  }
}
```

**修改后** (完整替换上述代码):
```typescript
// 分批处理（统一 10 条/批）
const totalBatches = Math.ceil(texts.length / DeepSeekTranslator.BATCH_SIZE);
for (let i = 0; i < texts.length; i += DeepSeekTranslator.BATCH_SIZE) {
  if (signal.aborted) {
    throw this.createFatalError('error_translation_switch_provider');
  }

  const batch = texts.slice(i, i + DeepSeekTranslator.BATCH_SIZE);
  const batchNumber = Math.floor(i / DeepSeekTranslator.BATCH_SIZE) + 1;

  // 🔧 调试日志：打印输入字幕（完整拼接字符串）
  const combinedInput = batch.join(DeepSeekTranslator.SEPARATOR);
  if (DeepSeekTranslator.DEBUG_TRANSLATION) {
    console.log(`\n========== [DeepSeekTranslator] 批次${batchNumber}/${totalBatches} (${stage}阶段) ==========`);
    console.log(`📥 原文拼接字符串 (共${batch.length}条):`);
    console.log(JSON.stringify(combinedInput));
    console.log(`${'='.repeat(60)}`);
  }

  // ⭐ 使用 RetryHandler 包裹整个批次翻译逻辑
  const translations = await RetryHandler.executeWithRetry(
    async () => {
      // 构建提示词并调用 API（使用英文语言名称）
      const messages = this.buildTranslationPrompt(
        batch,
        sourceLangName,
        targetLangName
      );

      // 估算输出token（使用统一的TokenEstimator工具）
      const combinedText = batch.join(DeepSeekTranslator.SEPARATOR);
      const estimatedMaxTokens = TokenEstimator.estimateOutputTokens(
        combinedText,
        DeepSeekTranslator.MAX_TOKENS
      );

      const { content: response, usage } = await this.callAPI(messages, signal, estimatedMaxTokens);

      // 累计token使用
      if (usage) {
        totalInputTokens += usage.prompt_tokens;
        totalOutputTokens += usage.completion_tokens;
        totalEstimatedOutputTokens += estimatedMaxTokens;
      }

      // 🔧 调试日志：打印API返回的原始响应（完整字符串）
      if (DeepSeekTranslator.DEBUG_TRANSLATION) {
        console.log(`\n🔄 译文返回字符串:`);
        console.log(JSON.stringify(response));
        console.log(`${'='.repeat(60)}`);
        console.log(`🔍 响应长度: ${response.length}字符`);
        console.log(`🔍 分隔符"\\n---\\n"出现次数: ${(response.match(/\n---\n/g) || []).length}次 (期望${batch.length - 1}次)`);
        console.log(`${'='.repeat(60)}`);
      }

      // 解析响应
      const parsedTranslations = response.split(DeepSeekTranslator.SEPARATOR);

      // 🔧 调试日志：打印双语对比
      if (DeepSeekTranslator.DEBUG_TRANSLATION) {
        console.log(`\n📋 双语字幕对比 (原文${batch.length}条 vs 译文${parsedTranslations.length}条):`);
        const maxCount = Math.max(batch.length, parsedTranslations.length);
        for (let idx = 0; idx < maxCount; idx++) {
          const original = batch[idx] || '【缺失】';
          const translated = parsedTranslations[idx] || '【缺失】';
          console.log(`\n[${idx + 1}/${maxCount}]`);
          console.log(`  原文: ${original}`);
          console.log(`  译文: ${translated}`);
        }
        console.log(`${'='.repeat(60)}\n`);
      }

      // 验证数量匹配
      if (parsedTranslations.length !== batch.length) {
        console.error(
          `[DeepSeekTranslator] ❌ 批次翻译数量不匹配: 期望${batch.length}, 实际${parsedTranslations.length}`
        );
        // 🔧 详细错误信息
        if (DeepSeekTranslator.DEBUG_TRANSLATION) {
          console.error(`[DeepSeekTranslator] 🔍 详细对比:`);
          console.error(`  期望输入: ${batch.length}条`);
          console.error(`  实际输出: ${parsedTranslations.length}条`);
          console.error(`  差异: ${parsedTranslations.length - batch.length}条`);
        }
        throw this.createFatalError('error_translation_switch_provider');
      }

      return parsedTranslations.map(t => t.trim());
    },
    {
      signal,
      serviceName: 'DeepSeekTranslator',
      batchNumber,
      totalBatches
    }
  );

  results.push(...translations);

  // 批次间延迟（仅 batch 阶段）
  if (stage === 'batch' && i + DeepSeekTranslator.BATCH_SIZE < texts.length) {
    await this.delayWithSignal(DeepSeekTranslator.BATCH_DELAY_MS, signal);
  }
}
```

**关键改动说明**:
1. 将整个批次翻译逻辑(API调用、token统计、解析、验证)包裹在`RetryHandler.executeWithRetry()`内
2. 429错误时自动触发智能延迟重试
3. 保留所有现有的调试日志、token统计、数量验证逻辑
4. 批次间延迟保持不变(仅batch阶段)

---

### Step 2.2: Gemini Translator

**文件**: `src/background/components/gemini-translator.ts`

#### 2.2.1 添加导入

**位置**: 文件开头(在现有import之后)

**添加代码**:
```typescript
import { RetryHandler } from '@shared/utils/retry-handler';
```

#### 2.2.2 修改translate方法

**位置**: Line 167-236 (translate方法内的try块)

**关键点**: Gemini需要特别保留YAML转换和性能日志

**修改前** (Line 167-236的核心部分):
```typescript
try {
  // 【批次循环】处理每个批次
  for (let i = 0; i < texts.length; i += batchSize) {
    // ... 中断检查 ...

    const batch = texts.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(texts.length / batchSize);

    // 将批次转换为YAML格式
    const yamlInput = this.convertToYAML(batch);

    const perfStart = performance.now();
    const yamlResponse = await this.callAPI(yamlInput, signal, stage);
    const perfEnd = performance.now();
    const duration = ((perfEnd - perfStart) / 1000).toFixed(1);

    console.debug(
      `[debug][GeminiTranslator] API响应时间: ${duration}s | 批次: ${batchNumber}/${totalBatches}`
    );

    // 解析YAML响应
    const translations = this.parseYAMLResponse(yamlResponse, batch.length);

    // ... 验证逻辑 ...

    results.push(...translations);

    // ... 批次延迟 ...
  }
} catch (error) {
  // ... 错误处理 ...
}
```

**修改后** (包裹RetryHandler):
```typescript
try {
  // 【批次循环】处理每个批次
  for (let i = 0; i < texts.length; i += batchSize) {
    // ... 中断检查(保持不变) ...

    const batch = texts.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(texts.length / batchSize);

    // ⭐ 使用 RetryHandler 包裹整个批次翻译逻辑
    const translations = await RetryHandler.executeWithRetry(
      async () => {
        // 将批次转换为YAML格式
        const yamlInput = this.convertToYAML(batch);

        const perfStart = performance.now();
        const yamlResponse = await this.callAPI(yamlInput, signal, stage);
        const perfEnd = performance.now();
        const duration = ((perfEnd - perfStart) / 1000).toFixed(1);

        console.debug(
          `[debug][GeminiTranslator] API响应时间: ${duration}s | 批次: ${batchNumber}/${totalBatches}`
        );

        // 解析YAML响应
        const parsedTranslations = this.parseYAMLResponse(yamlResponse, batch.length);

        // 验证数量匹配
        if (parsedTranslations.length !== batch.length) {
          console.error(
            `[GeminiTranslator] ❌ 批次翻译数量不匹配: 期望${batch.length}, 实际${parsedTranslations.length}`
          );
          throw this.createFatalError('error_translation_switch_provider');
        }

        return parsedTranslations;
      },
      {
        signal,
        serviceName: 'GeminiTranslator',
        batchNumber,
        totalBatches
      }
    );

    results.push(...translations);

    // 批次间延迟（仅 batch 阶段）
    if (stage === 'batch' && i + batchSize < texts.length) {
      await this.delayWithSignal(this.batchDelay, signal);
    }
  }
} catch (error) {
  // ... 错误处理(保持不变) ...
}
```

**关键改动说明**:
1. 将YAML转换、API调用、性能计时、解析、验证全部包裹在RetryHandler内
2. 保留完整的性能日志(`perfStart/perfEnd`)
3. 验证逻辑移到RetryHandler内部,确保每次重试都会验证

---

### Step 2.3: DeepL Translator

**文件**: `src/background/components/deepl-translator.ts`

#### 2.3.1 添加导入

**位置**: 文件开头(Line 19之后)

**添加代码**:
```typescript
import { RetryHandler } from '@shared/utils/retry-handler';
```

#### 2.3.2 修改translate方法

**位置**: Line 150-203 (translate方法内的批次循环)

**关键点**: DeepL需要保留计费字符统计

**修改前** (Line 150-203):
```typescript
// 分批处理（30 条/批）
for (let i = 0; i < texts.length; i += DeepLTranslator.BATCH_SIZE) {
  if (signal.aborted) {
    throw this.createFatalError('error_translation_switch_provider');
  }

  const batch = texts.slice(i, i + DeepLTranslator.BATCH_SIZE);

  // 调用 DeepL API（直接使用已转换的DeepL标准CODE）
  const requestBody: DeepLRequest = {
    text: batch,
    target_lang: targetLang,  // ✅ 直接使用（上层已转换）
    split_sentences: this.splitSentences,           // ⚠️ 字符串类型
    preserve_formatting: this.preserveFormatting,
    model_type: this.modelType as any,              // 模型类型
    show_billed_characters: this.showBilledCharacters  // 显示计费字符数
  };

  // 只有在支持 formality 的语言时才添加该参数
  if (this.isFormalitySupported(targetLang)) {
    requestBody.formality = this.formality as any;
  }

  // 源语言可选（省略则自动检测）
  if (sourceLang && sourceLang !== 'auto' && sourceLang !== 'AUTO') {
    requestBody.source_lang = sourceLang;  // ✅ 直接使用（上层已转换）
  }

  const response = await this.callAPI(requestBody, signal);

  // 提取翻译结果
  const translations = response.translations.map(t => t.text);

  // 验证数量匹配
  if (translations.length !== batch.length) {
    console.error(
      `[DeepLTranslator] ✗ 批次翻译数量不匹配: 期望${batch.length}, 实际${translations.length}`
    );
    throw this.createFatalError('error_translation_switch_provider');
  }

  results.push(...translations);

  // 累加计费字符
  if (response.billed_characters) {
    totalBilledCharacters += response.billed_characters;
  }

  // 批次间延迟（仅 batch 阶段）
  if (stage === 'batch' && i + DeepLTranslator.BATCH_SIZE < texts.length) {
    console.debug(`[debug][DeepLTranslator] 批次间延迟 ${this.batchDelay}ms`);
    await this.delayWithSignal(this.batchDelay, signal);
  }
}
```

**修改后** (完整替换上述代码):
```typescript
// 分批处理（30 条/批）
const totalBatches = Math.ceil(texts.length / DeepLTranslator.BATCH_SIZE);
for (let i = 0; i < texts.length; i += DeepLTranslator.BATCH_SIZE) {
  if (signal.aborted) {
    throw this.createFatalError('error_translation_switch_provider');
  }

  const batch = texts.slice(i, i + DeepLTranslator.BATCH_SIZE);
  const batchNumber = Math.floor(i / DeepLTranslator.BATCH_SIZE) + 1;

  // ⭐ 使用 RetryHandler 包裹整个批次翻译逻辑
  const { translations, billedChars } = await RetryHandler.executeWithRetry(
    async () => {
      // 调用 DeepL API（直接使用已转换的DeepL标准CODE）
      const requestBody: DeepLRequest = {
        text: batch,
        target_lang: targetLang,  // ✅ 直接使用（上层已转换）
        split_sentences: this.splitSentences,           // ⚠️ 字符串类型
        preserve_formatting: this.preserveFormatting,
        model_type: this.modelType as any,              // 模型类型
        show_billed_characters: this.showBilledCharacters  // 显示计费字符数
      };

      // 只有在支持 formality 的语言时才添加该参数
      if (this.isFormalitySupported(targetLang)) {
        requestBody.formality = this.formality as any;
      }

      // 源语言可选（省略则自动检测）
      if (sourceLang && sourceLang !== 'auto' && sourceLang !== 'AUTO') {
        requestBody.source_lang = sourceLang;  // ✅ 直接使用（上层已转换）
      }

      const response = await this.callAPI(requestBody, signal);

      // 提取翻译结果
      const parsedTranslations = response.translations.map(t => t.text);

      // 验证数量匹配
      if (parsedTranslations.length !== batch.length) {
        console.error(
          `[DeepLTranslator] ✗ 批次翻译数量不匹配: 期望${batch.length}, 实际${parsedTranslations.length}`
        );
        throw this.createFatalError('error_translation_switch_provider');
      }

      // 返回翻译结果和计费字符数
      return {
        translations: parsedTranslations,
        billedChars: response.billed_characters || 0
      };
    },
    {
      signal,
      serviceName: 'DeepLTranslator',
      batchNumber,
      totalBatches
    }
  );

  results.push(...translations);

  // 累加计费字符
  totalBilledCharacters += billedChars;

  // 批次间延迟（仅 batch 阶段）
  if (stage === 'batch' && i + DeepLTranslator.BATCH_SIZE < texts.length) {
    console.debug(`[debug][DeepLTranslator] 批次间延迟 ${this.batchDelay}ms`);
    await this.delayWithSignal(this.batchDelay, signal);
  }
}
```

**关键改动说明**:
1. 将整个批次翻译逻辑(请求构建、API调用、验证)包裹在RetryHandler内
2. **重要**: 返回值改为对象`{ translations, billedChars }`,以保留计费信息
3. 计费字符累加逻辑移到RetryHandler外部
4. 保留所有现有的参数构建和验证逻辑

---

## Phase 3: UI状态管理

**文件**: `src/background/handle-toggle-translate-v4.ts`

### Change 1: 关闭翻译时清理所有同标签页会话

**位置**: Line ~200-220 (关闭翻译逻辑)

**修改前**:
```typescript
// 清理会话
if (abortTimeoutManager.hasSession(sessionId)) {
  abortTimeoutManager.abortSession(sessionId, '用户主动关闭翻译');
  console.log('[service-worker-v4] ✓ 已终止翻译会话');
}
```

**修改后**:
```typescript
// 清理所有同标签页会话（包括当前和后台批量翻译）
const activeSessionIds = abortTimeoutManager.getActiveSessionIds();
const tabPrefix = `translate_${tabId}_`;
const tabSessions = activeSessionIds.filter(id => id.startsWith(tabPrefix));

if (tabSessions.length > 0) {
  tabSessions.forEach(sid => {
    abortTimeoutManager.abortSession(sid, '用户主动关闭翻译');
  });
  console.log(`[service-worker-v4] ✓ 已终止 ${tabSessions.length} 个翻译会话`);
}
```

**改动说明**:
- 原逻辑只清理当前sessionId
- 新逻辑清理所有`translate_${tabId}_`前缀的会话
- 确保批量翻译后台任务也被终止

---

### Change 2: 开启翻译时清理旧会话

**位置**: Line ~223 (创建会话之前)

**修改前**:
```typescript
// 创建会话
const session = abortTimeoutManager.createSession(sessionId);
```

**修改后**:
```typescript
// 清理同标签页的旧会话（避免重复任务）
const activeSessionIds = abortTimeoutManager.getActiveSessionIds();
const tabPrefix = `translate_${tabId}_`;
const oldSessions = activeSessionIds.filter(
  id => id.startsWith(tabPrefix) && id !== sessionId
);

if (oldSessions.length > 0) {
  oldSessions.forEach(sid => {
    abortTimeoutManager.abortSession(sid, '新翻译任务开始，终止旧任务');
  });
  console.debug(`[debug][service-worker-v4] 清理了 ${oldSessions.length} 个旧会话`);
}

// 创建新会话
const session = abortTimeoutManager.createSession(sessionId);
```

**改动说明**:
- 避免用户快速切换视频时,旧视频的批量翻译继续执行
- 确保每个标签页只有一个活跃翻译任务

---

### Change 3: 紧急翻译完成后立即设置ACTIVE

**位置**: Line ~933 (发送紧急翻译后)

**修改前**:
```typescript
console.log(`[service-worker-v4] ✓ 已发送 ${urgentSubtitles.length} 条紧急翻译`);

// ... 直接进入批量翻译 ...
console.debug('[service-worker-v4] Stage 10: 批量翻译');
```

**修改后**:
```typescript
console.log(`[service-worker-v4] ✓ 已发送 ${urgentSubtitles.length} 条紧急翻译`);

// ⭐ 立即设置ACTIVE状态（不等待批量翻译完成）
console.debug('[service-worker-v4] → 紧急翻译完成，设置状态为 ACTIVE');
await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);
console.log('[service-worker-v4] ✅ 翻译已激活（批量翻译将在后台继续）');

// ... 继续批量翻译 ...
console.debug('[service-worker-v4] Stage 10: 批量翻译');
```

**改动说明**:
- 紧急翻译(前9+后30)完成后立即激活按钮
- 批量翻译在后台继续,不影响用户操作
- 避免按钮长时间(>1分钟)处于PENDING状态

---

### Change 4: 简化批量翻译完成逻辑

**位置**: Line ~1107-1111 (批量翻译完成)

**修改前**:
```typescript
console.debug('[service-worker-v4] → 批量翻译完成');
session.complete();
console.log('[service-worker-v4] ✅ 批量翻译已完成，设置状态为 ACTIVE');
await runtimeStateManager.setTranslateState(TranslateActiveState.ACTIVE);
await notifyStateChange(tabId, 'translateActive', TranslateActiveState.ACTIVE);
```

**修改后**:
```typescript
console.debug('[service-worker-v4] → 批量翻译完成');
session.complete();
console.log('[service-worker-v4] ✅ 全部翻译已完成');
// 注意：ACTIVE状态已在紧急翻译完成后设置，这里不需要重复设置
```

**改动说明**:
- 移除重复的ACTIVE状态设置
- ACTIVE已在Change 3中设置,这里只需完成会话

---

### Change 5: 验证批量失败处理

**位置**: Line ~1188-1198 (批量翻译失败)

**现有代码** (应该已经正确):
```typescript
// 清除字幕
await chrome.tabs.sendMessage(tabId, {
  type: 'CLEAR_SUBTITLE_OVERLAY'
});

// 设置为INACTIVE
await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);

console.log('[service-worker-v4] ✗ 批量翻译失败，已清除所有字幕并设置为INACTIVE');
```

**验证要点**:
1. ✅ 清除所有字幕(包括紧急翻译的字幕)
2. ✅ 设置状态为INACTIVE
3. ✅ 通知UI更新

**如果代码不完全匹配,修改为**:
```typescript
// 批量翻译失败：清除所有字幕并设置为INACTIVE
try {
  // 清除字幕覆盖层
  await chrome.tabs.sendMessage(tabId, {
    type: 'CLEAR_SUBTITLE_OVERLAY'
  });
  console.debug('[debug][service-worker-v4] 已清除所有字幕');
} catch (err) {
  console.warn('[service-worker-v4] ⚠️ 清除字幕失败（标签页可能已关闭）');
}

// 设置为INACTIVE
await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
await notifyStateChange(tabId, 'translateActive', TranslateActiveState.INACTIVE);

console.log('[service-worker-v4] ✗ 批量翻译失败，已清除所有字幕并设置为INACTIVE');
```

---

## Phase 4: 测试验证

### 测试场景

#### 测试1: 紧急翻译触发429

**目的**: 验证紧急翻译Fail Fast

**步骤**:
1. 人为降低API限制(修改测试API密钥或使用模拟)
2. 打开短视频,点击翻译开关
3. 观察紧急翻译阶段

**预期结果**:
- ✅ 紧急翻译失败后立即停止
- ✅ 不进入批量翻译阶段
- ✅ 按钮状态变为INACTIVE
- ✅ 不显示任何字幕

---

#### 测试2: 批量翻译第一批次触发429

**目的**: 验证智能延迟计算(第一次429)

**步骤**:
1. 打开长视频(300+字幕)
2. 紧急翻译正常完成
3. 批量翻译第1批次触发429

**预期结果**:
- ✅ 按钮在紧急翻译完成后变为ACTIVE
- ✅ 批量翻译触发429后打印日志: `⏳ 触发限速(429): 批次 1/30 | 重试 1/3 | 延迟 Xs`
- ✅ 延迟时间: `0 < delay <= 20s`
- ✅ 延迟后自动重试
- ✅ 重试成功后打印: `✓ 重试成功: 批次 1/30 | 重试次数: 1/3`

**计算验证**:
- 假设批次开始后10秒触发429
- 延迟应为: `60s - 10s = 50s → 超出20s → 使用5s`
- 或者如果是5秒后触发: `60s - 5s = 55s → 超出20s → 使用5s`

---

#### 测试3: 批量翻译多次触发429

**目的**: 验证多次429的延迟计算

**步骤**:
1. 模拟连续触发429的场景
2. 观察每次重试的延迟时间

**预期结果**:
- ✅ 第1次429: 基于`批次开始时间`计算延迟
- ✅ 第2次429: 基于`上次429时间`计算延迟
- ✅ 第3次429: 基于`上次429时间`计算延迟
- ✅ 达到3次后抛出错误,清除所有字幕

**日志示例**:
```
[DeepSeekTranslator] ⏳ 触发限速(429): 批次 1/30 | 重试 1/3 | 延迟 5.0s
[DeepSeekTranslator] ⏳ 触发限速(429): 批次 1/30 | 重试 2/3 | 延迟 8.5s
[DeepSeekTranslator] ⏳ 触发限速(429): 批次 1/30 | 重试 3/3 | 延迟 12.0s
[DeepSeekTranslator] ✗ 重试失败: 批次 1/30 | 已达最大重试次数 3
[service-worker-v4] ✗ 批量翻译失败，已清除所有字幕并设置为INACTIVE
```

---

#### 测试4: 批量翻译中用户关闭翻译

**目的**: 验证会话清理逻辑

**步骤**:
1. 打开长视频,开启翻译
2. 紧急翻译完成后(按钮ACTIVE)
3. 等待批量翻译进行中(约5秒)
4. 点击翻译开关关闭

**预期结果**:
- ✅ 批量翻译立即中断
- ✅ 打印: `✓ 已终止 1 个翻译会话`
- ✅ 按钮变为INACTIVE
- ✅ 字幕清除
- ✅ 不再有API请求发送

---

#### 测试5: 批量翻译中用户切换视频

**目的**: 验证旧会话清理

**步骤**:
1. 打开视频A,开启翻译
2. 紧急翻译完成后
3. 立即跳转到视频B,开启翻译

**预期结果**:
- ✅ 视频A的批量翻译被终止
- ✅ 打印: `清理了 1 个旧会话`
- ✅ 视频B的翻译正常开始
- ✅ 无资源泄漏

---

#### 测试6: 长视频完整翻译流程

**目的**: 端到端验证

**步骤**:
1. 打开600字幕的长视频
2. 开启翻译,观察完整流程

**预期结果**:
- ✅ 紧急翻译(39条)完成 → 按钮ACTIVE (2-3秒)
- ✅ 批量翻译开始(560条)
- ✅ 如果触发429,自动延迟重试
- ✅ 全部翻译完成打印: `✅ 全部翻译已完成`
- ✅ 字幕正常显示,无遗漏

**性能要求**:
- 紧急翻译: < 5秒
- 批量翻译(无429): < 60秒
- 批量翻译(含重试): 可能超过2分钟(正常)

---

### 测试工具

#### 日志监控脚本

在Chrome DevTools Console中运行:

```javascript
// 监听翻译相关日志
const originalLog = console.log;
const originalDebug = console.debug;
const originalError = console.error;

const translationLogs = [];

console.log = function(...args) {
  const message = args.join(' ');
  if (message.includes('Translator') || message.includes('service-worker-v4')) {
    translationLogs.push({ type: 'log', time: Date.now(), message });
  }
  originalLog.apply(console, args);
};

console.debug = function(...args) {
  const message = args.join(' ');
  if (message.includes('Translator') || message.includes('service-worker-v4')) {
    translationLogs.push({ type: 'debug', time: Date.now(), message });
  }
  originalDebug.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  if (message.includes('Translator') || message.includes('service-worker-v4')) {
    translationLogs.push({ type: 'error', time: Date.now(), message });
  }
  originalError.apply(console, args);
};

// 导出日志
window.exportTranslationLogs = () => {
  console.table(translationLogs);
  return translationLogs;
};
```

#### 429模拟工具

修改translator的`callAPI`方法,添加模拟逻辑:

```typescript
// 仅用于测试：模拟429错误
private static TEST_SIMULATE_429 = false;
private static TEST_429_AT_BATCH = 1;  // 在第几批次触发429

private async callAPI(...) {
  // 测试代码
  if (DeepSeekTranslator.TEST_SIMULATE_429) {
    const currentBatch = /* 计算当前批次 */;
    if (currentBatch === DeepSeekTranslator.TEST_429_AT_BATCH) {
      throw this.createFatalError('error_deepseek_rate_limit', undefined, 429);
    }
  }

  // 正常逻辑
  // ...
}
```

---

## 编译与验证

### 编译步骤

```bash
# 1. 编译所有修改的文件
npm run build

# 2. 检查TypeScript错误
npx tsc --noEmit

# 3. 验证特定文件编译
npx tsc --noEmit src/shared/utils/retry-handler.ts
npx tsc --noEmit src/background/components/deepseek-translator.ts
npx tsc --noEmit src/background/components/gemini-translator.ts
npx tsc --noEmit src/background/components/deepl-translator.ts
npx tsc --noEmit src/background/handle-toggle-translate-v4.ts
```

### 编译成功标志

```
✓ No TypeScript errors found
✓ Build completed successfully
```

### 加载扩展

1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"重新加载"扩展
4. 或删除后"加载已解压的扩展程序"

---

## 实施检查清单

### Phase 1: RetryHandler ✅
- [ ] 创建 `retry-handler.ts` 文件
- [ ] 实现 `executeWithRetry()` 方法
- [ ] 实现 `calculateSmartDelay()` 算法
- [ ] 实现 `delayWithSignal()` 方法
- [ ] 实现 `is429Error()` 检查
- [ ] 验证TypeScript编译无错误

### Phase 2: Translators ✅
- [ ] DeepSeek: 添加导入
- [ ] DeepSeek: 包裹批次逻辑
- [ ] Gemini: 添加导入
- [ ] Gemini: 包裹批次逻辑(保留YAML+性能日志)
- [ ] DeepL: 添加导入
- [ ] DeepL: 包裹批次逻辑(保留计费统计)
- [ ] 验证所有翻译器编译无错误

### Phase 3: UI State ✅
- [ ] Change 1: 关闭翻译清理所有会话
- [ ] Change 2: 开启翻译清理旧会话
- [ ] Change 3: 紧急翻译完成设置ACTIVE
- [ ] Change 4: 简化批量完成逻辑
- [ ] Change 5: 验证批量失败处理
- [ ] 验证handle-toggle-translate-v4编译无错误

### Phase 4: Testing ✅
- [ ] 测试1: 紧急翻译429
- [ ] 测试2: 批量翻译第一次429
- [ ] 测试3: 批量翻译多次429
- [ ] 测试4: 批量中关闭翻译
- [ ] 测试5: 批量中切换视频
- [ ] 测试6: 长视频完整流程

---

## 常见问题

### Q1: 为什么延迟上限是20秒?

**A**: 基于用户体验考虑:
- 延迟过长(>20s)会导致批量翻译时间过长
- 20秒是用户可接受的等待时间
- 超出20秒使用5秒兜底,避免无限等待

### Q2: 为什么第一次429基于批次开始时间?

**A**:
- 第一次429说明批次内的某次API调用触发了限制
- 批次开始时间是最准确的起点
- 保证延迟覆盖整个60秒窗口

### Q3: 为什么后续429基于上次429时间?

**A**:
- 多次429说明限制窗口仍在
- 基于上次429时间可以更精确地等待窗口过期
- 避免延迟过短导致再次触发

### Q4: DeepL返回值为什么要改成对象?

**A**:
- DeepL需要统计计费字符数(`billed_characters`)
- RetryHandler只能返回一个值
- 使用对象`{ translations, billedChars }`同时返回两个信息

### Q5: 为什么Gemini要包裹性能计时?

**A**:
- 性能计时需要包含重试时间才准确
- 如果放在RetryHandler外部,只会计时最后一次成功的时间
- 包裹在内部可以记录包含重试的总耗时

---

## 附录: 架构对比

### 改造前
```
translate() {
  for (batch) {
    callAPI()  ← 429直接抛出,无重试
    parse()
    validate()
  }
}
```

### 改造后
```
translate() {
  for (batch) {
    RetryHandler.executeWithRetry(() => {
      callAPI()     ← 429触发智能延迟
      parse()       ← 重试时重新解析
      validate()    ← 重试时重新验证
    })
  }
}
```

### 关键差异
| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 429错误 | 直接失败 | 智能重试 |
| 延迟策略 | 固定延迟 | 动态计算 |
| 重试次数 | 0次 | 最多3次 |
| UI状态 | 全部完成才ACTIVE | 紧急完成即ACTIVE |
| 会话管理 | 单会话清理 | 多会话清理 |

---

**文档版本**: v1.0.0
**最后更新**: 2025-11-07
**作者**: Claude Code
**审核**: 待用户确认
