# YouTube字幕翻译助手 - 开发指南

本文档提供扩展项目的开发环境设置、工作流程和贡献指南，帮助开发者参与项目开发。

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

## 项目结构

```
youtube-subtitle-translator/
├── .cursor/                 # Cursor编辑器配置
│   └── rules/               # 编辑器规则
│       └── chrome-rules.mdc # Chrome扩展开发规则
├── .git/                    # Git版本控制（自动生成）
├── _locales/                # 国际化文件
│   └── zh_CN/               # 中文本地化
│       └── messages.json    # 中文消息定义
├── assets/                  # 静态资源和构建产物
│   ├── sidepanel.css        # 侧边栏样式文件
│   ├── storage-manager.js   # 存储管理器编译产物
│   └── storage-manager.js.map # 存储管理器源码映射
├── background/              # 后台脚本
│   ├── background.ts        # 主要服务工作者脚本
│   ├── background.ts.backup # 备份文件
│   ├── batch-processor.ts   # 批处理器
│   ├── index.ts             # 后台脚本入口
│   ├── openai-translator.ts # OpenAI翻译API实现
│   ├── rate-limit-manager.ts # API限流管理器
│   ├── subtitle-local-storage.ts # 字幕本地存储
│   └── translation-local-storage.ts # 翻译本地存储
├── content/                 # 内容脚本
│   ├── content-script.ts    # 主要内容脚本
│   ├── content-script.ts.backup # 备份文件
│   ├── content-script.ts.bak # 备份文件
│   ├── content-script.ts.original # 原始版本
│   ├── content-script-external.js # 外部内容脚本
│   ├── content-script-new-event.ts.deprecated # 已弃用的事件版本
│   ├── content.ts           # 内容处理脚本
│   ├── event-bus.ts_DEPRECATED # 已弃用的事件总线
│   ├── main-world.ts        # 主世界注入脚本
│   └── main-world.ts.backup # 主世界脚本备份
├── docs/                    # 项目文档
│   ├── archive/             # 归档文档
│   │   ├── ARCHITECTURE_CHANGE_LOG.md     # 架构变更日志
│   │   ├── CACHE_FUNCTION_NAMING_REVIEW.md # 缓存函数命名审查
│   │   ├── LOG_FORMAT_IMPROVEMENTS.md     # 日志格式改进
│   │   ├── NAMING_CONVENTION_OPTIMIZATION.md # 命名规范优化
│   │   ├── OPTIMIZATION_COMPLETED.md      # 优化完成记录
│   │   ├── REFACTOR_MESSAGE_COMMUNICATION.md # 消息通信重构
│   │   ├── REFACTOR_PLAN.md               # 重构计划
│   │   ├── SESSION_STORAGE_FIX.md         # Session存储修复
│   │   ├── TEST_RESULTS.md                # 测试结果
│   │   ├── TRANSLATION_CACHE_FLOW.md      # 翻译缓存流程
│   │   ├── VERIFICATION_CACHE_IMPLEMENTATION.md # 缓存实现验证
│   │   └── bugs.md                        # Bug记录
│   ├── README.md            # 文档中心导航
│   ├── api.md               # API参考文档
│   ├── architecture.md      # 技术架构文档（权威）
│   ├── decision-log.md      # 技术决策记录
│   ├── optimization-verification.md # 优化验证指南
│   ├── performance.md       # 性能优化文档
│   ├── roadmap.md           # 开发路线图
│   ├── translation-flow.md  # 翻译流程说明
│   └── troubleshooting.md   # 故障排除指南
├── icons/                   # 扩展图标
│   ├── .DS_Store            # macOS系统文件
│   ├── icon16.png           # 16x16 图标
│   ├── icon48.png           # 48x48 图标
│   ├── icon128.png          # 128x128 图标
│   ├── l-setting.svg        # 设置按钮图标
│   ├── l-setting-active.svg # 激活状态设置图标
│   ├── normal-border.svg    # 普通边框图标
│   ├── off.svg              # 关闭状态图标
│   └── on.svg               # 开启状态图标
├── options/                 # 选项页面（备用）
│   ├── options.html         # 选项页面HTML
│   └── options.ts           # 选项页面脚本
├── popup/                   # 弹出页面（备用）
│   ├── popup.html           # 弹出页面HTML
│   └── popup.ts             # 弹出页面脚本
├── rules/                   # 规则配置文件（空目录）
├── scripts/                 # 构建和部署脚本
│   └── verify-build.sh      # 构建验证脚本
├── sidepanel/               # 侧边栏
│   ├── sidepanel.css        # 侧边栏样式
│   ├── sidepanel.html       # 侧边栏HTML
│   ├── sidepanel.ts         # 侧边栏脚本
│   └── template.ts          # 侧边栏模板
├── src/                     # 通用组件和工具
│   ├── components/          # 可复用组件
│   │   ├── control-panel.ts # 控制面板组件
│   │   └── ui-manager.ts    # UI组件管理器
│   ├── events/              # 事件系统
│   │   ├── event-bus.ts     # 事件总线
│   │   └── event-types.ts   # 事件类型定义
│   ├── storage/             # 存储管理
│   │   ├── storage-manager.ts       # 存储管理器
│   │   ├── global-settings.ts       # 新增：统一的全局设置类型定义，合并原UserSettings和VideoSettings
│   │   ├── global-settings-manager.ts # 新增：统一的全局设置管理器，替代分散式设置管理
│   │   ├── migration-helper.ts       # 新增：数据迁移助手，自动从旧架构迁移到新架构
│   │   ├── settings-manager.ts      # 用户设置的专门管理器（保留兼容性）
│   │   ├── video-settings-local-storage.ts # 视频级别设置的本地存储（保留兼容性）
│   │   └── storage-test.ts          # 存储测试
│   ├── translation/         # 翻译相关
│   │   └── translation-dispatcher.ts # 翻译调度器
│   └── utils/               # 工具函数
│       ├── language-processing.ts   # 语言处理工具
│       └── languages.ts             # 语言定义
├── tmp/                     # 临时文件
│   └── event-system.ts      # 事件系统临时文件
├── dist/                    # 构建输出目录（构建时生成）
│   ├── _locales/            # 本地化文件输出
│   ├── assets/              # 资源文件输出
│   ├── icons/               # 图标文件输出
│   ├── sidepanel/           # 侧边栏输出
│   ├── background.js        # 编译后的后台脚本
│   ├── background.js.map    # 后台脚本源码映射
│   ├── content-script.js    # 编译后的内容脚本
│   ├── content-script.js.map # 内容脚本源码映射
│   ├── main-world.js        # 编译后的主世界脚本
│   ├── main-world.js.map    # 主世界脚本源码映射
│   ├── sidepanel.js         # 编译后的侧边栏脚本
│   ├── sidepanel.js.map     # 侧边栏脚本源码映射
│   └── manifest.json        # 复制的清单文件
├── node_modules/            # 依赖包（自动生成）
├── .DS_Store                # macOS系统文件
├── .gitignore               # Git忽略文件
├── CHANGELOG.md             # 更新日志
├── DEVELOPMENT.md           # 开发指南（本文档）
├── README.md                # 用户使用指南
├── TODO.md                  # 待办事项
├── manifest.json            # 扩展清单文件
├── package-lock.json        # 依赖版本锁定
├── package.json             # 项目依赖和脚本
├── tsconfig.json            # TypeScript配置
└── vite.config.ts           # Vite构建配置
```

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

