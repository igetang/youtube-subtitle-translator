# YouTube字幕翻译助手 - 项目结构文档

## 📁 项目结构概览

```
5.24/
├── public/                    # 静态资源目录
│   ├── manifest.json         # Chrome Extension配置文件
│   ├── icons/               # 扩展图标
│   ├── assets/              # 静态资源
│   └── _locales/            # 国际化文件
├── src/                      # 源代码目录
│   ├── background/          # Service Worker (Background Script)
│   ├── content-scripts/     # Content Scripts
│   ├── popup/              # Popup页面
│   ├── popup/              # Popup页面（主UI界面）
│   ├── options/            # Options页面
│   ├── shared/             # 共享代码模块
│   │   ├── types/          # TypeScript类型定义
│   │   ├── messages/       # 消息系统
│   │   ├── storage/        # 存储管理
│   │   ├── utils/          # 工具函数
│   │   └── index.ts        # 统一导出
│   └── styles/             # 全局样式
├── docs/                   # 项目文档
├── tests/                  # 测试文件
└── dist/                   # 构建输出目录
```

## 🎯 设计原则

### 1. 按功能模块分离
- 每个Chrome Extension组件有独立目录
- 清晰的职责边界
- 便于维护和扩展

### 2. 共享代码集中管理
- `src/shared/` 包含所有可复用代码
- 统一的类型定义和工具函数
- 避免代码重复

### 3. 符合Manifest V3最佳实践
- Service Worker替代Background Page
- 模块化设计
- 安全的消息传递机制

## 📦 目录详细说明

### `/public/` - 静态资源
```
public/
├── manifest.json          # Extension配置文件
├── icons/                # 16px, 48px, 128px图标
├── assets/               # 图片、样式等静态资源
└── _locales/             # 国际化语言包
    └── zh_CN/
        └── messages.json
```

### `/src/background/` - Service Worker
```
background/
├── background-modules.ts   # 主入口文件
├── service-worker.ts      # Service Worker实现
└── handlers/              # 消息处理器
```

**职责:**
- 监听Chrome Extension事件
- 处理跨标签页消息传递
- 管理扩展生命周期

### `/src/content-scripts/` - Content Scripts
```
content-scripts/
├── content-script.ts      # 主内容脚本
├── main-world.ts         # Main World注入脚本
└── youtube-injector.ts   # YouTube页面注入器
```

**职责:**
- 与YouTube页面交互
- 注入UI控件
- 监听页面事件

### `/src/sidepanel/` - SidePanel界面【已废弃】
```
sidepanel/              # 已迁移到Popup方案
├── [已废弃]            # 保留作为历史参考
└── [归档至docs/archive/deprecated-sidepanel/]
```

**注意:**
- SidePanel已废弃，功能迁移到Popup
- 相关文档归档至 `docs/archive/deprecated-sidepanel/`

### `/src/popup/` - Popup界面（主UI方案）
```
popup/
├── popup.html            # Popup页面结构
├── popup.ts              # Popup逻辑（含页面检测）
└── components/           # Popup组件
```

**职责:**
- 页面类型智能检测
- YouTube页面：完整翻译功能界面
- 非YouTube页面：使用说明和引导
- 翻译设置和管理

### `/src/shared/` - 共享代码
```
shared/
├── types/                # TypeScript类型定义
│   ├── core-types.ts     # 核心业务类型
│   ├── storage-types.ts  # 存储相关类型
│   ├── message-types.ts  # 消息通信类型
│   └── types.ts          # 统一导出
├── messages/             # 消息系统
│   ├── message-bus.ts    # 消息总线
│   ├── message-handlers.ts # 消息处理器
│   └── messages.ts       # 统一导出
├── storage/              # 存储管理
│   └── storage.ts        # 存储管理器
├── utils/                # 工具函数
│   ├── languages.ts      # 语言相关工具
│   └── language-processing.ts # 语言处理工具
└── index.ts              # 统一导出入口
```

## 🔧 构建配置

### Vite配置
- 多入口构建配置
- 静态资源拷贝
- TypeScript支持
- 别名配置：`@shared` 指向 `src/shared`

### 导入规范
```typescript
// 推荐：使用别名导入共享模块
import { MessageBus } from '@shared';
import type { MessageType } from '@shared/types/types';

// 避免：直接相对路径导入
import { MessageBus } from '../../shared/messages/message-bus';
```

## 🚀 迁移完成状态

### ✅ 已完成
- [x] 目录结构重构
- [x] 静态资源迁移到public/
- [x] 代码模块重新组织
- [x] 构建配置更新
- [x] 别名配置添加

### 🔄 待完成
- [ ] 更新所有import路径
- [ ] 测试构建流程
- [ ] 更新开发文档
- [ ] 验证功能完整性

## 📝 开发建议

1. **新功能开发**: 优先使用共享模块中的类型和工具
2. **导入顺序**: 先导入类型，再导入实现
3. **命名规范**: 遵循 `docs/naming-conventions.md`
4. **模块职责**: 保持单一职责原则

## 🔍 故障排除

### 构建问题
```bash
# 检查路径引用
npm run build

# 检查类型定义
npm run type-check
```

### 导入问题
- 检查 `vite.config.ts` 中的alias配置
- 确认文件路径正确性
- 验证导出/导入语法

---

本文档记录了项目结构重构的完整过程和新的组织方式，为后续开发提供参考。 