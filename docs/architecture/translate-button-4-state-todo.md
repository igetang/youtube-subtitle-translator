# 翻译按钮架构优化TODO清单
**创建日期:** 2025-08-19
**目标:** 优化翻译按钮状态管理，实现更清晰的用户体验

## 一、状态管理优化

### 1.1 添加INTENT_ONLY状态
**文件:** `src/shared/types/runtime-state-types.ts`
- [ ] 在TranslateActiveState枚举中添加INTENT_ONLY = 'intent_only'
- [ ] 更新相关类型定义和注释

### 1.2 状态转换逻辑
**文件:** `src/shared/storage/runtime-state-manager.ts`
- [ ] 修改setTranslateActive方法，支持4态转换
- [ ] 添加状态转换规则：
  - INACTIVE → PENDING → ACTIVE/INTENT_ONLY
  - ACTIVE/INTENT_ONLY → PENDING → INACTIVE
- [ ] 实现智能状态判断（根据字幕可用性）

## 二、UI展示优化

### 2.1 简化视觉状态为两态
**文件:** `src/shared/components/ui-renderer.ts`
- [ ] 保持两个图标状态：关闭(⚪) 和 开启(✅)
- [ ] ACTIVE和INTENT_ONLY都显示开启图标
- [ ] PENDING状态添加加载动画overlay

### 2.2 差异化提示文案
**文件:** `src/shared/components/ui-renderer.ts`
- [ ] 实现状态对应的tooltip：
  - INACTIVE: "点击开启翻译"
  - ACTIVE: "翻译已开启"
  - INTENT_ONLY: "等待字幕加载中..."
  - PENDING: "处理中..."

### 2.3 加载动画实现
**文件:** `src/shared/components/ui-renderer.ts`
- [ ] 添加CSS加载动画样式
- [ ] 实现动画overlay逻辑
- [ ] 确保动画不影响按钮点击

## 三、交互逻辑优化

### 3.1 防并发机制
**文件:** `src/shared/components/control-panel.ts`
- [ ] 添加操作锁机制
- [ ] 点击时立即设置PENDING状态
- [ ] 操作完成前阻止重复点击

### 3.2 轮询等待机制
**文件:** `src/shared/components/control-panel.ts`
- [ ] 实现轮询检查字幕可用性
- [ ] 设置合理的轮询间隔（如1秒）
- [ ] 设置最大等待时间（如30秒）
- [ ] 超时后自动回退到INACTIVE

### 3.3 状态同步优化
**文件:** `src/content-scripts/content-script.ts`
- [ ] 监听字幕变化事件
- [ ] 字幕出现时：INTENT_ONLY → ACTIVE
- [ ] 字幕消失时：ACTIVE → INTENT_ONLY
- [ ] 确保状态同步的实时性

## 四、消息通信优化

### 4.1 新增消息类型
**文件:** `src/shared/types/message-types.ts`
- [ ] 添加SUBTITLE_STATUS_CHANGED消息类型
- [ ] 添加TRANSLATE_STATE_TRANSITION消息类型

### 4.2 Service Worker处理
**文件:** `src/background/service-worker.ts`
- [ ] 处理状态转换请求
- [ ] 协调字幕状态和翻译状态
- [ ] 确保状态一致性

## 五、测试场景

### 5.1 基本功能测试
- [ ] 无字幕时点击开启 → INTENT_ONLY状态
- [ ] 有字幕时点击开启 → ACTIVE状态
- [ ] 字幕出现后自动转换 → INTENT_ONLY → ACTIVE
- [ ] 字幕消失后自动转换 → ACTIVE → INTENT_ONLY

### 5.2 边界情况测试
- [ ] 快速连续点击 → 防并发生效
- [ ] 长时间无字幕 → 超时处理
- [ ] 页面刷新 → 状态恢复
- [ ] 标签切换 → 状态同步

### 5.3 性能测试
- [ ] 轮询不影响页面性能
- [ ] 状态转换响应及时
- [ ] 内存使用合理

## 六、代码清理

### 6.1 移除冗余代码
- [ ] 清理旧的状态管理逻辑
- [ ] 移除未使用的消息类型
- [ ] 优化重复的状态检查

### 6.2 代码规范
- [ ] 添加必要的类型定义
- [ ] 补充关键代码注释
- [ ] 确保命名一致性

## 实施顺序建议

1. **第一阶段：** 状态管理层（1.1, 1.2）
2. **第二阶段：** UI展示层（2.1, 2.2, 2.3）
3. **第三阶段：** 交互逻辑（3.1, 3.2, 3.3）
4. **第四阶段：** 消息通信（4.1, 4.2）
5. **第五阶段：** 测试验证（5.1, 5.2, 5.3）
6. **第六阶段：** 代码优化（6.1, 6.2）

## 注意事项

1. **向后兼容：** 确保更新不影响现有功能
2. **渐进实施：** 每个阶段完成后进行测试
3. **状态持久化：** 考虑是否需要保存INTENT_ONLY状态
4. **错误处理：** 添加适当的错误边界和降级策略
5. **用户体验：** 确保状态转换平滑，避免闪烁

## 相关文档
- 架构设计：`docs/architecture.md`
- UI注入分析：`docs/ui-button-injection-analysis.md`
- 消息系统：`docs/message-migration.md`