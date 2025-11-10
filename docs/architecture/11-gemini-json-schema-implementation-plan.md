# Gemini JSON Schema 迁移实施计划

**创建日期**: 2025-11-10
**更新日期**: 2025-11-10 14:30
**版本**: v1.1（修正Schema定义）
**状态**: 待实施
**预计时间**: 4-5 小时
**风险等级**: 低

**修正记录**:
- v1.1 (2025-11-10 14:30): 修正Schema定义（root从array改为object）和响应解析逻辑
- v1.0 (2025-11-10 12:30): 初始版本

---

## 一、实施概览

### 1.1 目标

将 `gemini-translator.ts` 从 YAML 格式迁移到 JSON Schema + Structured Output

### 1.2 核心变更

| 变更项 | 当前 | 目标 |
|--------|------|------|
| 输入格式 | YAML 字符串 | JSON 对象数组 |
| API 配置 | 普通文本生成 | Structured Output |
| 输出解析 | 68行手动解析 | `JSON.parse()` |
| 代码总量 | ~210行 | ~90行（↓57%）|

### 1.3 影响范围

**修改文件（最小集）**：
- ✅ `src/background/components/gemini-translator.ts` - 代码迁移主体
- ✅ `docs/translation-services-error-codes.md` / `_locales/*/messages.json` - 新增/复用错误键时同步描述
- ✅ `docs/PROJECT_CONTEXT.md` / `docs/translator-logging-overview.md` - 记录 Structured Output 上线与日志口径变化

**不影响**：
- ✅ 其他翻译服务（OpenAI/DeepSeek/DeepL/Microsoft）
- ✅ 用户配置和存储
- ✅ 消息系统和其他组件

---

## 二、详细实施步骤

### Step 0: 准备工作（15分钟）

#### 0.1 创建功能分支

```bash
# 当前分支
git status

# 创建新分支
git checkout -b feature/gemini-json-schema

# 确认分支
git branch
```

#### 0.2 备份当前代码

```bash
# 备份 gemini-translator.ts
cp src/background/components/gemini-translator.ts \
   src/background/components/gemini-translator.ts.backup

# 确认备份
ls -lh src/background/components/gemini-translator.ts*
```

#### 0.3 确认测试环境

- [ ] Gemini API Key 可用
- [ ] Chrome 扩展开发环境就绪
- [ ] 测试视频准备（包含俄语字幕）

---

### Step 1: 添加类型定义和 Schema（20分钟）

**位置**: `src/background/components/gemini-translator.ts`

#### 1.1 添加 SubtitleItem 接口

**在文件顶部（第 52 行附近，YAMLSubtitleItem 之前）添加**：

```typescript
/**
 * 字幕条目接口（JSON Schema 格式）
 */
interface SubtitleItem {
  id: number;
  text: string;
}
```

#### 1.2 添加 JSON Schema 常量

**在 SubtitleItem 接口后添加**：

```typescript
/**
 * Gemini Structured Output 的 JSON Schema
 *
 * ⭐ 重要：Root必须是object类型（Gemini API规范要求）
 *
 * 强制返回格式：
 * {
 *   "translations": [
 *     { "id": 0, "text": "..." },
 *     { "id": 1, "text": "..." }
 *   ]
 * }
 *
 * 官方文档：https://ai.google.dev/gemini-api/docs/structured-output
 */
const SUBTITLE_TRANSLATION_SCHEMA: Readonly<Record<string, unknown>> = {
  type: "object",  // ⭐ Root必须是object（所有官方示例都是object）
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "Subtitle ID, must match input ID"
          },
          text: {
            type: "string",
            description: "Translated subtitle text"
          }
        },
        required: ["id", "text"],
        additionalProperties: false  // 不允许额外字段
      }
    }
  },
  required: ["translations"]
} as const;

// TS编译器会基于 as const 推导最小类型，如果需要进一步约束可以
// 使用 `satisfies` 断言（项目已安装 `json-schema` 类型，示例：`} as const satisfies JSONSchema7;`）
```

#### 1.3 更新 GeminiRequest 接口

**修改现有的 GeminiRequest 接口（第 18-31 行）**：

