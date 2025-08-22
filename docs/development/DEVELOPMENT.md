# YouTube字幕翻译助手 - 开发指南

> **最后更新**: 2025-08-21  
> **当前版本**: v3.0.0 (**Popup架构版本**)  
> **架构状态**: ✅ **Popup架构已完成** - 从SidePanel迁移到Popup，采用MessageBus通信

本文档提供扩展项目的开发环境设置、工作流程和贡献指南，帮助开发者参与v3.0.0 Popup架构的项目开发。

## 🎯 **v3.0.0 Popup架构开发指导**

### 核心架构原则
- **Popup优先**: 使用Popup替代Popup，提供更好的兼容性
- **MessageBus通信**: 统一的消息总线替代EventBus，简化组件通信
- **4状态翻译系统**: 精确的翻译状态管理（inactive/pending/active/intent_only）
- **Chrome官方最佳实践**: 严格遵循 Manifest V3 规范

### 重要设计决策
- ✅ **Popup架构**: 从Popup迁移到Popup，提供更稳定的用户体验
- ✅ **MessageBus系统**: 统一消息通信，使用type字段替代action字段
- ✅ **状态分离**: RuntimeState与UserPreferences分离，清晰的职责划分
- ✅ **缓存优先策略**: 三层缓存架构，减少API调用

## 开发环境设置

### 前置要求

* Node.js (v14+)
* npm, yarn 或 pnpm
* Chrome浏览器（用于测试扩展）

### 项目获取与依赖安装

```bash
# 克隆仓库
git clone <repository-url>

# 进入项目目录
cd youtube-subtitle-translator

# 安装依赖
npm install
```

### 开发命令

```bash
# 开发模式构建（支持热重载）
npm run dev

# 生产模式构建
npm run build

# 代码检查
npm run lint

# 类型检查
npm run type-check
```

## 加载扩展进行测试

1. 运行 `npm run dev` 启动 Vite 开发服务器
2. 在 Chrome 地址栏输入：`chrome://extensions/`
3. 打开右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 目录
6. 访问任意 YouTube 视频页面进行测试
7. 每次修改代码后，点击扩展卡片上的"重新加载"按钮应用更改

### 开发环境配置验证

```bash
# 验证Node.js版本
node --version

# 验证npm可用性
npm --version

# 检查项目依赖
npm ls
```

## 项目结构 (v3.0.0 Popup架构)

```
/mnt/e/chrome/8.19/
├── src/                        # 新架构核心代码 (v3.0.0 Popup架构)
│   ├── background/             # Background Service Worker
│   │   ├── service-worker.ts   # 主要服务工作者脚本
│   │   ├── utils/              # 后台工具函数
│   │   └── components/         # 后台组件
│   ├── content-scripts/        # Content Scripts
│   │   ├── content-script.ts   # 主要内容脚本
│   │   └── main-world.ts       # 主世界注入脚本
│   ├── popup/                  # 弹出窗口（主要UI界面）
│   │   ├── popup.html          # 弹出页面HTML
│   │   └── popup.ts            # 弹出页面脚本
│   ├── popup/             # [已废弃] 旧版侧边栏（保留用于历史参考）
│   └── shared/                # 共享组件和工具
│       ├── components/        # UI组件
│       │   ├── ui-manager.ts  # UI管理器
│       │   └── control-panel.ts # 控制面板组件
│       ├── storage/           # 存储管理 (v3.0.0 统一架构)
│       │   ├── user-preferences-manager.ts  # 用户偏好管理器
│       │   ├── runtime-state-manager.ts     # 运行时状态管理器
│       │   ├── video-source-language-cache.ts # 视频源语言缓存
│       │   ├── memory-cache.ts              # 内存缓存管理
│       │   └── index.ts                     # 统一存储入口
│       ├── types/             # TypeScript类型定义
│       │   ├── storage.ts     # 存储相关类型
│       │   └── messages.ts    # 消息类型定义
│       ├── messages/          # 消息系统
│       │   ├── message-bus.ts     # 消息总线
│       │   ├── message-handlers.ts # 消息处理器
│       │   └── messages.ts        # 消息类型定义
│       ├── constants/         # 常量定义
│       ├── translation/       # 翻译相关
│       │   └── translation-dispatcher.ts # 翻译调度器
│       └── utils/             # 工具函数
│           ├── language-processing.ts # 语言处理工具
│           └── languages.ts           # 语言定义
├── .archive/                   # 已归档文件（旧架构、备份等）
├── docs/                      # 项目文档
│   ├── architecture/          # 架构文档
│   │   ├── 01-05 及 popup.md  # 新架构标准文档
│   ├── development/           # 开发文档
│   ├── guides/                # 使用指南
│   ├── api/                   # API文档
│   └── archive/               # 归档文档
├── public/                    # 公共资源文件
│   ├── _locales/              # 国际化文件
│   │   └── zh_CN/             # 中文本地化
│   ├── icons/                 # 扩展图标
│   │   ├── icon16.png         # 16x16 图标
│   │   ├── icon48.png         # 48x48 图标
│   │   ├── icon128.png        # 128x128 图标
│   │   ├── l-setting.svg      # 设置按钮图标
│   │   └── on.svg             # 开启状态图标
│   └── assets/                # 静态资源
├── scripts/                   # 构建和部署脚本
│   └── verify-build.sh        # 构建验证脚本
├── dist/                      # 构建输出目录（构建时生成）
│   ├── background.js          # 编译后的后台脚本
│   ├── content-script.js      # 编译后的内容脚本
│   ├── popup.js               # 编译后的Popup脚本
│   └── manifest.json          # Chrome扩展清单文件
├── manifest.json              # 扩展清单文件 (Manifest V3)
├── package.json               # 项目依赖和脚本
├── tsconfig.json              # TypeScript配置
├── vite.config.ts             # Vite构建配置
├── README.md                  # 用户使用指南
├── CHANGELOG.md               # 更新日志
└── DEVELOPMENT.md             # 开发指南（本文档）
```

