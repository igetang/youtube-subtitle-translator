# AbortController超时架构集成指南

## 概述
本指南说明如何将新的AbortController超时架构（v4.0）集成到现有的service-worker.ts中。

## 文件清单

### 新增文件
1. `abort-timeout-manager.ts` - 会话管理器
2. `translation-session.ts` - 翻译会话类
3. `timeout-errors.ts` - 错误类型定义
4. `message-with-signal.ts` - 支持信号的消息传递
5. `two-phase-translator-v4.ts` - 支持信号的翻译器
6. `service-worker-refactored.ts` - 重构后的处理函数示例

### 需要修改的文件
1. `service-worker.ts` - 主服务文件
2. `content-script.ts` - 内容脚本（可选）

## 集成步骤

### Step 1: 导入新模块

在service-worker.ts顶部添加：

```typescript
// === 超时架构v4.0组件导入 ===
import { abortTimeoutManager } from './components/abort-timeout-manager';
import { TranslationSession } from './components/translation-session';
import { 
  StageTimeoutError, 
  SessionAbortError, 
  isTimeoutError, 
  isAbortError,
  getUserFriendlyMessage,
  getErrorLevel,
  ErrorLevel
} from '../shared/types/timeout-errors';
import { 
  sendMessageWithSignal, 
  fetchSubtitlesWithSignal,
  triggerSubtitleLoadWithSignal 
} from './components/message-with-signal';
import { TwoPhaseTranslatorV4 } from './components/two-phase-translator-v4';
```

### Step 2: 替换handleToggleTranslate函数

将现有的handleToggleTranslate函数替换为新版本。主要改动：

```typescript
async function handleToggleTranslate(
  sender: chrome.runtime.MessageSender, 
  data: ToggleTranslateRequest
): Promise<ToggleTranslateResponse> {
  const { videoId, newState } = data;
  const tabId = sender.tab?.id;
  
  if (!tabId) {
    return { success: false, error: '无法获取标签页信息' };
  }
  
  const sessionId = `translate_${tabId}_${videoId}`;
  
  // 关闭翻译
  if (!newState) {
    if (abortTimeoutManager.hasSession(sessionId)) {
      abortTimeoutManager.abortSession(sessionId);
    }
    await runtimeStateManager.setTranslateState(TranslateActiveState.INACTIVE);
    return { success: true, action: 'stopped' };
  }
  
  // 开启翻译 - 创建会话
  const session = abortTimeoutManager.createSession(sessionId);
  
  try {
    // 使用session.executeStage执行各阶段
    // ... 详见service-worker-refactored.ts
  } catch (error) {
    session.abort(error.message);
    // 错误处理
  }
}
```

### Step 3: 修改消息处理

在SUBTITLE_DATA消息处理中，改为使用新的会话管理：

```typescript
case 'SUBTITLE_DATA':
  // 旧代码：清除watchdog
  // watchdogManager.clearWatchdog(subtitleWatchdogKey);
  
  // 新代码：通知会话收到数据
  const sessionId = `translate_${sender.tab?.id}_${data.videoId}`;
  if (abortTimeoutManager.hasSession(sessionId)) {
    // 数据已收到，会话会自动处理
    console.log('[service-worker] 收到字幕数据，会话继续');
  }
  break;
```

### Step 4: 更新continueTranslationWithSubtitles

改造此函数以支持会话和信号：

```typescript
async function continueTranslationWithSubtitles(
  data: any,
  session: TranslationSession
): Promise<any> {
  const translator = new TwoPhaseTranslatorV4();
  
  // 紧急翻译
  const urgentResults = await session.executeStage(
    'urgent_translate',
    async (signal) => {
      return await translator.translateUrgent(
        data.subtitles,
        data.currentTime,
        preferences,
        signal
      );
    },
    { timeoutMs: 5000, fallback: [] }
  );
  
  // 批量翻译
  const batchResults = await session.executeStage(
    'batch_translate',
    async (signal) => {
      return await translator.translateBatch(
        data.subtitles,
        urgentResults,
        preferences,
        signal
      );
    },
    { timeoutMs: 5000, fallback: data.subtitles }
  );
  
  // ... 处理结果
}
```

### Step 5: 清理旧代码

1. 移除SimpleWatchdogManager的使用
2. 移除activeAbortControllers Map
3. 移除旧的超时处理逻辑

## 测试方案

### 1. 单元测试
```typescript
// 测试超时
const session = abortTimeoutManager.createSession('test');
try {
  await session.executeStage(
    'test_timeout',
    async () => {
      await new Promise(resolve => setTimeout(resolve, 6000));
    },
    { timeoutMs: 5000 }
  );
} catch (error) {
  assert(error instanceof StageTimeoutError);
}
```

### 2. 集成测试
1. 测试字幕获取超时（5秒）
2. 测试用户取消翻译
3. 测试紧急翻译超时降级
4. 测试批量翻译超时降级

### 3. 手动测试
1. 打开YouTube视频
2. 点击翻译按钮
3. 观察控制台日志
4. 验证超时处理
5. 验证用户取消

## 注意事项

### 兼容性
- AbortSignal.timeout() 需要Chrome 103+
- AbortSignal.any() 需要Chrome 116+
- 提供了降级方案在translation-session.ts中

### 性能影响
- 每个会话约2KB内存
- 信号创建<1ms
- 无明显性能影响

### 迁移风险
- 保留SimpleWatchdogManager作为备份
- 可通过feature flag控制启用：
```typescript
const USE_ABORT_ARCHITECTURE = true;
if (USE_ABORT_ARCHITECTURE) {
  // 新架构
} else {
  // 旧架构
}
```

## 回滚方案

如果出现问题，可以快速回滚：

1. 恢复原handleToggleTranslate函数
2. 重新启用SimpleWatchdogManager
3. 注释掉新的import语句

## FAQ

**Q: 为什么要替换SimpleWatchdog？**
A: SimpleWatchdog只能执行回调，无法真正中断执行流，导致超时后操作仍在继续。

**Q: 新架构的核心优势是什么？**
A: 真正的执行控制、自动资源清理、支持用户取消、精确错误定位。

**Q: 是否需要修改content-script？**
A: 不是必需的，但建议支持取消信号以获得更好的响应性。

## 联系支持

如有问题，请参考：
- 架构文档：`docs/architecture/08-abort-timeout-architecture.md`
- 测试文档：`test-watchdog-timeout.md`

---
*版本: v4.0*
*日期: 2025-09-09*