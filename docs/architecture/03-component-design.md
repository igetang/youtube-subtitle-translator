# VTC 5.24 架构设计文档 - Part 3 (存储与缓存架构)

> **文档更新**: 2025-11-03
> **版本**: v5.24.11（视频源语言缓存单一数据源重构）
> **当前方案**: ✅ **Popup UI + Service Worker 调度（HandleToggleTranslate V4）**

## 🚨 **方案变更说明**

### **✅ 当前采用方案: Popup + Service Worker 调度**
- **核心流程**: Popup 负责 UI，其余逻辑由 Service Worker 的 `handleToggleTranslateV4` 统一调度
- **消息通信**: 通过后台 `window.postMessage ↔️ chrome.runtime` 协议，与内容脚本交互
- **状态管理**: `RuntimeStateManager` 基于 `chrome.storage.session` 维护 INACTIVE/PENDING/ACTIVE
- **缓存协作**: `VideoSourceLanguageCacheManager` 与 `TranslationCacheManager` 提供命中/复用能力，命中后仍会同步字幕轨道

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

为了确保职责清晰、数据管理集中以及 Service Worker 的生命周期稳定，**所有存储访问都通过后台的 `StorageManager` 与各类管理器（UserPreferences / RuntimeState / Cache）完成**，Popup 与内容脚本不直接操作原生 `chrome.storage.*`。

**核心原则**：
- **Service Worker 作为数据守门人**：后台脚本（`service-worker.ts`）统一响应消息并调用存储管理器
- **单一数据源原则（Single Source of Truth）** ⭐：每种数据只有一个权威写入者，避免重复写入和数据不一致
- **消息驱动的数据访问**：`handleToggleTranslateV4` 接收来自 Popup/内容脚本的请求，串联状态、缓存与翻译流程
- **分层存储策略**：持久化数据使用 `chrome.storage.local`，跨标签页运行态使用 `chrome.storage.session`（详见 6.4 与 7.1.2）
- **统一键名管理**：通过 `StorageKeys` 与专用管理器约束键前缀，避免直接拼接字符串
- **避免直接调用原生 API**：若确需批量写入，亦通过 `StorageManager.set()`/`get()` 等封装方法实现，保留监控与迁移钩子

#### 6.1.1 视频源语言缓存的单一数据源架构（v5.24.11新增）

**架构背景**：在v5.24.10及之前版本中，存在视频源语言缓存被多次写入的问题：
- Popup 通过 `getAvailableSourceLanguages()` 自己获取轨道数据并保存
- Service Worker 通过 `handleGetPopupInitData()` 也获取轨道数据并保存
- Cache Manager 的 `initialize()` 会主动创建空缓存并写入

这导致同一个videoId的缓存在短时间内被写入3次，造成性能浪费和职责混乱。

**单一数据源重构（2025-11-03）**：

**核心原则**：
- ✅ **Service Worker = 唯一数据写入者**：只有 Service Worker 可以写入视频源语言缓存
- ❌ **Popup = 纯消费者**：Popup 不直接读取缓存、不调用Content Script、不保存缓存
- ✅ **Cache Manager = 纯存储层**：只提供get/upsert接口，不实现业务逻辑
- ✅ **Content Script = 数据源**：只负责响应请求并返回YouTube API数据

**数据流向（单向流动）**：
```
YouTube API (Content Script)
         ↓
    Service Worker (业务协调层 + 唯一写入者)
         ↓
  VideoSourceLanguageCacheManager (纯存储层)
         ↓
  chrome.storage.local (持久化)
         ↓
      Popup (纯UI展示层 + 只读消费者)
```

**职责划分**：

1. **Popup（UI层）**
   - ✅ 展示用户界面
   - ✅ 接收用户操作
   - ✅ 通过消息通知Service Worker用户的操作
   - ✅ 从Service Worker获取数据并展示
   - ❌ 不直接读取chrome.storage
   - ❌ 不直接调用Content Script获取轨道数据
   - ❌ 不直接保存缓存数据