### v3.0.0 架构特色说明

#### 🎯 Popup 架构
- **新架构**: `src/popup/popup.ts` (主要UI界面)
- **旧架构**: `src/popup/` (已废弃，Popup架构)
- **设计理念**: 使用Popup提供更稳定的用户体验

#### 📦 存储管理统一架构
- **UserPreferencesManager**: 用户偏好设置管理
- **RuntimeStateManager**: 运行时状态管理
- **VideoSourceLanguageCache**: 视频源语言缓存
- **MemoryCache**: 内存缓存管理
- **统一入口**: `src/shared/storage/index.ts`

#### 🔄 MessageBus 通信系统
- **统一消息格式**: 使用 `type` 字段替代 `action` 字段
- **消息路由**: Service Worker 作为消息中心
- **组件通信**: Content Script ↔ Service Worker ↔ Popup

### 目录功能说明

#### 核心脚本目录
- **`background/`**: 扩展后台服务工作者，处理翻译请求、缓存管理和消息路由
  - `background.ts`: 主要的服务工作者脚本，消息路由和缓存管理
  - `batch-processor.ts`: 字幕批处理器，优化翻译性能
  - `openai-translator.ts`: OpenAI翻译API的专门实现
  - `rate-limit-manager.ts`: API调用频率控制和限流管理
  - `subtitle-local-storage.ts`: 字幕数据的本地存储管理
  - `translation-local-storage.ts`: 翻译结果的本地存储管理
  - `*.backup`: 各种备份文件，用于版本回退和对比

- **`content/`**: 内容脚本，与YouTube页面交互，注入UI组件和处理用户交互
  - `content-script.ts`: 主要内容脚本，处理UI注入和用户交互
  - `main-world.ts`: 主世界注入脚本，访问YouTube播放器API
  - `content.ts`: 内容处理和字幕显示逻辑
  - `*.backup` / `*.deprecated`: 备份文件和已弃用的版本

- **`popup/`**: 侧边栏界面，提供用户设置、语言选择和翻译API配置
  - `popup.html`: 侧边栏页面结构
  - `popup.ts`: 侧边栏交互逻辑和设置管理，包含智能语言选择系统
    * **ASR轨道识别**: `generateLanguageDisplayName()` 函数自动为ASR轨道添加"（自动生成）"标识
    * **语言族互斥**: `isSameLanguageFamily()` 函数实现基于语言族的互斥逻辑
    * **轨道切换检测**: 增强的变化检测机制，支持轨道类型切换时触发翻译更新
  - `popup.css`: 侧边栏样式定义
  - `template.ts`: 侧边栏模板和组件

#### 共享代码目录
- **`src/`**: 可复用的组件和工具库
  - `components/`: UI组件管理，包含翻译按钮、设置按钮等界面元素管理
    - `control-panel.ts`: 控制面板的核心逻辑，统一管理翻译流程
    - `ui-manager.ts`: UI元素的创建、更新和状态管理
  - `messages/`: 消息系统，实现组件间高效通信机制
    - `message-bus.ts`: Chrome扩展原生消息通信实现
    - `message-handlers.ts`: 消息处理器和回调函数管理
    - `messages.ts`: 所有消息类型的TypeScript定义
  - `storage/`: **🔄 新架构**：统一的数据存储和缓存管理，全新重构的设置系统
    - `storage-manager.ts`: 统一的存储访问层，支持多种存储区域和变更监听
    - `global-settings.ts`: **新增**：统一的全局设置类型定义
    - `user-preferences-manager.ts`: **新增**：统一的用户偏好设置管理器，专注用户偏好管理
    - `runtime-state-manager.ts`: **新增**：运行时状态管理器（translateActive等）
    - `migration.ts`: **新增**：数据迁移机制，自动从旧架构迁移到新架构
    - `index.ts`: **新增**：统一存储模块入口，导出所有管理器
    - `settings-manager.ts`: **保留**：向后兼容的设置管理器
    - `video-settings-local-storage.ts`: **保留**：向后兼容的视频设置存储
    - `storage-test.ts`: **保留**：存储测试
  - `translation/`: 翻译相关逻辑和多API封装
    - `translation-dispatcher.ts`: 翻译任务的调度和优先级管理
  - `utils/`: 通用工具函数和帮助类
    - `language-processing.ts`: 语言检测、匹配和处理工具
      * **语言相关性检测**: `isLanguageRelevantToUI()` 函数判断语言与UI语言的相关性
      * **语言族互斥逻辑**: 支持基于语言基础代码的互斥判断
    - `languages.ts`: 支持的语言列表和元数据

