# YouTube字幕翻译扩展 - 重构计划

本文档包含多个重构优化计划，按优先级和紧急程度组织。

## 📋 **重构计划概览**

| 计划 | 状态 | 优先级 | 预估时间 | 关联问题 |
|------|------|--------|----------|----------|
| 按钮交互架构优化 | 🔄 规划中 | 🚨 最高 | 2-3小时 | 按钮重复调用 |
| SidePanel架构现代化 | ⏸️ 暂停 | 🟡 中等 | 4-6小时 | 侧边栏加载问题 |

---

## 🚨 **计划1：按钮交互架构优化**（最高优先级）

**目标**：解决按钮重复调用问题，实现集中式Background缓存管理

**时间**：2025-05-26 开始

**负责人**：开发团队

**基于**：`docs/architecture.md` 第4.3节完整流程设计

**优化状态**：🔄 **规划中** - 基于新架构设计制定实施方案

### 🎯 问题分析

#### 当前问题

1. **按钮重复调用**：
   - 点击翻译按钮时出现重复日志
   - 相同逻辑被执行多次
   - UIManager中存在事件循环：按钮点击 → 发出事件 → 自己监听到自己的事件 → 再次执行方法

2. **缓存操作分散**：
   - Content Script直接操作chrome.storage
   - Background Script也直接操作存储
   - 数据不一致和重复处理问题

3. **语言冲突处理缺失**：
   - 源语言=目标语言时缺少智能处理
   - 缺少用户引导机制

### 🚀 解决方案：集中式Background缓存管理架构

#### 核心设计原则

```
原则：避免事件循环 + 集中式缓存管理 + 三层缓存策略
策略：直接调用本地方法，通过Background统一管理所有缓存操作
```

#### 架构设计

##### 1. **按钮交互模式优化**
- **翻译按钮**：直接调用 + 事件通知（混合模式）
- **设置按钮**：纯直接调用（简单模式）
- **避免循环**：移除UIManager中监听自己事件的处理器

##### 2. **三层缓存架构**
```
Level 1: Local Storage 缓存 (持久)
├── 翻译设置参数 (videoId+config)
└── 翻译结果缓存 (翻译配置+结果)

Level 2: Memory Cache 缓存 (会话)  
├── 字幕轨道信息 (cachedCaptionTracks)
└── 语言变种数据 (变种映射)

Level 3: API调用 (兜底)
└── 直接获取完整字幕数据
```

##### 3. **统一消息接口**
```typescript
// 缓存操作消息格式
{ action: 'getTranslationConfig', videoId: string, payload?: any }
{ action: 'checkTranslationCache', videoId: string, params: TranslationParams }
{ action: 'saveTrackCache', videoId: string, tracks: CaptionTrack[] }
{ action: 'saveTranslationCache', videoId: string, params: TranslationParams, result: TranslationResult }
```

### 🔧 实施方案

#### 阶段1：修改UIManager按钮点击逻辑 (预估30分钟)

##### 1.1 翻译按钮优化
**文件**: `src/components/ui-manager.ts`

```typescript
// 修改前（存在事件循环）
translateButton.addEventListener('click', () => {
  const newState = !this.state.translateActive;
  this.eventBus.emit('state:translate_active_changed', newState); // ❌ 发出事件
});

// 修改后（直接调用）
translateButton.addEventListener('click', () => {
  const newState = !this.state.translateActive;
  this.setTranslateActive(newState); // ✅ 直接调用
});
```

##### 1.2 设置按钮优化
```typescript
// 修改前
settingsButton.addEventListener('click', () => {
  const newState = !this.state.settingPanelOpen;
  this.eventBus.emit('state:setting_panel_open_changed', newState); // ❌ 发出事件
});

// 修改后
settingsButton.addEventListener('click', () => {
  const newState = !this.state.settingPanelOpen;
  this.setSettingPanelOpen(newState); // ✅ 直接调用
});
```

##### 1.3 移除重复监听器
- 删除UIManager中监听`state:translate_active_changed`的处理器
- 删除UIManager中监听`state:setting_panel_open_changed`的处理器

#### 阶段2：实现Background统一缓存管理 (预估60分钟)

##### 2.1 新增缓存服务接口
**文件**: `background/background.ts`

