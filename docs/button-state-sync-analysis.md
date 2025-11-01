# 按钮状态全局同步机制分析

## 概述

本文档分析YouTube字幕翻译插件的按钮状态同步机制，采用**全局状态设计**（类似YouTube自身的CC字幕按钮）。

## 设计原则

### 全局状态存储

- **存储位置**：`chrome.storage.session['runtime_state_translateActive']`
- **存储值**：`'inactive'` | `'pending'` | `'active'`
- **特点**：所有标签页共享**同一个**存储位置

### 同步策略：被动读取（Pull模式）

不采用广播通知（Push），而是在需要时主动读取：

```
保存：当前页面改变状态 → 写入 chrome.storage.session
读取：页面激活/刷新/切换时 → 读取 chrome.storage.session → 更新UI
```

**优点：**
- 实现简单，逻辑清晰
- 没有死循环问题
- 性能好（按需读取）
- 符合Chrome扩展最佳实践

---

## 核心流程

### 流程1：状态保存

```
用户点击翻译按钮
  ↓
content-script: toggleTranslation()
  ↓
StateManager.updateState('translateActive', 'pending')
  ↓
chrome.runtime.sendMessage({ type: 'setRuntimeState', stateKey: 'translateActive', value: 'pending' })
  ↓
service-worker: RuntimeStateManager.setTranslateState('pending')
  ↓
chrome.storage.session.set('runtime_state_translateActive', 'pending')
  ↓
【完成】状态已保存到全局存储
```

### 流程2：状态读取

```
页面激活/刷新/视频切换
  ↓
content-script: refreshStates()
  ↓
chrome.runtime.sendMessage({ type: 'getAllState' })
  ↓
service-worker: RuntimeStateManager.getAllState()
  ↓
chrome.storage.session.get('runtime_state_translateActive')
  ↓
返回状态值（如 'active'）
  ↓
StateManager.updateStates({ translateActive: 'active' })
  ↓
uiRenderer.update() → 更新按钮UI
  ↓
【完成】按钮显示正确状态
```

---

## 使用场景

### 场景1：首次打开视频页面

```
用户打开 youtube.com/watch?v=abc123
  ↓
content-script 初始化
  ↓
调用 refreshStates() 读取状态
  ↓
storage['translateActive'] = 'inactive'（默认值）
  ↓
按钮显示：关闭图标
```

### 场景2：点击翻译按钮

```
用户点击按钮
  ↓
保存 storage['translateActive'] = 'pending'
  ↓
按钮显示：处理中...
  ↓
翻译完成，保存 storage['translateActive'] = 'active'
  ↓
按钮显示：开启图标
```

### 场景3：页面刷新

```
刷新前：storage['translateActive'] = 'active'
  ↓
页面刷新，content-script 重新初始化
  ↓
调用 refreshStates() 读取状态
  ↓
读取到 'active'
  ↓
按钮显示：开启图标
  ↓
✅ 状态恢复成功
```

### 场景4：标签页切换

```
标签页A：翻译=开启，storage['translateActive'] = 'active'
  ↓
切换到标签页B（新打开的YouTube页面）
  ↓
标签页B初始化 → refreshStates()
  ↓
读取到 'active'
  ↓
标签页B的按钮也显示：开启图标
  ↓
✅ 全局状态同步成功
```

### 场景5：标签页失焦后重新聚焦

```
用户从YouTube标签页切换到其他网站
  ↓
【不触发任何逻辑】
  ↓
用户切回YouTube标签页
  ↓
触发 visibilitychange 事件
  ↓
【需要实现】调用 refreshStates() 读取最新状态
  ↓
更新按钮UI
```

### 场景6：视频切换（SPA导航）

```
标签页A：视频1，翻译=开启
  ↓
切换到视频2
  ↓
触发 handleVideoChange()
  ↓
【当前实现】强制重置为 'inactive' ❌
【应该改为】读取 storage['translateActive'] ✅
  ↓
按钮显示全局状态
```

---

## 当前实现状态

### ✅ 已实现

1. **状态保存机制**
   - 文件：`src/shared/components/state-manager.ts`
   - 方法：`StateManager.updateState()`
   - 流程：content-script → service-worker → chrome.storage.session

2. **状态读取机制**
   - 文件：`src/content-scripts/content-script.ts`
   - 方法：`refreshStates()`
   - 流程：content-script → service-worker → chrome.storage.session

3. **页面初始化时读取**
   - 文件：`src/content-scripts/content-script.ts:973-1012`
   - 方法：`initialize() → refreshStates()`
   - 时机：content-script加载时自动调用

4. **storage自动同步机制**
   - 文件：`src/shared/storage/runtime-state-manager.ts:57-87`
   - 方法：`setupStorageListener()`
   - 功能：监听 `chrome.storage.onChanged`，自动更新内存缓存

### ❌ 缺失/需要修改

1. **标签页激活时读取状态**
   - **问题**：当用户从其他网站切回YouTube时，按钮状态不更新
   - **需要添加**：监听 `visibilitychange` 事件
   - **位置**：`src/content-scripts/content-script.ts`

   ```typescript
   // 监听标签页可见性变化
   document.addEventListener('visibilitychange', async () => {
     if (document.visibilityState === 'visible') {
       console.log('[content-script] 标签页激活，刷新状态');
       await refreshStates();
     }
   });
   ```

