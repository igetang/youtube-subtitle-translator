# 字幕获取功能测试指南

## 功能说明
实现了基于 new/1.md 文档的字幕获取方案，通过拦截 YouTube 的 timedtext API 请求来获取字幕数据。

## 实现内容

### 1. Main World Script (main-world.ts)
- 添加了 `SubtitleInterceptor` 类
- 劫持 `fetch` 和 `XMLHttpRequest` 来捕获 timedtext 请求
- 支持 JSON3 和 XML 格式解析
- 自动触发 CC 按钮以获取字幕

### 2. ContentScriptCoordinator (content-script-coordinator.ts)
- 在翻译按钮点击时触发字幕获取
- 监听来自 main-world 的字幕数据
- 将字幕数据转发给 Service Worker

### 3. Service Worker (service-worker.ts)
- 添加 `SUBTITLE_DATA` 消息处理
- 将字幕数据存储到内存缓存
- 准备后续的翻译流程

## 测试步骤

1. **加载扩展**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启开发者模式
   - 点击"加载已解压的扩展程序"
   - 选择 `/mnt/e/chrome/8.19/dist` 目录

2. **测试字幕获取**
   - 打开一个有字幕的 YouTube 视频
   - 等待页面完全加载
   - 点击翻译按钮（开启翻译）
   - 打开开发者工具（F12）查看控制台日志

3. **预期日志**
   ```
   [ContentScriptCoordinator] 翻译已开启，请求获取字幕...
   [Main World] 收到字幕捕获请求，初始化拦截器...
   [SubtitleInterceptor] 🎯 开始初始化字幕拦截器
   [SubtitleInterceptor] 尝试自动触发字幕按钮...
   [SubtitleInterceptor] 🎯 捕获到字幕URL (Fetch/XHR): ...
   [SubtitleInterceptor] ✅ JSON3/XML格式字幕解析成功，共 X 条
   [ContentScriptCoordinator] 收到字幕数据: X 条
   [background] 收到字幕数据: ...
   [background] ✅ 字幕数据已缓存
   ```

## 验证方法

1. **检查全局变量**
   在控制台输入：
   ```javascript
   window.__capturedSubtitles
   ```
   应该能看到捕获的字幕数组

2. **手动触发**
   如果自动触发失败，可以手动切换字幕按钮（关闭再打开）

3. **检查网络请求**
   在 Network 面板中查找包含 `timedtext` 的请求

## 注意事项

1. 视频必须有可用的字幕轨道
2. 首次使用可能需要手动切换一次字幕按钮
3. 某些视频可能使用不同的字幕格式，需要进一步调试

## 后续工作

1. 完善错误处理机制
2. 添加字幕语言自动选择
3. 集成翻译功能
4. 优化缓存策略
5. 添加用户界面反馈

## 调试提示

如果字幕获取失败：
1. 确认视频有字幕可用
2. 检查字幕按钮是否存在（.ytp-subtitles-button）
3. 在 Network 面板查看是否有 timedtext 请求
4. 检查控制台是否有错误信息
5. 尝试手动切换字幕语言触发请求