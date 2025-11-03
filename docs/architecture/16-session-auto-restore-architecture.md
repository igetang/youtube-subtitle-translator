# 翻译状态会话自动恢复架构设计

**文档版本：** v2.0
**创建日期：** 2025-11-03
**最后更新：** 2025-11-03
**作者：** Claude Code
**状态：** 已实现（与代码完全同步）

---

## 📋 目录

1. [背景与动机](#背景与动机)
2. [核心概念](#核心概念)
3. [架构设计](#架构设计)
4. [技术实现](#技术实现)
5. [时序控制](#时序控制)
6. [风险评估](#风险评估)
7. [实施计划](#实施计划)
8. [测试验证](#测试验证)

---

## 背景与动机

### 当前行为

#### 用户操作流程
```
1. 用户在视频A开启翻译 ✅
2. 翻译正常工作 ✅
3. 用户刷新页面（F5）
   ↓
4. 翻译开关重置为"关闭" ❌
5. 用户需要再次点击开启 ❌
```

#### 现有问题

1. **用户体验不佳**
   - 刷新页面后，翻译状态丢失
   - 需要重复点击开关，操作繁琐
   - 不符合用户心理预期（"我已经开启了翻译，为什么刷新后就关了？"）

2. **与竞品对比**
   ```
   YouTube官方字幕：刷新后保持开启 ✅
   沉浸式翻译扩展：刷新后保持开启 ✅
   Language Reactor：刷新后保持开启 ✅
   我们的扩展：刷新后关闭 ❌
   ```

3. **技术层面分析**
   - **存储层**：`translateActive` 已存储在 `chrome.storage.session`（数据不丢失）
   - **问题层**：页面刷新后，content-script重新初始化时，未检查session状态
   - **根本原因**：缺少"自动恢复"机制

### 用户需求

| 场景 | 用户期望 | 当前行为 | 期望行为 |
|------|---------|---------|---------|
| 刷新页面（F5） | 翻译继续工作 | ❌ 关闭 | ✅ 自动恢复 |
| 切换视频 | 新视频也开启翻译 | ❌ 关闭 | ✅ 自动恢复 |
| 切换标签页回来 | 翻译保持开启 | ✅ 正常 | ✅ 正常 |
| 关闭浏览器重开 | 重置状态 | ✅ 重置 | ✅ 重置 |

### 设计目标

**核心原则：** "会话级记忆" - 用户在一次浏览器会话中开启翻译后，所有YouTube视频都自动开启翻译，直到关闭浏览器。

**具体目标：**
1. ✅ 页面刷新后，自动恢复翻译状态
2. ✅ 视频切换后，自动为新视频开启翻译
3. ✅ 关闭浏览器后，重置状态（不保留到下次会话）
4. ✅ 保持现有架构不变（不修改存储层）
5. ✅ 实现成本低，风险可控

---

## 核心概念

### Session存储特性

#### chrome.storage.session的行为

```javascript
// 特性1：跨标签页共享
标签页A设置：chrome.storage.session.set({ key: 'active' })
标签页B读取：chrome.storage.session.get('key') → 'active' ✅

// 特性2：会话级持久化
打开浏览器 → 设置数据 → 刷新页面 → 数据保留 ✅
关闭浏览器 → 重新打开 → 数据重置 ✅

// 特性3：页面刷新保留
页面刷新前：translateActive = 'active'
页面刷新后：translateActive = 'active' ✅（存储层数据不丢失）
问题：content-script不知道要恢复翻译 ❌
```

#### 为什么不用chrome.storage.local

| 对比项 | session | local |
|--------|---------|-------|
| 数据生命周期 | 浏览器会话 | 永久 |
| 跨标签页共享 | ✅ | ✅ |
| 页面刷新保留 | ✅ | ✅ |
| 关闭浏览器后 | 重置 | 保留 |
| 性能 | 内存存储，更快 | 硬盘存储，较慢 |
| 适用场景 | **临时状态** ✅ | 用户偏好 |

**结论：** session更符合"翻译开关"的语义（临时状态，关闭浏览器自动重置）

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户操作                              │
│  点击翻译开关 / 刷新页面 / 切换视频                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│               Content Script (content-script.ts)             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ initialize() - 页面初始化                              │   │
│  │  1. initializeUIComponents()                         │   │
│  │  2. setupMessageHandlers()                           │   │
│  │  3. startVideoChangeDetection()                      │   │
│  │  4. 🆕 autoRestoreTranslationIfNeeded()  ← 新增      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ autoRestoreTranslationIfNeeded() - 自动恢复逻辑        │   │
│  │  1. 等待YouTube播放器准备就绪                          │   │
│  │  2. 读取 session 中的 translateActive 状态            │   │
│  │  3. 如果状态 === 'active'，触发恢复流程               │   │
│  │  4. 调用 handleUserAction({ action: 'toggle' })      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ handleVideoChange() - 视频切换处理                     │   │
│  │  1. 清空字幕覆盖层                                     │   │
│  │  2. 重置UI状态                                        │   │
│  │  3. 重新创建按钮                                       │   │
│  │  4. 🆕 autoRestoreTranslationIfNeeded()  ← 新增      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│            RuntimeStateManager (存储管理层)                   │
│                                                              │
│  chrome.storage.session {                                   │
│    'runtime.translateActive': 'active' | 'pending' | 'inactive' │
│  }                                                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Service Worker (service-worker.ts)              │
│                                                              │
│  handleToggleTranslateV4() - 执行翻译流程                     │
│    1. 获取用户偏好                                            │
│    2. 获取字幕数据                                            │
│    3. 执行翻译（两阶段并行）                                   │
│    4. 更新状态为 'active'                                     │
└─────────────────────────────────────────────────────────────┘
```

### 核心流程

#### 流程1：页面刷新自动恢复

```
时间轴：
T0: 用户在视频A开启翻译
    ↓
    chrome.storage.session.set({ 'runtime.translateActive': 'active' })

T1: 用户按F5刷新页面
    ↓
    Content Script 被销毁
    chrome.storage.session 数据保留 ✅

T2: 页面重新加载
    ↓
    Content Script 重新初始化
    调用 initialize()

T3: 执行 autoRestoreTranslationIfNeeded()
    ↓
    步骤1：等待 YouTube 播放器准备就绪（监听 yt-page-data-updated）

T4: YouTube 播放器准备就绪
    ↓
    步骤2：读取 RuntimeStateManager.getTranslateActive()
    返回 'active' ✅

T5: 触发翻译恢复
    ↓
    步骤3：重置状态为INACTIVE（让toggleTranslation正确判断）
    步骤4：调用 toggleTranslation()

T6: 翻译流程执行
    ↓
    toggleTranslation() 检测到INACTIVE状态
    判断为"开启翻译"操作
    发送TOGGLE_TRANSLATE消息到Service Worker
    执行 handleToggleTranslateV4()
    获取字幕 → 执行翻译 → 更新UI

T7: 翻译恢复完成 ✅
    用户看到双语字幕
```

#### 流程2：视频切换自动恢复

```
时间轴：
T0: 用户在视频A开启翻译
    ↓
    chrome.storage.session.set({ 'runtime.translateActive': 'active' })

T1: 用户点击推荐视频B（YouTube单页导航）
    ↓
    触发 yt-navigate-start 事件

T2: YouTube页面URL更新
    ↓
    触发 handleVideoChange()

T3: 清理UI状态
    ↓
    清空字幕覆盖层
    销毁拦截器
    清除错误消息

T4: 刷新全局状态
    ↓
    调用 refreshStates({ reason: 'videoChange' })
    从session读取最新状态并同步按钮UI

T5: 重新创建按钮
    ↓
    调用 checkAndCreateButtons()

T6: 自动恢复翻译
    ↓
    调用 autoRestoreTranslationIfNeeded()

T7: 读取 session 状态
    ↓
    translateActive = 'active' ✅

T8: 触发翻译
    ↓
    重置状态为INACTIVE
    调用 toggleTranslation()

T9: 翻译恢复完成 ✅
    视频B显示双语字幕
```

### 状态转换图

```
┌─────────────────────────────────────────────────────────────┐
│                    翻译状态生命周期                            │
└─────────────────────────────────────────────────────────────┘

初始状态（刚打开浏览器）：
  chrome.storage.session = {}
  translateActive = 'inactive'

用户操作1：点击翻译开关
  ↓
  INACTIVE → PENDING → ACTIVE
  chrome.storage.session.set({ 'runtime.translateActive': 'active' })

场景A：刷新页面
  ↓
  Content Script 重新初始化
  autoRestoreTranslationIfNeeded() 读取 session
  发现 translateActive = 'active'
  ↓
  自动触发翻译流程
  INACTIVE → PENDING → ACTIVE ✅（恢复成功）

场景B：切换视频
  ↓
  handleVideoChange() 清空UI
  autoRestoreTranslationIfNeeded() 读取 session
  发现 translateActive = 'active'
  ↓
  自动触发新视频的翻译
  INACTIVE → PENDING → ACTIVE ✅（恢复成功）

场景C：用户手动关闭翻译
  ↓
  ACTIVE → INACTIVE
  chrome.storage.session.set({ 'runtime.translateActive': 'inactive' })

场景D：关闭浏览器
  ↓
  chrome.storage.session 清空
  下次打开浏览器：translateActive = 'inactive' ✅（重置成功）
```

---

## 技术实现

### 1. 新增函数：autoRestoreTranslationIfNeeded()

#### 函数签名

```typescript
/**
 * 自动恢复翻译状态（如果需要）
 *
 * 使用场景：
 * 1. 页面初始化时（initialize()）
 * 2. 视频切换后（handleVideoChange()）
 * 3. 标签页激活时（visibilitychange）
 *
 * 工作流程：
 * 1. 检查去重标志，防止并发调用
 * 2. 等待YouTube播放器准备就绪
 * 3. 读取session中的translateActive状态
 * 4. 如果状态为'active'（或forceRestore=true），自动触发翻译
 *
 * @param forceRestore 强制恢复（用于视频切换场景）
 * @returns Promise<void>
 */
async function autoRestoreTranslationIfNeeded(forceRestore: boolean = false): Promise<void>
```

#### 实现逻辑

```typescript
// 去重标志（模块级别）
let isAutoRestoring = false;

async function autoRestoreTranslationIfNeeded(): Promise<void> {
  // === 步骤1：去重检查 ===
  if (isAutoRestoring) {
    console.log('[content-script] 正在自动恢复翻译，跳过重复调用');
    return;
  }

  if (!isInitialized) {
    console.log('[content-script] Content Script 未初始化完成，跳过自动恢复');
    return;
  }

  isAutoRestoring = true;

  try {
    // === 步骤2：等待YouTube播放器准备就绪 ===
    const playerReady = await waitForYouTubePlayer();
    if (!playerReady) {
      console.log('[content-script] YouTube播放器未就绪，跳过自动恢复');
      return;
    }

    // === 步骤3：读取session状态 ===
    // 优先从本地StateManager读取(状态最新),避免缓存延迟问题
    let translateActive: string;
    if (stateManager) {
      translateActive = stateManager.getTranslateState();
      console.log('[content-script] 检查翻译状态(StateManager):', translateActive, '| 强制恢复:', forceRestore);
    } else {
      // 降级方案: 从RuntimeStateManager读取
      const RuntimeStateManager = (await import('@shared/storage/runtime-state-manager')).RuntimeStateManager;
      const runtimeStateManager = RuntimeStateManager.getInstance();
      translateActive = await runtimeStateManager.getTranslateState();
      console.log('[content-script] 检查翻译状态(RuntimeStateManager):', translateActive, '| 强制恢复:', forceRestore);
    }

    // === 步骤4：判断是否需要恢复 ===
    if (!forceRestore && translateActive !== TranslateActiveState.ACTIVE) {
      console.log('[content-script] 翻译状态非active，无需恢复');
      return;
    }

    // === 步骤5：检查videoId ===
    const videoId = getVideoId();
    if (!videoId) {
      console.log('[content-script] 无法获取videoId，跳过自动恢复');
      return;
    }

    // === 步骤6：延迟执行，确保播放器完全加载 ===
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('[content-script] 🔄 自动恢复翻译:', videoId);

    // === 步骤7：设置状态为PENDING（符合状态机规范：ACTIVE → PENDING）===
    if (stateManager) {
      await stateManager.updateState('translateActive', TranslateActiveState.PENDING);
    }

    // === 步骤8：显示"翻译中"提示 ===
    subtitleOverlay.showPendingMessage('正在恢复翻译...');

    // === 步骤9：直接发送翻译消息到Service Worker ===
    const subtitleBtn = document.querySelector('.ytp-subtitles-button') as HTMLElement;
    const originalSubtitleState = subtitleBtn?.getAttribute('aria-pressed') === 'true';

    const videoElement = document.querySelector('video');
    const currentTime = videoElement ? videoElement.currentTime : 0;

    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_TRANSLATE',
      data: {
        videoId,
        newState: true,  // 开启翻译
        currentTime,
        originalSubtitleState
      }
    });

    // === 步骤10：根据响应更新状态 ===
    if (response?.success) {
      console.log('[content-script] ✅ 自动恢复翻译完成');
      // Service Worker会设置状态为ACTIVE并通过消息通知更新UI
    } else {
      console.error('[content-script] ❌ 自动恢复翻译失败:', response?.error);
      if (stateManager) {
        await stateManager.updateState('translateActive', TranslateActiveState.INACTIVE);
      }
      subtitleOverlay.hide();
    }

  } catch (error) {
    console.error('[content-script] ❌ 自动恢复翻译失败:', error);

    // 失败时重置状态为INACTIVE
    if (stateManager) {
      await stateManager.updateState('translateActive', TranslateActiveState.INACTIVE);
    }
    subtitleOverlay.hide();

  } finally {
    isAutoRestoring = false;
  }
}
```

### 2. 辅助函数：waitForYouTubePlayer()

#### 函数签名

```typescript
/**
 * 等待YouTube播放器准备就绪
 *
 * 策略：
 * 1. 优先使用轮询检查播放器DOM元素（最稳定）
 * 2. 备用方案：监听 yt-navigate-finish 事件
 *
 * @param timeout 超时时间（毫秒），默认10秒
 * @returns Promise<boolean> 是否准备就绪
 */
async function waitForYouTubePlayer(timeout: number = 10000): Promise<boolean>
```

#### 实现逻辑

```typescript
async function waitForYouTubePlayer(timeout: number = 10000): Promise<boolean> {
  // === 方案A：直接轮询检查DOM元素（推荐，最稳定） ===
  // 检查播放器是否已经存在
  const existingPlayer = document.querySelector('.html5-video-player');
  if (existingPlayer) {
    console.log('[content-script] YouTube播放器已就绪（立即检测）');
    return true;
  }

  // 轮询检测
  const maxAttempts = Math.floor(timeout / 500);  // 默认20次（10秒）
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const player = document.querySelector('.html5-video-player');
    if (player) {
      console.log(`[content-script] YouTube播放器已就绪（轮询第${i + 1}次）`);
      return true;
    }
  }

  console.error('[content-script] YouTube播放器未就绪，轮询超时');
  return false;
}

// === 备用方案B：监听yt-navigate-finish事件（可选） ===
// 如果轮询方案不稳定，可以改用事件监听：
/*
async function waitForYouTubePlayerByEvent(timeout: number = 10000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // 检查播放器是否已存在
    const player = document.querySelector('.html5-video-player');
    if (player) {
      resolve(true);
      return;
    }

    // 监听YouTube导航完成事件
    const handleNavigateFinish = () => {
      console.log('[content-script] YouTube导航完成');
      document.removeEventListener('yt-navigate-finish', handleNavigateFinish);
      clearTimeout(timeoutId);
      // 等待100ms确保DOM更新
      setTimeout(() => resolve(true), 100);
    };

    document.addEventListener('yt-navigate-finish', handleNavigateFinish);

    // 超时处理
    const timeoutId = setTimeout(() => {
      document.removeEventListener('yt-navigate-finish', handleNavigateFinish);
      console.warn('[content-script] 等待播放器超时');
      resolve(false);
    }, timeout);
  });
}
*/
```

### 3. 修改现有函数

#### 3.1 修改 initialize() 函数

**位置：** `src/content-scripts/content-script.ts:1009`

**改动：**

```typescript
async function initialize(): Promise<void> {
  try {
    // 检查是否为YouTube视频页面
    if (!isYouTubeVideoPage()) {
      console.log('[content-script] 非YouTube视频页面，跳过初始化');
      return;
    }

    // 注入主世界脚本
    injectMainWorldScript();

    // 初始化UI组件
    await initializeUIComponents();

    // 设置消息处理器
    setupMessageHandlers();

    // 🔑 刷新状态（从session读取最新状态并同步按钮UI）
    await refreshStates({ forcePopupClosed: true, reason: 'initialize' });

    // 启动视频切换检测
    startVideoChangeDetection();

    // 监听标签页可见性变化
    setupVisibilityChangeListener();

    // 初始化用户偏好管理器
    const userPreferencesManager = UserPreferencesManager.getInstance();
    await userPreferencesManager.initialize();

    // 设置监听器
    setupSourceLanguageChangeListener();
    setupTargetLanguageChangeListener();
    setupTranslationServiceChangeListener();

    isInitialized = true;
    console.log('[content-script] ✅ 初始化完成');

    // 🆕 新增：自动恢复翻译状态
    // 注意：必须在refreshStates()之后调用
    // 因为refreshStates()会同步按钮UI状态
    await autoRestoreTranslationIfNeeded();

  } catch (error) {
    console.error('[content-script] ❌ 初始化失败:', error);
  }
}
```

**关键点：**
- 保留现有的 `refreshStates()` 调用（第1028行）
- `refreshStates()` 会从session读取状态并同步按钮UI
- `autoRestoreTranslationIfNeeded()` 放在最后，检查状态并触发翻译
- 确保所有组件都已初始化完成
- 即使恢复失败，也不影响整体初始化

#### 3.2 修改 handleVideoChange() 函数

**位置：** `src/content-scripts/content-script.ts:1238`

**改动：**

```typescript
async function handleVideoChange(oldVideoId: string | null, newVideoId: string): Promise<void> {
  console.log(`[content-script] 视频切换检测: ${oldVideoId} → ${newVideoId}`);

  // 1. 清理临时变量
  capturedSourceLang = null;

  // 2. 销毁拦截器（如果存在）
  console.log('[content-script] 视频切换，销毁拦截器...');
  window.postMessage({
    source: 'content-script',
    type: 'DESTROY_SUBTITLE_INTERCEPTOR'
  }, '*');

  // 3. 清理字幕显示（使用SubtitleOverlay的API）
  subtitleOverlay.hide();

  // 4. 清除错误消息
  clearErrorMessage();

  // 5. 🆕 保存切换前的翻译状态(用于后续自动恢复)
  // 重要: 通过background获取session storage中的原始值,避免读取到被污染的缓存
  let shouldAutoRestore = false;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getAllState',
      data: { includeUserPreferences: false }
    });

    if (response?.success) {
      const previousState = response.data?.translateActive;
      shouldAutoRestore = previousState === 'active' || previousState === TranslateActiveState.ACTIVE;
      console.log('[content-script] 视频切换前翻译状态(background):', previousState, '| 需要恢复:', shouldAutoRestore);
    } else {
      console.warn('[content-script] 获取切换前状态失败:', response?.error);
    }
  } catch (error) {
    console.error('[content-script] 获取切换前状态失败:', error);
  }

  // 6. 重新读取全局状态并重置翻译状态(清理旧视频的翻译)
  try {
    await refreshStates({ forcePopupClosed: true, reason: 'videoChange' });
  } catch (error) {
    console.error('[content-script] 视频切换刷新状态失败:', error);
  }

  // 7. 确保按钮重新注入并应用最新状态
  try {
    await checkAndCreateButtons();
  } catch (error) {
    console.error('[content-script] 视频切换后重新创建按钮失败:', error);
  }

  // 8. 🆕 根据保存的状态决定是否自动恢复翻译
  // 如果切换前翻译是开启的,自动翻译新视频
  if (shouldAutoRestore) {
    console.log('[content-script] 视频切换后自动恢复翻译');
    await autoRestoreTranslationIfNeeded(true); // 强制恢复
  } else {
    console.log('[content-script] 视频切换前翻译未开启,不自动恢复');
  }

  console.log('[content-script] 视频切换处理完成');
}
```

**关键点：**
- **步骤5（新增）**: 在清理前先保存切换前的翻译状态,通过 background 读取原始 session 值
- **步骤6**: `refreshStates({ reason: 'videoChange' })` 会强制重置为 INACTIVE（清理旧视频）
- **步骤7**: 重新创建按钮
- **步骤8（新增）**: 根据保存的状态决定是否强制恢复翻译
- **forceRestore参数**: 视频切换场景使用 `forceRestore=true`,跳过状态检查

#### 3.3 修改 refreshStates() 函数 (🆕 v2.0新增)

**位置：** `src/content-scripts/content-script.ts:1209`

**改动：**

```typescript
async function refreshStates(options: { forcePopupClosed?: boolean; reason?: RefreshReason } = {}): Promise<void> {
  try {
    const { forcePopupClosed = true, reason = 'manual' } = options;

    // 🔑 关键修改：只有视频切换时才强制重置翻译状态
    // 其他场景(initialize, visibility)保持session状态,由autoRestore决定是否恢复
    const shouldForceInactive = reason === 'videoChange';

    const response = await chrome.runtime.sendMessage({
      type: 'getAllState',
      data: { includeUserPreferences: true }
    });

    if (response && response.success) {
      const { translateActive, popupOpen } = response.data;
      const resolvedTranslateActive = shouldForceInactive ? TranslateActiveState.INACTIVE : (translateActive || 'inactive');
      const resolvedPopupOpen = forcePopupClosed ? false : (popupOpen || false);

      if (stateManager) {
        await stateManager.updateStates({
          translateActive: resolvedTranslateActive,
          popupOpen: resolvedPopupOpen
        });
      }

      if (shouldForceInactive) {
        resetTranslateState(reason);
      }
    }
  } catch (error) {
    console.error('[content-script] 刷新状态失败:', error);
  }
}
```

**关键点：**
- **旧逻辑**: `shouldForceInactive = reason !== 'manual'` (除了手动刷新,都强制重置)
- **新逻辑**: `shouldForceInactive = reason === 'videoChange'` (只有视频切换才强制重置)
- **原因**: 页面刷新和Tab切换时,应该保持session状态,让 `autoRestore` 来决定是否恢复
- **影响**: `initialize` 和 `visibility` 场景不再强制重置,保持session状态

#### 3.4 修改 visibilitychange 监听器 (🆕 v2.0新增)

**位置：** `src/content-scripts/content-script.ts:209`

**改动：**

```typescript
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    console.log('[content-script] 标签页激活，刷新状态');
    try {
      await refreshStates({ forcePopupClosed: true, reason: 'visibility' });
      // 🆕 标签页激活后,自动恢复翻译状态
      await autoRestoreTranslationIfNeeded();
    } catch (error) {
      console.error('[content-script] 标签页激活刷新状态失败:', error);
    }
  }
});
```

**关键点：**
- 新增 `autoRestoreTranslationIfNeeded()` 调用
- 支持Tab切换回来时自动恢复翻译
- 与页面刷新场景逻辑一致

---

## 时序控制

### 关键事件时间轴

```
YouTube单页应用的加载过程：