2. **视频切换时不应强制重置状态**
   - **问题**：切换视频时强制设置 `translateActive = 'inactive'`
   - **位置**：`src/content-scripts/content-script.ts:1190-1227`
   - **当前代码**：
   ```typescript
   async function handleVideoChange(oldVideoId: string | null, newVideoId: string): Promise<void> {
     // 1. 重置翻译状态为关闭 ❌
     if (stateManager) {
       await stateManager.updateStates({
         translateActive: TranslateActiveState.INACTIVE
       });
     }
   ```
   - **应该改为**：
   ```typescript
   async function handleVideoChange(oldVideoId: string | null, newVideoId: string): Promise<void> {
     // 1. 清理UI和临时状态
     capturedSourceLang = null;
     subtitleOverlay.hide();
     clearErrorMessage();

     // 2. 重新读取全局状态（保持与其他标签页一致）
     await refreshStates();

     // 3. 不要强制重置状态，让全局状态生效
   ```

3. **service-worker监听器只打印日志**
   - **位置**：`src/background/service-worker.ts:1961-1978`
   - **当前代码**：
   ```typescript
   runtimeStateManager.addChangeListener(
     RuntimeStateChangeEvent.TRANSLATE_ACTIVE_CHANGED,
     (newValue, oldValue) => {
       console.log(`[service-worker] 状态变更: translateState [${oldValue} → ${newValue}]`);
       // ❌ 只打印日志，没有其他处理
     }
   );
   ```
   - **说明**：这个监听器**不需要广播**，因为采用被动读取策略。但可以在这里添加其他业务逻辑（如果需要）。

---

## 需要修改的代码

### 修改1：添加标签页激活监听

**文件**：`src/content-scripts/content-script.ts`

**位置**：在 `initialize()` 函数中添加

```typescript
async function initialize(): Promise<void> {
  try {
    // ... 现有初始化代码 ...

    // 启动视频切换检测
    startVideoChangeDetection();

    // 【新增】监听标签页激活
    setupVisibilityChangeListener();

    isInitialized = true;
    console.log('[content-script] ✅ 初始化完成');
  } catch (error) {
    console.error('[content-script] ❌ 初始化失败:', error);
  }
}

/**
 * 【新增】设置标签页可见性监听器
 */
function setupVisibilityChangeListener(): void {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('[content-script] 标签页激活，刷新状态');
      await refreshStates();
    }
  });

  console.log('[content-script] 标签页可见性监听器已设置');
}
```

### 修改2：视频切换时不强制重置状态

**文件**：`src/content-scripts/content-script.ts`

**函数**：`handleVideoChange()`（第1190行）

**修改前**：
```typescript
async function handleVideoChange(oldVideoId: string | null, newVideoId: string): Promise<void> {
  console.log(`[content-script] 视频切换检测: ${oldVideoId} → ${newVideoId}`);

  // 1. 重置翻译状态为关闭
  if (stateManager) {
    await stateManager.updateStates({
      translateActive: TranslateActiveState.INACTIVE
    });
  }

  // 2. 清理临时变量
  capturedSourceLang = null;

  // 2.5. 销毁拦截器
  window.postMessage({
    source: 'content-script',
    type: 'DESTROY_SUBTITLE_INTERCEPTOR'
  }, '*');

  // 3. 清理字幕显示
  subtitleOverlay.hide();

  // 4. 更新按钮状态
  if (uiRenderer) {
    const translateButton = document.getElementById('youtube-translate-button');
    if (translateButton) {
      translateButton.classList.remove('active');
      translateButton.setAttribute('aria-pressed', 'false');
    }
  }

  // 5. 清除错误消息
  clearErrorMessage();

  console.log('[content-script] 视频切换重置完成');
}
```

**修改后**：
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

  // 5. 【修改】重新读取全局状态，而不是强制重置
  // 这样可以保持与其他标签页的状态一致
  await refreshStates();

  console.log('[content-script] 视频切换处理完成');
}
```

---

## 测试验证

### 测试用例1：页面刷新保持状态

1. 打开YouTube视频，开启翻译
2. 刷新页面（F5）
3. **预期**：按钮显示"开启"状态

### 测试用例2：标签页切换同步状态

1. 标签页A：打开视频1，开启翻译
2. 标签页B：打开视频2
3. **预期**：标签页B的按钮也显示"开启"状态

### 测试用例3：视频切换保持全局状态

1. 视频1：开启翻译
2. 切换到视频2（同一标签页）
3. **预期**：按钮仍显示"开启"状态（全局状态）

### 测试用例4：标签页失焦后重新聚焦

1. 标签页A：打开视频，开启翻译
2. 切换到其他网站标签页
3. 切回标签页A
4. **预期**：按钮显示"开启"状态（验证需要修改1）

### 测试用例5：多标签页协同工作

1. 标签页A：视频1，翻译=关闭
2. 标签页B：视频2，翻译=关闭
3. 在标签页A开启翻译
4. 切换到标签页B
5. **预期**：标签页B的按钮也显示"开启"状态

---

## 后续优化方向（可选）

### 按视频ID独立状态（如果需要）

如果未来需要每个视频独立记住翻译状态，需要修改存储结构：

**当前结构**：
```typescript
chrome.storage.session['runtime_state_translateActive'] = 'active'
```

**改进结构**：
```typescript
chrome.storage.local['video_translation_states'] = {
  'video_abc123': 'active',
  'video_def456': 'inactive',
  'video_ghi789': 'active'
}
```

**需要修改**：
1. 存储管理器：新增 `VideoTranslationStateManager`
2. `refreshStates()`：根据当前 videoId 读取对应状态
3. `handleVideoChange()`：读取新视频的状态而不是全局状态

---

## 总结

当前设计采用**全局状态**，所有标签页共享同一个翻译状态，这与YouTube自身的行为一致。

**核心机制**：
- 保存：当前页面改变 → 写入全局存储
- 读取：页面激活/刷新/切换 → 读取全局存储 → 更新UI

**需要完成的修改**：
1. ✅ 添加标签页激活监听（`visibilitychange`）
2. ✅ 视频切换时读取状态而不是重置

完成这两处修改后，按钮状态将在所有场景下正确同步。