#### 文档目录
- **`docs/`**: 完整的项目文档集合
  - `architecture.md`: **权威技术架构文档**，所有技术设计的唯一参考
  - `translation-flow.md`: 字幕翻译完整流程说明
  - `decision-log.md`: 重要技术决策记录和背景说明  
  - `performance.md`: 性能优化策略和三层缓存实现
  - `api.md`: 内部和外部API接口文档
  - `roadmap.md`: 开发路线图和功能规划
  - `optimization-verification.md`: 性能验证和测试指南
  - `troubleshooting.md`: 故障排除和问题解决
  - `archive/`: 历史文档和已解决问题的详细记录
    - 包含架构变更、优化记录、重构计划、测试结果等历史文档

#### 配置和资源目录
- **`_locales/`**: Chrome扩展国际化支持，当前支持中文
- **`icons/`**: 扩展图标资源，包含多种尺寸和状态的图标文件
  - 支持16px、48px、128px多种尺寸
  - 包含开启/关闭状态、设置按钮等SVG图标
- **`assets/`**: 静态资源文件和编译产物
- **`.cursor/`**: Cursor编辑器的项目配置，包含Chrome扩展开发规则

#### 构建和工具目录
- **`scripts/`**: 自动化构建、部署和维护脚本
  - `verify-build.sh`: 构建验证脚本，确保输出正确
- **`tmp/`**: 临时文件、开发缓存和实验性代码
- **`dist/`**: Vite构建输出目录，Chrome扩展的最终运行文件
  - 包含所有编译后的JavaScript文件和源码映射
  - 复制的静态资源和清单文件

#### 备用功能目录
- **`options/`**: 选项页面（当前未使用，侧边栏为主要设置界面）
- **`popup/`**: 弹出式界面（当前未使用，侧边栏为主要交互界面）
- **`rules/`**: 扩展行为规则和策略配置（当前为空）

### 架构特点

#### 模块化设计
- **职责分离**: 后台脚本处理数据和API，内容脚本处理UI和交互，侧边栏提供设置界面
- **事件驱动**: 使用事件总线实现组件间松耦合通信
- **三层缓存**: Memory Cache (Background内存) → Local Storage → API调用的完整缓存策略
- **🔄 统一设置管理**: 新的GlobalSettingsManager统一管理用户设置和视频特定设置，支持自动数据迁移

#### 设置架构重构 (v3.0.0)
- **统一数据模型**: 将原来分散的UserSettings和VideoSettings合并为GlobalSettings
- **智能缓存管理**: 自动管理视频设置缓存，支持最近使用列表和容量限制
- **无缝数据迁移**: MigrationHelper自动检测并迁移旧版本数据，保证用户设置不丢失
- **变更通知机制**: 统一的设置变更监听和通知系统，提高响应性能

#### 性能优化
- **懒加载**: 仅在用户首次交互时完整初始化核心功能
- **渐进式翻译**: 优先翻译当前播放位置附近的字幕
- **智能缓存**: 基于视频ID、语言和API的多维度缓存机制
- **资源管理**: 页面导航时自动清理资源和事件监听器

#### 开发体验
- **TypeScript**: 全面的类型安全和开发时错误检查
- **Vite构建**: 快速的热重载和现代化构建工具链
- **模块导入**: 标准ES模块支持，避免全局污染
- **文档完整**: 从用户指南到技术架构的完整文档体系

### 文件流转关系

```
开发源码 (src/, background/, content/, popup/)
    ↓ (Vite构建)
构建输出 (dist/)
    ↓ (Chrome加载)
扩展运行时
```

### 重要配置文件

- **`manifest.json`**: Chrome扩展配置，定义权限、脚本加载等
- **`vite.config.ts`**: 构建配置，处理TypeScript编译和模块打包
- **`tsconfig.json`**: TypeScript编译选项
- **`package.json`**: 项目元信息、依赖管理和脚本定义

## 📊 数据架构设计（v3.0.0.6重构版本）

### 存储分层架构

项目采用三层分离的数据存储架构，将不同类型的数据按职责和生命周期进行分层管理：