T0: 用户点击视频链接 / 刷新页面
    ↓
T1: yt-navigate-start 事件触发
    ↓
    URL开始变化

T2: URL更新完成
    ↓
    window.location.href 已变化

T3: YouTube开始加载视频数据
    ↓
    播放器DOM元素可能还未就绪

T4: 播放器DOM元素创建
    ↓
    .html5-video-player 元素可查询

T5: 播放器完全初始化
    ↓
    可以安全调用播放器API
    可以开始翻译流程 ✅
```

### 等待播放器的策略选择

**对比三种方案：**

| 方案 | 触发时间 | 可靠性 | 复杂度 | 当前使用 |
|------|----------|--------|--------|---------|
| **轮询检测DOM** | 检测到`.html5-video-player` | 🟢 高 | 🟢 低 | ❌ 否 |
| yt-navigate-finish | YouTube导航结束 | 🟡 中 | 🟡 中 | ✅ 是（视频切换） |
| yt-page-data-updated | 页面数据更新 | 🟡 中 | 🟡 中 | ❌ 否 |

**选择轮询方案的理由：**
1. ✅ 最简单直接，不依赖YouTube事件
2. ✅ 兼容性最好，适用于所有YouTube版本
3. ✅ 超时控制清晰，10秒内必有结果
4. ✅ 性能影响可控（每500ms检查一次）
5. ✅ 当前代码中已在使用 `yt-navigate-finish`，可以共存

### 轮询机制的实现细节

**核心逻辑：**
```typescript
// 每500ms检查一次播放器DOM
for (let i = 0; i < 20; i++) {  // 最多20次 = 10秒
  const player = document.querySelector('.html5-video-player');
  if (player) return true;  // 找到播放器 ✅
  await new Promise(resolve => setTimeout(resolve, 500));
}
return false;  // 超时失败 ❌
```

**性能影响：**
- CPU占用：每500ms执行一次querySelector，几乎无影响
- 内存占用：单次循环，无内存泄漏风险
- 用户体验：最快500ms检测到，平均2.5秒（通常1-2秒即可检测到）

**与事件方案的对比：**
- 轮询方案：简单、可靠、性能可控 ✅
- 事件方案：复杂、依赖YouTube实现、可能不触发 ⚠️

---

## 风险评估

### 风险1：时序竞争（高风险 ⚠️）

**问题描述：**
```
场景：用户快速刷新页面2次
T0: 第1次刷新 → autoRestore() 开始执行
T1: 第2次刷新 → Content Script 被销毁
T2: autoRestore() 尝试访问已销毁的DOM → 报错 ❌
```

**解决方案：**
```typescript
// 方案1：检查isInitialized标志
if (!isInitialized) {
  console.log('Content Script已销毁，跳过恢复');
  return;
}