2. **Service Worker（业务层）**
   - ✅ 唯一负责获取轨道数据（通过Content Script）
   - ✅ 唯一负责保存缓存数据（通过Cache Manager）
   - ✅ 实现业务逻辑（智能选择源语言、缓存策略等）
   - ✅ 协调Popup、Content Script、Cache Manager之间的通信

3. **VideoSourceLanguageCacheManager（存储层）**
   - ✅ 管理内存缓存（this.cache）
   - ✅ 读写chrome.storage.local
   - ✅ 实现FIFO淘汰策略
   - ✅ 提供统一的upsert接口（替代set和upsertFromPopup）
   - ❌ 不实现业务逻辑
   - ❌ 不主动获取数据
   - ❌ initialize()时不主动写入空数据

4. **Content Script（数据源）**
   - ✅ 响应 `getVideoTrackData` 消息
   - ✅ 从YouTube Player API获取轨道数据
   - ✅ 返回原始数据给调用者
   - ❌ 不保存缓存
   - ❌ 不做数据处理（除基本格式转换）

**消息接口规范**：

```typescript
// Popup初始化时
Popup → Service Worker: {
  type: 'getPopupInitData',
  tabId: number
}
Service Worker → Popup: {
  popupContext: {
    availableSourceLanguages: TrackMetadata[],
    selectedSourceTrack: TrackMetadata | null,
    ...
  }
}

// 用户切换源语言时
Popup → Service Worker: {
  type: 'updateVideoSourceLanguage',
  data: {
    videoId: string,
    selectedSourceTrack: TrackMetadata
  }
}
Service Worker → Popup: {
  success: boolean
}
```

**Cache Manager接口统一**：

```typescript
class VideoSourceLanguageCacheManager {
  // ✅ 统一的写入方法（替代set和upsertFromPopup）
  async upsert(data: Omit<VideoSourceLanguageData, 'fetchedAt' | 'lastAccessed'>): Promise<void>

  // ✅ 读取方法
  async get(videoId: string): Promise<VideoSourceLanguageData | null>

  // ❌ 废弃方法（向后兼容，内部调用upsert）
  async set(data: ...): Promise<void>  // 已废弃
  async upsertFromPopup(data: ...): Promise<void>  // 已废弃
}
```

**架构优势**：
- ✅ **消除重复写入**：从3次写入减少到1次写入
- ✅ **职责清晰**：每个层级的职责明确，不会相互越界
- ✅ **易于维护**：数据流向清晰，单向流动，便于排查问题
- ✅ **性能优化**：减少存储写入次数，减少chrome.storage.onChanged触发
- ✅ **代码简化**：删除冗余方法和重复逻辑

**架构约束**：
为了保证架构不被破坏，制定以下约束：
1. ✅ **只有Service Worker可以调用Cache Manager的upsert()**
2. ❌ **Popup不允许import VideoSourceLanguageCacheManager**
3. ❌ **Content Script只响应消息，不主动操作缓存**
4. ✅ **所有缓存读写必须通过Service Worker**

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

#### 6.3.1 HandleToggleTranslate V4 执行顺序（当前方案）

`handle-toggle-translate-v4.ts` 将翻译开关的生命周期拆分为多个阶段，每一阶段都会优先命中缓存，失败时再回落到页面 API：

1. **Stage 1 — 用户偏好加载**  
   - 通过 `UserPreferencesManager.getUserPreferences()`（`chrome.storage.local`）读取目标语言、字幕模式、翻译服务。  
   - 缺失时触发默认值与 Hash 校验逻辑。

2. **Stage 2 — 源语言缓存命中**  
   - 使用 `VideoSourceLanguageCacheManager.get(videoId)`（`chrome.storage.local` 单键容器）读取可用轨道与上次选择。  
   - 若缓存命中，优先按「用户请求 → 缓存记录 → 智能选择算法」排序匹配，并记录 `sourceLang`/`sourceKind`。