#### 1. **GlobalSettings** - 持久化用户偏好设置
```typescript
interface GlobalSettings {
  // === 核心翻译设置 ===
  targetLang: string;                           // 目标语言（全局默认）
  subtitleMode: SubtitleMode;                   // 字幕显示模式
  
  // === 翻译服务配置 ===
  translationService: TranslationServiceType;  // 翻译服务类型
  serviceConfig: ServiceConfig;                 // 服务配置（API密钥、模型等）
  
  // === 数据完整性 ===
  hash: string;                                 // 设置hash值
}
```
- **存储位置**: `chrome.storage.local`
- **前缀**: `global_settings.`
- **特点**: 用户偏好永久保存，不清理
- **管理器**: `GlobalSettingsManager`

#### 2. **RuntimeState** - 运行时状态
```typescript
interface RuntimeState {
  translateActive: TranslateActiveState;        // 翻译状态（4状态枚举）
  popupOpen: boolean;                           // Popup打开状态
}

enum TranslateActiveState {
  INACTIVE = 'inactive',      // 翻译关闭
  PENDING = 'pending',         // 翻译执行中（过渡状态）
  ACTIVE = 'active',           // 翻译激活（有字幕并显示翻译）
  INTENT_ONLY = 'intent_only'  // 仅有意图（用户想翻译但无字幕）
}
```
- **存储位置**: `chrome.storage.local`
- **前缀**: `runtime_state.`
- **特点**: 运行时状态，可重置
- **管理器**: `RuntimeStateManager`

#### 3. **VideoSpecificData** - 视频特定数据
```typescript
interface VideoSpecificData {
  videoId: string;                              // 视频ID
  sourceLang: string;                           // 源语言（用于匹配）
  targetLang: string;                           // 目标语言（用于匹配）
  translationService: TranslationServiceType;   // 翻译服务类型
  serviceConfig: ServiceConfig;                 // 服务配置
  lastUsed: number;                             // 最后使用时间戳
  hasSubtitles: boolean;                        // 是否有字幕
  translatedSubtitles: string;                 // 翻译后的字幕数据
  
  // === 数据完整性验证 ===
  dataHash: string;                             // 数据完整性hash
}
```
- **存储位置**: 与翻译字幕一起存储
- **特点**: 循环覆盖，存满后覆盖最早的
- **管理器**: 由`GlobalSettingsManager`和翻译模块共同管理

### Hash验证机制

#### **GlobalSettings Hash**
- **计算范围**: `targetLang + subtitleMode + translationService`
- **用途**: 检测用户设置变更，避免不必要的重新计算
- **更新时机**: 这3个参数设置变更时自动重新计算
- **排除字段**: 不包含频繁变化的状态数据（如translateActive）

#### **VideoSpecificData 数据完整性验证**
- **dataHash**: 验证翻译数据完整性，包含字幕内容和关键元数据
- **自动恢复**: 验证失败时自动重新翻译，保证功能可用性

### 管理器架构

#### 1. **GlobalSettingsManager**
- **职责**: 管理用户偏好设置
- **功能**: 
  * 智能默认值计算（基于浏览器UI语言）
  * Hash完整性验证
  * 设置变更通知
  * 缓存管理

#### 2. **RuntimeStateManager**
- **职责**: 管理运行时状态
- **功能**:
  * 状态变更通知
  * 支持状态重置
  * 批量状态操作

#### 3. **统一存储入口** (`src/storage/index.ts`)
- **职责**: 提供统一的存储访问接口
- **导出**: 所有管理器和类型定义
- **简化**: 外部模块只需导入此文件即可访问所有存储功能

### 并行处理事件系统

#### **设计理念**
当Background获得要存储数据时，同时引发相应的事件，通过并行处理提升性能和用户体验。

#### **优势特性**
- ⚡ **响应速度提升**: 存储和通知同时进行，不阻塞用户操作
- ⚡ **降低延迟**: 避免存储完成后再发送事件的串行等待
- 🎯 **职责清晰**: Background专注数据管理，事件系统专注通信
- 🛡️ **容错性好**: 存储失败不影响事件通知，反之亦然

#### **事件类型**
```typescript
enum StorageEventType {
  SETTINGS_UPDATED = 'SETTINGS_UPDATED',
  TRANSLATION_CACHED = 'TRANSLATION_CACHED',
  RUNTIME_STATE_CHANGED = 'RUNTIME_STATE_CHANGED',
  VIDEO_DATA_UPDATED = 'VIDEO_DATA_UPDATED'
}
```

### 性能优化策略

#### **缓存机制**
- **内存缓存**: GlobalSettingsManager内置缓存，避免重复读取
- **Hash验证**: 快速检测数据变更，避免不必要的计算
- **批量操作**: 支持批量设置更新，减少存储操作次数

#### **存储优化**
- **分层存储**: 按数据特点分层存储，避免频繁读写大数据
- **精确缓存**: 基于hash的精确缓存匹配，避免缓存冲突
- **LRU清理**: 视频特定数据支持LRU策略自动清理