// 方案2：使用try-catch包裹翻译调用
try {
  await toggleTranslation();
} catch (error) {
  if (error.message.includes('destroyed')) {
    console.log('Content Script已销毁，中止恢复');
    return;
  }
  throw error;
}
```

### 风险2：重复触发（中风险 ⚠️）

**问题描述：**
```
场景：用户在自动恢复过程中点击翻译开关
T0: autoRestore() 开始执行（translateActive → PENDING）
T1: 用户点击开关 → handleUserAction() 执行
T2: 两个翻译流程同时运行 → 资源浪费 / 状态混乱 ❌
```

**解决方案：**
```typescript
// 使用标志位防止重复
let isAutoRestoring = false;

async function autoRestoreTranslationIfNeeded() {
  if (isAutoRestoring) return;  // 去重 ✅

  isAutoRestoring = true;
  try {
    // ... 恢复逻辑
  } finally {
    isAutoRestoring = false;  // 确保重置
  }
}
```

### 风险3：播放器未就绪（中风险 ⚠️）

**问题描述：**
```
场景：网络慢，YouTube播放器加载超时
T0: autoRestore() 开始执行
T1: waitForPlayer() 等待10秒
T2: 超时 → 播放器仍未就绪
T3: 触发翻译 → 获取字幕失败 ❌
```

**解决方案：**
```typescript
// 方案1：设置合理的超时时间（10秒）
const playerReady = await waitForYouTubePlayer(10000);
if (!playerReady) {
  console.log('播放器未就绪，跳过恢复');
  return;  // 优雅降级 ✅
}

