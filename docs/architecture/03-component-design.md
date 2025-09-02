# VTC 5.24 架构设计文档 - Part 3 (存储与缓存架构)

> **文档更新**: 2025-07-16  
> **版本**: v5.24.7+ (**当前统一版本**)  
> **当前方案**: ✅ **Popup直接调用** (已实施完成)

## 🚨 **方案变更说明**

### **✅ 当前采用方案: Popup直接调用架构**
- **存储架构**: 完全适配Popup架构，优化页面检测和界面切换
- **缓存策略**: 支持双重界面的数据缓存需求
- **消息通信**: 无需消息中转，直接调用Chrome API
- **状态管理**: 通过`chrome.storage.session`共享内存自动同步

### **❌ 已放弃方案: SidePanel**

**放弃原因**:
1. **兼容性问题**: Chrome 114+限制，排除约30%用户
2. **权限复杂性**: 需要scripting权限，用户授权困难
3. **用户体验不一致**: "死按钮"问题，非YouTube页面无响应
4. **开发维护成本**: 复杂的动态状态管理和Port连接处理
5. **实际用户反馈**: 用户对动态逻辑感到困惑，偏好一致性体验

**放弃影响**:
1. **状态管理简化**: 移除复杂的SidePanel状态同步
2. **消息类型精简**: 移除SidePanel专用消息类型
3. **缓存优化**: 移除SidePanel多标签页切换缓存

> **📚 保留说明**: SidePanel相关存储逻辑保留作为历史记录和技术参考

---

## 6. 存储与缓存架构

### 6.1 存储设计原则

为了确保职责清晰、数据管理的集中化以及遵循"关注点分离"原则，**所有对 `chrome.storage.local` 的直接API调用都应封装在 BackgroundScript 中**，或由BackgroundScript调用的专用存储管理模块中。

**核心原则**：
- **BackgroundScript作为数据守门人**：负责处理所有存储消息并执行相应的存储操作
- **消息驱动的数据访问**：其他组件通过向BackgroundScript发送定义好的消息来进行数据操作
- **统一存储区域**：扩展统一使用 `chrome.storage.local` 区域，不使用 `chrome.storage.sync`
- **键名前缀组织**：使用前缀清晰地组织不同类型的数据，避免键名冲突

### 6.2 两层缓存架构

**整体缓存策略**：
```
┌─────────────────────────────────────────────────────────────┐
│             Level 1: Local Storage (chrome.storage.local)   │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ - user_preferences_* (用户全局设置)                      │ │
│ │ - video_source_language_cache (视频源语言和字幕轨道缓存)  │ │
│ │ - subtitle_translation_cache_* (翻译结果缓存)            │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Level 2: API调用                         │
│                  直接获取完整数据                             │
└─────────────────────────────────────────────────────────────┘
```
### 6.3 缓存处理流程

#### 6.3.1 Popup界面缓存流程 ⭐ **当前方案**

**完整缓存检查顺序**：
```
用户点击扩展图标
    ↓
[Chrome] 自动打开Popup
    ↓ 
[Popup] 页面检测 → 发送数据请求到 Background
    ↓
[Background] 两层缓存检查：
    ↓
┌─────────────── 缓存检查流程 ──────────────┐
│ 1. 用户偏好设置检查                        │
│    - 检查 user_preferences_*              │
│    - 获取: targetLang, subtitleMode等     │
│                                         │
│ 2. 视频源语言和字幕轨道缓存检查              │
│    - 检查 video_source_language_cache     │
│    - 获取该视频的源语言选择和字幕轨道       │
│    - 如无缓存则调用YouTube API获取         │
└─────────────────────────────────────────┘
    ↓
合并设置数据和轨道信息 → 发送到Popup界面
```

#### 6.3.2 传统SidePanel缓存流程 📚 **已放弃**

> **📚 历史记录**: 以下为SidePanel的缓存流程，保留作为技术参考  
> **放弃原因**: 复杂的消息流和状态管理，用户体验不一致

```
用户点击翻译设置按钮 (当前实现)
    ↓
[UIManager] 设置按钮点击事件
    ↓ 
直接调用 chrome.action.openPopup()  // ✅ 直接调用
    ↓
[Popup] 通过Port连接通知Background更新状态  // ✅ 生命周期管理
    ↓
从 chrome.storage.session 读取状态和设置  // ✅ 共享内存
```

#### 6.3.3 智能写入机制

**写入优化策略**：

1. **防重复写入机制**：
   - 通过Hash验证避免重复保存相同数据
   - 数据变更检测，只在实际变化时才写入
   - 批量操作合并，减少Storage API调用次数

2. **性能优化策略**：
```typescript
   // 批量更新示例
   const batchUpdate = {
     'settings_targetLang': 'ja',
     'settings_subtitleMode': 'dual',
     'settings_translationService': 'openai'
   };
   await chrome.storage.local.set(batchUpdate);
   ```