## 构建系统

项目使用 Vite 进行构建，配置了多入口点以生成所需的各个脚本：

### 内容脚本特殊构建说明

由于Chrome扩展中内容脚本的特殊性，项目使用双重构建策略：

1. **为什么内容脚本需要特殊处理？**
   - 内容脚本直接注入到网页环境中，该环境可能不支持ES模块
   - 使用`import`语句会导致`Uncaught SyntaxError: Cannot use import statement outside a module`错误

2. **构建格式差异**
   - 内容脚本使用IIFE（立即执行函数表达式）格式构建
   - 背景脚本和其他扩展部分使用ES模块格式

3. **构建命令**
   - `npm run build:main` - 构建背景脚本、侧边栏等
   - `npm run build:content` - 构建内容脚本
   - `npm run build` - 依次执行上述两个命令

## 开发工作流

### 1. 功能开发流程

1. 从主分支创建新的功能分支：`feature/功能名称`
2. 实现功能并编写相关文档
3. 本地测试功能是否正常工作
4. 提交代码，遵循提交信息规范
5. 创建Pull Request，等待审核

### 2. Bug修复流程

1. 从主分支创建新的修复分支：`fix/问题名称`
2. 修复Bug并添加相关测试
3. 在本地验证修复是否有效
4. 提交代码，包含问题和解决方案的清晰描述
5. 创建Pull Request，等待审核

### 3. 代码热重载开发

```bash
# 启动开发模式
npm run dev

# 在另一个终端监控文件变化
npm run watch
```

## 调试技巧

### Chrome DevTools调试

1. **后台脚本调试**：
   - 在扩展卡片上点击"查看视图: 后台页面"打开Service Worker调试器
   - 使用`console.log`输出调试信息
   - 在"应用程序"标签查看Storage数据

2. **内容脚本调试**：
   - 在YouTube页面上打开开发者工具
   - 在控制台中可以看到内容脚本日志
   - 使用"Elements"面板检查注入的UI元素

3. **侧边栏调试**：
   - 右键点击侧边栏，选择"检查"
   - 独立的DevTools窗口用于调试侧边栏

### 常见调试方法

```javascript
// 使用带标识的日志输出
console.log('[background] 处理翻译请求:', data);
console.error('[content-script] 错误信息:', error);

// 检查扩展存储
chrome.storage.local.get(null, console.log);

// 监控消息传递
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message, '来自:', sender);
});
```

### 性能分析

1. **内存使用监控**：
   - 在背景页面DevTools中使用"内存"标签
   - 定期检查是否存在内存泄漏

2. **网络请求监控**：
   - 使用"Network"面板监控API请求
   - 检查翻译API的响应时间和成功率

## 代码规范

### TypeScript代码风格

```typescript
// 函数命名：使用驼峰命名法
function handleTranslationRequest(data: any): Promise<void> {
  // 函数体
}

// 接口定义：使用PascalCase
interface TranslationResult {
  sourceText: string;
  targetText: string;
  confidence: number;
}

// 常量：使用UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const API_TIMEOUT = 5000;

// 类命名：使用PascalCase
class TranslationManager {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
}
```

### 错误处理规范

```typescript
// 使用try-catch包装异步操作
async function translateText(text: string): Promise<string> {
  try {
    const result = await callTranslationAPI(text);
    return result.translatedText;
  } catch (error) {
    console.error('[translator] 翻译失败:', error);
    throw new Error(`翻译失败: ${error.message}`);
  }
}

// 消息处理中的错误处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    handleMessage(message).then(result => {
      sendResponse({ success: true, data: result });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
  return true; // 保持消息通道开放
});
```

### 文档注释规范

   ```typescript
/**
 * 翻译字幕文本
 * @param subtitles - 字幕数组
 * @param sourceLang - 源语言代码
 * @param targetLang - 目标语言代码
 * @returns Promise<翻译结果数组>
 */
async function translateSubtitles(
  subtitles: SubtitleEvent[],
  sourceLang: string,
  targetLang: string
): Promise<TranslatedSubtitle[]> {
  // 实现
}
```

## 测试策略

### 单元测试

```bash
# 运行测试
npm run test

# 运行测试并生成覆盖率报告
npm run test:coverage
```

### 集成测试

1. **扩展加载测试**：验证扩展能否正常加载
2. **YouTube集成测试**：在不同类型的YouTube视频上测试
3. **API集成测试**：测试各种翻译API的调用

### 手动测试清单

- [ ] 扩展安装和卸载
- [ ] 翻译按钮显示和隐藏
- [ ] 字幕翻译功能
- [ ] 设置保存和恢复
- [ ] 错误处理和恢复
- [ ] 不同语言对的翻译
- [ ] 页面导航后的功能

## 贡献指南

### 提交信息规范