3. **Stage 2.5 — 翻译缓存命中**  
   - 调用 `TranslationCacheManager.get(videoId, sourceLang, sourceKind, targetLang, service)`。  
   - **即使命中，也会调用 `setSubtitleTrackAPI`**（`sendSetSubtitleTrack` → `chrome.tabs.sendMessage`）同步播放器轨道，确保字幕按钮与缓存使用的源语言一致。  
   - 命中后直接切换状态为 ACTIVE 并返回缓存内容；流程在此结束。

4. **Stage 3 — 广告检测 + 轨道拉取**  
   - 在真正发出轨道请求前，先通过 `checkPlayerAdState` 判断是否有广告播放；若是广告直接抛出 `ad_playing`，状态回退为 inactive 并提示用户。  
   - 未命中时，通过内容脚本的 `getVideoTrackData` → `getSubtitleTracksAPI` 获取播放器轨道。  
   - 选出最佳轨道后再次调用 `setSubtitleTrackAPI`，并异步写回 `VideoSourceLanguageCacheManager.set()`，维持 FIFO + TTL。

5. **Stage 4 — 字幕获取**  
   - 若未请求复用缓存字幕，则发送 `TRIGGER_SUBTITLE_LOAD`，并监听 `SUBTITLE_DATA` 消息获取最新 VTT。  
   - 失败会抛出 `StageTimeoutError`，终止整个流程并回滚状态。

6. **Stage 5 — 两阶段翻译**  
   - `TwoPhaseTranslatorV4` 使用紧急/批量流程执行翻译，超时与降级由 `TranslationSession` + `AbortTimeoutManager` 控制。  
   - 翻译完成后调用 `TranslationCacheManager.set()` 写入缓存（含 `availableSourceLanguages` 与 `dataHash`），最后通知内容脚本渲染。

#### 6.3.2 历史方案：SidePanel 缓存流程（已归档）

> **📚 历史记录**：保留 SidePanel 流程作为技术参考，实际代码已移除（详见归档文档）。

```
用户点击翻译设置按钮
    ↓
[UIManager] 设置按钮点击事件
    ↓ 
chrome.action.openPopup()
    ↓
[Popup] 通过 Port 通知 Background
    ↓
读取 chrome.storage.session 的状态与设置（现已废弃）
```

#### 6.3.3 智能写入机制

**写入优化策略**：

1. **防重复写入机制**：
   - 通过Hash验证避免重复保存相同数据
   - 数据变更检测，只在实际变化时才写入
   - 批量操作合并，减少Storage API调用次数

2. **性能优化策略**：
```typescript
   // 批量更新示例（必须通过 StorageManager 保留日志 & 迁移钩子）
   const batchUpdate = {
     'settings_targetLang': 'ja',
     'settings_subtitleMode': 'dual',
     'settings_translationService': 'openai'
   };
   await StorageManager.getInstance().setBatch(batchUpdate, 'local');
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
- **VideoSourceLanguageCache**：单键容器，最大 10 条记录（FIFO），每条记录 30 天 TTL，命中时刷新 `lastAccessed`
- **TranslationCache**：键前缀 `subtitle_translation_cache_`，全局最多 50 条记录（LRU），每条包含原始字幕/译文及 `availableSourceLanguages`
- **RuntimeState**：存储在 `chrome.storage.session`，浏览器关闭后自动清空

**自动清理策略**：

**FIFO / LRU 机制**：
- **VideoSourceLanguageCache**：超过 10 条时移除最早访问的视频；访问命中或更新都会触发 `saveCache()` 覆盖式写入
- **TranslationCache**：写入前执行 `_enforceLruPolicy()`，按 `lastUsed` 升序删除多余键；缓存命中会异步刷新 `lastUsed`

**容量管理原则**：
- 对同一 `videoId` 写入时直接覆盖旧条目，保持数组/键数量稳定
- 只有新增条目会触发 FIFO/LRU 清理，减少不必要的 remove 操作
- 结合 `dataHash` 校验防止脏数据污染容量统计

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
- **存储位置**: `chrome.storage.session`（跨标签页同步翻译状态 & Popup 手势）
- **存储键**:  
  - `runtime_state_translateActive`：翻译状态（INACTIVE / PENDING / ACTIVE）  
  - `runtime_state_popupOpen`：Popup 是否处于开启态
- **管理器**: `RuntimeStateManager`
- **生命周期**: 会话级存储，浏览器关闭即清空
- **设计理念**: 将所有运行态写入后台，避免 Service Worker 重启造成状态丢失

**API 使用示例**：
```typescript
const runtimeStateManager = RuntimeStateManager.getInstance();

