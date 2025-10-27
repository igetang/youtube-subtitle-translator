# YouTube字幕翻译助手 - 命名规范

> **最后更新**: 2025-10-25  
> 适用于 `src/` 下所有 TypeScript / Vue-less 模块及相关文档

规范目标：提高可读性、避免导入混淆、确保团队协作时命名一致。

---

## 1. TypeScript/JavaScript 命名约定

| 实体类型 | 约定 | 示例 |
| -------- | ---- | ---- |
| 类 / 枚举 | PascalCase | `AbortTimeoutManager`, `TranslateActiveState` |
| 函数 / 变量 | camelCase | `handleToggleTranslateV4`, `selectBestSourceLanguage` |
| 常量（顶层） | UPPER_SNAKE_CASE | `ERROR_MESSAGE_DURATION` |
| 类型别名 / 接口 | PascalCase，必要时追加后缀 | `ToggleTranslateRequest`, `SubtitleEntry` |
| 日志前缀 | `[模块名]` 或 `[debug][模块名]` | `[service-worker-v4]`, `[debug][ContentScript]` |

> **提示**：在 TypeScript 中优先使用 `type` / `interface` 描述结构，避免使用 `any`。导出类型应用 `export type ...`，导出实现使用 `export function / class ...`。

---

## 2. 文件与目录命名

### 2.1 总体原则
- 使用 **kebab-case**（小写 + 连字符）作为文件名：`message-bus.ts`、`user-preferences-manager.ts`。
- 避免 `index.ts`；若必须作为目录入口，请在 README 或注释中说明用途。
- 目录名称使用英文单词或组合，见下表。

### 2.2 统一导出文件

| 目录 | 统一导出文件 | 说明 |
| ---- | ------------ | ---- |
| `src/shared/types/` | `types.ts` | 汇总核心类型（原 `index.ts`） |
| `src/shared/messages/` | `index.ts` | 暴露 MessageBus/Handlers（其余文件按职责命名） |
| `src/shared/storage/` | `index.ts` | 暴露存储相关管理器 |
| `src/background/` | `background-modules.ts` | 组装后台模块出口 |

### 2.3 功能文件命名
- **模块名称 + 功能**：`handle-toggle-translate-v4.ts`、`translation-cache-manager.ts`。
- **类型文件**：`{module}-types.ts`（例如 `runtime-state-types.ts`）。
- **工具函数**：`{功能}-utils.ts` 或 `utils/{功能}.ts`。
- **翻译服务适配器**：`{provider}-translator.ts`（如 `microsoft-translator.ts`）。

### 2.4 导入示例

```typescript
// ✅ 推荐：显式文件名或别名
import { MessageBus } from '@shared/messages/message-bus';
import type { TranslateActiveState } from '@shared/types/runtime-state-types';

// ✅ 推荐：从统一出口导入
import { TranslationCacheManager } from '@shared/storage';

// ❌ 避免：依赖目录默认导出或 index 简写
import { MessageBus } from '@shared/messages';
import { StorageManager } from '../storage/index';
```

---

## 3. 日志与前缀

- **普通日志**：`console.log('[service-worker-v4] 开启翻译会话')`
- **调试信息**：`console.debug('[debug][TwoPhaseTranslatorV4] 生成批次', batch)`
- **警告/错误**：使用 `console.warn` / `console.error`，保持与日志优化任务一致。
- 在多人协作时保持前缀一致，便于过滤。

---

## 4. 命名检查清单

1. 新文件命名是否符合 kebab-case？  
2. 是否避免 `index.ts` 的模糊导入？  
3. 新增类型是否放置在 `src/shared/types/` 下并命名为 `*-types.ts`？  
4. 导入语句是否使用显式路径或别名？  
5. 日志前缀是否体现模块名称？

如需新增命名规则，请先更新本文件并在评审时说明。*** End Patch