```bash
# 格式：类型(范围): 描述
git commit -m "feat(translation): 添加Google翻译API支持"
git commit -m "fix(popup): 修复语言选择重置问题"
git commit -m "docs(readme): 更新安装说明"
```

**类型说明**：
- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建或工具变动

### 代码审查清单

- [ ] 代码遵循项目风格规范
- [ ] 添加了必要的类型注解
- [ ] 包含适当的错误处理
- [ ] 添加了JSDoc注释
- [ ] 通过了所有测试
- [ ] 更新了相关文档

### Pull Request模板

```markdown
## 变更描述
[简要描述此PR的变更内容]

## 变更类型
- [ ] Bug修复
- [ ] 新功能
- [ ] 重构
- [ ] 文档更新

## 测试
- [ ] 本地测试通过
- [ ] 添加了新的测试
- [ ] 所有现有测试通过

## 相关Issue
[关联的Issue编号]
```

## 发布流程

### 版本管理

```bash
# 更新版本号
npm version patch  # 补丁版本
npm version minor  # 次版本
npm version major  # 主版本
```

### 发布前检查清单

- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] 文档更新到位
- [ ] 版本号已更新
- [ ] 构建成功无错误
- [ ] 在真实环境中验证

### 构建和打包

```bash
# 生产构建
npm run build

# 验证构建结果
ls -la dist/

# 打包用于Chrome Web Store
npm run package
```

## 故障排除

### 常见构建错误

1. **依赖版本冲突**：
   ```bash
   # 清理并重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

---

## Popup开发指南 (2025-01-21更新)

### 概述

Popup是YouTube字幕翻译助手的核心用户界面组件，提供设置管理和状态控制功能。本节提供Popup开发、调试和维护的完整指导。

### 架构原则

#### 数据流向
```typescript
// ✅ 正确：数据单向流动
Background → Popup  // 通过PopupContext传输业务数据
Popup → Background  // 通过事件消息传输用户操作

// ❌ 错误：避免双向数据绑定
Popup ↔ Background  // 复杂且难以维护
```

#### 职责分离
- **Background**: 业务逻辑、数据管理、API调用
- **Popup**: UI展示、用户交互、状态反馈

### 核心数据结构

#### PopupContext (主数据通道)
```typescript
interface PopupState {
  videoId: string;                      // 当前视频ID
  tabId: number;                        // 当前标签页ID
  globalSettings: GlobalSettings;       // 全局设置
  detectedSourceLang: string;          // 检测到的源语言
  conflictState: ConflictState;        // 语言冲突状态
}
```

#### StatusMessage (状态消息通道)
```typescript
interface StatusMessage {
  type: 'success' | 'error' | 'loading' | 'info' | 'warning';
  message: string;
}
```

### 开发工作流

#### 1. 新功能开发

**Background端修改**：
```typescript
// 1. 更新PopupContext结构（如需要）
interface PopupState {
  // ... existing fields ...
  newFeatureData: NewFeatureData;      // 新增数据字段
}

// 2. 在Background中构建新数据
class PopupContextBuilder {
  async buildContext(): Promise<PopupContext> {
    // ... existing logic ...
    const newFeatureData = await this.loadNewFeatureData();
    
    return {
      // ... existing fields ...
      newFeatureData
    };
  }
}

// 3. 添加新事件处理
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'NEW_FEATURE_UPDATE') {
    this.handleNewFeatureUpdate(message.data);
  }
});
```

**Popup端修改**：
```typescript
// 1. 监听数据更新
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SIDEPANEL_CONTEXT_UPDATE') {
    this.updateNewFeatureUI(message.data.newFeatureData);
  }
});

// 2. 发送用户操作
function handleUserAction(actionData: any): void {
  chrome.runtime.sendMessage({
    type: MessageType.NEW_FEATURE_UPDATE, // 使用type字段和枚举
    data: actionData
  });
}
```

#### 2. 状态机开发

**语言冲突处理示例**：
```typescript
enum ConflictResolutionState {
  IDLE = 'idle',
  DETECTING = 'detecting',
  CONFLICT_FOUND = 'conflict_found',
  RESOLVING = 'resolving',
  RESOLVED = 'resolved',
  ERROR = 'error'
}

class ConflictResolutionStateMachine {
  private state: ConflictResolutionState = ConflictResolutionState.IDLE;
  
  async detectConflict(source: string, target: string): Promise<ConflictState> {
    this.setState(ConflictResolutionState.DETECTING);
    // 实现检测逻辑...
  }
  