// 设置状态（内部会校验合法流转）
await runtimeStateManager.setTranslateState(TranslateActiveState.PENDING);

// 读取当前状态
const translateState = await runtimeStateManager.getTranslateState();
if (translateState === TranslateActiveState.ACTIVE) {
  // 已完成翻译
}

// 监听状态变化（service-worker.ts 内部使用）
runtimeStateManager.addChangeListener(
  RuntimeStateChangeEvent.TRANSLATE_ACTIVE_CHANGED,
  (newValue) => console.log('state changed:', newValue)
);
```

> **📋 设计说明**：`setTranslateState` 会先更新内存缓存，再写入 `chrome.storage.session`。若传入非法状态，则复用 `TranslateStateHelper.canTransition()` 阻止。

**三态翻译逻辑设计**：
- **INACTIVE**: 翻译功能关闭，按钮为非激活状态
- **ACTIVE**: 翻译功能激活，显示翻译结果
- **PENDING**: 翻译执行中，显示加载状态，支持B45-B48检测循环

**翻译按钮流程支持**：
- **INACTIVE ➝ PENDING**: 用户打开翻译，后台创建新的 `TranslationSession`
- **PENDING ➝ ACTIVE**: 字幕抓取 + 翻译完成，并成功向内容脚本下发译文
- **PENDING ➝ INACTIVE**: 字幕抓取失败或翻译异常时自动回滚
- **状态变更追踪**: Service Worker 监听存储变化，向 Popup / 内容脚本广播最新状态

**YouTube SPA导航处理设计**（2025-09-16）：
- **设计原则**: 视频切换 = 页面刷新，每个视频从干净状态开始
- **重置策略**: 视频切换时自动重置translateActive为INACTIVE
- **检测机制**: 监听`yt-navigate-finish`事件 + URL轮询备用方案
- **用户体验**: 新视频默认关闭翻译，用户主动选择是否开启
- **架构决策**: 不做基于videoId的复杂状态隔离，保持简单可维护
**v4.0 架构优势**：
- ✅ **专注核心**: 运行态仅包含翻译状态与 Popup 打开状态，信息量最小化
- ✅ **跨标签同步**: 借助 `chrome.storage.session` 自动向所有标签页广播
- ✅ **类型安全**: 枚举约束 + `TranslateStateHelper` 防止非法状态写入
- ✅ **调试友好**: Service Worker 日志记录状态来源，易于定位异常

#### 7.1.3 **VideoSourceLanguageData** - 视频源语言数据

**设计理念**：存储每个视频的源语言元数据（不含会过期的URL），包括可用语言列表和用户选择，避免重复API调用，提升Popup加载速度。

```typescript
/**
 * 视频源语言数据（与 VideoSourceLanguageCacheManager 一致）
 * - 保存完整轨道元数据（languageCode/name/kind）
 * - 不包含 baseUrl，避免 YouTube 签名过期
 */
interface VideoSourceLanguageData {
  videoId: string;
  availableSourceLanguages: TrackMetadata[];
  selectedSourceTrack?: TrackMetadata;
  fetchedAt: number;
  lastAccessed: number;
}

/**
 * 字幕轨道元数据（经过 sanitize，kind 仅允许 'asr' | 'forced' | undefined）
 */
interface TrackMetadata {
  languageCode: string;
  name: string;
  kind?: 'asr' | 'forced';
}

/**
 * 缓存容器：单键存储，内部维护 FIFO 队列
 */