```typescript
// 添加消息处理器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getTranslationConfig':
      return handleGetTranslationConfig(message, sendResponse);
    case 'checkTranslationCache':
      return handleCheckTranslationCache(message, sendResponse);
    case 'saveTrackCache':
      return handleSaveTrackCache(message, sendResponse);
    case 'saveTranslationCache':
      return handleSaveTranslationCache(message, sendResponse);
    // ... 其他处理器
  }
});
```

##### 2.2 实现三层缓存逻辑
```typescript
// Memory Cache (Background内存变量)
let memoryCache = {
  cachedCaptionTracks: null,
  languageVariants: new Map()
};

// 翻译配置获取逻辑
async function handleGetTranslationConfig(message, sendResponse) {
  const { videoId } = message;
  
  // 1. 检查视频设置缓存
  const videoSettings = await getVideoSettings(videoId);
  
  if (videoSettings) {
    // 有设置缓存，检查翻译结果缓存
    const translationCache = await checkTranslationResultCache(videoId, videoSettings);
    if (translationCache.hit) {
      return sendResponse({ config: videoSettings, cacheHit: true, data: translationCache.data });
    }
  } else {
    // 无设置缓存，生成默认配置
    const defaultConfig = generateDefaultConfig();
    return sendResponse({ config: defaultConfig, cacheHit: false });
  }
}
```

#### 阶段3：修改ContentScript缓存访问 (预估45分钟)

##### 3.1 替换直接存储访问
**文件**: `content/content-script.ts`

```typescript
// 修改前（直接访问存储）
const result = await chrome.storage.local.get(['translationConfig']);

// 修改后（通过消息访问）
const response = await chrome.runtime.sendMessage({
  action: 'getTranslationConfig',
  videoId: currentVideoId
});
```

##### 3.2 更新翻译流程
```typescript
// 新的翻译启动流程
async function startTranslationProcess() {
  // 1. 获取翻译配置
  const configResponse = await chrome.runtime.sendMessage({
    action: 'getTranslationConfig', 
    videoId: currentVideoId
  });
  
  if (configResponse.cacheHit) {
    // 直接显示缓存结果
    displayCachedTranslation(configResponse.data);
  } else {
    // 2. 检查内存轨道缓存
    // 3. 执行翻译流程
    // 4. 保存翻译结果
    await chrome.runtime.sendMessage({
      action: 'saveTranslationCache',
      videoId: currentVideoId,
      params: translationParams,
      result: translationResult
    });
  }
}
```

#### 阶段4：实现语言冲突处理 (预估45分钟)

##### 4.1 冲突检测逻辑
**文件**: `background/background.ts`

```typescript
function resolveLanguageConflict(sourceLang, targetLang, availableTracks) {
  if (sourceLang === targetLang) {
    // 四组轨道分类
    const groups = classifyTracks(availableTracks, targetLang);
    
    // 优先级选择: A[0] → B[0] → C[0] → D[0]
    const finalSourceLang = selectBestSource(groups);
    
    if (groups.C.length > 0 || groups.D.length > 0) {
      // 进入降级模式
      return {
        finalSourceLang,
        finalTargetLang: targetLang,
        conflictMode: 'same_language_only',
        userGuidance: `仅有 ${getLanguageName(targetLang)} 字幕，请先选择目标语`
      };
    }
  }
  
  return {
    finalSourceLang: sourceLang,
    finalTargetLang: targetLang,
    conflictMode: 'none'
  };
}

function classifyTracks(tracks, targetLang) {
  return {
    A: tracks.filter(t => t.languageCode !== targetLang && t.kind !== 'asr'), // 非目标&非ASR
    B: tracks.filter(t => t.languageCode !== targetLang && t.kind === 'asr'), // 非目标&ASR  
    C: tracks.filter(t => t.languageCode === targetLang && t.kind !== 'asr'), // 目标&非ASR
    D: tracks.filter(t => t.languageCode === targetLang && t.kind === 'asr')  // 目标&ASR
  };
}
```

##### 4.2 冲突处理逻辑
**文件**: `background/background.ts`

```typescript
function handleLanguageConflict(conflictInfo) {
  const { finalSourceLang, finalTargetLang, conflictMode, userGuidance } = conflictInfo;
  
  if (conflictMode === 'same_language_only') {
    // 显示用户提示
    showUserGuidance(userGuidance);
  } else {
    // 处理其他冲突情况
    // ...
  }
}

function showUserGuidance(userGuidance) {
  // 实现用户提示逻辑
}
```