// 方案2：失败后重置状态，避免持续尝试
catch (error) {
  await runtimeStateManager.setTranslateActive(
    TranslateActiveState.INACTIVE
  );
}
```

### 风险4：API限流（低风险 ⚠️）

**问题描述：**
```
场景：用户短时间内刷新多次页面
T0: 第1次刷新 → 触发翻译API
T1: 第2次刷新 → 触发翻译API
T2: 第3次刷新 → 触发翻译API
→ 短时间内多次调用API → 可能触发限流 ❌
```

**解决方案：**
```typescript
// 方案1：优先使用翻译缓存（已实现 ✅）
// handleToggleTranslateV4() 会先查缓存
// 如果缓存命中，不会调用API

// 方案2：限制自动恢复频率（可选）
let lastAutoRestoreTime = 0;
const MIN_INTERVAL = 3000; // 最小间隔3秒

async function autoRestoreTranslationIfNeeded() {
  const now = Date.now();
  if (now - lastAutoRestoreTime < MIN_INTERVAL) {
    console.log('恢复频率过高，跳过');
    return;
  }

  lastAutoRestoreTime = now;
  // ... 恢复逻辑
}
```

### 风险矩阵

| 风险 | 概率 | 影响 | 风险等级 | 缓解措施 |
|------|------|------|---------|---------|
| 时序竞争 | 中 | 高 | ⚠️ 高 | 检查isInitialized + try-catch |
| 重复触发 | 中 | 中 | ⚠️ 中 | 标志位去重 |
| 播放器未就绪 | 低 | 中 | ⚠️ 低 | 超时+备用轮询 |
| API限流 | 低 | 低 | ✅ 低 | 缓存优先+频率限制 |

---

## 实施计划

### 阶段1：核心功能实现（30分钟）

**目标：** 实现基本的自动恢复功能

**任务清单：**
- [ ] 实现 `autoRestoreTranslationIfNeeded()` 函数
- [ ] 实现 `waitForYouTubePlayer()` 函数
- [ ] 修改 `initialize()` 函数，添加恢复调用
- [ ] 添加去重标志位 `isAutoRestoring`
- [ ] 添加基础日志输出

**验证方式：**
1. 开启翻译
2. 刷新页面（F5）
3. 观察控制台日志
4. 确认翻译自动恢复

### 阶段2：视频切换支持（15分钟）

**目标：** 支持视频切换场景

**任务清单：**
- [ ] 修改 `handleVideoChange()` 函数
- [ ] 添加视频切换后的恢复调用
- [ ] 测试视频切换场景

**验证方式：**
1. 在视频A开启翻译
2. 点击推荐视频B
3. 确认视频B自动开启翻译

### 阶段3：鲁棒性增强（20分钟）

**目标：** 处理边界情况和错误

**任务清单：**
- [ ] 实现轮询备用方案
- [ ] 添加超时处理
- [ ] 添加失败后的状态重置
- [ ] 添加频率限制（可选）
- [ ] 完善错误日志

**验证方式：**
1. 模拟网络慢场景（Chrome DevTools限速）
2. 快速刷新页面3次
3. 确认不会崩溃或死循环

### 阶段4：用户体验优化（可选，15分钟）

**目标：** 提升用户感知

**任务清单：**
- [ ] 显示"正在恢复翻译..."提示（可选）
- [ ] 在Popup中新增"自动恢复翻译"开关（可选）
- [ ] 优化日志输出（简化非错误日志）

### 总计时间：65-80分钟

---

## 测试验证

### 测试用例

#### 用例1：页面刷新恢复

**前置条件：**
- 已在视频A开启翻译
- 双语字幕正常显示

**操作步骤：**
1. 按F5刷新页面
2. 等待页面加载完成

**预期结果：**
- ✅ 翻译开关按钮显示为"已激活"
- ✅ 双语字幕自动显示
- ✅ 控制台显示"自动恢复翻译"日志

#### 用例2：视频切换恢复

**前置条件：**
- 已在视频A开启翻译

**操作步骤：**
1. 点击右侧推荐视频B
2. 等待新视频加载

**预期结果：**
- ✅ 视频B的翻译开关显示为"已激活"
- ✅ 视频B的双语字幕自动显示
- ✅ 控制台显示"视频切换后自动恢复"日志

#### 用例3：手动关闭后不恢复

**前置条件：**
- 已在视频A开启翻译

**操作步骤：**
1. 点击翻译开关，关闭翻译
2. 刷新页面

**预期结果：**
- ✅ 翻译开关显示为"未激活"
- ✅ 不显示双语字幕
- ✅ 控制台显示"翻译状态非active，无需恢复"

#### 用例4：关闭浏览器重置

**前置条件：**
- 已在视频A开启翻译

**操作步骤：**
1. 完全关闭Chrome浏览器
2. 重新打开浏览器
3. 访问YouTube视频

**预期结果：**
- ✅ 翻译开关显示为"未激活"
- ✅ session存储已清空
- ✅ 不自动开启翻译

#### 用例5：快速刷新鲁棒性

**前置条件：**
- 已在视频A开启翻译

**操作步骤：**
1. 快速按F5刷新3次（间隔<1秒）

**预期结果：**
- ✅ 不崩溃、不报错
- ✅ 最终翻译正常恢复
- ✅ 没有重复调用API（检查网络面板）

#### 用例6：网络慢场景

**前置条件：**
- 已在视频A开启翻译
- Chrome DevTools限速到"Slow 3G"

**操作步骤：**
1. 刷新页面
2. 等待最多15秒

**预期结果：**
- ✅ 如果播放器10秒内加载完成，翻译自动恢复
- ✅ 如果播放器10秒未就绪，优雅降级（跳过恢复）
- ✅ 控制台显示"播放器未就绪"日志

### 测试矩阵

| 场景 | 翻译状态 | 操作 | 预期结果 |
|------|---------|------|---------|
| 1 | ACTIVE | 刷新页面 | ✅ 自动恢复 |
| 2 | ACTIVE | 切换视频 | ✅ 自动恢复 |
| 3 | INACTIVE | 刷新页面 | ✅ 不恢复 |
| 4 | ACTIVE | 关闭浏览器重开 | ✅ 不恢复（重置） |
| 5 | ACTIVE | 快速刷新3次 | ✅ 恢复1次（去重） |
| 6 | ACTIVE | 网络慢 | ✅ 超时降级 |

### 性能指标

**目标：**
- 自动恢复延迟 < 2秒（从页面加载完成到字幕显示）
- 内存占用增加 < 1MB
- 不增加API调用次数（依赖缓存）

**测量方法：**
```javascript
// 在 autoRestoreTranslationIfNeeded() 中添加性能埋点
const startTime = performance.now();