3. **自动清理机制**：
   - 定期清理过期缓存，避免存储膨胀
   - LRU策略管理视频缓存，保留最近使用的数据
   - 性能监控记录写入次数和耗时

### 6.4 缓存数据结构设计原则

**架构原则**：
- **职责分离**：不同类型的缓存数据采用不同的存储策略和生命周期管理
- **性能优化**：本地存储用于持久化数据，会话存储用于跨标签页状态同步
- **容量管理**：各类缓存都有明确的大小限制和清理策略

**缓存层次结构**：
1. **翻译缓存**（TranslationCache）：存储翻译结果，避免重复翻译
2. **视频源语言缓存**（VideoSourceLanguageCache）：记住用户为每个视频选择的源语言和字幕轨道信息

> **📋 数据结构定义**：具体的接口定义和类型声明请参见 **[第7章 数据结构设计规范](#7-数据结构设计规范)**

**存储键命名规范**：
- 使用明确的前缀区分不同类型的数据
- 采用下划线分隔的命名方式保持一致性
- 详细的存储键定义请参见第7章相关章节

### 6.5 数据管理策略

#### 6.5.1 缓存大小限制和清理

**存储限制管理**：
- **总缓存大小限制**：10MB (chrome.storage.local 限制)
- **单视频缓存限制**：500KB (包括字幕轨道 + 翻译结果)
- **最大缓存视频数量**：50个视频

**自动清理策略**：

**FIFO清理机制**：
- **视频源语言缓存**：采用先进先出策略，最大容量10个视频
- **翻译缓存**：基于时间戳和使用频率进行智能清理

**容量管理原则**：
- 同一videoId的更新操作直接覆盖，不影响FIFO顺序
- 新增条目时才执行容量检查和清理操作
- 批量清理操作避免频繁的单个删除操作

> **📋 具体实现**：详细的清理算法和代码实现请参见相关管理器类的源代码

#### 6.5.2 性能监控和调试

**日志格式标准**：
- **存储操作日志**：记录所有存储读写操作，包含操作类型、键名和数据概览
- **缓存命中日志**：监控缓存效率，区分命中和未命中情况
- **性能监控日志**：记录操作耗时和数据大小，用于性能分析

**监控策略**：
- 统一的日志前缀格式便于过滤和分析
- 敏感信息（如API密钥）不记录到日志中
- 性能指标包含操作耗时和数据体积，便于优化分析

> **📋 具体格式**：详细的日志格式和监控代码请参见相关管理器类的实现


## 7. 数据结构设计规范

> **📋 说明**: 本章节为项目数据结构的权威技术参考，所有其他文档中的数据结构说明均以此为准。

### 7.1 存储分层架构设计

项目采用三层分离的数据存储架构，将不同类型的数据按职责和生命周期进行分层管理：

#### 7.1.1 **UserPreferences** - 持久化用户偏好设置

```typescript
interface UserPreferences {
  // === 核心翻译设置 ===
  targetLang: string;                           // 目标语言（全局默认）
  subtitleMode: SubtitleMode;                   // 字幕显示模式
  
  // === 翻译服务配置（统一） ===
  translationService: TranslationServiceComplete;  // 完整的翻译服务配置（包含type, model, temperature等）
  
  // === 数据完整性 ===
  hash: string;                                 // 设置hash值
}

enum SubtitleMode {
  BILINGUAL = 'bilingual',                      // 双语显示：原文+译文
  TARGET_ONLY = 'targetOnly'                    // 仅目标语言显示
}

enum TranslationServiceType {
  GOOGLE_FREE = 'google-free',                  // 免费Google翻译，不需要API key
  MICROSOFT_FREE = 'microsoft-free',            // 免费微软翻译，不需要API key
  OPENAI = 'openai',                           // OpenAI，需要API key + model + temperature
  GEMINI = 'gemini',                           // Google Gemini，需要API key + model
  DEEPSEEK = 'deepseek',                       // DeepSeek，需要API key + model
  QWEN = 'qwen',                               // 通义千问，需要API key + model
  DUMMY = 'dummy'                              // 用于测试
}

/**
 * 统一的翻译服务配置结构 - 完整版本 (TranslationServiceComplete)
 */
interface TranslationServiceComplete {
  // === 基础信息 ===
  type: TranslationServiceType;                 // 服务类型
  name: string;                                 // 显示名称
  
  // === 模型配置 ===
  model: string | null;                         // 模型名称
  availableModels?: string[];                   // 可用模型列表
  
  // === 认证信息 ===
  apiKey?: string;                              // API密钥（敏感信息）
  
  // === 调节参数 ===
  temperature?: number | null;                  // 温度参数
  maxTokens?: number;                           // 最大令牌数
  topP?: number;                                // Top-P参数
  
  // === 限流参数 ===
  rpm?: number | null;                          // 每分钟请求限制
  tpm?: number | null;                          // 每分钟令牌限制
}

/**
 * 📋 新增：派生类型设计架构
 * 基于TranslationServiceComplete，为不同使用场景提供专门化类型
 */

// 存储用：排除敏感信息  
type TranslationServiceForStorage = Omit<TranslationServiceComplete, 'apiKey'>;

// 传输用：排除敏感信息，适合消息传递
type TranslationServiceForTransfer = Omit<TranslationServiceComplete, 'apiKey'>;

// UI显示用：仅包含显示相关字段
type TranslationServiceForUI = Pick<TranslationServiceComplete, 
  'type' | 'name' | 'description' | 'model' | 'availableModels'>;

// API调用用：包含执行翻译所需的所有信息
type TranslationServiceForAPI = TranslationServiceComplete;

// 缓存键用：仅包含影响翻译结果的字段  
type TranslationServiceForCacheKey = Pick<TranslationServiceComplete, 
  'type' | 'model' | 'temperature'>;

/**
 * 向后兼容：保持原有接口名称
 */
type TranslationService = TranslationServiceComplete;

}
/**
 * 翻译服务配置设计
 * 详细配置参见：src/shared/types/translation-service.ts
 */
type ServiceConfig = TranslationService;


```

**存储规范**：
- **存储位置**: `chrome.storage.local`
- **存储键**: `user_preferences`（统一键，存储完整UserPreferences对象）
- **存储架构**: 统一对象存储，非分离键存储
- **特点**: 用户偏好永久保存，不清理
- **管理器**: `UserPreferencesManager`

**统一存储设计**：
```typescript
// ✅ 实际存储方式：统一对象
await chrome.storage.local.set({
  'user_preferences': {
    targetLang: 'zh-CN',
    subtitleMode: 'bilingual',
    translationService: {
      type: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
      // ... 完整配置
    },
    hash: 'calculated_hash_value'
  }
});

// ❌ 废弃方式：分离键存储
// await chrome.storage.local.set({
//   'user_preferences_targetLang': 'zh-CN',
//   'user_preferences_subtitleMode': 'bilingual',
//   'user_preferences_translationService': {...},
//   'user_preferences_hash': 'calculated_hash_value'
// });
```

**预加载流程**：
1. **Local Storage匹配** → **Hash验证** → **验证通过则直接采用完整UserPreferences**
2. **验证不通过** → **获取浏览器UI语言**: `chrome.i18n.getUILanguage()` → **设置targetLang** → **其他元素取默认值** → **组合成新的UserPreferences**

**来源确认机制**：
- ✅ **LOCAL_STORAGE**: 从本地存储成功加载且Hash验证通过的完整设置
- ✅ **SMART_DEFAULT**: 基于UI语言智能计算targetLang + 系统默认的其他设置
- ✅ **FALLBACK_DEFAULT**: 兜底的完整默认配置

#### 7.1.2 **RuntimeState** - 运行时状态

**设计理念** (v5.24.7+极简版)：专注翻译状态管理的极简运行时状态，移除复杂的全局同步机制，支持PENDING状态的三态翻译逻辑。

```typescript
/**
 * 翻译状态枚举 - 支持PENDING状态的三态逻辑
 */
export enum TranslateActiveState {
  INACTIVE = 'inactive',  // 翻译关闭
  ACTIVE = 'active',      // 翻译激活
  PENDING = 'pending'     // 翻译执行中（异步状态）
}

/**
 * 运行时状态 - v5.24.7+简化架构
 * 仅管理翻译状态，移除设置面板相关复杂状态管理
 */
export interface RuntimeState {
  // === 核心翻译状态 ===
  translateActive: TranslateActiveState;      // 翻译状态（三态：INACTIVE/ACTIVE/PENDING）
}

/**
 * 默认运行时状态
 */
export const DEFAULT_RUNTIME_STATE: RuntimeState = {
  translateActive: TranslateActiveState.INACTIVE  // 默认翻译关闭
};
```

**存储规范**：
- **存储位置**: `chrome.storage.session`（跨标签页状态同步）
- **存储键**: `runtime_state_translateActive`（翻译状态）
- **存储架构**: 单一键存储，简化状态管理
- **管理器**: `RuntimeStateManager`
- **生命周期**: 会话级存储，浏览器关闭后清空
- **设计理念**: 专注翻译状态，页面级设置面板管理

**简化存储设计**：
```typescript
// ✅ v5.24.7+简化存储方式：仅存储翻译状态
await chrome.storage.session.set({
  'runtime_state_translateActive': TranslateActiveState.ACTIVE
});

// 存储键常量定义
export const RUNTIME_STATE_STORAGE_KEYS = {
  TRANSLATE_ACTIVE: 'runtime_state_translateActive'
} as const;
```

> **📋 设计说明**：v5.24.7+版本采用存储读取优先策略，RuntimeState包含翻译状态和设置面板状态。设置面板状态通过`runtimeStateManager.getSettingPanelState()`高性能读取。

**三态翻译逻辑设计**：
- **INACTIVE**: 翻译功能关闭，按钮为非激活状态
- **ACTIVE**: 翻译功能激活，显示翻译结果
- **PENDING**: 翻译执行中，显示加载状态，支持B45-B48检测循环

**翻译按钮流程支持**：
- **B38三分支**: `translateActive` 枚举直接匹配 INACTIVE/ACTIVE/PENDING
- **B45-B48 PENDING检测**: 支持PENDING状态的循环检测和超时处理
- **状态变更源追踪**: 通过 `RuntimeStateManager` 的事件机制追踪状态变更来源


**使用示例**：
```typescript
// B38: 当前翻译开关状态判断
const translateState = await runtimeStateManager.getState('translateActive');
switch (translateState) {
  case TranslateActiveState.ACTIVE:
    // B39: 根据缓存状态智能执行翻译
    break;
  case TranslateActiveState.INACTIVE:
    // B40: 设置保存完成，等待用户操作
    break;
  case TranslateActiveState.PENDING:
    // B41: PENDING状态下的设置变更处理
    // B45-B48: 启动检测循环
    break;
}

// 设置PENDING状态（B45开始检测循环）
await runtimeStateManager.setState('translateActive', TranslateActiveState.PENDING);

// B47: 重新检查状态
const currentState = await runtimeStateManager.getState('translateActive');
if (currentState === TranslateActiveState.PENDING) {
  // B48: 状态仍为PENDING，继续检测或超时处理
}

// ❌ 已废弃：设置面板状态改为页面级管理，通过chrome.sidePanel API检测
```

**v5.24.7+极简架构优势**：
- ✅ **专注核心**: 仅管理翻译状态，移除设置面板相关状态
- ✅ **简化管理**: 翻译状态跨标签页共享，Popup界面状态简化管理
- ✅ **类型安全**: TranslateActiveState枚举提供编译时检查
- ✅ **状态清晰**: INACTIVE/ACTIVE/PENDING语义明确，易于调试
- ✅ **性能优化**: 移除不必要状态，减少存储操作
- ✅ **维护简便**: 极简设计，代码更易维护和扩展

#### 7.1.3 **VideoSourceLanguageData** - 视频源语言数据

**设计理念**：存储每个视频的源语言元数据（不含会过期的URL），包括可用语言列表和用户选择，避免重复API调用，提升Popup加载速度。

```typescript
/**
 * 视频源语言数据 - 完整版设计
 * 存储每个视频的源语言相关信息
 * 注意：不存储baseUrl，避免过期问题
 */
interface VideoSourceLanguageData {
  /** 视频ID */
  videoId: string;
  
  /** 可用的源语言列表（仅元数据，不含URL） */
  availableSourceLanguages: TrackMetadata[];
  
  /** 用户上次选择的源语言 */
  lastSelectedLanguage?: string;
  
  /** 数据获取时间戳 */
  fetchedAt: number;
  
  /** 最后访问时间戳 */
  lastAccessed: number;
}

/**
 * 字幕轨道元数据
 * 只包含稳定信息，不包含会过期的URL
 */
interface TrackMetadata {
  /** 语言代码 */
  languageCode: string;
  /** 显示名称 */
  name: string;
  /** 字幕类型 */
  kind?: 'asr' | 'forced' | undefined;
  // 注意：不包含 baseUrl
}
```

**存储规范**：
- **存储位置**: `chrome.storage.local`
- **存储键**: `video_source_${videoId}` （分散存储，每个视频独立）
- **缓存策略**: LRU淘汰，30天过期
- **数据大小**: ~2KB/视频
- **更新逻辑**: 打开Popup时检查缓存，过期则重新获取

**实现逻辑**：
```typescript
/**
 * 获取或更新视频源语言数据
 * @param videoId 视频ID
 */
async getVideoSourceLanguageData(videoId: string): Promise<VideoSourceLanguageData | null> {
  const key = `video_source_${videoId}`;
  const result = await chrome.storage.local.get(key);
  const data = result[key];
  
  // 检查缓存有效性（30天过期）
  if (data && (Date.now() - data.fetchedAt < 30 * 24 * 60 * 60 * 1000)) {
    // 更新最后访问时间
    data.lastAccessed = Date.now();
    await chrome.storage.local.set({ [key]: data });
    return data;
  }
  
  // 缓存过期或不存在，需要重新获取
  return null;
}

/**
 * 保存视频源语言数据
 * @param videoId 视频ID  
 * @param languages 可用语言列表
 * @param selectedLang 用户选择的语言
 */
async saveVideoSourceLanguageData(
  videoId: string, 
  languages: TrackMetadata[],
  selectedLang?: string
): Promise<void> {
  const key = `video_source_${videoId}`;
  const data: VideoSourceLanguageData = {
    videoId,
    availableSourceLanguages: languages,
    lastSelectedLanguage: selectedLang,
    fetchedAt: Date.now(),
    lastAccessed: Date.now()
  };
  
  await chrome.storage.local.set({ [key]: data });
}
```

**核心解决问题**：
- ✅ **避免重复API调用**: 缓存源语言元数据，Popup秒开
- ✅ **用户选择记忆**: 记住用户为每个视频选择的源语言偏好
- ✅ **性能优化**: 从~500ms API调用优化到~10ms缓存读取
- ✅ **离线可用**: 即使网络问题也能显示源语言列表
- ✅ **避免URL过期**: 不存储baseUrl，需要时实时获取

**使用场景**：
```typescript
// 场景1: 打开Popup时获取源语言列表
const data = await getVideoSourceLanguageData(videoId);
if (data) {
  // 使用缓存的语言列表，瞬间加载
  renderLanguageList(data.availableSourceLanguages);
  setSelectedLanguage(data.lastSelectedLanguage);
} else {
  // 缓存未命中，从API获取
  const languages = await fetchFromYouTubeAPI(videoId);
  await saveVideoSourceLanguageData(videoId, languages);
}

// 场景2: 用户更改源语言选择
async function onSourceLanguageChange(videoId: string, newLang: string) {
  const data = await getVideoSourceLanguageData(videoId);
  if (data) {
    data.lastSelectedLanguage = newLang;
    await saveVideoSourceLanguageData(videoId, data.availableSourceLanguages, newLang);
  }
}

// 场景3: 构建翻译缓存键
const data = await getVideoSourceLanguageData(videoId);
const sourceLang = data?.lastSelectedLanguage || 'auto';
const cacheKey = `translation_${videoId}_${sourceLang}_${targetLang}_${serviceType}`;
```

**查询优先级**：
```
1. VideoSourceLanguageCache (Local Storage) → 源语言元数据（不含URL）
2. Content Script API调用 → 获取新数据
```

**baseUrl处理策略**：
- **翻译设置按钮**：只需要语言列表元数据，不需要baseUrl
- **翻译开关按钮**：需要字幕时，通过GET_SUBTITLE_DATA消息实时获取最新baseUrl
- **原因**：YouTube的baseUrl包含时间戳和签名，会过期，不适合缓存

#### 7.1.6 **SubtitleCache** - 基础翻译缓存结构

```typescript
/**
 * 翻译缓存结构 - 映射表格式
 */
interface SubtitleCache {
  [cacheKey: string]: {  // 缓存键: videoId + apiType + targetLang
    translatedSubtitles: {
      [id: string]: string;  // 字幕ID到翻译文本的映射
    };
    timestamp: number;    // 缓存时间戳
  };
}
```

**存储规范**：
- **存储位置**: `chrome.storage.local`
- **键格式**: 使用复合键标识唯一的翻译缓存条目
- **生命周期**: 持久化存储，基于时间戳进行清理
- **用途**: 避免重复翻译相同内容，提升性能

#### 7.1.7 **TranslationCacheData** - 完整翻译缓存数据

```typescript
interface TranslationCacheData {
  // === 标识信息 ===
  videoId: string;                              // 视频ID
  sourceLang: string;                           // 源语言（用于匹配）
  targetLang: string;                           // 目标语言（用于匹配）
  
  // === 翻译服务配置（安全版本） ===
  translationService: {                         // 服务配置（不含API密钥）
    type: TranslationServiceType;               // 服务类型
    model?: string;                             // AI模型（如果适用）
    temperature?: number;                        // 温度参数（如果适用）
  };
  
  // === 原始和翻译内容 ===
  originalSubtitles: string;                    // 原始字幕（VTT格式）
  translatedSubtitles: string;                  // 翻译后的字幕（VTT格式）
  
  // === 缓存管理 ===
  createdAt: number;                            // 创建时间戳
  lastUsed: number;                             // 最后使用时间戳
  
  // === 数据完整性验证 ===
  dataHash: string;                             // 数据完整性hash
}
```

**存储规范**：
- **存储位置**: `chrome.storage.local`
- **键格式**: `translation_${videoId}_${sourceLang}_${targetLang}_${serviceType}[_${model}][_${temperature}]`
- **键生成函数**:
  ```typescript
  function generateCacheKey(
    videoId: string,
    sourceLang: string, 
    targetLang: string,
    service: TranslationService
  ): string {
    // 基础部分
    let key = `translation_${videoId}_${sourceLang}_${targetLang}_${service.type}`;
    
    // 根据服务类型添加特定参数，确保缓存精确匹配
    switch (service.type) {
      case 'openai':
      case 'gemini':
      case 'deepseek':
      case 'qwen':
        // AI服务需要包含模型和temperature
        if (service.model) key += `_${service.model}`;
        if (service.temperature !== undefined) key += `_${service.temperature}`;
        break;
        
      case 'google-free':
      case 'microsoft-free':
        // 免费服务无额外参数
        break;
        
      case 'deepl':
        // DeepL可能有formality参数
        if (service.formality) key += `_${service.formality}`;
        break;
        
      case 'custom':
        // 自定义服务需要endpoint的hash
        if (service.endpoint) key += `_${hashString(service.endpoint)}`;
        break;
    }
    
    return key;
  }
  ```
- **键示例**: 
  ```typescript
  // 付费AI服务（有model和temperature参数）
  'translation_dQw4w9WgXcQ_en_zh-CN_openai_gpt-4o_0.7'
  
  // 免费服务（无model和temperature）
  'translation_dQw4w9WgXcQ_ja_zh-CN_google-free'
  ```
- **存储策略**: 分散存储，每个翻译结果独立键值对
- **缓存大小**: ~85KB/翻译（原字幕35KB + 译文50KB）
- **过期策略**: 30天自动过期，LRU淘汰
- **安全特性**: 
  - ✅ **排除敏感信息**: translationService不包含API密钥
  - ✅ **保存原始字幕**: 支持切换翻译服务无需重新获取
  - ✅ **精确匹配**: 任何服务参数变化都会生成新的缓存键
- **特点**: 循环覆盖，存满后覆盖最早的（LRU策略）
- **管理器**: 由翻译模块和缓存管理器共同管理
- **清理策略**: 基于`lastUsed`时间戳和存储配额

**数据示例**：
```typescript
// 完整的TranslationCacheData示例
{
  videoId: "abc123",
  sourceLang: "en",
  targetLang: "zh-CN",
  
  // 翻译服务配置（不含API密钥）
  translationService: {
    type: "openai",
    model: "gpt-4o",
    temperature: 0.7
  },
  
  // 原始字幕（VTT格式）
  originalSubtitles: `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello everyone, welcome to my channel

00:00:04.000 --> 00:00:06.000
Today we'll discuss the development of AI`,
  
  // 翻译后的字幕（VTT格式）
  translatedSubtitles: `WEBVTT

00:00:01.000 --> 00:00:03.000
大家好，欢迎来到我的频道

00:00:04.000 --> 00:00:06.000
今天我们将讨论人工智能的发展`,
  
  createdAt: 1640995000000,
  
  lastUsed: 1640995200000,
  dataHash: "a1b2c3d4e5f6"
}
```

**设计优势**：
- ✅ **避免重复API调用**: 保存originalSubtitles，切换服务无需重新获取
- ✅ **数据完整性**: VTT格式包含完整时间轴和文本，可独立使用
- ✅ **缓存精度**: 键中包含model和temperature，确保缓存匹配准确性
- ✅ **即插即用**: 可直接用于字幕显示，无需二次处理
- ✅ **支持离线对比**: 用户可以对比原文和译文
- ✅ **安全存储**: translationService不包含API密钥等敏感信息
- ✅ **自动管理**: LRU策略自动清理，Hash验证保证数据可靠性

## 缓存架构说明

### 两层缓存设计（v3.0+）

自v3.0版本起，我们简化了缓存架构，从三层缓存简化为两层：

1. **Local Storage缓存层** - chrome.storage.local持久化存储
   - VideoSourceLanguageData：视频源语言和字幕轨道信息
   - TranslationCacheData：翻译结果缓存
   - UserPreferences：用户偏好设置（无内存缓存）

2. **Content Script API层** - 从YouTube页面获取数据
   - 当缓存未命中时，从页面API获取最新数据
   - 获取后立即存入Local Storage供后续使用

**架构简化理由**：
- Service Worker会在30秒空闲后重启，内存缓存效果有限
- chrome.storage.local访问速度足够快（通常<1ms）
- 减少代码复杂度，提高可维护性
- 避免多层缓存的一致性问题

**原始字幕复用机制**：
```typescript
/**
 * 查找特定视频+源语言的所有缓存（用于复用原始字幕）
 */