#### 阶段5：测试验证 (预估30分钟)

##### 5.1 功能测试清单
- [ ] 点击翻译按钮后，每个日志只出现一次
- [ ] 翻译功能正常启动/停止
- [ ] 设置按钮正常打开/关闭侧边栏
- [ ] 缓存命中时翻译结果立即显示
- [ ] 语言冲突时显示正确的用户提示
- [ ] 跨组件通信仍然正常工作

##### 5.2 性能测试
- [ ] 首次翻译启动时间 < 3秒
- [ ] 缓存命中时显示时间 < 500ms  
- [ ] 内存缓存命中时轨道获取 < 100ms
- [ ] 无内存泄漏，长时间使用稳定

##### 5.3 用户体验测试
- [ ] 按钮点击响应及时，无卡顿
- [ ] 错误提示清晰易懂
- [ ] 语言冲突引导用户操作简单
- [ ] 翻译质量保持不变

### 📊 预期效果

#### 技术指标
- ✅ 按钮重复调用问题完全解决
- ✅ 缓存命中率提升至90%以上
- ✅ 翻译启动时间减少50%
- ✅ 组件间通信更加高效

#### 开发体验指标  
- ✅ 代码职责清晰，便于维护
- ✅ 调试更加容易，问题定位准确
- ✅ 符合最佳实践，架构可扩展
- ✅ 文档完善，新人容易上手

#### 用户体验指标
- ✅ 操作响应更加迅速
- ✅ 智能语言冲突处理
- ✅ 缓存提升使用流畅度
- ✅ 错误处理更加友好

### 📝 风险评估与应对

#### 潜在风险
1. **消息传递延迟**：Background与Content Script间通信可能增加延迟
2. **内存占用增加**：Background内存缓存可能增加内存使用
3. **兼容性问题**：新的消息接口可能与现有代码冲突

#### 应对措施
1. **异步优化**：使用Promise和async/await优化消息传递
2. **缓存清理**：实现定时清理和LRU策略控制内存占用
3. **渐进迁移**：分阶段实施，保持向后兼容

### 🎯 成功标准

#### 核心指标
- 按钮重复调用问题完全消失
- 所有功能测试用例通过  
- 性能测试指标达标
- 代码审查通过

#### 验收标准
- 开发团队确认代码质量
- QA团队完成完整功能测试
- 性能测试报告显示改进效果
- 文档更新完成并审核通过

---

## ⏸️ **计划2：SidePanel混合现代化架构优化**（暂停中）

**目标**：采用**混合现代化架构**，解决当前sidepanel无法加载的问题，同时保持现代化开发体验

**时间**：待定（按钮交互问题解决后）

**备份状态**：✅ 已完成Git备份

**优化状态**：⏸️ **暂停** - 等待按钮交互问题解决后再启动

### 🎯 深层问题分析

#### 当前架构的根本问题

1. **架构不匹配**：
   - 当前：TypeScript入口 + 动态HTML生成
   - Chrome扩展现实：需要静态HTML文件作为sidepanel入口
   - 结果：sidepanel显示"ERR_FILE_NOT_FOUND"

2. **构建复杂度过高**：
   - 模板系统 + HTML复制 + TS编译 + 双重构建
   - 6个构建步骤，3种模式，多种文件类型
   - 任何一环出错都会导致整体失败

3. **Vite配置不优雅**：
   - 静态复制 + ES模块 + IIFE混合
   - 文件路径复杂，难以维护
   - 开发与生产环境不一致

### 🚀 新优化方案：混合现代化架构

#### 核心设计思路

```
原则：保持Chrome扩展标准 + 现代化工具链 + 最小复杂度
策略：让HTML处理结构，让TypeScript处理逻辑，各司其职
```

#### 架构设计

##### 1. **文件结构优化**
```
sidepanel/
├── sidepanel.html        ← 标准HTML文件（静态UI结构）
├── sidepanel.ts          ← 现代TS逻辑（所有动态功能） 
├── sidepanel.css         ← 样式文件
└── components/           ← UI组件模块
    ├── language-selector.ts
    ├── api-selector.ts  
    └── settings-panel.ts
```