  private setState(newState: ConflictResolutionState): void {
    console.log(`[ConflictStateMachine] ${this.state} → ${newState}`);
    this.state = newState;
  }
}
```

#### 3. 配置流程开发

**OpenAI配置示例**：
```typescript
class ServiceConfigHandler {
  async handleServiceSelection(service: 'openai'): Promise<void> {
    // 1. 显示配置弹窗
    this.showServiceConfigModal(service);
    
    // 2. 等待用户填写
    const config = await this.waitForUserConfiguration();
    
    // 3. 验证配置
    const validation = this.validateServiceConfig(service, config);
    if (!validation.isValid) {
      this.showValidationErrors(validation.errors);
      return;
    }
    
    // 4. 发送到Background测试
    await chrome.runtime.sendMessage({
      type: MessageType.SERVICE_CONFIG_UPDATE, // 使用type字段和枚举
      data: { translationService: service, config }
    });
  }
}
```

### 调试指南

#### 1. Background Script调试
```bash
# 1. 打开扩展管理页面
chrome://extensions/

# 2. 点击扩展的"service worker"链接
# 3. 在DevTools Console中查看日志
console.log('[Background] PopupContext构建完成:', context);
```

#### 2. Popup调试
```bash
# 1. 打开Popup
# 2. 右键点击Popup内容区域
# 3. 选择"检查"打开DevTools
# 4. 查看Console和Network面板
```

#### 3. 通信调试
```typescript
// Background端日志
console.log('[Background→Popup]', message.type, message.data);

// Popup端日志  
console.log('[Popup→Background]', message.type, message.data);
console.log('[Popup←Background]', message.type, message.data);
```

#### 4. 状态机调试
```typescript
class ConflictResolutionStateMachine {
  private setState(newState: ConflictResolutionState): void {
    const transition = `${this.state} → ${newState}`;
    console.log(`[ConflictStateMachine] ${transition}`);
    
    // 发送到DevTools Timeline
    performance.mark(`conflict-state-${newState}`);
    
    this.state = newState;
  }
}
```

### 测试指南

#### 1. 演示系统测试
```bash
# 打开完整架构演示
open tests/demos/demo-popup-architecture.html

# 运行关键测试场景：
# - 插件初始化流程
# - 多标签页切换
# - OpenAI配置流程  
# - 语言冲突处理
```

#### 2. 单元测试
```typescript
// PopupContext构建测试
describe('PopupContextBuilder', () => {
  it('should build complete context for new user', async () => {
    const builder = new PopupContextBuilder();
    const context = await builder.buildContext();
    
    expect(context.videoId).toBeDefined();
    expect(context.globalSettings).toBeDefined();
    expect(context.conflictState).toBeDefined();
  });
});

// 状态机测试
describe('ConflictResolutionStateMachine', () => {
  it('should detect language conflict correctly', async () => {
    const machine = new ConflictResolutionStateMachine();
    const result = await machine.detectConflict('zh-cn', 'zh-tw');
    
    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe('same_family');
  });
});
```

#### 3. 集成测试
```typescript
// 端到端通信测试
describe('Background-Popup Communication', () => {
  it('should handle tab switch correctly', async () => {
    // 模拟标签页切换
    await mockTabSwitch(newTabId);
    
    // 验证Popup接收到更新
    const contextUpdate = await waitForMessage('SIDEPANEL_CONTEXT_UPDATE');
    expect(contextUpdate.data.tabId).toBe(newTabId);
  });
});
```

### 性能优化

#### 1. 数据传输优化
```typescript
// ✅ 只传输必需数据
interface PopupState {
  videoId: string;              // 必需
  globalSettings: GlobalSettings; // 必需
  // 避免传输缓存数据、临时数据等
}

// ❌ 避免传输过多数据
interface BadPopupContext {
  fullApplicationState: any;    // 避免
  allCachedData: any;          // 避免
  temporaryUIState: any;       // 避免
}
```

#### 2. 状态机优化
```typescript
// ✅ 使用缓存避免重复计算
class ConflictResolutionStateMachine {
  private conflictCache = new Map<string, ConflictState>();
  
  async detectConflict(source: string, target: string): Promise<ConflictState> {
    const cacheKey = `${source}-${target}`;
    if (this.conflictCache.has(cacheKey)) {
      return this.conflictCache.get(cacheKey)!;
    }
    
    const result = await this.performDetection(source, target);
    this.conflictCache.set(cacheKey, result);
    return result;
  }
}
```

#### 3. 通信优化
```typescript
// ✅ 防抖合并消息
class MessageBatcher {
  private pendingUpdates = new Map<string, any>();
  private batchTimer: NodeJS.Timeout | null = null;
  
  scheduleUpdate(key: string, data: any): void {
    this.pendingUpdates.set(key, data);
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.batchTimer = setTimeout(() => {
      this.sendBatchUpdate();
    }, 100); // 100ms防抖
  }
}
```

### 错误处理

#### 1. 数据验证
```typescript
// Background端验证
function validatePopupContext(context: PopupContext): boolean {
  if (!context.videoId || !context.globalSettings) {
    console.error('[Background] Invalid PopupContext:', context);
    return false;
  }
  return true;
}