class TranslationCacheManager {
  async findByVideoAndSourceLang(videoId: string, sourceLang: string): Promise<TranslationCacheData[]> {
    const pattern = `translation_${videoId}_${sourceLang}_*`;
    const keys = await chrome.storage.local.get(null);
    
    return Object.entries(keys)
      .filter(([key]) => key.match(new RegExp(`^translation_${videoId}_${sourceLang}_`)))
      .map(([_, value]) => value as TranslationCacheData)
      .sort((a, b) => b.lastUsed - a.lastUsed);  // 最近使用的优先
  }
  
  /**
   * 检查原始字幕是否可复用
   */
  canReuseOriginalSubtitles(
    existing: TranslationCacheData, 
    targetLang: string,
    service: TranslationService
  ): boolean {
    // 源语言必须相同
    if (existing.sourceLang !== sourceLang) return false;
    
    // 如果目标语言和服务都相同，直接使用完整缓存
    if (existing.targetLang === targetLang && 
        this.isSameService(existing.translationService, service)) {
      return 'full-cache';  // 完全命中
    }
    
    // 源语言相同但目标语言或服务不同，可复用原始字幕
    return 'partial-cache';  // 部分命中
  }
}
```

### 7.2 存储键定义规范

**架构设计**：
基于实际项目需求，采用**统一对象存储**策略，确保数据的原子性和一致性。存储键设计遵循明确的前缀分类和命名约定。

```typescript
/**
 * 存储键名约定 - 与实际代码保持一致
 * 文件位置: src/shared/storage/storage-manager.ts
 */