interface VideoSourceLanguageCache {
  items: VideoSourceLanguageData[];
  maxSize: number; // 固定 10
}
```

**存储规范**：
- **存储位置**: `chrome.storage.local`
- **存储键**: `StorageKeys.VIDEO_SOURCE_LANGUAGE_CACHE`（单键对象，内部维护 FIFO 数组）
- **缓存策略**: 命中时刷新 `lastAccessed`，超过 `maxSize`（10）触发 FIFO；单条记录超过 30 天则丢弃
- **更新逻辑**: ⭐ **只有Service Worker可以写入**，通过 `VideoSourceLanguageCacheManager.upsert()` 统一接口

**核心能力**：
- ✅ **避免重复 API 调用**：Service Worker 拉取轨道前优先命中缓存
- ✅ **记忆轨道选择**：缓存 `selectedSourceTrack`（包含 kind），供下一次直接复用
- ✅ **轨道清洗**：写入/读取时统一通过 `sanitizeKind` 过滤，仅保留稳定值
- ✅ **单一写入者**：⭐ 只有 Service Worker 可以写入，避免重复保存

**使用示例（Service Worker）**：
```typescript
// ✅ 正确：Service Worker中的使用方式
const manager = VideoSourceLanguageCacheManager.getInstance();
const cached = await manager.get(videoId);

if (cached) {
  // 缓存命中，直接使用
  return cached.availableSourceLanguages;
} else {
  // 缓存未命中，从Content Script获取
  const tracks = await getTracksFromContentScript(videoId);
  const bestTrack = selectBestSourceLanguage(tracks, targetLang);

  // Service Worker负责保存缓存
  await manager.upsert({
    videoId,
    availableSourceLanguages: tracks,
    selectedSourceTrack: bestTrack
  });

  return tracks;
}
```

**禁止的使用方式（Popup）**：
```typescript
// ❌ 错误：Popup不应该直接操作缓存
// ❌ 删除：Popup中的getAvailableSourceLanguages函数
// ❌ 删除：Popup中的saveVideoSourceLanguageCache函数

// ✅ 正确：Popup通过消息请求数据
const response = await chrome.runtime.sendMessage({
  type: 'getPopupInitData',
  tabId: currentTabId
});
const { availableSourceLanguages } = response.popupContext;
```

#### 7.1.6 **TranslationCacheData** - 完整翻译缓存数据

> 📌 **重要**：字幕内容以 VTT 字符串保存，保持与内容脚本协议一致；历史 `SubtitleCache`（按字幕 ID 映射的结构）已移至归档。

```typescript
interface TranslationCacheData {
  // === 标识信息 ===
  videoId: string;                              // 视频ID
  sourceLang: string;                           // 源语言（用于匹配）
  sourceKind?: 'asr' | 'forced';                // 源字幕类型（ASR / 强制字幕 / manual）
  targetLang: string;                           // 目标语言（用于匹配）

  // === 源语言补充信息 ===
  availableSourceLanguages: SimplifiedCaptionTrack[]; // 缓存命中时可直接渲染备选列表

  // === 翻译服务配置（安全版本） ===
  translationService: {                         // 服务配置（不含API密钥）
    type: TranslationServiceType;               // 服务类型
    model?: string | null;                      // AI模型
    temperature?: number | null;                // 温度参数
  };

  // === 原始和翻译内容 ===
  originalSubtitles: string;                    // 原始字幕（VTT格式字符串，非数组）
  translatedSubtitles: string;                  // 翻译后的字幕（VTT格式字符串，非数组）
  
  // === 缓存管理 ===
  lastUsed: number;                             // 最后使用时间戳
  