// Popup端验证
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SIDEPANEL_CONTEXT_UPDATE') {
    if (!message.data || !message.data.videoId) {
      console.error('[Popup] Invalid context data:', message.data);
      this.showErrorMessage('数据加载失败，请刷新页面重试');
      return;
    }
    this.updateUI(message.data);
  }
});
```

#### 2. 通信异常处理
```typescript
// 超时处理
async function sendMessageWithTimeout(message: any, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message timeout'));
    }, timeout);
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}
```

#### 3. 降级策略
```typescript
// 数据加载失败时的降级
class PopupDataLoader {
  async loadWithFallback(): Promise<PopupContext> {
    try {
      return await this.loadFromBackground();
    } catch (error) {
      console.warn('[Popup] Background加载失败，使用默认数据:', error);
      return this.getDefaultContext();
    }
  }
  
  private getDefaultContext(): PopupContext {
    return {
      videoId: 'unknown',
      tabId: -1,
      globalSettings: getDefaultGlobalSettings(),
      detectedSourceLang: 'auto',
      conflictState: { hasConflict: false, status: 'none' }
    };
  }
}
```

### 代码规范

#### 1. 命名约定
```typescript
// 接口命名：PascalCase + 描述性后缀
interface PopupState { }
interface ConflictState { }
interface StatusMessage { }

// 事件命名：UPPER_SNAKE_CASE + _UPDATE/_REQUEST后缀
const SIDEPANEL_CONTEXT_UPDATE = 'SIDEPANEL_CONTEXT_UPDATE';
const SERVICE_CONFIG_REQUEST = 'SERVICE_CONFIG_REQUEST';

// 状态机状态：小写 + 下划线
enum ConflictResolutionState {
  IDLE = 'idle',
  DETECTING = 'detecting',
  CONFLICT_FOUND = 'conflict_found'
}
```

#### 2. TypeScript规范
```typescript
// ✅ 使用明确的类型定义
interface ServiceConfig {
  openai_api_key: string;
  openai_model?: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo';
  openai_temperature?: number;
}

// ✅ 使用JSDoc注释
/**
 * 构建Popup所需的完整上下文数据
 * @param tabId - 目标标签页ID
 * @returns 完整的PopupContext对象
 */
async function buildPopupContext(tabId: number): Promise<PopupContext> {
  // ...
}

// ❌ 避免使用any类型
function handleMessage(message: any): void { }  // 不推荐

// ✅ 使用具体类型
function handleMessage(message: PopupMessage): void { }  // 推荐
```

### 维护指南

#### 1. 版本兼容性
```typescript
// 向前兼容的数据结构扩展
interface PopupState {
  videoId: string;
  tabId: number;
  globalSettings: GlobalSettings;
  detectedSourceLang: string;
  conflictState: ConflictState;
  
  // v5.25新增字段，保持可选以兼容旧版本
  newFeature?: NewFeatureData;
}
```

#### 2. 文档同步
- 重大架构变更时同步更新 `docs/architecture.md`
- 新增技术决策时记录到 `docs/decision-log.md`
- 演示系统与实际代码保持同步

#### 3. 测试覆盖
- 每个新功能都要有对应的演示场景
- 状态机的每个状态转换都要有测试用例
- 异常情况和边界条件必须有测试覆盖

这套Popup开发指南确保了代码质量、维护性和团队协作效率，为YouTube字幕翻译助手的持续迭代提供了坚实的技术基础。

---

## 📚 **重要文档参考** (v3.0.0.7+)

### 核心架构文档
- **[技术架构文档](docs/architecture.md)** ⭐ **权威参考**
  - v3.0.0.7+ 简化架构设计完整规范
  - 设计思维指导原则
  - Popup简化架构详解（340行→60行）
  - 数据结构设计规范
  - 存储与缓存架构
  - 翻译服务架构
  - 事件系统架构

### 开发指导
- **[更新日志](CHANGELOG.md)** - 版本更新历史与技术演进记录
- **[用户指南](README.md)** - 用户使用说明和功能介绍
- **[开发指南](DEVELOPMENT.md)** - 本文档，开发环境设置和工作流程

### v3.0.0.7+ 架构重要变更
1. **架构简化**: Popup从340行简化到60行，维护成本大幅降低
2. **状态管理**: 移除全局状态同步，采用页面级状态管理
3. **设计思维**: 沉淀设计思维指导原则，避免过度设计
4. **历史归档**: v3.0.0.6及更早版本已归档至 `legacy/` 目录

### 开发注意事项
- ⚠️ **严格遵循v3.0.0 Popup架构**，避免重新引入SidePanel
- ⚠️ **使用MessageBus通信**，不要使用EventBus
- ⚠️ **新功能开发前先阅读architecture/01-05及popup.md**
- ⚠️ **禁止从.archive目录复制代码**，旧架构已废弃

### 文档维护
- 任何架构变更都必须同步更新 `docs/architecture.md`
- 新增功能必须更新相应的文档章节
- 重大设计决策记录到决策日志中

---

**🎯 开发目标**: 在v3.0.0.7+简化架构基础上，持续保持代码的简洁性和可维护性，避免重新引入复杂机制。