# 文件命名规范 - 优化版本

## 📁 目录命名规范

### 基本原则
- 使用 `kebab-case` (短横线分隔)
- 英文描述，简洁明了
- 功能导向命名

### 标准目录名称
```
├── src/
│   ├── background/          # Service Worker相关
│   ├── content-scripts/     # Content Scripts
│   ├── popup/              # 弹出窗口
│   ├── popup/              # 弹出窗口（当前方案）
│   ├── options/            # 选项页
│   ├── shared/             # 共享代码
│   └── styles/             # 全局样式
├── public/                 # 静态资源
├── docs/                   # 文档
└── tests/                  # 测试文件
```

## 📄 文件命名规范

### TypeScript/JavaScript 文件
```
✅ 推荐:
service-worker.ts           # Service Worker主文件
content-script.ts           # Content Script主文件
main-world.ts              # Main World注入脚本
message-bus.ts             # 消息总线
rate-limit-manager.ts      # 限速管理器

❌ 避免:
ServiceWorker.ts           # PascalCase文件名
content_script.ts          # snake_case文件名
messagebus.ts              # 缺少分隔符
```

### HTML文件
```
✅ 推荐:
popup.html                 # 弹出窗口主页
options.html               # 选项页

❌ 避免:
Popup.html
popup_page.html
```

### CSS文件
```
✅ 推荐:
popup.css                  # 与对应HTML同名
global-styles.css          # 全局样式
component-styles.css       # 组件样式

❌ 避免:
Popup.css                  # 避免PascalCase
popup_styles.css           # 避免snake_case
```

### React组件文件
```
✅ 推荐:
popup-panel.tsx            # kebab-case文件名
control-panel.tsx          # 组件文件名
ui-manager.tsx             # 管理器组件

❌ 避免:
PopupPanel.tsx             # PascalCase文件名（避免）
popupPanel.tsx             # camelCase文件名（避免）
```

## 🗂️ 目录内部组织

### background/ 目录
```
background/
├── service-worker.ts          # 主Service Worker文件
├── background-modules.ts      # 模块导出文件
├── components/               # 业务组件
│   ├── openai-translator.ts  # OpenAI翻译器
│   └── batch-processor.ts    # 批处理器
└── utils/                    # 工具函数
    ├── rate-limit-manager.ts  # 限速管理
    ├── subtitle-local-storage.ts # 字幕存储
    └── translation-local-storage.ts # 翻译存储
```

### content-scripts/ 目录
```
content-scripts/
├── content-script.ts         # 主Content Script
├── main-world.ts            # Main World注入
├── index.ts                 # 导出文件
└── external-injector.js     # 外部注入器
```

### popup/ 目录
```
popup/
├── popup.html               # 主HTML文件
├── popup.ts                 # 主逻辑文件
├── components/              # UI组件
│   └── popup-panel.tsx      # 主组件
├── templates/               # 模板
│   └── template.ts          # 模板逻辑
└── styles/                  # 样式文件
    └── popup.css            # 主样式
```

### shared/ 目录
```
shared/
├── types/                   # 类型定义
│   ├── core-types.ts        # 核心类型
│   ├── storage-types.ts     # 存储类型
│   ├── message-types.ts     # 消息类型
│   └── types.ts             # 统一导出
├── messages/                # 消息系统
│   ├── message-bus.ts       # 消息总线
│   ├── message-handlers.ts  # 消息处理
│   └── messages.ts          # 统一导出
├── storage/                 # 存储管理
├── utils/                   # 工具函数
└── index.ts                 # 总导出文件
```

## 🚫 避免的文件命名

### 临时和备份文件
```
❌ 删除这些文件:
*.backup
*.bak
*.original
*.tmp
*_old
*_new
*deprecated*
*DEPRECATED*
```

### 不明确的命名
```
❌ 避免:
index.html                 # 太通用，应该具体描述
utils.ts                   # 太宽泛，应该按功能分组
helper.ts                  # 不明确，应该说明具体用途
temp.ts                    # 临时文件应该删除
```

## ✅ 命名最佳实践

### 1. 功能描述性
```
✅ 好的命名:
openai-translator.ts       # 明确说明是OpenAI翻译器
rate-limit-manager.ts      # 明确是限速管理器
subtitle-local-storage.ts  # 明确是字幕本地存储

❌ 差的命名:
translator.ts              # 太通用
manager.ts                 # 不知道管理什么
storage.ts                 # 存储什么？
```

### 2. 一致性原则
- 同类文件使用相同的命名模式
- 相关文件使用相似的前缀或后缀
- 整个项目保持命名风格统一

### 3. 长度适中
```
✅ 适中长度:
message-bus.ts             # 清楚且不冗长
user-preferences.ts        # 描述准确

❌ 过长或过短:
a.ts                       # 太短，无意义
very-long-descriptive-filename-that-explains-everything.ts # 太长
```

## 🔄 重构后的改进

### 清理效果
- ✅ 删除了7个备份/废弃文件
- ✅ 重组了background目录结构
- ✅ 统一了组件命名规范
- ✅ 优化了目录层级

### 命名一致性
- ✅ 所有文件使用kebab-case
- ✅ 目录按功能明确分组
- ✅ 消除了冗余嵌套命名
- ✅ 文件名与功能一致

---

遵循这些命名规范可以让项目更易维护，新开发者更容易理解代码结构。 