  // === 数据完整性验证 ===
  dataHash: string;                             // 数据完整性hash
}
```

**存储规范**：
- **存储位置**: `chrome.storage.local`
- **键格式**: `subtitle_translation_cache_${videoId}_${sourceLang}_${sourceKind}_${targetLang}_${service.type}_${service.model || 'default'}_${service.temperature || 'default'}`
- **键生成函数**:
  ```typescript
  function getCacheKey(
    videoId: string,
    sourceLang: string, 
    sourceKind: 'asr' | 'forced' | undefined,
    targetLang: string,
    service: TranslationService
  ): string {
    const kindPart = sourceKind || 'manual';
    const modelPart = service.model || 'default';
    const tempPart = service.temperature ?? 'default';
    return `subtitle_translation_cache_${videoId}_${sourceLang}_${kindPart}_${targetLang}_${service.type}_${modelPart}_${tempPart}`;
  }
  ```
- **键示例**: 
  ```typescript
  // ASR 轨道 + OpenAI 模型
  'subtitle_translation_cache_dQw4w9WgXcQ_en_asr_zh-CN_openai_gpt-5-mini_default'

  // 手动轨道 + 免费谷歌翻译
  'subtitle_translation_cache_dQw4w9WgXcQ_ja_manual_zh-CN_google-free_default_default'
  ```
- **存储策略**: 分散键值存储 + LRU（最多 50 条，写入前执行 `_enforceLruPolicy()`）
- **缓存大小**: 取决于字幕长度，单条通常 50~120 KB（含原文/译文 VTT）
- **安全特性**: 
  - ✅ **排除敏感信息**: translationService不包含API密钥
  - ✅ **保存原始字幕**: 支持切换翻译服务无需重新获取
  - ✅ **精确匹配**: 任何服务参数变化都会生成新的缓存键
- **字段说明**:
  - `availableSourceLanguages`: 缓存命中时直接复用轨道列表，避免再次访问 Player API
  - `sourceKind`: 与轨道选择结果配对，便于 ASR/强制字幕的差异化处理
  - `dataHash`: 基于 videoId + sourceLang + sourceKind + targetLang + service 计算的完整性校验
- **特点**: 循环覆盖，存满后覆盖最早的（LRU策略）
- **管理器**: 由翻译模块和缓存管理器共同管理
- **清理策略**: 基于`lastUsed`时间戳和存储配额

**数据示例**：
```typescript
// 完整的TranslationCacheData示例
{
  videoId: "abc123",
  sourceLang: "en",
  sourceKind: "manual",
  targetLang: "zh-CN",
  availableSourceLanguages: [
    { languageCode: "en", name: "English" },
    { languageCode: "ja", name: "日本語", kind: "asr" }
  ],
  
  // 翻译服务配置（不含API密钥）
  translationService: {
    type: "openai",
    model: "gpt-5-mini",
    temperature: null
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
- ✅ **轨道再利用**: 缓存命中时直接填充 `availableSourceLanguages`，加快 Popup 渲染

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
    const all = await chrome.storage.local.get(null);

    return Object.entries(all)
      .filter(([key]) => key.startsWith(`subtitle_translation_cache_${videoId}_${sourceLang}_`))
      .map(([_, value]) => value as TranslationCacheData)
      .filter(item => item.sourceLang === sourceLang)
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
   - **Hash验证高效**：只对关键参数计算Hash，验证缓存匹配的正确性
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
- **dataHash**: 验证缓存键参数的完整性，确保缓存匹配正确
- **自动恢复**: 验证失败时自动重新翻译，保证功能可用性
- **性能优先**: 只对关键参数计算hash，避免大量数据的计算开销

```typescript
function calculateTranslationDataHash(data: Omit<TranslationCacheData, 'dataHash'>): string {
  // 只对缓存键相关的参数计算hash，不包含实际的字幕内容
  // 理由：1. 提升性能 2. 避免字段顺序问题 3. Chrome存储本身可靠
  const hashData = {
    videoId: data.videoId,
    sourceLang: data.sourceLang,
    targetLang: data.targetLang,
    translationService: {
      type: data.translationService.type,
      model: data.translationService.model || 'default',
      temperature: data.translationService.temperature || 'default'
    }
  };

  const str = JSON.stringify(hashData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
```

**设计理念**：
- **实用主义**: 缓存的目的是提升性能，不是数据安全验证
- **简化维护**: 避免字幕数据结构变化导致的缓存失效
- **性能优先**: 减少不必要的计算开销，特别是在读取缓存时

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