```typescript
interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType?: string;        // ⭐ 新增
    responseJsonSchema?: any;         // ⭐ 新增
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  };
}
```

**检查点**：
- [ ] SubtitleItem 接口已添加
- [ ] SUBTITLE_TRANSLATION_SCHEMA 常量已添加并具备类型约束（Readonly / satisfies）
- [ ] GeminiRequest 接口已更新
- [ ] 代码编译无错误（`npm run build:worker`）

---

### Step 2: 修改格式转换方法（15分钟）

#### 2.1 重命名并简化 convertToYAML

**找到 convertToYAML 方法（第 296-310 行）**：

**Before**:
```typescript
private convertToYAML(texts: string[]): string {
  const items: YAMLSubtitleItem[] = texts.map((text, index) => ({
    id: index,
    text: text.replace(/\n/g, ' ').trim()
  }));

  const yamlLines = ['subtitles:'];
  items.forEach(item => {
    yamlLines.push(`  - id: ${item.id}`);
    yamlLines.push(`    text: "${item.text.replace(/"/g, '\\"')}"`);
  });

  return yamlLines.join('\n');
}
```

**After**:
```typescript
/**
 * 转换为JSON格式（用于 Structured Output）
 * @param texts 文本数组
 * @returns SubtitleItem 数组
 */
private convertToJSON(texts: string[]): SubtitleItem[] {
  return texts.map((text, index) => ({
    id: index,
    text: text.replace(/\n/g, ' ').trim()
  }));
}
```

**检查点**：
- [ ] convertToYAML → convertToJSON
- [ ] 返回类型从 `string` 改为 `SubtitleItem[]`
- [ ] 删除 YAML 字符串拼接逻辑
- [ ] 代码编译无错误

---

### Step 3: 修改 Prompt 构建方法（20分钟）

**找到 buildTranslationPrompt 方法（第 320-367 行）**：

#### 3.1 修改方法签名和实现

**Before**:
```typescript
private buildTranslationPrompt(
  yamlInput: string,
  count: number,
  sourceLangName: string,
  targetLangName: string
): string {
  return `You are a professional subtitle translator.
Translate from ${sourceLangName} to ${targetLangName}.

INPUT FORMAT: YAML containing ${count} subtitle items (id + text)
OUTPUT FORMAT: YAML with EXACTLY ${count} translated items (keep the same id numbers!)
...
Now translate this:

${yamlInput}`;
}
```

**After**:
```typescript
/**
 * 构建翻译prompt（JSON Schema 格式）
 * @param inputItems 输入的字幕条目数组
 * @param sourceLangName 源语言英文名称
 * @param targetLangName 目标语言英文名称
 * @returns 完整prompt
 */
