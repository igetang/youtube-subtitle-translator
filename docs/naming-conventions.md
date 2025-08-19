# YouTube字幕翻译助手 - 命名规范文档

> **版本**: 5.24.6  
> **最后更新**: 2025-06-03

## 🎯 文件命名规范

### 📁 统一导出文件命名标准

为避免多个 `index.ts` 文件造成混淆，我们采用以下命名规范：

| 目录 | 原文件名 | 新文件名 | 用途描述 |
|------|----------|----------|----------|
| `src/types/` | ~~index.ts~~ | `types.ts` | 类型定义统一导出 |
| `src/messages/` | ~~index.ts~~ | `messages.ts` | 消息系统统一导出 |
| `src/storage/` | ~~index.ts~~ | `storage.ts` | 存储系统统一导出 |
| `background/` | ~~index.ts~~ | `background-modules.ts` | 后台脚本模块导出 |

### 🏗️ 导入引用更新

#### 类型定义引用
```typescript
// ✅ 推荐写法
import { MessageType, VideoId } from '../types/types';

// ❌ 避免写法
import { MessageType, VideoId } from '../types/index';
import { MessageType, VideoId } from '../types/';
```

#### 事件系统引用
```typescript
// ✅ 推荐写法
import { initializeMessageSystem, MessageBus } from '../messages/index';

// ❌ 避免写法
import { initializeMessageSystem, MessageBus } from '../messages/messages';
```

#### 存储系统引用
```typescript
// ✅ 推荐写法
import { StorageManager } from '../storage/storage';

// ❌ 避免写法
import { StorageManager } from '../storage/index';
```

### 📋 文件命名原则

#### 1. **模块导出文件**
- 使用模块名作为文件名：`types.ts`、`messages.ts`、`storage.ts`
- 避免使用 `index.ts`（除非确实是目录的唯一入口点）

#### 2. **功能描述性文件**
- 使用功能描述：`background-modules.ts`、`message-handlers.ts`
- 体现文件的具体作用

#### 3. **组件文件**
- 使用组件名：`message-bus.ts`、`user-preferences-manager.ts`
- 采用kebab-case命名

#### 4. **类型定义文件**
- 后缀使用 `-types.ts`：`core-types.ts`、`storage-types.ts`
- 明确表示这是类型定义文件

### 🔍 命名一致性检查

#### 当前项目结构（重构后）
```
src/
├── types/
│   ├── core-types.ts          # 核心类型定义
│   ├── storage-types.ts       # 存储类型定义
│   ├── message-types.ts       # 消息类型定义
│   └── types.ts              # 统一导出 (原index.ts)
├── shared/
│   ├── messages/
│   │   ├── index.ts              # 统一导出
│   │   ├── message-bus.ts        # 主要消息总线
│   │   ├── messages.ts           # 消息类型定义
│   │   └── message-handlers.ts   # 消息处理器
│   └── events/                   # 保留用于向后兼容
│       └── event-bus.ts          # 原有事件总线(向后兼容)
└── storage/
    ├── [various managers].ts
    └── storage.ts            # 统一导出 (原index.ts)

background/
├── background.ts             # 主要后台脚本
├── [various modules].ts
└── background-modules.ts     # 模块导出 (原index.ts)
```

### ⚠️ 注意事项

1. **构建系统配置**
   - 更新 `vite.config.ts` 中的入口点引用
   - 检查所有import语句的路径

2. **向后兼容性**
   - 保持原有文件的功能不变
   - 新的命名仅用于避免混淆

3. **团队协作**
   - 所有团队成员使用统一的命名规范
   - Code Review时检查命名一致性

### 🚀 迁移指导

#### 现有代码迁移
如果发现旧的import语句，按以下方式更新：

```typescript
// 旧的导入方式
import { MessageType } from '../types';
import { MessageBus } from '../events';
import { StorageManager } from '../storage';

// 新的导入方式
import { MessageType } from '../types/types';
import { MessageBus } from '../messages/messages';
import { StorageManager } from '../storage/storage';
```

#### 自动化检查
可以使用以下命令检查项目中的导入：

```bash
# 查找所有可能的index导入
grep -r "from.*index" src/
grep -r "from.*/" src/ | grep -v ".ts"
```

### 📊 命名规范总结

| 类型 | 规范 | 示例 |
|------|------|------|
| 类型定义文件 | `{module}-types.ts` | `core-types.ts` |
| 模块导出文件 | `{module}.ts` | `types.ts`, `messages.ts` |
| 功能实现文件 | `{功能描述}.ts` | `message-bus.ts` |
| 组件文件 | `{组件名}.ts` | `user-preferences-manager.ts` |

这样的命名规范确保了：
- ✅ 文件用途清晰明确
- ✅ 避免import时的混淆
- ✅ 便于代码维护和团队协作
- ✅ 支持IDE的智能提示和导航 