// ... 恢复逻辑

const endTime = performance.now();
console.log(`[性能] 自动恢复耗时: ${endTime - startTime}ms`);
```

---

## 附录

### A. 相关文件清单

**需要修改的文件：**
- `src/content-scripts/content-script.ts` - 主要改动
- `docs/architecture/16-session-auto-restore-architecture.md` - 本文档

**不需要修改的文件：**
- `src/shared/types/runtime-state-types.ts` - 存储区域保持session
- `src/shared/storage/runtime-state-manager.ts` - 存储逻辑不变
- `src/background/handle-toggle-translate-v4.ts` - 翻译流程不变

### B. 代码位置索引

| 函数/逻辑 | 文件路径 | 行号（参考） |
|----------|---------|------------|
| initialize() | content-script.ts | 1009 |
| handleVideoChange() | content-script.ts | 1238 |
| toggleTranslation() | content-script.ts | 312 |
| checkAndCreateButtons() | content-script.ts | 149 |
| refreshStates() | content-script.ts | 1057 |
| RuntimeStateManager.getTranslateState() | runtime-state-manager.ts | 349 |
| RuntimeStateManager.setTranslateState() | runtime-state-manager.ts | 383 |
| handleToggleTranslateV4() | handle-toggle-translate-v4.ts | 45 |

**注意：** 行号可能因代码更新而变化，以实际代码为准

### C. 参考资料

**Chrome Extension API:**
- [chrome.storage.session](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session)
- [Content Scripts Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

**YouTube API:**
- [YouTube Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Events (yt-navigate, yt-page-data-updated)](https://github.com/topics/youtube-events)

**项目内部文档:**
- [08-abort-timeout-architecture.md](./08-abort-timeout-architecture.md) - AbortController架构
- [07-batch-translation-architecture.md](./07-batch-translation-architecture.md) - 批量翻译架构

---

**文档结束**

---

## 📝 版本历史

### v2.0 (2025-11-03) - 实现完成版（当前版本）

**状态：** ✅ 已实现并部分测试通过

**核心改动：**

1. **状态读取优化** ⭐关键修复
   - 从 RuntimeStateManager 改为优先从 StateManager 读取
   - 解决缓存延迟导致的状态不一致问题
   - 降级方案：StateManager 不存在时使用 RuntimeStateManager

2. **翻译触发方式重构** ⭐核心变更
   - 旧方式：重置为 INACTIVE → 调用 `toggleTranslation()`
   - 新方式：设置为 PENDING → 直接发送 TOGGLE_TRANSLATE 消息
   - 符合状态机规范：ACTIVE → PENDING → ACTIVE
   - 避免非法状态转换警告

3. **视频切换强制恢复** ⭐新增功能
   - 新增 `forceRestore` 参数支持强制恢复
   - 视频切换前通过 background 保存原始状态
   - 避免 content script 直接访问 session storage（权限限制）
   - 切换后根据保存状态决定是否恢复

4. **refreshStates() 逻辑优化** ⭐行为变更
   - 旧逻辑：`reason !== 'manual'` 都强制重置
   - 新逻辑：只有 `reason === 'videoChange'` 才强制重置
   - `initialize` 和 `visibility` 保持 session 状态

5. **Tab切换支持** ⭐新增场景
   - 新增 `visibilitychange` 监听器中的自动恢复调用
   - 支持 Tab 切换回来时自动恢复翻译
   - 支持新标签页打开时自动恢复

**测试状态：**
- ✅ 页面刷新：保持状态并自动恢复
- ✅ 页面导航：切换视频后自动翻译
- ⚠️ Tab切换：部分实现（按钮状态正确，翻译流程待优化）
- ✅ 状态转换：无非法转换警告

**已知问题：**
- Tab切换场景的翻译执行流程需进一步优化
- 极端情况下的时序竞争待测试

---

### v1.1 (2025-11-03) - 代码匹配度核对版
**主要更新：**
1. ✅ 修正所有API方法名：`getTranslateActive()` → `getTranslateState()`
2. ✅ 修正触发翻译方式：改为直接调用 `toggleTranslation()`
3. ✅ 新增状态重置逻辑：确保 `toggleTranslation()` 能正确判断为"开启"操作
4. ✅ 更新等待播放器策略：使用轮询检测DOM（最稳定）
5. ✅ 补充 `refreshStates()` 调用说明
6. ✅ 更新 `handleVideoChange()` 函数签名和流程
7. ✅ 完善代码位置索引

---

### v1.0 (2025-11-03) - 初始设计版
**主要内容：**
- 完整的架构设计方案
- 核心概念和技术实现
- 风险评估和测试验证