export const StorageKeys = {
  // === 新架构核心存储键 ===
  /** 统一的用户偏好设置存储键 - 整个UserPreferences对象 */
  USER_PREFERENCES: 'user_preferences',
  /** 视频源语言数据前缀 - 分散存储每个视频 */
  VIDEO_SOURCE_PREFIX: 'video_source_',
  /** 翻译缓存数据前缀 - 分散存储每个翻译 */
  TRANSLATION_PREFIX: 'translation_',
  
  // === Session Storage 存储键模板 ===
  /** 原字幕数据：session_subtitles_${videoId} */
  SESSION_SUBTITLES_PREFIX: 'session_subtitles_',

  // === 通用前缀规范 ===
  /** 缓存数据前缀：翻译缓存等 */
  CACHE_PREFIX: 'cache.',
  /** 临时数据前缀 */
  TEMP_PREFIX: 'temp.',
  
  // === Local Storage 相关键（明确区分作用域） ===
  LOCAL: {
    VIDEO_SETTINGS_PREFIX: 'video_settings.',
    LAST_USED_VIDEOS: 'last_used_videos',
    CACHE_TRANSLATION_PREFIX: 'translation_cache.',
    CACHE_SUBTITLES_PREFIX: 'subtitle_cache.',
    TRANSLATIONS_PREFIX: 'local.translations.',
    API_TEST_RESULTS: 'local.apiTestResults',
    VIDEO_TRACKS_PREFIX: 'local.videoTracks.'
  },

  // === 临时数据键（存储在local中） ===
  TEMP: {
    CURRENT_VIDEO_ID: 'temp.currentVideoId',
    ACTIVE_TAB: 'temp.activeTab',
    SUBTITLE_EVENTS: 'temp.subtitleEvents',
    LAST_KNOWN_VIDEO_ID_FOR_TAB: 'temp.lastKnownVideoIdForTab'
  },
  
  // === 运行时状态存储键（实际使用） ===
  RUNTIME_STATE_STORAGE_KEYS: {
    TRANSLATE_ACTIVE: 'runtime_state_translateActive',
    SETTING_PANEL_OPEN: 'runtime_state_settingPanelOpen'
  },
  
  // === 兼容性层（保留用于迁移） ===
  SETTINGS_PREFIX: 'settings.',                    // 已迁移到 UserPreferencesManager
  USER_PREFERENCES_PREFIX: 'user_preferences.',    // 已迁移到 UserPreferencesManager  
  RUNTIME_STATE_PREFIX: 'runtime_state.'           // 已迁移到 RuntimeStateManager 专用键
};
```

**核心设计理念**：

1. **统一对象存储 vs 分离键存储**：
   ```typescript
   // ✅ 当前架构：统一对象存储
   StorageKeys.USER_PREFERENCES = 'user_preferences'
   // 存储内容：完整的 UserPreferences 对象
   
   // ❌ 废弃方案：分离键存储  
   // 'user_preferences_targetLang': 'en'
   // 'user_preferences_subtitleMode': 'bilingual'
   // 'user_preferences_translationService': {...}
   ```

2. **统一存储的优势**：
   - **原子性操作**：整个设置作为一个单元更新，避免部分更新导致的不一致
   - **Hash验证简单**：基于完整对象计算Hash，验证数据完整性
   - **事务性更强**：减少存储操作次数，降低出错概率
   - **管理简化**：UserPreferencesManager只需处理一个存储键

3. **前缀规范说明**：
   - **全局唯一键**：`user_preferences`（用户偏好设置）
   - **分散存储键**：`video_source_${videoId}`、`translation_${...}`
   - **前缀键**：按作用域分类（`cache.`、`temp.`、`local.`等）
   - **弃用前缀**：保留兼容性，支持平滑迁移

**存储策略对比**：

| 存储类型 | 存储方式 | 键格式 | 大小 | 生命周期 |
|---------|---------|--------|------|----------|
| **UserPreferences** | 全局唯一 | `user_preferences` | ~1KB | 永久 |
| **VideoSourceLanguageData** | 分散存储 | `video_source_${videoId}` | ~2KB/视频 | 30天 |
| **TranslationCacheData** | 分散存储 | `translation_${...}` | ~85KB/翻译 | 30天 |
| **RuntimeState** | Session存储 | `runtime_state_*` | <1KB | 会话级 |

> **📋 说明**：此StorageKeys定义与实际代码完全一致，是项目的权威标准。所有存储操作都应引用此常量，而不是硬编码字符串。

### 7.3 Hash验证机制规范

#### 7.3.1 **UserPreferences Hash验证**

**计算规则**：
- **计算范围**: `targetLang + subtitleMode + translationService`
- **用途**: 检测用户设置变更，避免不必要的重新计算
- **更新时机**: 这3个参数设置变更时自动重新计算
- **排除字段**: 不包含频繁变化的状态数据（如translateActive等）

```typescript
function calculateUserPreferencesHash(settings: UserPreferences): string {
  const hashData = {
    targetLang: settings.targetLang,
    subtitleMode: settings.subtitleMode,
    // 翻译服务的关键参数（影响翻译结果的字段）
    serviceType: settings.translationService.type,
    serviceModel: settings.translationService.model,
    serviceTemperature: settings.translationService.temperature
  };
  return generateHash(JSON.stringify(hashData));
}
```

#### 7.3.2 **TranslationCacheData 数据完整性验证**

**验证机制**：
- **dataHash**: 验证翻译数据完整性，包含字幕内容和关键元数据
- **自动恢复**: 验证失败时自动重新翻译，保证功能可用性

```typescript
function calculateTranslationDataHash(data: Omit<TranslationCacheData, 'dataHash'>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
```

### 7.4 数据结构总结

本章定义了项目的核心数据结构，包括用户偏好设置、运行时状态、翻译缓存等关键组件。这些数据结构为整个扩展的存储层提供了统一的类型定义和接口规范。

**核心设计原则**：
- **类型安全**: 使用TypeScript提供编译时类型检查
- **数据完整性**: 通过Hash验证确保数据一致性
- **存储优化**: 针对不同使用场景采用合适的存储策略
- **向后兼容**: 预留扩展空间，支持平滑升级

> **📋 说明**: 具体的管理器实现、性能优化策略等内容请参见相应的专门章节。本章专注于数据结构的权威定义。




### 7.5 消息通信集成

本节描述数据结构与第9章消息通信架构的集成方式。

#### 7.5.1 数据结构在消息传递中的应用

**存储层集成**：
- 复用现有的`UserPreferencesManager`
- ❌ 已移除 (v5.24.7+): 扩展`RuntimeStateManager`处理SidePanel状态，改为Popup页面内检测
- 利用现有的三层分离架构

**通信层集成**：
- 扩展现有的消息处理系统
- 集成到消息路由系统
- 复用BackgroundScript的消息路由

**UI层集成**：
- 与现有的按钮状态同步机制协调
- 集成到`UIManager`组件系统
- 保持与ContentScript的状态一致性

#### 7.5.2 消息类型与数据结构映射

```typescript
/**
 * 消息负载与数据结构的标准映射
 */
interface MessageDataMapping {
  // 用户设置相关消息
  SETTINGS_UPDATE: {
    payload: Partial<UserPreferences>;
    response: { success: boolean; data?: UserPreferences };
  };
  
  // 翻译状态相关消息
  STATE_SYNC: {
    payload: Partial<RuntimeState>;
    response: { success: boolean; data?: RuntimeState };
  };
  
  // 字幕数据相关消息
  RAW_TRACKS_DATA: {
    payload: OriginalSubtitleData;
    response: { success: boolean; data?: OriginalSubtitleData };
  };
}
```

#### 7.5.3 开发指导原则

1. **数据流向**：始终从Background流向其他组件，避免双向数据绑定
2. **类型安全**：所有消息负载必须符合第7章定义的数据结构
3. **错误处理**：完善的验证和容错机制
4. **性能优先**：按需加载，避免过度优化
5. **状态一致性**：及时的状态反馈和清晰的错误提示

---

**📋 章节总结**: 本章定义了项目的核心数据结构规范，包括存储分层架构、键定义规范、Hash验证机制等。这些数据结构为整个扩展提供了统一、类型安全的存储基础。

---