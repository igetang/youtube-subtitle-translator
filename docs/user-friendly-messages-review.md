# 用户友好提示文字审查清单

本文档列出所有错误提示的具体文字内容，供审查是否友好合理。

**版本**: v1.0.0
**创建日期**: 2025-11-07
**目的**: 审查所有错误消息的用户友好性

---

## 📋 目录

1. [通用错误消息](#1-通用错误消息)
2. [Google 免费翻译](#2-google-免费翻译)
3. [Microsoft 翻译](#3-microsoft-翻译)
4. [DeepL](#4-deepl)
5. [DeepSeek](#5-deepseek)
6. [Gemini](#6-gemini)
7. [OpenAI](#7-openai)
8. [Qwen（通义千问）](#8-qwen通义千问)
9. [网络相关错误](#9-网络相关错误)
10. [字幕相关错误](#10-字幕相关错误)
11. [配置相关错误](#11-配置相关错误)

---

## 1. 通用错误消息

### 1.1 基础错误

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 未知错误 | **未知错误** | Unknown error | 无法识别的错误 | ⚠️ 太模糊 |
| 翻译失败 | **翻译失败** | Translation failed | 通用翻译失败 | ⚠️ 缺少操作建议 |
| 翻译失败（可重试） | **翻译失败，请稍后重试** | Translation failed, please try again later | 可重试的翻译失败 | ✅ 提供了操作建议 |
| 翻译失败（需重试） | **翻译失败，请重试** | Translation failed, please retry | 需要用户手动重试 | ✅ 提供了操作建议 |

### 1.2 操作状态

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 翻译已取消 | **翻译已取消** | Translation cancelled | 用户主动取消 | ✅ 清晰明确 |
| 翻译开始前已取消 | **翻译开始前已取消** | Translation cancelled before start | 翻译未启动就被取消 | ✅ 清晰明确 |

### 1.3 速率和配额

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 速率限制 | **请求过于频繁，请稍后重试** | Rate limit exceeded, please try again later | 通用速率限制 | ✅ 清晰且有建议 |
| 速率限制（短） | **速率限制，请稍后重试** | Rate limit exceeded | 速率限制（短版） | ✅ 简洁清晰 |
| 配额用尽 | **配额已用完，请检查账户额度** | Quota exceeded | 通用配额用完 | ✅ 提供了操作建议 |
| 余额不足 | **账户余额不足，请充值** | Insufficient balance | 通用余额不足 | ✅ 清晰直接 |

---

## 2. Google 免费翻译

### ✅ 已有6条友好提示

| Key | 中文提示 | 英文提示 | 触发场景 | 友好性 |
|-----|---------|---------|---------|--------|
| `error_google_bulk_requires_urgent` | Google 翻译需要先完成一次快速检测，请稍后再试 | Google Translate needs to finish a quick check first. Please try again shortly. | 批量翻译前紧急阶段未成功 | ✅ 明确告知操作 |
| `error_google_endpoint_http` | 翻译服务异常，请切换服务或重试 | Translation service error. Please switch a provider or try again. | 任何 HTTP 非 2xx 状态（429/503 等） | ✅ 语言简单 |
| `error_google_response_format` | 翻译失败，请重试 | Translation failed. Please try again. | 响应结构/解析失败 | ✅ 简洁明了 |
| `error_google_network` | 网络请求失败，请重试 | Network request failed. Please try again. | `fetch` 抛错或网络不可达 | ✅ 有行动建议 |
| `error_google_count_mismatch` | 翻译失败，请重试 | Translation failed. Please try again. | 按比例修复后仍无法匹配数量 | ✅ 与场景一致 |
| `error_google_all_endpoints_failed` | 翻译服务异常，请切换服务或重试 | Translation service error. Please switch a provider or try again. | 所有端点都失败的兜底提示 | ✅ 提供了替代方案 |

### ℹ️ 备注
- 比例拆分仅在控制台输出 `console.debug('[TwoPhaseTranslatorV4][Google] 检测到单条译文，按原字幕比例拆分成多条')`，不会打扰用户。

---

## 3. Microsoft 翻译

### ❌ 状态：所有消息缺失（优先级1 + 有严重bug）

| 错误类型 | HTTP | 建议中文提示 | 建议英文提示 | 触发场景 | 友好性评价 |
|---------|------|------------|------------|---------|-----------|
| 认证失败 | 401 | **微软翻译认证失败，请检查网络连接** | Microsoft Translator authentication failed, please check network | Token无效/过期 | ⚠️ 误导（不是网络问题） |
| 配额用尽 | 403001 | **微软翻译免费配额已用完** | Microsoft Translator quota exceeded | 免费配额用尽 | ⚠️ 缺少操作建议 |
| 速率限制 | 429 | **微软翻译请求过于频繁，请稍后重试** | Microsoft Translator rate limit exceeded, please try again later | 速率限制 | ✅ 清晰+操作建议 |
| 服务器错误 | 500/503 | **微软翻译服务暂时不可用，请稍后重试** | Microsoft Translator temporarily unavailable, please try again later | 服务器错误 | ✅ 清晰+操作建议 |
| 参数错误 | 400 | **微软翻译请求参数错误** | Microsoft Translator parameter error | 参数错误 | ⚠️ 用户看不懂 |
| 资源不可用 | 408 | **微软翻译系统暂时不可用，请稍后重试** | Microsoft Translator system unavailable, please try again later | 资源缺失 | ✅ 清晰+操作建议 |
| 网络失败 | - | **微软翻译网络请求失败，请检查网络连接** | Microsoft Translator network request failed, please check network | 网络错误 | ✅ 清晰+操作建议 |

**建议优化**：
```
认证失败 → "微软翻译连接失败，请检查网络或稍后重试"（401通常是临时token过期，会自动刷新）
配额用尽 → "微软翻译免费配额已用完，请明天再试或切换其他翻译服务"
参数错误 → "微软翻译请求失败，请重试"（用户无需知道技术细节）
```

---

## 4. DeepL

### ✅ 已有4个，缺失4个

#### 4.1 已实现的消息

| 错误类型 | HTTP | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|------|---------|---------|---------|-----------|
| 测试失败 | - | **DeepL测试失败** | DeepL test failed | 测试连接失败 | ⚠️ 缺少操作建议 |
| 响应格式错误 | - | **DeepL API 返回格式错误：缺少translations数组** | DeepL API response format error: missing translations array | 响应格式错误 | ⚠️ 技术术语太多 |
| 请求参数错误 | 400 | **DeepL 请求参数错误** | DeepL request parameter error | 参数错误 | ⚠️ 用户看不懂 |
| 服务器错误 | 500/503 | **DeepL 服务器错误，请稍后重试** | DeepL server error, please try again later | 服务器错误 | ✅ 清晰+操作建议 |

#### 4.2 缺失的消息

| 错误类型 | HTTP | 建议中文提示 | 建议英文提示 | 触发场景 | 友好性评价 |
|---------|------|------------|------------|---------|-----------|
| API密钥无效 | 403 | **DeepL API 密钥无效，请检查设置** | DeepL API key invalid, please check settings | API密钥无效 | ✅ 清晰+操作建议 |
| 配额用尽 | 456 | **DeepL 配额已用完，请检查账户额度或升级订阅** | DeepL quota exceeded, please check account or upgrade | 配额用尽 | ✅ 提供了解决方案 |
| 速率限制 | 429 | **DeepL 请求过于频繁，请稍后重试** | DeepL rate limit exceeded, please try again later | 速率限制 | ✅ 清晰+操作建议 |
| 请求过大 | 413 | **DeepL 请求过大（超过128KiB），请减少批次大小** | DeepL request too large (>128KiB), please reduce batch size | 请求过大 | ⚠️ 技术细节太多 |

**建议优化**：
```
测试失败 → "DeepL连接测试失败，请检查API密钥或网络"
响应格式错误 → "DeepL返回数据异常，请重试"
请求参数错误 → "DeepL请求失败，请重试"
请求过大 → "DeepL单次翻译内容过多，请重试"（系统会自动调整）
```

---

## 5. DeepSeek

### ✅ 状态：100%完整（9个消息全部实现）⭐⭐⭐

| 错误类型 | HTTP | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|------|---------|---------|---------|-----------|
| 测试失败 | - | **DeepSeek测试失败** | DeepSeek test failed | 测试连接失败 | ⚠️ 缺少操作建议 |
| 服务未配置 | - | **DeepSeek服务未配置，请在设置中添加API密钥** | DeepSeek not configured, please add API key in settings | 未配置 | ✅ 清晰+详细指导 |
| API密钥无效 | 401/403 | **DeepSeek API 密钥无效或已过期** | DeepSeek API key invalid or expired | API密钥无效 | ✅ 明确原因 |
| 余额不足 | 402 | **DeepSeek 账户余额不足，请前往官网充值** | DeepSeek balance insufficient, please recharge | 余额不足 | ✅ 清晰+操作建议 |
| 速率限制 | 429 | **DeepSeek API 速率限制，请稍后重试** | DeepSeek rate limit, please try again later | 速率限制 | ✅ 清晰+操作建议 |
| 服务器错误 | 500/502/503 | **DeepSeek API 服务器错误，请稍后重试** | DeepSeek server error, please try again later | 服务器错误 | ✅ 清晰+操作建议 |
| 请求格式错误 | 400 | **DeepSeek API 请求格式错误** | DeepSeek request format error | 格式错误 | ⚠️ 用户看不懂 |
| 请求参数错误 | 422 | **DeepSeek API 请求参数错误** | DeepSeek parameter error | 参数错误 | ⚠️ 用户看不懂 |
| 响应格式错误 | - | **DeepSeek API 返回格式错误：缺少必要字段** | DeepSeek response format error: missing required fields | 响应格式错误 | ⚠️ 技术术语太多 |

**建议优化**：
```
测试失败 → "DeepSeek连接测试失败，请检查API密钥或网络"
请求格式错误 → "DeepSeek请求失败，请重试"
请求参数错误 → "DeepSeek请求失败，请重试"
响应格式错误 → "DeepSeek返回数据异常，请重试"
```

---

## 6. Gemini

### ✅ 已有4个，缺失7个

#### 6.1 已实现的消息

| 错误类型 | HTTP | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|------|---------|---------|---------|-----------|
| 测试失败 | - | **Gemini测试失败** | Gemini test failed | 测试连接失败 | ⚠️ 缺少操作建议 |
| 服务未配置 | - | **Gemini服务未配置，请在设置中添加API密钥** | Gemini not configured, please add API key in settings | 未配置 | ✅ 清晰+详细指导 |
| 响应格式错误 | - | **Gemini API 返回格式错误：缺少候选内容** | Gemini response format error: missing candidates | 响应格式错误 | ⚠️ 技术术语太多 |
| 请求参数错误 | 400 | **Gemini 请求参数错误，请检查设置** | Gemini parameter error, please check settings | 参数错误 | ⚠️ 用户看不懂 |

#### 6.2 缺失的消息

| 错误类型 | HTTP/Code | 建议中文提示 | 建议英文提示 | 触发场景 | 友好性评价 |
|---------|----------|------------|------------|---------|-----------|
| API密钥无效 | 401/403 | **Gemini API密钥无效或无权限** | Gemini API key invalid or no permission | API密钥无效 | ✅ 明确原因 |
| 速率限制 | 429 | **Gemini API 请求过于频繁，请稍后重试** | Gemini rate limit exceeded, please try again later | 速率限制 | ✅ 清晰+操作建议 |
| 服务器错误 | 500/502/503/504 | **Gemini 服务暂时不可用，请稍后重试** | Gemini temporarily unavailable, please try again later | 服务器错误 | ✅ 清晰+操作建议 |
| 地区限制 | 400+FAILED_PRECONDITION | **Gemini 服务在您的地区不可用或需要付费计划** | Gemini unavailable in your region or requires paid plan | 地区限制 | ✅ 清晰+解释原因 |
| 输出超长 | MAX_TOKENS | **Gemini 输出超出长度限制，请重试** | Gemini output too long, please retry | 输出超长 | ✅ 清晰+操作建议 |
| 内容过滤 | SAFETY | **Gemini 内容被安全过滤拦截，无法翻译** | Gemini content filtered by safety settings | 内容过滤 | ✅ 明确原因 |
| 重复内容 | RECITATION | **Gemini 检测到重复内容，请重试** | Gemini recitation detected, please retry | 重复内容 | ⚠️ 用户看不懂"重复内容" |

**建议优化**：
```
测试失败 → "Gemini连接测试失败，请检查API密钥或网络"
响应格式错误 → "Gemini返回数据异常，请重试"
请求参数错误 → "Gemini请求失败，请检查设置"
重复内容 → "Gemini检测到内容问题，请重试"
```

---

## 7. OpenAI

### ✅ 已有6个，缺失4个

#### 7.1 已实现的消息

| 错误类型 | HTTP | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|------|---------|---------|---------|-----------|
| 测试失败 | - | **OpenAI测试失败** | OpenAI test failed | 测试连接失败 | ⚠️ 缺少操作建议 |
| 服务未配置 | - | **OpenAI服务未配置，请在设置中添加API密钥** | OpenAI not configured, please add API key in settings | 未配置 | ✅ 清晰+详细指导 |
| 响应格式错误 | - | **OpenAI 翻译响应格式错误** | OpenAI response format error | 响应格式错误 | ⚠️ 缺少操作建议 |
| 请求参数错误 | 400 | **OpenAI 请求参数错误** | OpenAI parameter error | 参数错误 | ⚠️ 用户看不懂 |
| 余额不足 | 402 | **OpenAI 账户余额不足，请前往官网充值** | OpenAI balance insufficient, please recharge | 余额不足 | ✅ 清晰+操作建议 |
| Structured Outputs错误 | - | **OpenAI Structured Outputs 响应格式错误：缺少translations数组** | OpenAI Structured Outputs error: missing translations array | Structured Outputs错误 | ⚠️ 技术术语太多 |

#### 7.2 缺失的消息

| 错误类型 | HTTP | 建议中文提示 | 建议英文提示 | 触发场景 | 友好性评价 |
|---------|------|------------|------------|---------|-----------|
| API密钥无效 | 401/403 | **OpenAI API密钥无效，请检查设置** | OpenAI API key invalid, please check settings | API密钥无效 | ✅ 清晰+操作建议 |
| 速率限制 | 429 | **OpenAI API 请求过于频繁，请稍后重试** | OpenAI rate limit exceeded, please try again later | 速率限制 | ✅ 清晰+操作建议 |
| 服务器错误 | 500/502/503 | **OpenAI 服务暂时不可用，请稍后重试** | OpenAI temporarily unavailable, please try again later | 服务器错误 | ✅ 清晰+操作建议 |
| 语种不支持 | 422 | **OpenAI 暂时不支持当前设置的语种** | OpenAI does not support current language setting | 语种不支持 | ✅ 明确原因 |

**建议优化**：
```
测试失败 → "OpenAI连接测试失败，请检查API密钥或网络"
响应格式错误 → "OpenAI返回数据异常，请重试"
请求参数错误 → "OpenAI请求失败，请重试"
Structured Outputs错误 → "OpenAI返回数据格式异常，请重试"
```

---

## 8. Qwen（通义千问）

### ✅ 已有4个，缺失2个

#### 8.1 已实现的消息

| 错误类型 | HTTP | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|------|---------|---------|---------|-----------|
| 测试失败 | - | **Qwen测试失败** | Qwen test failed | 测试连接失败 | ⚠️ 缺少操作建议 |
| 速率限制 | 429 | **Qwen API 速率限制（超出 RPM 或 TPM）** | Qwen rate limit (RPM or TPM exceeded) | 速率限制 | ⚠️ 技术术语太多 |
| 请求参数错误 | 400 | **Qwen API 请求参数错误** | Qwen parameter error | 参数错误 | ⚠️ 用户看不懂 |
| 服务器错误 | 500/503 | **Qwen API 服务器错误，请稍后重试** | Qwen server error, please try again later | 服务器错误 | ✅ 清晰+操作建议 |

#### 8.2 缺失的消息

| 错误类型 | HTTP | 建议中文提示 | 建议英文提示 | 触发场景 | 友好性评价 |
|---------|------|------------|------------|---------|-----------|
| API密钥无效 | 401/403 | **Qwen API 密钥无效或已过期** | Qwen API key invalid or expired | API密钥无效 | ✅ 明确原因 |
| 服务未配置 | - | **Qwen服务未配置，请在设置中添加API密钥** | Qwen not configured, please add API key in settings | 未配置 | ✅ 清晰+详细指导 |

**建议优化**：
```
测试失败 → "Qwen连接测试失败，请检查API密钥或网络"
速率限制 → "Qwen API 请求过于频繁，请稍后重试"（去掉技术术语RPM/TPM）
请求参数错误 → "Qwen请求失败，请重试"
```

---

## 9. 网络相关错误

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 网络超时 | **网络超时，请检查网络连接后重试** | Network timeout, please check connection and retry | 网络超时 | ✅ 清晰+操作建议 |
| 连接失败 | **网络连接失败，请检查网络设置** | Network connection failed, please check network settings | 连接失败 | ✅ 清晰+操作建议 |

---

## 10. 字幕相关错误

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 无字幕 | **当前视频无字幕** | No subtitles available | 视频无字幕 | ✅ 简洁清晰 |
| 字幕获取失败 | **字幕获取失败，请重试** | Subtitle fetch failed, please retry | 字幕获取失败 | ✅ 清晰+操作建议 |
| 字幕获取超时 | **字幕获取超时，请检查网络连接后重试** | Subtitle fetch timeout, please check connection and retry | 字幕获取超时 | ✅ 清晰+操作建议 |
| 拦截器初始化失败 | **字幕获取失败：拦截器初始化错误** | Subtitle fetch failed: interceptor init error | 拦截器初始化失败 | ⚠️ 技术术语"拦截器" |
| 拦截器超时 | **字幕获取超时** | Interceptor timeout | 拦截器超时 | ✅ 简洁清晰 |
| 翻译数量不匹配 | **（消息不完整）** | - | 翻译数量不匹配 | ❌ 消息不完整 |

**建议优化**：
```
拦截器初始化失败 → "字幕获取失败，请刷新页面重试"
翻译数量不匹配 → "翻译结果不完整，请重试"
```

---

## 11. 配置相关错误

### 11.1 API密钥

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 提示输入密钥 | **请输入API密钥** | Please enter API key | 提示输入 | ✅ 简洁清晰 |
| 密钥为空 | **API 密钥为空，请在设置中填写** | API key is empty, please fill in settings | 密钥为空 | ✅ 清晰+操作建议 |
| 密钥无效 | **API密钥无效，请检查设置** | API key invalid, please check settings | 通用密钥无效 | ✅ 清晰+操作建议 |
| 密钥无效或过期 | **API密钥无效或已过期，请检查设置** | API key invalid or expired, please check settings | 密钥无效或过期 | ✅ 明确原因+建议 |
| 验证失败 | **API 密钥验证失败，请检查设置** | API key validation failed, please check settings | 验证失败 | ✅ 清晰+操作建议 |

### 11.2 翻译服务配置

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 服务未配置 | **翻译服务未配置，请在设置中添加API密钥** | Translation service not configured, please add API key in settings | 通用未配置 | ✅ 清晰+详细指导 |
| 配置异常 | **翻译配置异常，请检查设置** | Translation config error, please check settings | 配置异常 | ✅ 清晰+操作建议 |

### 11.3 语言设置

| 错误类型 | 中文提示 | 英文提示 | 触发场景 | 友好性评价 |
|---------|---------|---------|---------|-----------|
| 语种不支持 | **当前语种暂不支持，请更换翻译目标** | Language not supported, please change target language | 通用语种不支持 | ✅ 清晰+操作建议 |
| 服务不支持该语言 | **当前翻译服务暂不支持该语言** | Language not supported by this service | 服务不支持该语言 | ✅ 明确原因 |
| 目标语言变更失败 | **处理目标语言变更失败** | Target language change failed | 目标语言变更失败 | ⚠️ 缺少操作建议 |

**建议优化**：
```
目标语言变更失败 → "目标语言设置失败，请重试"
```

---

## 📊 总体评价统计

### 友好性评分

| 评分 | 数量 | 占比 | 说明 |
|------|------|------|------|
| ✅ 友好清晰 | 约60个 | ~65% | 有明确原因+操作建议 |
| ⚠️ 需要优化 | 约30个 | ~32% | 技术术语过多或缺少建议 |
| ❌ 有问题 | 约3个 | ~3% | 消息不完整或误导性 |

### 主要问题类别

#### 问题1：技术术语过多（约15个）
**示例**：
- "响应解析失败" → 改为"返回数据异常"
- "请求参数错误" → 改为"请求失败"
- "缺少translations数组" → 改为"返回数据格式异常"
- "超出 RPM 或 TPM" → 改为"请求过于频繁"

#### 问题2：缺少操作建议（约10个）
**示例**：
- "XXX测试失败" → 改为"XXX连接测试失败，请检查API密钥或网络"
- "配额已用完" → 改为"配额已用完，请明天再试或切换其他服务"
- "端点不可用" → 改为"服务暂时不可用，请稍后重试"

#### 问题3：误导性表述（约2个）
**示例**：
- "微软翻译认证失败，请检查网络连接" → 改为"微软翻译连接失败，请检查网络或稍后重试"
  （理由：401通常是临时token过期，不是用户网络问题）

#### 问题4：消息不完整（1个）
- "翻译结果数量不匹配" - 消息定义不完整

---

## 🎯 优化建议优先级

### 优先级1：修复误导性和不完整的消息（3个）
1. Microsoft 401错误："认证失败，请检查网络" → "连接失败，请检查网络或稍后重试"
2. 翻译数量不匹配：补全消息定义
3. Microsoft 403001：添加"请明天再试或切换其他服务"

### 优先级2：简化技术术语（约15个）
所有"响应格式错误"、"请求参数错误"、"解析失败"等技术术语改为用户友好表述

### 优先级3：补充操作建议（约10个）
所有"XXX测试失败"类消息添加具体的操作建议

---

## 💡 用户友好提示的5个核心原则

1. **说人话**：避免技术术语（解析、参数、数组、端点等）
2. **明确原因**：告诉用户发生了什么（余额不足、配额用完、网络超时）
3. **给出建议**：告诉用户怎么办（检查设置、稍后重试、充值、切换服务）
4. **保持简洁**：一句话说清楚，不要冗长
5. **一致风格**：相同类型错误使用相同的表述模式

---

**审查建议**：
1. 重点审查标注 ⚠️ 和 ❌ 的消息
2. 考虑是否采纳"建议优化"部分的改进方案
3. 统一所有"测试失败"类消息的表述
4. 统一所有技术错误的用户友好表述

**最后更新**: 2025-11-07
**维护者**: Claude Code
