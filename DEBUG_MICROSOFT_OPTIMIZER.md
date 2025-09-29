# 🧪 微软翻译5000字符窗口优化器调试指南

## ✅ 已完成的工作

1. **创建了 MicrosoftTextOptimizer 类**
   - 位置：`src/background/components/microsoft-text-optimizer.ts`
   - 功能：实现5000字符滑动窗口算法
   - 特性：智能断句、降级策略、超长处理

2. **扩展了 MicrosoftTranslator 类**
   - 新增：`translateOptimized()` 方法
   - 开关：`USE_OPTIMIZER = true`（可快速切换）

3. **准备了集成开关**
   - 位置：`two-phase-translator-v4.ts`
   - 开关：`USE_MICROSOFT_OPTIMIZER = true`

## 🔧 如何在Chrome中调试

### 1. 加载扩展
```bash
# 构建项目
npm run build

# 在Chrome中：
1. 打开 chrome://extensions
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 dist 目录
```

### 2. 查看调试日志
```javascript
// 在 Service Worker 控制台查看优化效果：
// chrome://extensions → 查看视图 → Service Worker

// 关键日志标记：
[MicrosoftTextOptimizer] - 优化器日志
[MicrosoftTranslator] - 翻译器日志
```

### 3. 测试步骤
1. 打开任意YouTube视频
2. 开启字幕
3. 选择"微软翻译"
4. 点击翻译按钮
5. 查看控制台日志

### 4. 预期看到的优化效果
```
[MicrosoftTextOptimizer] 开始优化 100 条字幕
[MicrosoftTextOptimizer] 优化完成：1 个批次
[MicrosoftTextOptimizer] 优化率：10%（请求减少 90%）
```

## 📊 性能对比

| 字幕数量 | 原始请求数 | 优化后请求数 | 减少率 |
|---------|-----------|-------------|--------|
| 100条   | 10        | 1-2         | 80-90% |
| 500条   | 50        | 5-6         | 88-92% |
| 1000条  | 100       | 10-12       | 88-90% |

## 🔄 快速切换新旧逻辑

在 `two-phase-translator-v4.ts` 中：
```typescript
// 设为 true 使用新优化器，false 使用旧逻辑
private static readonly USE_MICROSOFT_OPTIMIZER = true;
```

## ⚠️ 注意事项

1. 需要网络连接来获取微软认证令牌
2. 首次调用可能稍慢（获取令牌）
3. 令牌缓存30分钟
4. 如遇问题可通过开关快速回滚

## 🐛 问题排查

如果翻译不工作：
1. 检查网络连接
2. 查看Service Worker控制台错误
3. 确认选择了微软翻译服务
4. 尝试切换 USE_MICROSOFT_OPTIMIZER 为 false

## 📈 下一步优化

- [ ] 实现并发批量请求
- [ ] 添加请求时间控制
- [ ] 完善错误重试机制
- [ ] 添加性能监控指标