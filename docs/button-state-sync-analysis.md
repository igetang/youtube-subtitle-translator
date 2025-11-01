# 按钮状态全局同步机制分析

> 更新时间：2025-11-01  
> 适用分支：`feature/concurrent-translation`

---

## 🎯 总览

翻译开关与翻译设置（Popup）按钮共享统一的运行时状态模型，依赖 `runtime-state-manager` + `chrome.storage.session` 实现跨标签页、刷新与 SPA 导航的一致体验。核心设计遵循“按钮被动读取、后台统一写入、Popup 自行关闭”的原则，避免状态错乱或界面悬挂。

---

## 🧱 状态模型

| 状态键 | 存储位置 | 取值 | 说明 |
| --- | --- | --- | --- |
| `runtime_state_translateActive` | `chrome.storage.session` | `'inactive' \| 'pending' \| 'active'` | 翻译开关全局状态 |
| `runtime_state_popupOpen` | `chrome.storage.session` | `false \| true` | 翻译设置（Popup）开启状态 |

- `runtime-state-manager` 在后台维持缓存，并通过 `chrome.storage.onChanged` 监听多进程场景。
- 内容脚本通过 `StateManager.updateState(s)` 统一写入，`UIRenderer` 仅被动渲染。

---

## 🔄 关键数据流

### 1. 翻译开关状态保存
```
用户点击按钮
  ↓
content-script → StateManager.updateState('translateActive', nextState)
  ↓
service-worker → handleRuntimeStateSet()
  ↓
runtime-state-manager.setTranslateState(nextState)
  ↓
chrome.storage.session['runtime_state_translateActive'] = nextState
```

### 2. 状态读取（翻译 + Popup）
```
content-script.refreshStates({ forcePopupClosed: true })
  ↓
service-worker.handleGetAllState()
  ↓
runtime-state-manager.getAllState()
  ↓
StateManager.updateStates({
  translateActive: storedValue || 'inactive',
  popupOpen: forcePopupClosed ? false : storedPopup
})
  ↓
UIRenderer.update() → 同步两个按钮
```

### 3. Popup 打开 & 强制关闭
```
content-script.togglePopup()
  ↓
service-worker.handleOpenPopup()
  ↓
chrome.action.openPopup()
  ↓
popup.ts 连接 popup-lifecycle Port，postMessage({ tabId })
  ↓
runtime-state-manager.setPopupState(true)
--------------------------------------------
导航/刷新/标签激活 → refreshStates({ forcePopupClosed: true })
  ↓
runtime-state-manager.setPopupState(false)
  ↓
service-worker.forceCloseAllPopups()
  ↓
port.postMessage({ type: 'force-close' })
  ↓
popup.ts 接收消息 → window.close()
```

---

## 🧩 代码要点

### 内容脚本 `src/content-scripts/content-script.ts`
- `initialize()`：注入主世界脚本后立即 `refreshStates({ forcePopupClosed: true })`；注册 `setupVisibilityChangeListener()` 保证标签激活时刷新状态。
- `refreshStates(options)`：默认 `forcePopupClosed = true`，同时刷新翻译与 Popup 状态，并通过 `StateManager.updateStates` 通知 UI。
- `handleVideoChange()`：清理临时变量 → `refreshStates({ forcePopupClosed: true })` → `checkAndCreateButtons()`，确保 SPA 导航后按钮/Popup 状态正确。
- `StateManager`：批量写入只负责消息派发，不直接操控 DOM。

### 后台 `src/background/service-worker.ts`
- `runtime-state-manager`：封装状态写入，并向监听者广播枚举事件。
- `popupPortRegistry`：记录 `tabId → port`，在 `POPUP_STATE_CHANGED` 为 `false` 时调用 `forceCloseAllPopups()`。
- `setupPortListener()`：Popup 连接时登记端口，断开时移除并回写 `popupOpen = false`，避免悬挂引用。

### Popup `src/popup/popup.ts`
- 连接 `popup-lifecycle` Port 后发送 `{ type: 'init', tabId }` 给后台。
- 监听 `port.onMessage`，收到 `{ type: 'force-close' }` 后执行 `window.close()` 主动收起界面。

---

## 📚 典型场景

| 场景 | 翻译按钮表现 | 设置按钮 / Popup 表现 | 说明 |
| --- | --- | --- | --- |
| 首次进入视频 | 根据全局状态显示（默认 `inactive`） | 未激活，Popup 关闭 | `initialize()` → `refreshStates()` |
| 手动开启翻译 | `inactive → pending → active` | 不受影响 | 状态写入由 StateManager 完成 |
| 手动打开设置 | 状态保持不变 | Popup 打开，`popupOpen = true` | Popup 连接 Port，后台登记 |
| 刷新 / SPA 导航 | 保留翻译全局状态 | `forcePopupClosed` → Popup 立即关闭 | `handleVideoChange()` 路径 |
| 标签切换离开 → 返回 | 状态同步（无需手动刷新） | 保持未激活 | `visibilitychange` 触发刷新 |
| 多标签同步 | 各标签读取同一枚举值 | 默认未激活，需手动再开 | 所有状态均通过被动读取 |

---

## ✅ 测试清单

1. **刷新恢复**：开启翻译 & Popup → 刷新 → 翻译按钮保持开启，Popup 收起。
2. **跨标签**：Tab A 开启翻译 → 切到 Tab B → 翻译按钮显示开启，设置按钮未激活。
3. **SPA 导航**：同标签跳视频 → 翻译状态保留，Popup 立即消失。
4. **标签切换**：切到其它网站再返回 → 状态保持一致。
5. **双 Popup**：两个标签同时打开 Popup → 其中任一导航时，两端 Popup 均收起。

---

## 🧭 后续优化（可选）
- 为翻译状态引入按视频 ID 记忆策略（local storage 分桶）。
- 对 `forceCloseAllPopups()` 增加重试与详细日志，便于诊断端口中断。
- 考虑在 UI 上增加状态同步提示或动画，提升可见性。

---

## 🏁 总结

当前方案通过“被动读取 + 统一写入 + Popup 强制关闭”三段式设计，让翻译开关与翻译设置按钮在任何页面状态变更后仍能保持一致、可控与安全的表现，大幅降低了多标签、多导航场景下出现状态漂移或残留界面的风险。
