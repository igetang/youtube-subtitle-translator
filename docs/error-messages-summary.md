# 错误、警告和用户提示内容汇总

本文档整理了项目中所有面向用户的错误消息、警告提示和友好提示内容。

**版本**: v1.0.0
**更新日期**: 2025-11-07

---

## 📋 目录

1. [错误消息分类](#错误消息分类)
2. [通用错误消息](#通用错误消息)
3. [翻译服务错误消息](#翻译服务错误消息)
4. [网络相关错误](#网络相关错误)
5. [字幕相关错误](#字幕相关错误)
6. [配置相关错误](#配置相关错误)
7. [缺失的错误消息](#缺失的错误消息)
8. [用户友好提示建议](#用户友好提示建议)

---

## 1. 错误消息分类

### 分类标准

| 错误级别 | 用途 | 示例 |
|---------|------|------|
| **Fatal（致命）** | 需要用户立即操作的错误 | API密钥无效、余额不足 |
| **Retryable（可重试）** | 临时性问题，用户可以稍后重试 | 速率限制、服务器错误 |
| **Warning（警告）** | 不影响核心功能的提示 | 紧急翻译失败但批量翻译可能成功 |
| **Info（信息）** | 操作状态提示 | 翻译已取消、正在翻译 |

---

## 2. 通用错误消息

### 2.1 基础错误

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_unknown` | 未知错误 | Unknown error | 兜底错误 |
| `error_translation_failed` | 翻译失败 | Translation failed | 通用翻译失败 |
| `error_translation_failed_try_later` | 翻译失败，请稍后重试 | Translation failed, please try again later | 可重试的翻译失败 |
| `error_translation_failed_retry` | 翻译失败，请重试 | Translation failed, please retry | 需要用户手动重试 |

### 2.2 操作状态

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_translation_cancelled` | 翻译已取消 | Translation cancelled | 用户主动取消 |
| `error_translation_cancelled_before_start` | 翻译开始前已取消 | Translation cancelled before start | 翻译未启动就被取消 |

### 2.3 速率和配额

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_rate_limit` | 请求过于频繁，请稍后重试 | Rate limit exceeded, please try again later | 通用速率限制 |
| `error_rate_limit_exceeded` | 速率限制，请稍后重试 | Rate limit exceeded | 速率限制（短版） |
| `error_quota_exceeded` | 配额已用完，请检查账户额度 | Quota exceeded | 通用配额用完 |
| `error_quota_insufficient` | 账户余额不足，请充值 | Insufficient balance | 通用余额不足 |

---

## 3. 翻译服务错误消息

### 3.1 Google 免费翻译

**当前状态**：❌ **无专用错误消息**（使用通用消息）

**应该添加的消息**：

| i18n键（建议） | 中文消息（建议） | 英文消息（建议） | 使用场景 |
|--------------|---------------|----------------|---------|
| `error_google_all_endpoints_failed` | Google翻译所有端点均失败，请稍后重试 | All Google Translate endpoints failed | 所有端点（single/t）都失败 |
| `error_google_endpoint_unavailable` | Google翻译端点不可用 | Google Translate endpoint unavailable | 单个端点失败 |
| `error_google_parse_failed` | Google翻译响应解析失败 | Failed to parse Google Translate response | 响应格式错误 |
| `error_google_count_mismatch` | Google翻译返回数量不匹配 | Google Translate count mismatch | 翻译结果数量错误 |

---

### 3.2 Microsoft 翻译

**当前状态**：❌ **无专用错误消息**（使用通用消息）

**应该添加的消息**：

| i18n键（建议） | 中文消息（建议） | 英文消息（建议） | 错误代码 | 使用场景 |
|--------------|---------------|----------------|---------|---------|
| `error_microsoft_text_too_long` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a service or try again. | - | 字符超限 |
| `error_microsoft_network` | 网络请求失败，请重试 | Network request failed. Please try again. | - | 网络错误 |
| `error_microsoft_param_invalid` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a service or try again. | 400 | 参数错误 |
| `error_microsoft_auth_failed` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a service or try again. | 401 | Token无效/过期 |
| `error_microsoft_quota_exceeded` | 免费配额已用完，请切换翻译服务或明天再试 | Free quota is used up. Please switch a service or try again tomorrow. | 403001 | 免费配额用尽 |
| `error_microsoft_unavailable` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a service or try again. | 408 | 资源不可用 |
| `error_microsoft_rate_limit` | 翻译过于频繁，请稍后重试 | Requests are too frequent. Please try again later. | 429 | 速率限制 |
| `error_microsoft_service_error` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a service or try again. | 500/503/其他 | 服务器错误 |
| `error_microsoft_response_format` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a service or try again. | - | 响应格式异常 |

---

### 3.3 DeepL

**当前状态**：✅ **一刀切（所有错误均 fatal）**

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_translation_service_not_configured` | 翻译服务未配置，请在设置中添加API密钥 | Translation service not configured, please add API key in settings | 未提供 API Key |
| `error_api_key_invalid` | API 密钥无效，请检查设置 | API key invalid, please check settings | HTTP 403 |
| `error_deepl_network_failed` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 网络/超时/调用被取消 |
| `error_translation_switch_provider` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | HTTP 400/404/413/500/503/529/未知、JSON解析失败、响应缺字段、数量不匹配 |
| `error_deepl_rate_limit` | 翻译过于频繁，请稍后重试 | Translation requests are too frequent. Please try again later. | HTTP 429 |
| `error_deepl_quota_exhausted` | DEEPL翻译免费配额已用完，请明天再试或切换服务 | DEEPL free quota is exhausted. Please try tomorrow or switch a provider. | HTTP 456 |
| `error_deepl_test_failed` | DeepL测试失败 | DeepL test failed | 设置页连接测试 |

---

### 3.4 DeepSeek

**当前状态**：✅ **一刀切（全部 fatal）**

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_deepseek_test_failed` | DeepSeek测试失败 | DeepSeek test failed | 测试连接失败 |
| `error_deepseek_service_not_configured` | 服务未配置，请在设置中添加API密钥 | Service not configured | 未配置 |
| `error_deepseek_api_key_invalid` | API 密钥无效或已过期 | API key invalid or expired | HTTP 401/403 |
| `error_deepseek_quota_insufficient` | DeepSeek 账户余额不足，请前往官网充值 | DeepSeek account balance insufficient, please recharge | HTTP 402 |
| `error_deepseek_network_failed` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 网络失败/Abort |
| `error_deepseek_request_format` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | HTTP 400 |
| `error_deepseek_request_param` | DeepSeek API 请求参数错误 | DeepSeek API request parameter error | HTTP 422 |
| `error_deepseek_rate_limit` | 翻译过于频繁，请稍后重试 | Translation requests are too frequent. Please try again later. | HTTP 429 |
| `error_deepseek_server_error` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | HTTP 500/502/503 |
| `error_deepseek_parse_failed` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | JSON 解析失败 |
| `error_deepseek_response_format` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 响应缺字段 |
| `error_translation_switch_provider` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 数量不匹配/兜底 |

---

### 3.5 Gemini

**当前状态**：✅ **一刀切（全部 fatal）**

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_gemini_test_failed` | Gemini测试失败 | Gemini test failed | 设置页连接测试 |
| `error_gemini_service_not_configured` | 服务未配置，请在设置中添加API密钥 | Service not configured | 未配置 |
| `error_gemini_network_failed` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 网络/Abort |
| `error_gemini_response_format` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 缺少候选/内容为空 |
| `error_gemini_request_param` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | HTTP 400 等参数错误 |
| `error_gemini_api_key_invalid` | API密钥无效或无权限 | API key is invalid or has no permission. | HTTP 401/403 |
| `error_gemini_rate_limit` | 翻译过于频繁，请稍后重试 | Translation requests are too frequent. Please try again later. | HTTP 429 |
| `error_gemini_server_error` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | HTTP 500/502/503/504 |
| `error_gemini_parse_failed` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | JSON/YAML 解析失败 |
| `error_translation_switch_provider` | 翻译失败，请切换翻译服务或重试 | Translation failed. Please switch a provider or try again. | 数量不匹配、finishReason 等兜底 |

---

### 3.6 OpenAI

**当前状态**：✅ **部分已实现**

**已有的消息**：

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_openai_test_failed` | OpenAI测试失败 | OpenAI test failed | 测试连接失败 |
| `error_openai_service_not_configured` | OpenAI服务未配置，请在设置中添加API密钥 | OpenAI not configured | 未配置 |
| `error_openai_response_format` | OpenAI 翻译响应格式错误 | OpenAI response format error | 响应格式错误 |
| `error_openai_request_param` | OpenAI 请求参数错误 | OpenAI parameter error | 参数错误 |
| `error_openai_quota_insufficient` | OpenAI 账户余额不足，请前往官网充值 | OpenAI balance insufficient | 余额不足 |
| `error_openai_structured_response_format` | OpenAI Structured Outputs 响应格式错误：缺少translations数组 | OpenAI Structured Outputs error | Structured Outputs错误 |

**应该添加的消息**：

| i18n键（建议） | 中文消息（建议） | 英文消息（建议） | 错误代码 | 使用场景 |
|--------------|---------------|----------------|---------|---------|
| `error_openai_api_key_invalid` | OpenAI API密钥无效，请检查设置 | OpenAI API key invalid | 401/403 | API密钥无效 |
| `error_openai_rate_limit` | OpenAI API 请求过于频繁，请稍后重试 | OpenAI rate limit exceeded | 429 | 速率限制 |
| `error_openai_server_error` | OpenAI 服务暂时不可用，请稍后重试 | OpenAI temporarily unavailable | 500/502/503 | 服务器错误 |
| `error_openai_language_not_supported` | OpenAI 暂时不支持当前设置的语种 | OpenAI language not supported | 422 | 语种不支持 |

---

### 3.7 Qwen（通义千问）

**当前状态**：✅ **部分已实现**

**已有的消息**：

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_qwen_test_failed` | Qwen测试失败 | Qwen test failed | 测试连接失败 |
| `error_qwen_rate_limit` | Qwen API 速率限制（超出 RPM 或 TPM） | Qwen rate limit | 速率限制 |
| `error_qwen_request_param` | Qwen API 请求参数错误 | Qwen parameter error | 参数错误 |
| `error_qwen_server_error` | Qwen API 服务器错误，请稍后重试 | Qwen server error | 服务器错误 |

**应该添加的消息**：

| i18n键（建议） | 中文消息（建议） | 英文消息（建议） | 错误代码 | 使用场景 |
|--------------|---------------|----------------|---------|---------|
| `error_qwen_api_key_invalid` | Qwen API 密钥无效或已过期 | Qwen API key invalid | 401/403 | API密钥无效 |
| `error_qwen_service_not_configured` | Qwen服务未配置，请在设置中添加API密钥 | Qwen not configured | - | 未配置 |

---

## 4. 网络相关错误

### 4.1 网络连接

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_network_timeout_retry` | 网络超时，请检查网络连接后重试 | Network timeout | 网络超时 |
| `error_network_connection_failed` | 网络连接失败，请检查网络设置 | Network connection failed | 连接失败 |

---

## 5. 字幕相关错误

### 5.1 字幕获取

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_no_subtitles` | 当前视频无字幕 | No subtitles available | 视频无字幕 |
| `error_subtitle_fetch_failed` | 字幕获取失败，请重试 | Subtitle fetch failed | 字幕获取失败 |
| `error_subtitle_fetch_timeout` | 字幕获取超时，请检查网络连接后重试 | Subtitle fetch timeout | 字幕获取超时 |
| `error_interceptor_init_failed` | 字幕获取失败：拦截器初始化错误 | Interceptor init failed | 拦截器初始化失败 |
| `error_interceptor_timeout` | 字幕获取超时 | Interceptor timeout | 拦截器超时 |

### 5.2 字幕处理

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_translation_count_mismatch` | （消息不完整） | - | 翻译数量不匹配 |

**建议补充**：
```json
"error_translation_count_mismatch": {
  "message": "翻译结果数量不匹配，请重试"
}
```

---

## 6. 配置相关错误

### 6.1 API密钥

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_please_enter_api_key` | 请输入API密钥 | Please enter API key | 提示输入API密钥 |
| `error_api_key_empty` | API 密钥为空，请在设置中填写 | API key is empty | API密钥为空 |
| `error_api_key_invalid` | API密钥无效，请检查设置 | API key invalid | 通用API密钥无效 |
| `error_api_key_invalid_or_expired` | API密钥无效或已过期，请检查设置 | API key invalid or expired | API密钥无效或过期 |
| `error_api_key_validation_failed` | API 密钥验证失败，请检查设置 | API key validation failed | 验证失败 |

### 6.2 翻译服务配置

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_translation_service_not_configured` | 翻译服务未配置，请在设置中添加API密钥 | Translation service not configured | 通用未配置 |
| `error_translation_config_error` | 翻译配置异常，请检查设置 | Translation config error | 配置异常 |

### 6.3 语言设置

| i18n键 | 中文消息 | 英文消息 | 使用场景 |
|--------|---------|---------|---------|
| `error_language_not_supported` | 当前语种暂不支持，请更换翻译目标 | Language not supported | 通用语种不支持 |
| `error_translation_language_not_supported` | 当前翻译服务暂不支持该语言 | Language not supported by service | 服务不支持该语言 |
| `error_target_lang_change_failed` | 处理目标语言变更失败 | Target language change failed | 目标语言变更失败 |

---

## 7. 缺失的错误消息

### 7.1 Google 免费翻译（全部缺失）

需要添加4个错误消息：
- `error_google_all_endpoints_failed`
- `error_google_endpoint_unavailable`
- `error_google_parse_failed`
- `error_google_count_mismatch`

### 7.2 Microsoft 翻译（全部缺失）

需要添加7个错误消息：
- `error_microsoft_auth_failed`
- `error_microsoft_quota_exceeded`
- `error_microsoft_rate_limit`
- `error_microsoft_server_error`
- `error_microsoft_param_error`
- `error_microsoft_resource_unavailable`
- `error_microsoft_network_failed`

### 7.3 DeepL（已覆盖）

所有 DeepL 错误已对齐“一刀切”策略，核心 key 包括：
- `error_translation_switch_provider`
- `error_deepl_network_failed`
- `error_deepl_rate_limit`
- `error_deepl_quota_exhausted`
- `error_api_key_invalid`

### 7.4 Gemini（已覆盖）

Gemini 的错误提示已与 DeepL/DeepSeek 对齐，一刀切策略下所有关键路径均有对应 i18n 文案，无需新增项。

### 7.5 OpenAI（部分缺失）

需要添加4个错误消息：
- `error_openai_api_key_invalid`
- `error_openai_rate_limit`
- `error_openai_server_error`
- `error_openai_language_not_supported`

### 7.6 Qwen（部分缺失）

需要添加2个错误消息：
- `error_qwen_api_key_invalid`
- `error_qwen_service_not_configured`

---

## 8. 用户友好提示建议

### 8.1 错误消息优化原则

1. **明确性**：告诉用户发生了什么问题
2. **可操作性**：告诉用户如何解决问题
3. **一致性**：相同类型错误使用相同的措辞风格
4. **多语言**：所有错误都应该支持中英文

### 8.2 错误消息模板

#### 认证失败（401/403）
```
格式：[服务名] API密钥无效，请检查设置
示例：DeepSeek API 密钥无效或已过期
操作：引导用户到设置页面检查API密钥
```

#### 余额不足（402）
```
格式：[服务名] 账户余额不足，请前往官网充值
示例：OpenAI 账户余额不足，请前往官网充值
操作：提供官网充值链接（如果可能）
```

#### 配额用尽（456/403001）
```
格式：[服务名] 配额已用完，请检查账户额度或升级订阅
示例：DeepL 配额已用完，请检查账户额度或升级订阅
操作：引导用户检查账户额度或升级
```

#### 速率限制（429）
```
格式：[服务名] 请求过于频繁，请稍后重试
示例：Gemini API 请求过于频繁，请稍后重试
操作：建议用户等待1-2分钟后重试
```

#### 服务器错误（500/503）
```
格式：[服务名] 服务暂时不可用，请稍后重试
示例：DeepSeek API 服务器错误，请稍后重试
操作：建议用户稍后重试
```

### 8.3 紧急翻译失败的静默处理

当紧急翻译遇到429/503错误时，不显示错误提示（静默失败），但在控制台记录警告：

```javascript
console.warn('[TwoPhaseTranslatorV4] 紧急翻译遇到429错误，静默失败，等待批量翻译');
```

**理由**：
- 紧急翻译只影响39条字幕
- API响应时间（3-10秒）可能让限制恢复
- 避免过早打断用户体验

### 8.4 批量翻译失败的明确提示

当批量翻译遇到429/503错误时，必须显示明确的错误提示：

```javascript
throw new TranslationError(
  chrome.i18n.getMessage('error_[service]_rate_limit') ||
  '[服务名] 请求过于频繁，请稍后重试',
  'fatal',
  service,
  429
);
```

**理由**：
- 批量翻译失败意味着无法完整翻译视频
- 用户需要明确知道失败原因
- 可以选择稍后重试或切换服务

---

## 9. 统计数据

### 9.1 当前i18n消息统计

| 分类 | 已实现 | 缺失 | 完成度 |
|------|-------|------|--------|
| **Google** | 0 | 4 | 0% |
| **Microsoft** | 0 | 7 | 0% |
| **DeepL** | 4 | 4 | 50% |
| **DeepSeek** | 12 | 0 | 100% ✅ |
| **Gemini** | 9 | 0 | 100% ✅ |
| **OpenAI** | 6 | 4 | 60% |
| **Qwen** | 4 | 2 | 67% |
| **通用** | 约30 | - | - |

**总计**：约57个已实现，28个缺失

### 9.2 优先级排序

**优先级1（必须添加）**：
1. Microsoft 翻译（7个）- 当前完全没有错误消息
2. Google 翻译（4个）- 当前完全没有错误消息

**优先级2（建议添加）**：
3. DeepL（4个）- 缺失配额和速率限制消息

**优先级3（补充完善）**：
5. OpenAI（4个）
6. Qwen（2个）

---

## 10. 实施建议

### 第一步：添加缺失的i18n消息

在以下文件中添加缺失的错误消息：
- `_locales/zh_CN/messages.json`
- `_locales/en/messages.json`
- `_locales/zh_TW/messages.json`

### 第二步：更新翻译器代码

在各翻译器的错误处理中使用新的i18n键：
- `microsoft-translator.ts`
- `two-phase-translator-v4.ts`（Google翻译部分）
- `deepl-translator.ts`
- `gemini-translator.ts`
- `openai-translator.ts`
- `qwen-translator.ts`

### 第三步：测试验证

测试所有错误场景，确保：
1. 错误消息正确显示
2. 多语言切换正常
3. 用户能理解错误含义并知道如何操作

---

**维护说明**：
- 每次添加新的翻译服务时，必须同时添加完整的错误消息
- 每个错误消息都应该提供中英文版本
- 定期审查错误消息的用户友好性

**最后更新**: 2025-11-07
**维护者**: Claude Code
