# 日志优化任务进度追踪

**任务目标**: 按照CLAUDE.md中的日志规范，系统性优化整个项目的console日志

**日志规范**:
- `console.log` - 关键操作（用户操作、状态变更、API结果、关键决策）
- `console.debug` - 详细执行步骤（带`[debug]`前缀）
- `console.warn` - 警告信息
- `console.error` - 错误信息

**原则**:
- 内外层模式：外层显示摘要，内层使用debug或省略日志
- 去重：多次调用的方法仅在实际变更时记录

---

## ✅ 已完成的目录和文件

### /src/background/ 目录（全部完成）

#### service-worker.ts
- **优化前**: 146个console.log，4个console.debug
- **优化后**: 27个console.log，128个console.debug，44个console.warn，77个console.error
- **方法**: 自动批量替换（9个批次） + 手动审查
- **保留的关键日志**:
  - 架构启用、翻译切换、状态变更
  - 降级决策、初始化、版本更新
  - SidePanel操作结果、翻译完成
  - 用户提示和警告

#### handle-toggle-translate-v4.ts
- **优化情况**: 已完成日志优化
- **主要改动**: 将详细步骤转为debug，保留关键操作为log

### /src/background/components/ 目录（16/16已完成）

1. **two-phase-translator-v4.ts**
   - 优化详细翻译步骤为debug
   - 保留阶段完成和错误为关键日志

2. **batch-processor.ts**
   - 批处理详细步骤改为debug
   - 保留批次完成统计

3. **openai-translator.ts**
   - API调用细节改为debug
   - 保留翻译成功/失败结果

4. **intelligent-segmenter.ts**
   - 断句逻辑细节改为debug

5. **timeout-controller.ts**
   - 超时监控细节改为debug
   - 保留超时警告

6. **simple-watchdog-manager.ts**
   - 看门狗操作改为debug

7. **microsoft-translator.ts**
   - API细节改为debug
   - 保留翻译结果

8. **google-translator.ts**
   - Endpoint切换细节改为debug
   - 保留最终结果

9. **subtitle-fetcher.ts**
   - 获取步骤改为debug
   - 保留获取成功/失败

10. **translation-cache-manager.ts**
    - 缓存操作细节改为debug
    - 保留缓存命中统计

11. **youtube-player-controller.ts**
    - Player API调用细节改为debug
    - 保留控制结果

12. **video-source-language-detector.ts**
    - 检测步骤改为debug
    - 保留检测结果

13. **subtitle-data-processor.ts**
    - 数据处理细节改为debug

14. **two-phase-translator.ts** (旧版本)
    - 已优化

15. **subtitle-parser.ts**
    - 解析步骤改为debug

16. **subtitle-validator.ts**
    - 验证细节改为debug
    - 保留验证失败警告

### /src/background/utils/ 目录（2/2已完成）

1. **translation-local-storage.ts**
   - **优化前**: 多个console.log（已注释）
   - **优化后**: 已按规范优化
   - 存储操作细节改为debug

2. **rate-limit-manager.ts**
   - **优化前**: 多个console.debug
   - **优化后**: 已符合规范
   - 限流计算细节保持debug

### /src/content-scripts/ 目录（5/5已完成）

1. **content-script.ts**
   - 消息接收细节改为debug
   - 保留关键状态变更

2. **subtitle-overlay.ts**
   - 字幕渲染细节改为debug
   - 保留显示/隐藏操作

3. **content-script-coordinator.ts**
   - 状态协调细节改为debug

4. **main-world.ts**
   - API Hook细节改为debug
   - 保留拦截结果

5. **其他content-script文件**
   - 已全部优化完成

---

## ⏳ 待优化的目录和文件

### /src/popup/ 和 /src/options/ 目录

#### popup.ts
- **待优化**: 132个console语句
- **预计工作量**: 中等
- **优先级**: 高

#### options.ts (如果存在)
- **待优化**: 待统计
- **预计工作量**: 小

### /src/shared/components/ 目录（5个文件）

#### ui-manager.ts
- **待优化**: 120个console语句
- **预计工作量**: 大
- **优先级**: 高

#### 其他4个组件文件
- **待优化**: 待统计

### /src/shared/messages/ 目录（5个文件）

预计文件：
- message-bus.ts
- message-handler.ts
- 等消息相关文件

**待优化**: 待统计
**预计工作量**: 中等

### /src/shared/storage/ 目录（9个文件）

预计文件：
- runtime-state-manager.ts
- user-preferences-manager.ts
- video-source-language-cache-manager.ts
- translation-cache-manager.ts
- 等存储管理器

**待优化**: 待统计
**预计工作量**: 大

### /src/shared/translation/ 目录（2个文件）

预计文件：
- translation-service.ts
- 等翻译相关文件

**待优化**: 待统计
**预计工作量**: 小

### /src/shared/utils/ 目录（6个文件）

预计文件：
- vtt-utils.ts
- subtitle-utils.ts
- 等工具函数

**待优化**: 待统计
**预计工作量**: 中等

---

## 📊 总体进度统计

- **已完成**: 4个主目录，23+个文件
  - /src/background/ (完成)
  - /src/background/components/ (完成)
  - /src/background/utils/ (完成)
  - /src/content-scripts/ (完成)

- **待完成**: 6个主目录，约27个文件
  - /src/popup/ 和 /src/options/
  - /src/shared/components/
  - /src/shared/messages/
  - /src/shared/storage/
  - /src/shared/translation/
  - /src/shared/utils/

- **预计总进度**: 约 45-50%

---

## 📝 优化策略和经验

### 批量替换模式（适用于大文件）

使用sed批量替换常见模式：
```bash
# 详细步骤标志
s/console\.log(\x27.*✓/console.debug(\x27[debug].*✓/g
s/console\.log(\x27.*已/console.debug(\x27[debug].*已/g
s/console\.log(\x27.*收到/console.debug(\x27[debug].*收到/g
s/console\.log(\x27.*找到/console.debug(\x27[debug].*找到/g
s/console\.log(\x27.*Step/console.debug(\x27[debug].*Step/g
```

### 判断保留为console.log的标准

保留以下类型的日志：
1. 用户操作（toggleTranslate、changeSettings等）
2. 状态变更（translateState变化、popupOpen变化）
3. API结果（翻译完成、字幕获取成功）
4. 关键决策（降级到Popup、智能选择源语言）
5. 用户可见提示（警告、错误信息）
6. 初始化和生命周期（启动、关闭、版本更新）

### 改为console.debug的标准

改为debug的日志：
1. 详细执行步骤（Step 1/2/3）
2. 中间状态检查（当前状态、检测到XX）
3. 数据处理细节（解析、验证、转换）
4. 缓存操作（查找、保存、清理）
5. 内部方法调用（调用XX方法、执行XX操作）
6. 调试信息（DEBUG前缀）

### 改为console.warn的标准

改为warn的日志：
1. 警告信息（⚠️符号）
2. API调用失败（但有降级方案）
3. 数据验证失败（但不影响主流程）
4. 兼容性问题（但有回退方案）

---

_Last updated: 2025-10-10_