##### 2. **HTML结构策略**
- **静态内容**：核心UI结构直接写在HTML中
- **动态内容**：通过TypeScript填充和控制
- **加载机制**：Chrome直接加载HTML，不依赖JS初始化成功

##### 3. **TypeScript逻辑策略**
- **专注功能**：只处理动态功能，不管理HTML结构
- **模块化设计**：组件化开发，便于维护
- **现代化开发**：保持类型安全和开发体验

### 🔧 实施方案

#### 阶段1：简化HTML结构 (预估30分钟)

##### 1.1 创建完整HTML文件
```html
<!-- sidepanel/sidepanel.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>翻译设置</title>
    <link rel="stylesheet" href="./assets/sidepanel.css">
</head>
<body>
    <div id="sidepanel-root">
        <h1>翻译设置</h1>
        
        <div class="setting-item">
            <label for="source-language">源语言:</label>
            <div id="source-language-selector" class="custom-select-container">
                <div class="select-header">
                    <span class="selected-text">自动检测</span>
                    <span class="dropdown-arrow">▼</span>
                </div>
                <div class="dropdown-content">
                    <!-- 动态内容由TS填充 -->
                </div>
            </div>
        </div>

        <div class="setting-item">
            <label for="target-language">目标语言:</label>
            <div id="target-language-selector" class="custom-select-container">
                <div class="select-header">
                    <span class="selected-text">中文 (简体)</span>
                    <span class="dropdown-arrow">▼</span>
                </div>
                <div class="dropdown-content">
                    <!-- 动态内容由TS填充 -->
                </div>
            </div>
        </div>

        <div class="setting-item">
            <label for="translation-api">翻译API:</label>
            <div id="translation-api-selector" class="custom-select-container">
                <div class="select-header">
                    <span class="selected-text">Google 翻译</span>
                    <span class="dropdown-arrow">▼</span>
                </div>
                <div class="dropdown-content">
                    <!-- 动态内容由TS填充 -->
                </div>
            </div>
        </div>

        <div class="setting-item">
            <label for="subtitle-mode">字幕显示模式:</label>
            <div id="subtitle-mode-selector" class="custom-select-container">
                <div class="select-header">
                    <span class="selected-text">双语显示</span>
                    <span class="dropdown-arrow">▼</span>
                </div>
                <div class="dropdown-content">
                    <!-- 动态内容由TS填充 -->
                </div>
            </div>
        </div>
    </div>
    <script type="module" src="./sidepanel.js"></script>
</body>
</html>
```

##### 1.2 删除模板系统
- 删除 `sidepanel/template.ts`
- 清理相关导入

#### 阶段2：重构TypeScript逻辑 (预估45分钟)

##### 2.1 创建组件化架构
```typescript
// sidepanel/components/language-selector.ts
export class LanguageSelector {
  constructor(containerId: string, type: 'source' | 'target') {
    this.container = document.getElementById(containerId);
    this.type = type;
  }

  async init(settings: any) {
    await this.loadLanguages();
    this.bindEvents();
    this.updateSelection(settings);
  }

  private async loadLanguages() {
    // 填充语言选项
  }

  private bindEvents() {
    // 绑定点击事件
  }
}
```

##### 2.2 简化主入口文件
```typescript
// sidepanel/sidepanel.ts
import { LanguageSelector } from './components/language-selector';
import { ApiSelector } from './components/api-selector';
import { loadSettings, saveSettings } from '../src/storage/storage-manager';

console.log('[sidepanel] 初始化中...');

class SidePanelManager {
  private sourceLanguageSelector: LanguageSelector;
  private targetLanguageSelector: LanguageSelector;
  private apiSelector: ApiSelector;

  constructor() {
    this.sourceLanguageSelector = new LanguageSelector('source-language-selector', 'source');
    this.targetLanguageSelector = new LanguageSelector('target-language-selector', 'target');
    this.apiSelector = new ApiSelector('translation-api-selector');
  }

  async init() {
    try {
      const settings = await loadSettings();
      
      await Promise.all([
        this.sourceLanguageSelector.init(settings),
        this.targetLanguageSelector.init(settings),
        this.apiSelector.init(settings)
      ]);
      
      console.log('[sidepanel] 初始化完成');
    } catch (error) {
      console.error('[sidepanel] 初始化失败:', error);
    }
  }
}

// DOM加载完成后初始化
async function initSidePanel() {
  const manager = new SidePanelManager();
  await manager.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel);
} else {
  initSidePanel();
}
```

