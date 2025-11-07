# 翻译服务错误代码对照表

本文档整理了所有翻译服务（Microsoft、DeepL、DeepSeek、Gemini、OpenAI、Qwen）的错误代码、含义及项目处理方案。

**版本**: v1.0.0
**更新日期**: 2025-11-07

---

## 📋 目录

1. [Google 免费翻译](#google-免费翻译)
2. [Microsoft Translator（微软翻译）](#microsoft-translator)
3. [DeepL](#deepl)
4. [DeepSeek](#deepseek)
5. [Gemini](#gemini)
6. [OpenAI](#openai)
7. [Qwen (通义千问)](#qwen)
8. [错误分类规则](#错误分类规则)
9. [问题发现](#问题发现)

---

## 1. Google 免费翻译

**API端点**:
- 主端点: `https://translate.googleapis.com/translate_a/single`
- 备用端点: `https://translate.googleapis.com/translate_a/t`

**认证方式**: 无需认证（免费公开API）

**特殊说明**:
- 非官方API，无错误代码规范
- 使用双端点降级策略
- 所有HTTP错误统一处理

### 错误类型表

| 错误类型 | 触发条件 | 当前处理方案 | 错误分类 | 流程是否中断 |
|---------|---------|------------|---------|------------|
| **HTTP错误** | 任何`!response.ok`状态 | ✅ 尝试下一个端点，所有端点失败后抛出错误 | - | ✅ 是（所有端点失败后） |
| **响应格式错误** | 无法解析JSON/格式不符 | ✅ 尝试下一个端点，所有端点失败后抛出错误 | - | ✅ 是（所有端点失败后） |
| **数量不匹配** | 翻译结果数量≠输入数量 | ✅ 抛出错误 | - | ✅ 是 |
| **网络错误** | fetch失败（超时/网络断开） | ✅ 尝试下一个端点，所有端点失败后抛出错误 | - | ✅ 是（所有端点失败后） |

### 代码位置
- 文件: `src/background/components/two-phase-translator-v4.ts`
- 核心方法: 第1867-1993行 (`translateWithGoogleEndpoints`方法)
- 调用入口: 第1767-1783行 (`callTranslationAPI`方法)

### 错误处理逻辑

```typescript
// 双端点降级策略（第1945-1990行）
for (const id of order) {  // order = ['single', 't']
  const endpoint = endpointMap[id];

  try {
    // 1. 发送请求
    const response = await fetch(`${endpoint.url}?${params.toString()}`);

    // 2. 检查HTTP状态
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 3. 解析响应
    const json = await response.json();
    const combinedTranslation = endpoint.parse(json);

    // 4. 规范化并验证数量
    const normalized = this.normalizeGoogleTranslations(combinedTranslation, texts);
    if (normalized.length !== texts.length) {
      throw new Error(`normalized translation count mismatch`);
    }

    // ✅ 成功：返回结果
    return { translations: normalized, endpoint: endpoint.id };

  } catch (error) {
    // ❌ 失败：记录错误，继续尝试下一个端点
    errors.push(`${endpoint.id}: ${message}`);

    if (options?.recordStatistics) {
      this.failedGoogleEndpoints.add(endpoint.id);
    }
  }
}

// ✅ 所有端点都失败：抛出错误
throw new Error(`所有Google免费翻译端点调用失败: ${errors.join(' | ')}`);
```

### 当前实现评估

**✅ 优点**:
1. **双端点降级策略**：主端点失败自动切换备用端点
2. **错误正确传播**：所有端点失败后抛出Error，中断翻译流程
3. **详细错误日志**：记录每个端点的失败原因
4. **智能端点选择**：紧急翻译阶段会记录可用端点，批量翻译优先使用

**⚠️ 需要注意**:
- Google免费API不稳定，可能随时失效
- 无官方错误代码，难以区分错误类型（是速率限制还是服务不可用？）
- 无法判断错误是`fatal`还是`retryable`，统一按`retryable`处理

### 特殊说明

- **批次大小**: 40条/批（与Microsoft共用配置）
- **超时时间**: 10秒
- **并发限制**: 999（实际无限制）
- **分隔符**: `\n`（换行符）
- **规范化策略**:
  - 数量匹配：直接返回
  - 数量过少：按比例分割或补充原文
  - 数量过多：合并多余部分到最后一条

### 新增日志 & 用户提示（2025-11）

- **按比例拆分日志**：`[TwoPhaseTranslatorV4][Google] 检测到单条译文，按原字幕比例拆分成多条`（`normalizeGoogleTranslations` 中，仅当返回 1 条译文但原始字幕多条时打印，方便调试比例切分。）
- **统一错误提示**：Google 端错误现在会包装为 `TranslationError('google')` 并映射到 i18n：
  - `error_google_bulk_requires_urgent`：批量阶段依赖紧急翻译未完成。
  - `error_google_endpoint_http`：HTTP 状态异常（429/503 等）。
  - `error_google_response_format`：响应结构/解析失败。
  - `error_google_network`：`fetch` 失败或网络不可达。
  - `error_google_count_mismatch`：按比例修复后仍无法匹配数量。
  - `error_google_all_endpoints_failed`：所有端点都失败的兜底提示。
  这些提示在 popup / service worker UI 中直接面向用户，文本已统一为“翻译服务异常”或“翻译失败，请重试”。

---

## 2. Microsoft Translator（微软翻译）

**API端点**:
- 主端点（路径A）: `https://api.cognitive.microsofttranslator.com/translate`
- 备用端点（路径B）: `https://api-edge.cognitive.microsofttranslator.com/translate`

**认证方式**: Bearer Token（从 `microsoft-auth-manager.ts` 获取）

**特殊说明**:
- 免费翻译API（通过获取临时Token实现）
- 错误代码格式：6位数 = HTTP状态码(3位) + 细分代码(3位)
- 常见错误代码：403001（免费配额用尽）、401001（认证无效）


    case 500:  // 服务器错误
    case 503:  // 服务不可用
      throw new TranslationError(
        '微软翻译服务暂时不可用，请稍后重试',
        'retryable',
        'microsoft',
        status
      );

    default:
      throw new TranslationError(
        `微软翻译失败: HTTP ${status}`,
        'retryable',
        'microsoft',
        status
      );
  }
} else {
  throw new TranslationError(
    '微软翻译网络请求失败，请检查网络连接',
    'retryable',
    'microsoft'
  );
}
```

---

## 2. DeepL

**API端点**:
- 免费层: `https://api-free.deepl.com/v2/translate`
- 付费层: `https://api.deepl.com/v2/translate`

**认证方式**: `DeepL-Auth-Key` header

### 错误代码表

| HTTP状态码 | 含义 | 当前处理方案 | 错误分类 | 流程是否中断 |
|-----------|------|------------|---------|------------|
| **400** | 请求参数错误 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **403** | API密钥无效 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **404** | 资源未找到 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **413** | 请求过大（>128KiB） | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **429** | 请求过于频繁（速率限制） | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |
| **456** | 配额已用完 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **500** | 服务器错误 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |
| **503/529** | 服务暂时不可用 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |

### 代码位置
- 文件: `src/background/components/deepl-translator.ts`
- 错误处理: 第277-355行 (`handleAPIError`方法)

### 错误处理示例

```typescript
case 429:
  throw new TranslationError(
    'DeepL 请求过于频繁，请稍后重试',
    'retryable',
    'deepl',
    status
  );

case 456:
  throw new TranslationError(
    'DeepL 配额已用完，请检查账户额度或升级订阅',
    'fatal',
    'deepl',
    status
  );
```

### 特殊说明

- **批次大小**: 30条/批（优化后，原为50条）
- **计费方式**: 按字符计费（非token）
- **split_sentences**: 设置为"0"禁止分句，但Next-gen模型可能会忽略此参数

---

## 3. DeepSeek

**API端点**: `https://api.deepseek.com/chat/completions`

**认证方式**: `Bearer Token`

### 错误代码表

| HTTP状态码 | 含义 | 当前处理方案 | 错误分类 | 流程是否中断 |
|-----------|------|------------|---------|------------|
| **400** | 请求格式错误 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **401** | API密钥无效 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **402** | 账户余额不足 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **403** | 无权限/密钥已过期 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **422** | 请求参数错误 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **429** | API速率限制 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |
| **500/502/503** | 服务器错误 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |

### 代码位置
- 文件: `src/background/components/deepseek-translator.ts`
- 错误处理: 第359-437行 (`handleAPIError`方法)

### 错误处理示例

```typescript
case 402:
  throw new TranslationError(
    chrome.i18n.getMessage('error_deepseek_quota_insufficient') ||
    'DeepSeek 账户余额不足，请前往官网充值',
    'fatal',
    'deepseek',
    status,
    errorCode
  );

case 429:
  throw new TranslationError(
    chrome.i18n.getMessage('error_deepseek_rate_limit') ||
    'DeepSeek API 速率限制，请稍后重试',
    'retryable',
    'deepseek',
    status,
    errorCode
  );
```

### 特殊说明

- **模型**: `deepseek-chat`
- **批次大小**: 10条/批（优化后，原为20条）
- **温度参数**: 1.3（官方推荐值）
- **分隔符**: `\n---\n`（用于批量翻译）

---

## 4. Gemini

**API端点**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

**认证方式**: API Key（URL参数 `?key=`）

**支持模型**:
- `gemini-2.5-flash` (1M tokens上下文)
- `gemini-2.5-flash-lite`

### 错误代码表

| HTTP状态码 | 错误代码 | 含义 | 当前处理方案 | 错误分类 | 流程是否中断 |
|-----------|---------|------|------------|---------|------------|
| **400** | `FAILED_PRECONDITION` | 地区不可用/需要付费计划 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **400** | 包含"api key" | API密钥无效 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **400** | 其他 | 请求参数错误 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **401/403** | - | API密钥无效或无权限 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **404** | - | 资源未找到（模型名错误） | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **429** | - | 请求过于频繁 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |
| **500/502/503/504** | - | 服务暂时不可用 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |

### finishReason 错误

| finishReason | 含义 | 处理方案 | 错误分类 |
|-------------|------|---------|---------|
| `STOP` | 正常完成 | ✅ 继续 | - |
| `MAX_TOKENS` | 输出超出长度限制 | ✅ 抛出 `TranslationError` | `retryable` |
| `SAFETY` | 内容被安全过滤拦截 | ✅ 抛出 `TranslationError` | `fatal` |
| `RECITATION` | 检测到重复内容 | ✅ 抛出 `TranslationError` | `retryable` |

### 代码位置
- 文件: `src/background/components/gemini-translator.ts`
- 错误处理: 第484-570行 (`handleAPIError`方法)
- finishReason处理: 第572-603行 (`handleFinishReason`方法)

### 错误处理示例

```typescript
case 429:
  throw new TranslationError(
    'Gemini API 请求过于频繁，请稍后重试',
    'retryable',
    'gemini',
    status,
    errorCode
  );

case 'MAX_TOKENS':
  throw new TranslationError(
    'Gemini 输出超出长度限制，请重试',
    'retryable',
    'gemini'
  );
```

### 特殊说明

- **批次大小**: 80条/批
- **格式**: YAML格式（`id + text`结构）
- **thinking模式**: 已禁用（`thinkingBudget: 0`）
- **Token估算**: 基于`inputBytes / 2.5 × 1.5`

---

## 5. OpenAI

**API端点**: `https://api.openai.com/v1/chat/completions`

**认证方式**: `Bearer Token`

**支持模型**:
- `gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- `gpt-4o`, `gpt-4o-mini`

### 错误代码表

| HTTP状态码 | 含义 | 当前处理方案 | 错误分类 | 流程是否中断 |
|-----------|------|------------|---------|------------|
| **400** | 请求参数错误 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **401/403** | API密钥无效 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **402** | 账户余额不足 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **422** | 不支持当前语种 | ✅ 抛出 `TranslationError` | `fatal` | ✅ 是 |
| **429** | 请求过于频繁 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |
| **500/502/503** | 服务暂时不可用 | ✅ 抛出 `TranslationError` | `retryable` | ✅ 是 |

### 代码位置
- 文件: `src/background/components/openai-translator.ts`
- 错误处理: 第674-749行 (`handleAPIError`方法)

### 错误处理示例

```typescript
case 402:
  throw new TranslationError(
    chrome.i18n.getMessage('error_openai_quota_insufficient') ||
    'OpenAI 账户余额不足，请前往官网充值',
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
```

### 特殊说明

- **批次大小**: 不固定（由调用层控制）
- **两种方案**:
  - Legacy（编号标记）: `["[0] text", "[1] text"]`
  - Structured Outputs（JSON Schema）: 强制一对一对应
- **温度参数**: 默认1.0（GPT-5系列会忽略）
- **reasoning_effort**: `minimal`（降低延迟）
- **verbosity**: `low`（精简输出）

---

## 6. Qwen（通义千问）

**API端点**:
- 北京地域: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- 新加坡地域: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`

**认证方式**: `Bearer Token`

**模型**: `qwen-mt-plus`（机器翻译专用模型）

### 错误代码表

| HTTP状态码 | 含义 | 当前处理方案 | 错误分类 | 流程是否中断 |
|-----------|------|------------|---------|------------|
| **400** | 请求参数错误 | ✅ 抛出 `QwenTranslationError` | `fatal` | ✅ 是 |
| **401/403** | API密钥无效或已过期 | ✅ 抛出 `QwenTranslationError` | `fatal` | ✅ 是 |
| **429** | 速率限制（超出RPM或TPM） | ✅ 抛出 `QwenTranslationError` | `retryable` | ✅ 是 |
| **500/502/503** | 服务器错误 | ✅ 抛出 `QwenTranslationError` | `retryable` | ✅ 是 |

### 代码位置
- 文件: `src/background/components/qwen-translator.ts`
- 错误处理: 第469-504行 (`handleAPIError`方法)

### 错误处理示例

```typescript
case 429:
  throw new QwenTranslationError(
    chrome.i18n.getMessage('error_qwen_rate_limit') ||
    'Qwen API 速率限制（超出 RPM 或 TPM）',
    'retryable',
    status
  );

case 401:
case 403:
  throw new QwenTranslationError(
    'Qwen API 密钥无效或已过期',
    'fatal',
    status
  );
```

### 特殊说明

- **批次大小**: 30条/批
- **速率限制**: 60 RPM, 23,797 TPM
- **分隔符**: `\n\n`（双换行符）
- **语言代码**: 支持95+种语言，使用下划线格式（如`zh_tw`）
- **API格式**: OpenAI兼容API

---

## 7. 错误分类规则

### 7.1 基础错误分类

#### `fatal` - 致命错误（不应重试）

| 错误类型 | 示例 | 处理建议 |
|---------|------|---------|
| **认证失败** | 401, 403 - API密钥无效/过期 | 提示用户检查API密钥 |
| **余额不足** | 402 - 账户余额不足 | 提示用户充值 |
| **配额用完** | 456 (DeepL), 403001 (Microsoft) - 配额已用完 | 提示用户升级订阅 |
| **参数错误** | 400, 422 - 请求参数错误 | 检查代码逻辑，联系开发者 |
| **不支持** | 404, 422 - 资源不存在/语种不支持 | 提示用户切换服务或语种 |
| **内容过滤** | SAFETY (Gemini) - 内容被拦截 | 提示用户内容不符合安全规范 |

#### `retryable` - 可重试错误（临时性问题）

| 错误类型 | 示例 | 处理建议 |
|---------|------|---------|
| **速率限制** | 429 - 请求过于频繁 | 延迟后重试，降低并发 |
| **服务器错误** | 500, 502, 503 - 服务暂时不可用 | 稍后重试 |
| **超时** | 网络超时 | 稍后重试 |
| **输出截断** | MAX_TOKENS (Gemini) - 输出超长 | 调整批次大小后重试 |
| **重复内容** | RECITATION (Gemini) - 检测到重复 | 稍后重试 |

---

### 7.2 紧急翻译 vs 批量翻译的错误处理策略 ⭐⭐⭐

**核心原则**：根据翻译阶段（`stage`）决定429/503错误是否抛出

#### 架构背景

项目采用**两阶段翻译架构**（V4）：

```
1. 紧急翻译（urgent）
   - 翻译范围：前9条 + 后30条（共39条）
   - 目的：快速显示当前播放位置附近的字幕
   - 执行时间：3-10秒（API响应时间）

2. 批量翻译（batch）
   - 翻译范围：全部字幕
   - 目的：完整翻译整个视频
   - 启动时机：紧急翻译完成后
```

**关键时间间隔**：紧急翻译的API响应时间（3-10秒）足以让速率限制恢复。

---

#### 错误处理策略对比

| 错误类型 | 紧急翻译阶段（urgent） | 批量翻译阶段（batch） | 理由 |
|---------|---------------------|-------------------|------|
| **429 速率限制** | ⚠️ **静默失败**（不抛错） | ❌ **抛出fatal** | 紧急翻译失败只影响39条，可容忍；API响应时间（3-10秒）可能让限制恢复；批量翻译失败则整个视频无法完整翻译 |
| **503 服务不可用** | ⚠️ **静默失败**（不抛错） | ❌ **抛出fatal** | 同上 |
| **401/403 认证失败** | ❌ **抛出fatal** | ❌ **抛出fatal** | 认证失败无法恢复，必须立即告知用户 |
| **402 余额不足** | ❌ **抛出fatal** | ❌ **抛出fatal** | 余额不足无法恢复，必须立即告知用户 |
| **400/422 参数错误** | ❌ **抛出fatal** | ❌ **抛出fatal** | 参数错误无法恢复，属于代码bug |

---

#### 详细处理规则

**规则1：`fatal`错误（认证/配额/参数）- 无论哪个阶段都立即抛出**

```typescript
// 所有翻译服务
if (status === 401 || status === 403 || status === 402 || status === 400) {
  // 无论 stage === 'urgent' 还是 'batch'，都立即抛出
  throw new TranslationError(message, 'fatal', service, status);
}
```

**理由**：这些错误无法通过等待恢复，必须用户介入修复。

---

**规则2：`retryable`错误（429/503）- 根据阶段区分处理**

```typescript
// 在 two-phase-translator-v4.ts 的 catch 块中
if (stage === 'urgent') {
  // 紧急翻译阶段：静默失败
  if (error.status === 429 || error.status === 503) {
    console.warn(`[TwoPhaseTranslatorV4] 紧急翻译遇到${error.status}错误，静默失败`);
    return [];  // 返回空数组，不中断流程
  }
} else if (stage === 'batch') {
  // 批量翻译阶段：抛出fatal
  if (error.status === 429 || error.status === 503) {
    console.error(`[TwoPhaseTranslatorV4] 批量翻译遇到${error.status}错误，中断流程`);
    throw new TranslationError(
      error.message,
      'fatal',  // ⭐ 改为fatal
      error.service,
      error.status
    );
  }
}
```

**理由**：
- **紧急翻译失败影响小**：只损失39条字幕，大部分字幕依然可以通过批量翻译获得
- **API响应时间足够**：3-10秒的等待足以让速率限制恢复（多数API的限制窗口为1分钟）
- **批量翻译失败影响大**：无法完整翻译视频，必须告知用户

---

#### 实现位置

**需要修改的文件**：

1. **two-phase-translator-v4.ts** - 在翻译调用的catch块中判断stage
   - `translateUrgentSubtitles()` 方法
   - `translateBatchConcurrent()` 方法
   - `translateBatchPipelined()` 方法

2. **各翻译服务** - 保持现有错误抛出逻辑（已正确实现）
   - 所有翻译服务继续抛出`TranslationError`
   - 不需要在翻译器内部判断stage

---

#### 用户体验对比

**场景1：紧急翻译遇到429，批量翻译恢复**

```
优化后用户体验：
1. 用户点击翻译按钮
2. 紧急翻译遇到429 → 静默失败 → 当前播放位置无字幕
3. 等待3-10秒（API响应时间）
4. 批量翻译成功 → 完整字幕显示
5. ✅ 用户只损失前9后30条字幕，大部分字幕正常

优化前用户体验：
1. 用户点击翻译按钮
2. 紧急翻译遇到429 → 立即抛错 → 整个翻译流程终止
3. ❌ 用户看到错误提示，无法翻译
```

**场景2：批量翻译遇到429**

```
优化后用户体验：
1. 紧急翻译成功 → 前9后30条显示
2. 批量翻译遇到429 → 抛出fatal
3. ✅ 用户明确知道翻译失败，可以稍后重试或切换服务

优化前用户体验（Microsoft的问题）：
1. 批量翻译遇到429 → 继续翻译（返回原文）
2. ❌ 用户看到"部分原文+部分译文"混乱结果
```

---

## 9. 问题发现

### 总结：错误处理实现对比

| 翻译服务 | 错误处理方式 | 是否中断流程 | 实现质量 |
|---------|------------|------------|---------|
| **Google 免费** | ✅ 双端点降级，所有端点失败后抛出Error | ✅ 是 | ✅ 正确 |
| **Microsoft** | ❌ 双端点失败后**返回原文** | ❌ 否 | ❌ **有问题** |
| **DeepL** | ✅ 抛出TranslationError | ✅ 是 | ✅ 正确 |
| **DeepSeek** | ✅ 抛出TranslationError | ✅ 是 | ✅ 正确 |
| **Gemini** | ✅ 抛出TranslationError | ✅ 是 | ✅ 正确 |
| **OpenAI** | ✅ 抛出TranslationError | ✅ 是 | ✅ 正确 |
| **Qwen** | ✅ 抛出QwenTranslationError | ✅ 是 | ✅ 正确 |

**结论**: 7个翻译服务中，**只有Microsoft有问题**，其他6个都正确实现了错误处理。

---

### ⚠️ Microsoft Translator 关键问题

**问题代码** (`microsoft-translator.ts:72-113`):

```typescript
private async translateBatch(...): Promise<string[]> {
  // ...

  for (const endpoint of [queryPrimary, querySecondary]) {
    let retry = false;
    do {
      try {
        // 翻译逻辑
        return translations;
      } catch (error) {
        lastError = error;

        if (error instanceof MicrosoftRequestError && error.status === 401) {
          // 401错误刷新Token重试
          this.authManager.invalidateToken();
          token = await this.authManager.getToken(true);
          retry = !retry;
          continue;
        }

        retry = false;  // 其他错误不重试
      }
    } while (retry);
  }

  // ❌ 问题：所有端点失败后，返回原文继续翻译下一批
  console.warn('[MicrosoftTranslator] 所有路径均失败，回退原文', lastError);
  return batch;  // ← 应该抛出错误，而不是返回原文
}
```

**影响**:
1. ❌ 遇到任何限制错误（如速率限制、认证失败）都会继续翻译下一批
2. ❌ 用户看到"部分原文 + 部分译文"的混乱结果
3. ❌ 无法知道翻译失败的真实原因
4. ❌ 浪费用户时间和API配额

**修复建议**:

```typescript
// 第111行改为抛出错误
if (lastError instanceof MicrosoftRequestError) {
  throw new TranslationError(
    `微软翻译失败: HTTP ${lastError.status}`,
    lastError.status === 401 ? 'fatal' : 'retryable',
    'microsoft',
    lastError.status
  );
} else {
  throw new TranslationError(
    '微软翻译服务暂时不可用，请稍后重试',
    'retryable',
    'microsoft'
  );
}
```

---

## 9. 统一错误处理流程

### 当前架构（V4）

```
translateTexts() 循环
  ↓
for (let i = 0; i < texts.length; i += BATCH_SIZE)
  ↓
  检查 signal.aborted
  ↓
  调用 translateBatch() / callAPI()
  ↓
  遇到错误 → throw TranslationError
  ↓
  ✅ for循环中断（throw跳出）
  ↓
  ✅ 错误向上传播到调用层
  ↓
  ✅ 停止整个翻译流程
```

### Microsoft的错误流程（问题）

```
translateTexts() 循环
  ↓
for (let i = 0; i < texts.length; i += BATCH_SIZE)
  ↓
  调用 translateBatch()
  ↓
  遇到错误 → catch住，返回原文
  ↓
  ❌ for循环继续执行
  ↓
  ❌ 继续翻译下一批
  ↓
  ❌ 用户收到混乱结果
```

---

## 10. 详细错误代码速查表

### Google 免费翻译

| 场景 | 错误信息示例 | 处理方式 |
|------|-----------|---------|
| HTTP 4xx/5xx | `HTTP 429: Too Many Requests` | 尝试备用端点 |
| 解析失败 | `unexpected response structure` | 尝试备用端点 |
| 数量不匹配 | `count mismatch (3 vs 5)` | 抛出错误 |
| 所有端点失败 | `所有Google端点调用失败: single: HTTP 429 \| t: parse error` | 中断翻译 |

### Microsoft

| HTTP状态码 | 含义 | 当前处理 | 应该如何处理 |
|-----------|------|---------|------------|
| 401 | Token无效 | ❌ 刷新Token重试，失败后**返回原文** | ✅ 抛出fatal错误 |
| 其他 | 其他错误 | ❌ 尝试备用端点，失败后**返回原文** | ✅ 抛出错误 |

### DeepL

| HTTP状态码 | 含义 | 错误分类 |
|-----------|------|---------|
| 403 | API密钥无效 | fatal |
| 429 | 请求过于频繁 | retryable |
| 456 | 配额已用完 | fatal |

### DeepSeek

| HTTP状态码 | 含义 | 错误分类 |
|-----------|------|---------|
| 402 | 账户余额不足 | fatal |
| 429 | API速率限制 | retryable |

### Gemini

| HTTP状态码/finishReason | 含义 | 错误分类 |
|------------------------|------|---------|
| 400 + FAILED_PRECONDITION | 地区不可用 | fatal |
| 429 | 请求过于频繁 | retryable |
| MAX_TOKENS | 输出超长 | retryable |
| SAFETY | 内容被过滤 | fatal |

### OpenAI

| HTTP状态码 | 含义 | 错误分类 |
|-----------|------|---------|
| 402 | 账户余额不足 | fatal |
| 429 | 请求过于频繁 | retryable |

### Qwen

| HTTP状态码 | 含义 | 错误分类 |
|-----------|------|---------|
| 429 | 超出RPM或TPM | retryable |

---

## 11. 实施计划

### 第一阶段：修复Microsoft Translator（必须⭐⭐⭐）

**问题**：所有端点失败后返回原文，不抛出错误

**修复位置**：`src/background/components/microsoft-translator.ts:111`

**修复代码**：参见 [2. Microsoft Translator - 修复方案](#修复方案)

**影响范围**：所有使用Microsoft免费翻译的用户

**优先级**：最高（会导致用户看到混乱的翻译结果）

---

### 第二阶段：实现紧急/批量翻译错误区分（重要⭐⭐）

**目标**：对429/503错误根据翻译阶段区分处理

**修复位置**：`src/background/components/two-phase-translator-v4.ts`

**需要修改的方法**：
1. `translateUrgentSubtitles()` - 在catch块中判断429/503，静默失败
2. `translateBatchConcurrent()` - 在catch块中判断429/503，抛出fatal
3. `translateBatchPipelined()` - 在catch块中判断429/503，抛出fatal

**实现策略**：
```typescript
// 伪代码示例
try {
  const translatedTexts = await this.callTranslationAPI(..., { stage });
} catch (error) {
  if (error instanceof TranslationError) {
    // 认证/配额/参数错误：无论哪个阶段都立即抛出
    if (error.status === 401 || error.status === 403 ||
        error.status === 402 || error.status === 400) {
      throw error;
    }

    // 速率限制/服务不可用：根据阶段区分
    if (error.status === 429 || error.status === 503) {
      if (stage === 'urgent') {
        // 紧急翻译：静默失败
        console.warn(`[TwoPhaseTranslatorV4] 紧急翻译遇到${error.status}，静默失败`);
        return [];
      } else if (stage === 'batch') {
        // 批量翻译：抛出fatal
        console.error(`[TwoPhaseTranslatorV4] 批量翻译遇到${error.status}，中断流程`);
        throw new TranslationError(
          error.message,
          'fatal',  // ⭐ 改为fatal
          error.service,
          error.status
        );
      }
    }
  }

  // 其他错误：直接抛出
  throw error;
}
```

**影响范围**：所有翻译服务

**优先级**：高（显著提升用户体验）

---

### 第三阶段：增强错误消息i18n（建议⭐）

**目标**：为所有错误提供多语言支持

**修复位置**：
- `src/_locales/zh_CN/messages.json`
- `src/_locales/en/messages.json`

**需要添加的i18n键**：
```json
{
  "error_microsoft_quota_exceeded": {
    "message": "微软翻译免费配额已用完"
  },
  "error_microsoft_auth_failed": {
    "message": "微软翻译认证失败，请检查网络连接"
  },
  "error_microsoft_rate_limit": {
    "message": "微软翻译请求过于频繁，请稍后重试"
  }
}
```

**优先级**：中（提升国际化支持）

---

### 第四阶段：长期优化（可选）

1. **自适应重试机制**
   - 对`retryable`错误实现指数退避重试
   - 限制最大重试次数

2. **错误统计和监控**
   - 统计各服务错误频率
   - 优化服务选择策略

3. **用户反馈机制**
   - 收集翻译失败案例
   - 持续优化错误处理逻辑

---

## 附录：错误分类速查表

| 分类 | 立即中断 | 允许重试 | 用户操作 |
|------|---------|---------|---------|
| `fatal` | ✅ 是 | ❌ 否 | 检查设置/充值/联系支持 |
| `retryable` | ✅ 是 | ✅ 是（建议延迟） | 稍后重试 |

**注意**: 所有错误都应该**立即中断当前翻译流程**，区别在于是否建议用户重试。

---

**最后更新**: 2025-11-07
**维护者**: Claude Code
### 错误代码表

| 错误类型 | 触发条件 | 处理方案 | 分类 |
|---------|---------|---------|------|
| **输入超限** | 单条字幕 > 5000 字符/批次 > 50000 字符 | 立即抛出 `TranslationError` (`error_microsoft_text_too_long`) | `fatal` |
| **HTTP 400** | 参数缺失/无效 | `error_microsoft_param_invalid` | `fatal` |
| **HTTP 401** | Token 失效 | `error_microsoft_auth_failed` | `fatal` |
| **HTTP 403/403001** | 免费配额用完/无权限 | `error_microsoft_quota_exceeded` | `fatal` |
| **HTTP 408** | 资源不可用 | `error_microsoft_unavailable` | `fatal` |
| **HTTP 429** | 速率限制 | 紧急阶段 `retryable`，批量阶段 `fatal`，`error_microsoft_rate_limit` | `mixed` |
| **HTTP 500/503** | 服务器错误 | `error_microsoft_service_error` | `fatal` |
| **网络错误** | `fetch` 抛出 `TypeError`/断网 | 紧急阶段 `retryable`，批量阶段 `fatal`，`error_microsoft_network` | `mixed` |
| **响应格式异常** | JSON 结构异常/缺少 `translations[0].text` | 紧急阶段 `retryable`，批量阶段 `fatal`，`error_microsoft_response_format` | `mixed` |

### 新增错误提示 & 策略（2025-11）

| 场景 | Stage | 行为 | i18n提示 |
|------|-------|------|-----------|
| A. 单条字幕 >5000 字符 / 批次 >50000 字符 | 任意 | `fatal` | `error_microsoft_text_too_long`（翻译失败，请切换翻译服务或重试） |
| C. `fetch` 网络错误 | 紧急 | `retryable`（允许批量继续） | `error_microsoft_network`（网络请求失败，请重试） |
| C. `fetch` 网络错误 | 批量 | `fatal` | `error_microsoft_network` |
| D. HTTP 400 | 任意 | `fatal` | `error_microsoft_param_invalid` |
| E. HTTP 401 | 任意 | `fatal` | `error_microsoft_auth_failed` |
| F. HTTP 403/403001 | 任意 | `fatal` | `error_microsoft_quota_exceeded`（免费配额已用完，请切换翻译服务或明天再试） |
| G. HTTP 408 | 任意 | `fatal` | `error_microsoft_unavailable` |
| H. HTTP 429 | 紧急 | `retryable` | `error_microsoft_rate_limit`（翻译过于频繁，请稍后重试） |
| H. HTTP 429 | 批量 | `fatal` | `error_microsoft_rate_limit` |
| I. HTTP 500/503 | 任意 | `fatal` | `error_microsoft_service_error` |
| J. 响应格式异常 | 紧急 | `retryable` | `error_microsoft_response_format` |
| J. 响应格式异常 | 批量 | `fatal` | `error_microsoft_response_format` |
| K. 缺少 `translations[0].text` | 紧急 | `retryable` | `error_microsoft_response_format` |
| K. 缺少 `translations[0].text` | 批量 | `fatal` | `error_microsoft_response_format` |

所有异常都会封装为 `TranslationError('microsoft')` 并携带 `category`，紧急阶段的 `retryable` 会交由批量阶段继续尝试，批量阶段一律中断翻译并在 UI 中提示“切换翻译服务或稍后重试”。