- **`sidepanel/`**: 侧边栏界面，提供用户设置、语言选择和翻译API配置
  - `sidepanel.html`: 侧边栏页面结构
  - `sidepanel.ts`: 侧边栏交互逻辑和设置管理，包含智能语言选择系统
    * **ASR轨道识别**: `generateLanguageDisplayName()` 函数自动为ASR轨道添加"（自动生成）"标识
    * **语言族互斥**: `isSameLanguageFamily()` 函数实现基于语言族的互斥逻辑
    * **轨道切换检测**: 增强的变化检测机制，支持轨道类型切换时触发翻译更新
  - `sidepanel.css`: 侧边栏样式定义
  - `template.ts`: 侧边栏模板和组件

#### 共享代码目录
- **`src/`**: 可复用的组件和工具库
  - `components/`: UI组件管理，包含翻译按钮、设置按钮等界面元素管理
    - `control-panel.ts`: 控制面板的核心逻辑，统一管理翻译流程
    - `ui-manager.ts`: UI元素的创建、更新和状态管理
  - `events/`: 事件系统，实现组件间高效通信机制
    - `event-bus.ts`: 发布/订阅模式的事件总线实现
    - `event-types.ts`: 所有事件类型的TypeScript定义
  - `storage/`: **🔄 新架构**：统一的数据存储和缓存管理，全新重构的设置系统
    - `storage-manager.ts`: 统一的存储访问层，支持多种存储区域和变更监听
    - `global-settings.ts`: **新增**：统一的全局设置类型定义，合并原UserSettings和VideoSettings
    - `global-settings-manager.ts`: **新增**：统一的全局设置管理器，替代分散式设置管理
    - `migration-helper.ts`: **新增**：数据迁移助手，自动从旧架构迁移到新架构
    - `settings-manager.ts`: 用户设置的专门管理器（保留兼容性）
    - `video-settings-local-storage.ts`: 视频级别设置的本地存储（保留兼容性）
    - `storage-test.ts`: 存储功能的测试代码
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

#### 设置架构重构 (v5.24)
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
开发源码 (src/, background/, content/, sidepanel/)
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
git commit -m "fix(sidepanel): 修复语言选择重置问题"
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