#### 阶段3：简化构建配置 (预估20分钟)

##### 3.1 优化Vite配置
```typescript
// vite.config.ts - 简化版本
export default defineConfig(({ mode }) => {
  const baseConfig = {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    build: {
      sourcemap: true,
      outDir: 'dist',
    },
  };

  // 内容脚本配置 - 使用IIFE格式
  if (mode === 'content-script') {
    return mergeConfig(baseConfig, {
      build: {
        rollupOptions: {
          input: {
            'content-script': path.resolve(__dirname, 'content/content-script.ts'),
          },
          output: {
            entryFileNames: '[name].js',
            format: 'iife',
          },
        },
        emptyOutDir: false,
      },
    });
  }
  
  // 主要脚本配置 - 使用ES模块
  return mergeConfig(baseConfig, {
    plugins: [
      viteStaticCopy({
        targets: [
          { src: 'sidepanel/sidepanel.html', dest: '.' },
          { src: 'sidepanel/sidepanel.css', dest: 'assets' },
          { src: 'manifest.json', dest: '.' },
          { src: 'icons', dest: '.' },
          { src: 'assets', dest: '.' },
          { src: '_locales', dest: '.' },
        ],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          background: path.resolve(__dirname, 'background/index.ts'),
          sidepanel: path.resolve(__dirname, 'sidepanel/sidepanel.ts'),
          'main-world': path.resolve(__dirname, 'content/main-world.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
          format: 'es',
        },
      },
      emptyOutDir: true,
    },
  });
});
```

##### 3.2 清理构建脚本
```json
// package.json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:main\" \"npm run dev:content\"",
    "dev:main": "vite build --watch",
    "dev:content": "vite build --watch --mode content-script",
    "build": "npm run build:main && npm run build:content",
    "build:main": "vite build",
    "build:content": "vite build --mode content-script",
    "verify-build": "./scripts/verify-build.sh"
  }
}
```

#### 阶段4：测试验证 (预估15分钟)

##### 4.1 构建测试
- 运行 `npm run build`
- 验证 `dist/sidepanel.html` 存在且完整
- 验证 `dist/sidepanel.js` 正确生成

##### 4.2 功能测试
- 在Chrome中重新加载扩展
- 测试sidepanel是否能正常打开
- 验证UI界面是否完整显示
- 测试所有设置功能是否正常

### 🎯 预期效果

#### ✅ 解决的问题
1. **sidepanel加载问题** - HTML文件可被Chrome直接加载
2. **构建复杂度** - 从6步简化为2步构建
3. **文件路径混乱** - 清晰的文件结构和引用关系
4. **开发体验** - 保持现代化TypeScript开发

#### ✅ 保持的优势
1. **类型安全** - 完整的TypeScript支持
2. **模块化** - 组件化设计便于维护
3. **热重载** - Vite开发环境优势
4. **一致性** - 所有脚本仍使用TS入口

#### ✅ 新增优势
1. **简单可靠** - 符合Chrome扩展标准加载机制
2. **易于调试** - 清晰的职责分离
3. **更好的性能** - 减少动态DOM操作
4. **更好的可维护性** - HTML和逻辑分离

### 📝 后续维护规范

#### 开发原则
1. **HTML负责结构** - 静态UI元素直接写在HTML中
2. **TypeScript负责逻辑** - 动态功能和数据处理
3. **CSS负责样式** - 保持样式与逻辑分离
4. **组件化开发** - 每个功能模块独立管理

#### 文件管理
1. **新增UI元素** - 在HTML中添加结构，在TS中添加逻辑
2. **修改样式** - 只需修改CSS文件
3. **添加功能** - 创建新的组件模块
4. **调试问题** - 各层职责清晰，便于定位

---

## 📋 **实施建议**

1. **立即开始**：按钮交互架构优化（解决当前用户体验问题）
2. **后续跟进**：SidePanel架构现代化（提升开发体验）
3. **长期维护**：根据实际使用情况调整优先级 