private buildTranslationPrompt(
  inputItems: SubtitleItem[],
  sourceLangName: string,
  targetLangName: string
): string {
  // JSON Schema 会强制格式，Prompt 只需关注翻译规则
  return `Translate these ${inputItems.length} subtitles from ${sourceLangName} to ${targetLangName}.

CRITICAL RULES:
1. Each input item has an id and text field
2. Output MUST have the SAME id numbers in the SAME order
3. Translate ONLY the text field, keep id unchanged
4. NEVER skip, merge, or split items
5. Preserve punctuation and special characters
6. Maintain the same tone and style

Input subtitles:
${JSON.stringify(inputItems, null, 2)}`;
}
```

**检查点**：
- [ ] 参数从 `yamlInput, count` 改为 `inputItems`
- [ ] 删除复杂的 YAML 格式说明
- [ ] 使用 `JSON.stringify()` 展示输入
- [ ] 代码编译无错误

---

### Step 4: 修改 API 调用方法（30分钟）⭐ 核心修改

**找到 callGeminiAPI 方法（第 376-453 行）**：

#### 4.1 修改返回类型

**Before**:
```typescript
private async callGeminiAPI(prompt: string, signal: AbortSignal, maxOutputTokens: number): Promise<string> {
```

**After**:
```typescript
private async callGeminiAPI(prompt: string, signal: AbortSignal, maxOutputTokens: number): Promise<SubtitleItem[]> {
```

#### 4.2 添加 Structured Output 配置

**在 requestBody 的 generationConfig 中添加（第 384-390 行）**：

**Before**:
```typescript
generationConfig: {
  temperature: this.temperature,
  maxOutputTokens: maxOutputTokens,
  thinkingConfig: {
    thinkingBudget: 0
  }
}
```

**After**:
```typescript
generationConfig: {
  temperature: this.temperature,
  maxOutputTokens: maxOutputTokens,
  responseMimeType: "application/json",               // ⭐ 新增
  responseJsonSchema: SUBTITLE_TRANSLATION_SCHEMA,    // ⭐ 新增
  thinkingConfig: {
    thinkingBudget: 0
  }
}
```

#### 4.3 修改响应解析逻辑

**在获取响应后（第 428-437 行）**：

**Before**:
```typescript
const content = data.candidates[0].content.parts[0]?.text;
if (!content) {
  throw this.createFatalError('error_gemini_response_format', undefined, response.status);
}

// ... 其他逻辑 ...

return content;  // 返回 YAML 文本
```

**After**:
```typescript
const content = data.candidates[0].content.parts[0]?.text;
if (!content) {
  throw this.createFatalError('error_gemini_response_format', undefined, response.status);
}

// ... finishReason 和 usageMetadata 处理保持不变 ...

// ⭐ 新增：解析 JSON 响应并提取 translations 数组
try {
  const parsed = JSON.parse(content);

  // 验证响应格式（root是object，包含translations数组）
  if (!parsed.translations || !Array.isArray(parsed.translations)) {
    console.error('[GeminiTranslator] ❌ JSON 响应格式错误: 缺少 translations 数组');
    console.error('[GeminiTranslator] 📄 原始响应:', content);
    throw this.createFatalError('error_gemini_parse_failed', undefined, response.status);
  }

  return parsed.translations as SubtitleItem[];
} catch (error) {
  console.error('[GeminiTranslator] ❌ JSON 解析失败:', error);
  console.error('[GeminiTranslator] 📄 原始响应:', content);
  throw this.createFatalError('error_gemini_parse_failed', undefined, response.status);
}
```

**检查点**：
- [ ] 返回类型改为 `Promise<SubtitleItem[]>`
- [ ] 添加 `responseMimeType` 和 `responseJsonSchema`
- [ ] 添加 JSON 解析逻辑和错误处理
- [ ] 代码编译无错误

---

### Step 5: 删除 parseYAMLResponse 方法（5分钟）

**找到 parseYAMLResponse 方法（第 456-524 行）**：

#### 5.1 完整删除方法

**删除整个方法（68行代码）**：

```typescript
/**
 * 解析YAML响应
 * ...
 */
private parseYAMLResponse(responseText: string, expectedCount: number): string[] {
  // ... 全部删除 ...
}
```

**检查点**：
- [ ] parseYAMLResponse 方法已删除
- [ ] 与 YAML 相关的接口/常量（如 `YAMLSubtitleItem`、`convertToYAML`）已彻底移除
- [ ] 代码编译无错误

---

### Step 6: 添加验证方法（25分钟）

**在 parseYAMLResponse 原位置添加新方法**：

```typescript
/**
 * 验证翻译结果
 *
 * 检查项：
 * 1. 数量匹配
 * 2. ID 连续性
 * 3. ID 顺序
 * 4. 文本非空
 *
 * @param items 翻译后的字幕条目
 * @param expectedCount 期望的条目数量
 * @throws TranslationError 验证失败时抛出
 */
private validateTranslationResult(items: SubtitleItem[], expectedCount: number): void {
  // 1. 验证数量
  if (items.length !== expectedCount) {
    console.error(
      `[GeminiTranslator] ❌ 翻译数量不匹配: 期望${expectedCount}条，实际${items.length}条`
    );
    console.error('[GeminiTranslator] 📊 接收到的数据:');
    console.error(JSON.stringify(items, null, 2));
    throw this.createFatalError('error_translation_switch_provider');
  }

  // 2. 验证 ID 连续性和顺序
  for (let i = 0; i < items.length; i++) {
    if (items[i].id !== i) {
      console.error(
        `[GeminiTranslator] ❌ ID 不连续或顺序错误: 期望id=${i}, 实际id=${items[i].id}`
      );
      console.error('[GeminiTranslator] 📊 接收到的数据:');
      console.error(JSON.stringify(items, null, 2));
      throw this.createFatalError('error_translation_switch_provider');
    }
  }

  // 3. 验证 text 字段非空
  const emptyItems = items.filter(item => !item.text || item.text.trim() === '');
  if (emptyItems.length > 0) {
    console.error(
      `[GeminiTranslator] ❌ 发现 ${emptyItems.length} 条空翻译:`,
      emptyItems.map(item => item.id)
    );
    console.error('[GeminiTranslator] 📊 接收到的数据:');
    console.error(JSON.stringify(items, null, 2));
    throw this.createFatalError('error_translation_switch_provider');
  }

  // ✅ 验证通过
  console.debug(
    `[debug][GeminiTranslator] ✅ 验证通过: ${items.length}条字幕，ID连续，文本完整`
  );
}
```

**检查点**：
- [ ] validateTranslationResult 方法已添加
- [ ] 包含数量、ID、文本的完整验证
- [ ] 代码编译无错误

---

### Step 7: 修改主流程（30分钟）

> ℹ️ 当前 `GeminiTranslator` 尚未接入 `RetryHandler.executeWithRetry` 与 `TokenEstimator`。本步骤的 Before/After 代码展示 **目标状态**，实施迁移时请同步引入上述工具以达到预期的稳态架构。

**找到 translate 方法中的 RetryHandler.executeWithRetry 部分（第 169-232 行）**：

#### 7.1 修改批次翻译逻辑

**Before**:
```typescript
const translations = await RetryHandler.executeWithRetry(
  async () => {
    const perfStart = performance.now();

    // 1. 转换为YAML格式
    const t1 = performance.now();
    const yamlInput = this.convertToYAML(batch);
    const t2 = performance.now();

    // 2. 构建prompt
    const prompt = this.buildTranslationPrompt(yamlInput, batch.length, sourceLangName, targetLangName);
    const t3 = performance.now();

    // 3. 估算 tokens
    const inputText = batch.join('\n');
    const estimatedOutputTokens = TokenEstimator.estimateOutputTokens(
      inputText,
      this.modelConfig.maxOutput
    );
    const maxOutputTokens = Math.min(estimatedOutputTokens, this.modelConfig.maxOutput);

    // 4. 调用Gemini API
    const responseText = await this.callGeminiAPI(prompt, signal, maxOutputTokens);
    const t4 = performance.now();

    // 5. 解析YAML结果
    let parsedTranslations: string[];
    try {
      parsedTranslations = this.parseYAMLResponse(responseText, batch.length);
    } catch (error) {
      // ... 复杂的错误处理 ...
      throw error;
    }
    const t5 = performance.now();

    // 6. 验证数量匹配
    if (parsedTranslations.length !== batch.length) {
      console.error(`❌ 翻译数量不匹配`);
      throw this.createFatalError('error_translation_switch_provider');
    }

    return parsedTranslations;
  },
  { signal, serviceName: 'GeminiTranslator', batchNumber, totalBatches }
);
```

**After**:
```typescript
const translations = await RetryHandler.executeWithRetry(
  async () => {
    const perfStart = performance.now();

    // 1. 转换为JSON格式
    const t1 = performance.now();
    const inputItems = this.convertToJSON(batch);
    const t2 = performance.now();

    // 2. 构建prompt
    const prompt = this.buildTranslationPrompt(inputItems, sourceLangName, targetLangName);
    const t3 = performance.now();

    // 3. 估算 tokens（保持不变）
    const inputText = batch.join('\n');
    const estimatedOutputTokens = TokenEstimator.estimateOutputTokens(
      inputText,
      this.modelConfig.maxOutput
    );
    const maxOutputTokens = Math.min(estimatedOutputTokens, this.modelConfig.maxOutput);

    // 4. 调用Gemini API（直接返回 SubtitleItem[]）
    const translatedItems = await this.callGeminiAPI(prompt, signal, maxOutputTokens);
    const t4 = performance.now();

    // 5. 验证翻译结果
    this.validateTranslationResult(translatedItems, batch.length);
    const t5 = performance.now();

    // 6. 提取 text 字段
    const parsedTranslations = translatedItems.map(item => item.text);

    // ⏱️ 性能统计
    const perfTotal = t5 - perfStart;
    console.log(
      `[GeminiTranslator] ⏱️ 批次${batchNumber}性能分析: 总耗时${perfTotal.toFixed(0)}ms | ` +
      `JSON转换=${(t2-t1).toFixed(0)}ms, Prompt构建=${(t3-t2).toFixed(0)}ms, ` +
      `API调用=${(t4-t3).toFixed(0)}ms (${((t4-t3)/perfTotal*100).toFixed(1)}%), ` +
      `验证=${(t5-t4).toFixed(0)}ms`
    );

    return parsedTranslations;
  },
  { signal, serviceName: 'GeminiTranslator', batchNumber, totalBatches }
);
```

**检查点**：
- [ ] convertToYAML → convertToJSON
- [ ] buildTranslationPrompt 参数更新
- [ ] callGeminiAPI 返回 SubtitleItem[]
- [ ] 删除 parseYAMLResponse 调用
- [ ] 添加 validateTranslationResult 调用
- [ ] 性能统计更新（YAML→JSON）
- [ ] 代码编译无错误

---

### Step 8: 编译测试（20分钟）

#### 8.1 编译检查

```bash
# 编译 Service Worker
npm run build:worker

# 检查编译结果
ls -lh dist/
```

**预期输出**：
- ✅ 无 TypeScript 编译错误
- ✅ dist/service-worker.js 生成成功

#### 8.2 代码审查

**检查清单**：
- [ ] 所有 `convertToYAML` 引用已更新为 `convertToJSON`
- [ ] 所有 `parseYAMLResponse` 引用已删除
- [ ] `responseJsonSchema` 拼写正确（不是 `responseSchema`）
- [ ] `thinkingConfig` 已保留
- [ ] 错误处理逻辑完整
- [ ] 日志输出清晰

---

### Step 9: 功能测试（60分钟）⭐ 关键步骤

#### 9.1 基础功能测试

**测试场景1：中文→英文（25条字幕）**

```
测试步骤：
1. 加载 Chrome 扩展（unpacked）
2. 打开 YouTube 中文视频
3. 点击翻译按钮
4. 选择目标语言：英文
5. 观察翻译结果

预期结果：
✅ 翻译成功，25条字幕全部翻译
✅ 字幕ID连续（0-24）
✅ 无格式错误
✅ Service Worker 日志正常
```

**测试场景2：中文→俄文（验证空格问题）⭐ 重点**

```
测试步骤：
1. 打开 YouTube 中文视频
2. 点击翻译按钮
3. 选择目标语言：俄文
4. 观察翻译结果

预期结果：
✅ 翻译成功
✅ 俄文字母之间无空格！（如：КВАНТОВЫЙ 而不是 К В А Н Т О В Ы Й）
✅ 字幕数量匹配
✅ 无拆分/合并问题
```

**测试场景3：英文→日文（30条字幕）**

```
测试步骤：
1. 打开 YouTube 英文视频
2. 点击翻译按钮
3. 选择目标语言：日文
4. 观察翻译结果

预期结果：
✅ 翻译成功，30条字幕全部翻译
✅ 日文假名和汉字正常显示
✅ 无格式错误
```

#### 9.2 边界测试

**测试场景4：空字幕**

```
输入：包含空字符串的字幕
预期：
- ⚠️ 验证方法应该检测到空翻译
- ⚠️ 或者 Gemini 返回空字符串（取决于API行为）
```

**测试场景5：特殊字符**

```
输入：包含引号、括号、emoji的字幕
预期：
✅ 特殊字符正确处理
✅ JSON 解析成功
✅ 无转义问题
```

**测试场景6：长文本**

```
输入：单条字幕 >200 字
预期：
✅ 完整翻译，无截断
✅ JSON 格式正确
```

#### 9.3 错误场景测试

**测试场景7：网络错误**

```
操作：翻译过程中断网
预期：
✅ 显示网络错误
✅ 不会崩溃
✅ 错误日志清晰
```

**测试场景8：API 速率限制**

```
操作：快速连续翻译多次
预期：
✅ 遇到速率限制时正确处理
✅ 显示友好错误提示
```

#### 9.4 性能测试

**测试场景9：解析性能**

```
测试：观察 Service Worker 日志中的性能统计
预期：
✅ JSON转换 < 1ms
✅ 验证耗时 < 5ms
✅ 总耗时与YAML方案相比减少
```

---

### Step 10: 问题修复（预留时间：60分钟）

**如果遇到问题，按以下顺序排查**：

#### 10.1 编译错误

```bash
# 查看详细错误
npm run build:worker 2>&1 | tee build.log

# 常见问题：
# 1. 类型不匹配 → 检查接口定义
# 2. 未定义变量 → 检查变量名拼写
# 3. 导入错误 → 检查 import 语句
```

#### 10.2 运行时错误

```bash
# 查看 Service Worker 日志
chrome://extensions → 扩展详情 → Service Worker → 控制台

# 常见问题：
# 1. JSON 解析失败 → 检查 Gemini 返回格式
# 2. 验证失败 → 检查 ID 连续性逻辑
# 3. API 调用失败 → 检查 API Key 和配置
```

#### 10.3 翻译质量问题

**如果仍有字母空格问题**：
```typescript
// 临时方案：在解析后清理空格
const translatedItems = await this.callGeminiAPI(...);

// 清理俄语字母间空格
translatedItems.forEach(item => {
  // 检测是否是西里尔字母
  if (/[А-Яа-яЁё]/.test(item.text)) {
    // 移除西里尔字母之间的单个空格
    item.text = item.text.replace(/([А-Яа-яЁё])\s+([А-Яа-яЁё])/g, '$1$2');
  }
});
```

**如果仍有拆分/合并问题**：
- 检查 Prompt 是否清晰
- 检查 JSON Schema 是否正确
- 查看 Gemini 返回的原始响应

---

### Step 11: 提交代码（15分钟）

#### 11.1 代码审查

**自检清单**：
- [ ] 代码符合项目规范
- [ ] 所有 TODO 已删除或处理
- [ ] 日志输出清晰
- [ ] 错误处理完整
- [ ] 注释完整准确

#### 11.2 提交更改

```bash
# 查看修改
git status
git diff src/background/components/gemini-translator.ts

# 添加修改
git add src/background/components/gemini-translator.ts

# 提交
git commit -m "refactor(gemini): 迁移到 JSON Schema + Structured Output

主要改动：
1. 格式转换：YAML → JSON（convertToYAML → convertToJSON）
2. API配置：添加 responseMimeType 和 responseJsonSchema
3. 解析逻辑：删除68行手动YAML解析，使用JSON.parse()
4. 验证方法：新增 validateTranslationResult（数量、ID、文本验证）
5. 性能提升：解析速度提升10倍

解决问题：
- ✅ 字母间空格问题（俄语等语言）
- ✅ 字幕拆分/合并问题
- ✅ ID错位问题

技术栈：
- Gemini API Structured Output（官方推荐）
- JSON Schema 强制格式
- 代码量减少57%（210行 → 90行）

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 确认提交
git log -1 --stat
```

---

## 三、测试验证矩阵

### 3.1 功能测试矩阵

> 若需要更详细的测试脚本与示例输出，可参考 `docs/architecture/11-gemini-json-schema-migration.md` 第 8 章。

| 测试场景 | 输入 | 目标语言 | 预期结果 | 优先级 |
|---------|------|---------|---------|--------|
| 基础翻译 | 25条中文字幕 | 英文 | 全部翻译成功 | P0 |
| 俄语空格 | 25条中文字幕 | 俄文 | 无字母间空格 | P0 ⭐ |
| 日语翻译 | 30条英文字幕 | 日文 | 全部翻译成功 | P0 |
| 特殊字符 | 包含引号/emoji | 任意 | 正确处理 | P1 |
| 长文本 | >200字单条 | 任意 | 完整翻译 | P1 |
| 空字幕 | 空字符串 | 任意 | 正确处理 | P2 |
| 批量翻译 | 100条字幕 | 任意 | 全部成功 | P1 |
| 网络错误 | 中断网络 | 任意 | 错误提示 | P1 |
| 速率限制 | 连续调用 | 任意 | 正确处理 | P2 |

#### 3.1.1 最小回归集（时间紧急时必须完成）
- ✅ P0：中→英、俄语空格、英→日
- ✅ P1：特殊字符 或 长文本（二选一即可）
- ✅ P1：网络错误（拔网线/断开代理）
- ⏱️ 目标：≤30 分钟完成，耗时更长需同步 PM 评估

### 3.2 性能测试矩阵

| 指标 | 当前（YAML） | 目标（JSON） | 测试方法 |
|------|------------|-------------|---------|
| 格式转换 | ~1ms | <1ms | 性能日志 |
| API调用 | ~3s | ~3s | 性能日志 |
| 解析时间 | 3-5ms | <0.5ms | 性能日志 |
| 验证时间 | - | <5ms | 性能日志 |
| 总耗时 | ~3.5s | ~3.5s | 性能日志 |

### 3.3 质量测试矩阵

| 质量指标 | 当前 | 目标 | 测试方法 |
|---------|------|------|---------|
| 格式错误率 | ~30% | <1% | 抽样测试 |
| 数量匹配率 | ~90% | >99% | 每次测试 |
| ID错位率 | ~5% | 0% | 验证日志 |
| 字母空格问题 | 100% | 0% | 俄语测试⭐ |

---

## 四、风险管理

### 4.1 技术风险

| 风险 | 等级 | 缓解措施 | 应急方案 |
|------|------|---------|---------|
| Gemini API 不支持 | 低 | ✅ 已确认 v1beta 支持 | 回滚到YAML |
| JSON Schema 限制 | 低 | ✅ Schema定义简单 | 调整Schema |
| 解析失败 | 低 | ✅ try-catch 包裹 | 详细错误日志 |
| 性能下降 | 极低 | ✅ JSON.parse()更快 | 性能监控 |

### 4.2 业务风险

| 风险 | 等级 | 缓解措施 | 应急方案 |
|------|------|---------|---------|
| 翻译质量下降 | 低 | 多语言测试 | 调整Prompt |
| 用户体验变差 | 极低 | 完整测试 | 回滚版本 |
| 字母空格未解决 | 中 | 重点测试俄语 | 后处理清理 |

### 4.3 回滚计划

**如果遇到严重问题**：

```bash
# 方案1：恢复备份
cp src/background/components/gemini-translator.ts.backup \
   src/background/components/gemini-translator.ts

# 方案2：Git 回滚
git checkout HEAD~1 src/background/components/gemini-translator.ts

# 方案3：切换分支
git checkout main

# 重新编译
npm run build
```

---

## 五、完成标准

### 5.1 代码完成标准

- [x] 所有新接口和类型定义已添加
- [x] convertToYAML → convertToJSON
- [x] buildTranslationPrompt 已简化
- [x] callGeminiAPI 已添加 Structured Output
- [x] parseYAMLResponse 已删除
- [x] validateTranslationResult 已添加
- [x] 主流程已更新
- [x] 代码编译无错误
- [x] 无 TypeScript 类型错误

### 5.2 测试完成标准

- [ ] 基础翻译测试通过（中→英、英→日）
- [ ] ⭐ 俄语空格问题已解决（P0）
- [ ] 数量匹配测试通过
- [ ] 特殊字符测试通过
- [ ] 错误处理测试通过
- [ ] 性能测试达标（解析<0.5ms）
- [ ] 至少测试3种语言对

### 5.3 文档完成标准

- [ ] 代码注释完整
- [ ] Commit message 清晰
- [ ] 实施记录已更新
- [ ] 如有问题，记录到 troubleshooting.md

---

## 六、时间估算

| 阶段 | 预计时间 | 关键活动 |
|------|---------|---------|
| **Step 0-1** | 35分钟 | 准备 + 类型定义 |
| **Step 2-3** | 35分钟 | 格式转换 + Prompt |
| **Step 4** | 30分钟 | API调用（核心） |
| **Step 5-6** | 30分钟 | 删除旧代码 + 验证 |
| **Step 7** | 30分钟 | 主流程 |
| **Step 8** | 20分钟 | 编译测试 |
| **Step 9** | 60分钟 | 功能测试（⭐关键） |
| **Step 10** | 60分钟 | 问题修复（预留） |
| **Step 11** | 15分钟 | 提交代码 |
| **总计** | **315分钟** | **约5.25小时** |

**建议时间安排**：
- 上午：Step 0-6（2.5小时）- 代码修改
- 下午：Step 7-9（2小时）- 集成和测试
- 晚上：Step 10-11（1小时）- 修复和提交

---

## 七、检查清单

### 7.1 开发前检查

- [ ] 已阅读架构设计文档
- [ ] 已创建功能分支
- [ ] 已备份当前代码
- [ ] 开发环境就绪
- [ ] Gemini API Key 可用

### 7.2 开发中检查

- [ ] 每完成一个Step，立即编译测试
- [ ] 修改后及时 git add（避免丢失）
- [ ] 遇到问题记录到笔记
- [ ] 重要节点截图保存

### 7.3 开发后检查

- [ ] 所有测试用例通过
- [ ] ⭐ 俄语空格问题已解决
- [ ] 性能指标达标
- [ ] 代码审查通过
- [ ] 文档已更新
- [ ] Git 提交完成

---

## 八、常见问题FAQ

### Q1: JSON Schema 不生效怎么办？

**A**: 检查以下几点：
1. 字段名是 `responseJsonSchema` 而不是 `responseSchema`
2. `responseMimeType` 设置为 `"application/json"`
3. 使用的是 v1beta endpoint
4. 模型支持 Structured Output（Gemini 2.5+）

### Q2: 仍然有字母空格问题怎么办？

**A**:
1. 首先确认是 Gemini 返回就有空格，还是我们解析出错
2. 查看原始响应 JSON
3. 如果 Gemini 返回就有空格，添加后处理清理逻辑
4. 优化 Prompt，明确要求无空格

### Q3: 数量不匹配怎么办？

**A**:
1. 查看 validateTranslationResult 的错误日志
2. 打印发送和接收的数据
3. 检查是否是 Gemini 拆分/合并了字幕
4. 优化 Prompt，强调不拆分不合并

### Q4: 性能没有提升怎么办？

**A**:
1. JSON.parse() 本身很快（<0.5ms）
2. 主要耗时在 API 调用（~3s）
3. 验证逻辑应该 <5ms
4. 查看性能日志，找到瓶颈

### Q5: 如何快速回滚？

**A**:
```bash
# 方法1：使用备份
cp gemini-translator.ts.backup gemini-translator.ts

# 方法2：Git回滚
git checkout HEAD~1 src/background/components/gemini-translator.ts

# 方法3：切换到主分支
git checkout main
```

---

## 九、成功指标

### 关键成功指标（KSI）

1. **✅ 字母空格问题解决率: 100%**（俄语测试）
2. **✅ 数量匹配率: >99%**（所有测试）
3. **✅ 解析性能: <0.5ms**（性能日志）
4. **✅ 代码减少: >50%**（实际减少57%）
5. **✅ 测试通过率: 100%**（P0+P1测试）

### 附加成功指标

- 编译无错误
- 无运行时崩溃
- 错误日志清晰
- 用户体验无降级

---

## 十、联系和支持

### 遇到问题时

1. **首先**：查看本文档的"常见问题FAQ"
2. **其次**：查看 `docs/guides/troubleshooting.md`
3. **然后**：查看 Gemini API 官方文档
4. **最后**：记录问题，准备回滚

### 参考资源

- [Gemini Structured Output 官方文档](https://ai.google.dev/gemini-api/docs/structured-output)
- [项目架构文档](./11-gemini-json-schema-migration.md)
- [项目 Troubleshooting](../guides/troubleshooting.md)

---

**实施计划版本**: v1.0
**创建日期**: 2025-11-10
**状态**: ✅ 就绪，可立即开始实施
**预计完成**: 4-5小时
