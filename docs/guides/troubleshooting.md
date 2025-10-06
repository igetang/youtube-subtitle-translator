# YouTube字幕翻译助手 - 故障排除指南

本文档提供常见问题的解决方案和调试方法，帮助用户和开发者快速定位和解决问题。

## 🚨 常见问题解决方案

### Q1: 翻译按钮不显示或无法点击

**症状**：在YouTube页面看不到翻译按钮，或按钮显示但点击无反应

**解决方案**：
1. **检查扩展状态**：
   - 在Chrome中打开 `chrome://extensions/`
   - 确认扩展已启用且没有错误提示

2. **重新加载扩展**：
   - 在扩展管理页面点击"重新加载"按钮
   - 刷新YouTube页面

3. **检查页面权限**：
   - 确认YouTube页面地址以 `https://www.youtube.com/` 开头
   - 扩展只在官方YouTube域名下工作

4. **清除缓存**：
   ```javascript
   // 在控制台执行
   chrome.storage.local.clear();
   ```

### Q2: 字幕不显示或显示不完整

**症状**：翻译开关已开启，但字幕不显示或只显示部分内容

**解决方案**：
1. **检查视频字幕**：
   - 确认视频本身有字幕轨道
   - 尝试开启YouTube原生字幕验证

2. **切换翻译API**：
   - 打开设置，尝试不同的翻译服务
   - Google翻译无需API密钥，建议优先尝试

3. **检查语言设置**：
   - 确认源语言和目标语言设置正确
   - 避免源语言和目标语言相同

4. **清理翻译缓存**：
   ```javascript
   // 在控制台执行，清理翻译缓存
   chrome.storage.local.get(null).then(items => {
     Object.keys(items).forEach(key => {
       if (key.startsWith('subtitle_translation_cache_')) {
         chrome.storage.local.remove(key);
       }
     });
   });
   ```

### Q3: 设置界面无法打开

**症状**：点击扩展图标后设置界面不出现

**解决方案**：
1. **检查页面类型**：
   - Popup会根据页面类型显示不同界面
   - YouTube页面显示完整功能界面
   - 非YouTube页面显示使用说明

2. **检查扩展权限**：
   - 确认扩展已获得必要权限
   - 在扩展管理页面检查权限状态

3. **重新安装扩展**：
   ```javascript
   // 如果问题持续，尝试重新安装扩展
   // 1. 导出设置: chrome.storage.local.get(null, console.log)
   // 2. 重新安装扩展
   // 3. 恢复设置
   ```

### Q4: 翻译质量差或出现乱码

**症状**：翻译结果不准确或包含特殊字符

**解决方案**：
1. **切换翻译服务**：
   - 尝试不同的翻译API（Google、微软、有道）
   - 各服务对不同语言支持程度不同

2. **检查API配置**：
   - 如使用OpenAI，确认API密钥有效
   - 检查API配额是否充足

3. **调整翻译模型**：
   - OpenAI用户可尝试不同模型（GPT-4、GPT-3.5等）

### Q5: 页面导航后功能失效

**症状**：在同一标签页切换视频后翻译功能停止工作

**解决方案**：
1. **自动恢复**：系统会自动检测导航并恢复状态，稍等片刻
2. **手动重启**：关闭翻译开关后重新开启
3. **刷新页面**：如问题持续，刷新整个页面

## 🔧 开发者调试指南

### 调试工具

#### 1. 控制台日志
扩展使用标准化日志格式，便于问题追踪：
```
[background] - 后台脚本日志
[content-script] - 内容脚本日志  
[popup] - Popup界面日志
```

#### 2. 存储检查
```javascript
// 查看所有存储数据
chrome.storage.local.get(null, console.log);

// 查看特定设置
chrome.storage.local.get(['translateActive', 'targetLang'], console.log);
```

#### 3. 缓存状态检查
```javascript
// 检查翻译缓存
chrome.storage.local.get(null).then(items => {
  const cacheKeys = Object.keys(items).filter(key => 
    key.startsWith('subtitle_translation_cache_')
  );
  console.log('翻译缓存数量:', cacheKeys.length);
  console.log('缓存键列表:', cacheKeys);
});
```

### 常见错误代码

#### ES模块导入错误
**错误信息**：`Cannot use import statement outside a module`

**解决方案**：
- 确保构建系统正确配置
- 内容脚本使用IIFE格式，其他脚本使用ES模块
- 运行 `npm run build` 重新构建

#### 用户手势错误
**错误信息**：`may only be called in response to a user gesture`

**解决方案**：
- 确保Popup操作在用户点击的直接响应中执行
- 避免在异步回调中调用 `chrome.sidePanel.open()`

#### 权限错误
**错误信息**：`Cannot access a chrome:// URL`

**解决方案**：
- 检查manifest.json权限配置
- 确保只在允许的页面运行

## 🔌 Claude Code MCP 配置指南

### MCP 服务器配置常见问题

#### Q: chrome-devtools-mcp 显示 "Failed to reconnect"

**症状**：运行 `/mcp` 命令时，chrome-devtools-mcp 显示连接失败

**根本原因**：
- **配置文件优先级问题**：Claude Code 读取的是**项目级配置**，而非用户级配置
- 项目级配置文件：`.claude.json`（项目根目录）
- 用户级配置文件：`~/.config/claude/mcp.json`（会被忽略）

**解决方案**：

1. **使用官方 CLI 添加 MCP（推荐）**：
   ```bash
   # 进入项目目录
   cd /path/to/your/project

   # 使用 CLI 添加 MCP 服务器
   claude mcp add chrome-devtools npx chrome-devtools-mcp@latest
   ```

   ✅ CLI 会自动添加到正确的配置文件（`.claude.json`）

2. **手动配置（如果必须）**：

   编辑项目根目录的 `.claude.json`：
   ```json
   {
     "mcpServers": {
       "chrome-devtools": {
         "type": "stdio",
         "command": "npx",
         "args": ["chrome-devtools-mcp@latest"],
         "env": {}
       }
     }
   }
   ```

3. **验证配置**：
   ```bash
   # 检查 MCP 连接状态
   claude mcp list

   # 应该看到：
   # chrome-devtools: npx chrome-devtools-mcp@latest - ✓ Connected
   ```

**常见错误配置**：

❌ **错误 1**：修改了用户级配置
```bash
# 这个配置会被忽略！
~/.config/claude/mcp.json
```

❌ **错误 2**：手动编辑项目级配置时格式不正确
```json
// 错误：缺少 "type" 字段
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

✅ **正确**：使用 CLI 或包含完整字段
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"],
      "env": {}
    }
  }
}
```

### WSL2 环境特殊配置

**环境**：Windows + WSL2 + Ubuntu + Claude Code

**可能遇到的问题**：
1. Chrome 路径问题
2. 代理干扰
3. 沙箱权限限制

**推荐配置**：

1. **在 WSL2 中安装 Chrome**：
   ```bash
   # 下载并安装 Chrome
   wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
   sudo apt install ./google-chrome-stable_current_amd64.deb
   ```

2. **验证 Node 版本**：
   ```bash
   # 需要 Node >= 22.12.0
   node -v

   # 如果版本过低，升级 Node
   nvm install 22
   ```

3. **清理 npm 缓存**（如遇到问题）：
   ```bash
   npm cache clean --force
   npm cache verify
   ```

4. **禁用代理干扰**（如果使用代理）：
   ```json
   {
     "mcpServers": {
       "chrome-devtools": {
         "type": "stdio",
         "command": "npx",
         "args": ["chrome-devtools-mcp@latest"],
         "env": {
           "NO_PROXY": "*",
           "HTTP_PROXY": "",
           "HTTPS_PROXY": ""
         }
       }
     }
   }
   ```

### MCP 配置最佳实践

1. **始终使用 CLI 添加 MCP**：
   ```bash
   claude mcp add <server-name> <command> [args...]
   ```

2. **不要手动编辑 `~/.config/claude/mcp.json`**：
   - 这个文件是用户级配置，在项目中会被忽略
   - Claude Code 优先读取项目级配置

3. **验证配置生效**：
   ```bash
   # 检查 MCP 状态
   claude mcp list

   # 应该看到所有 MCP 都显示 ✓ Connected
   ```

4. **调试 MCP 连接问题**：
   ```bash
   # 手动测试 MCP 是否能启动
   npx chrome-devtools-mcp@latest

   # 应该看到：
   # Chrome DevTools MCP Server v0.x.x
   # Chrome DevTools MCP Server connected
   ```

### 相关资源

- [Claude Code MCP 官方文档](https://docs.claude.com/en/docs/claude-code/mcp)
- [chrome-devtools-mcp GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [MCP 配置故障排查](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues)

---

### 使用Chrome DevTools MCP调试扩展程序（高级用法）⭐

本节介绍如何使用Chrome DevTools MCP连接到你**已经打开的Chrome浏览器**来调试扩展程序，而不是让MCP自动启动新的Chrome实例。这对于需要在已登录状态、已加载扩展的真实环境中调试非常有用。

#### 快速开始

**核心要点：**
1. **先手动启动Chrome**（带远程调试端口）
2. **配置MCP连接到已打开的Chrome**（通过 `--browserUrl` 参数）
3. **再启动Claude Code**

#### 完整配置方法

##### 1. 启动Chrome（带远程调试）

**在WSL/Linux环境：**
```bash
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=~/.config/google-chrome-debug \
  --load-extension=/path/to/your/extension/dist &
```

**参数说明：**
- `--remote-debugging-port=9222` - 开启远程调试端口（必需）
- `--user-data-dir` - 指定非默认数据目录（Chrome限制，必需）
- `--load-extension` - 自动加载你的扩展（可选）

**验证Chrome已启动调试端口：**
```bash
curl http://127.0.0.1:9222/json/version
# 应该返回Chrome版本信息
```

##### 2. MCP项目配置（.mcp.json）

**文件位置：** 项目根目录的 `.mcp.json`

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browserUrl", "http://127.0.0.1:9222",
        "--logFile", "/tmp/chrome-devtools-mcp.log"
      ],
      "env": {
        "DEBUG": "*"
      }
    }
  }
}
```

**关键参数：**
- `--browserUrl http://127.0.0.1:9222` - **最关键！** 告诉MCP连接到已打开的Chrome，而不是启动新实例
- `--logFile` - 调试日志文件路径（可选，但强烈推荐）
- `DEBUG: "*"` - 开启详细调试日志（可选）

##### 3. 使用流程

```bash
# 步骤1：启动Chrome（带调试端口）
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=~/.config/google-chrome-debug \
  --load-extension=/home/k/chrome-9.15/dist &

# 步骤2：手动操作（如需要）
# - 登录你的账号
# - 手动加载扩展（如果--load-extension没生效）
# - 导航到测试页面

# 步骤3：启动Claude Code
claude

# 步骤4：使用MCP工具
# 在Claude Code中直接调用MCP工具，例如：
# - mcp__chrome-devtools__list_pages
# - mcp__chrome-devtools__take_snapshot
# - mcp__chrome-devtools__navigate_page
```

#### 常见问题与解决方案（踩过的坑）⚠️

##### 坑1：MCP多重配置冲突 ⭐ 最大的坑

**问题描述：**
项目配置文件 `.mcp.json` 里明明写了 `--browserUrl` 参数，但MCP启动时没有这个参数，导致MCP自己打开了新的Chrome实例。

**根本原因：**
Claude Code存在多个配置文件，优先级如下：
- **Local scope** (`.claude.json` 中的 `mcpServers`) - 最高优先级
- **Project scope** (`.mcp.json`) - 中等优先级
- **User scope** (`~/.config/claude/mcp.json`) - 最低优先级

如果Local配置中有chrome-devtools但没有 `--browserUrl` 参数，会覆盖Project配置。

**如何排查：**
```bash
# 1. 检查项目根目录的 .claude.json
cat .claude.json | grep -A 10 "mcpServers"

# 2. 检查是否有User级配置
cat ~/.config/claude/mcp.json 2>/dev/null
cat ~/.claude/mcp.json 2>/dev/null

# 3. 检查MCP进程的实际参数
ps aux | grep chrome-devtools-mcp
cat /proc/$(pgrep -f chrome-devtools-mcp)/cmdline | tr '\0' ' '
```

**解决方案：**
```bash
# 方案A：删除Local配置（推荐）
claude mcp remove chrome-devtools -s local

# 方案B：删除所有冲突的配置文件
rm ~/.claude/mcp.json
rm ~/.config/claude/mcp.json

# 方案C：只保留项目级配置 .mcp.json
# 确保其他配置文件都不包含chrome-devtools配置
```

**验证修复：**
```bash
# 重启Claude Code后，检查MCP进程参数
ps aux | grep chrome-devtools-mcp

# 应该看到类似：
# node ... chrome-devtools-mcp --browserUrl http://127.0.0.1:9222 --logFile /tmp/...
```

##### 坑2：MCP总是打开新Chrome实例

**问题描述：**
明明Chrome已经启动了，但MCP还是自己开了一个新的Chrome。

**原因：**
缺少 `--browserUrl` 参数。MCP的默认行为是启动自己的Chrome实例。

**解决方案：**
确保 `.mcp.json` 中包含正确的 `--browserUrl` 参数：
```json
{
  "args": [
    "-y",
    "chrome-devtools-mcp@latest",
    "--browserUrl", "http://127.0.0.1:9222"  // ← 必须有这个！
  ]
}
```

##### 坑3：Windows Chrome无法从WSL访问

**问题描述：**
在Windows中启动了Chrome（带 `--remote-debugging-port=9222`），但WSL中的MCP无法连接。

**原因：**
Windows防火墙或WSL网络隔离问题。

**解决方案：**
直接在WSL中启动Chrome：
```bash
# 在WSL中安装Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb

# 在WSL中启动Chrome
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=~/.config/google-chrome-debug &
```

##### 坑4：Chrome不允许用默认数据目录调试

**错误信息：**
```
DevTools remote debugging requires a non-default data directory
```

**原因：**
Chrome的安全限制，不允许在默认用户数据目录下开启远程调试。

**解决方案：**
必须使用 `--user-data-dir` 参数指定自定义目录：
```bash
# 正确 ✓
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=~/.config/google-chrome-debug

# 错误 ✗（会报错）
google-chrome --remote-debugging-port=9222
```

##### 坑5：命令换行格式错误

**错误命令：**
```bash
google-chrome --remote-debugging-port=9222
  --user-data-dir=xxx  # ❌ 这样会被当成新命令
```

**错误信息：**
```
-bash: --user-data-dir=xxx: No such file or directory
```

**正确格式：**
```bash
# 方式1：使用反斜杠续行 ✓
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=~/.config/google-chrome-debug \
  --load-extension=/path/to/extension &

# 方式2：单行 ✓
google-chrome --remote-debugging-port=9222 --user-data-dir=~/.config/google-chrome-debug &
```

#### 验证与调试

##### 验证配置是否生效

**方法1：检查Chrome调试端口**
```bash
curl http://127.0.0.1:9222/json/version
# 应该返回类似：
# {
#   "Browser": "Chrome/120.0.6099.109",
#   "Protocol-Version": "1.3",
#   "User-Agent": "Mozilla/5.0...",
#   "webSocketDebuggerUrl": "ws://127.0.0.1:9222/..."
# }
```

**方法2：检查MCP进程参数**
```bash
# 查找chrome-devtools-mcp进程
ps aux | grep chrome-devtools-mcp

# 查看完整命令行参数
cat /proc/$(pgrep -f chrome-devtools-mcp)/cmdline | tr '\0' ' '

# 应该看到包含：
# --browserUrl http://127.0.0.1:9222
```

**方法3：检查MCP日志**
```bash
tail -f /tmp/chrome-devtools-mcp.log

# 成功连接应该看到类似：
# [chrome-devtools-mcp] Connected to browser at http://127.0.0.1:9222
# [chrome-devtools-mcp] Found extension: chrome-extension://xxxxx/
```

**方法4：在Claude Code中测试**
```typescript
// 列出所有页面
mcp__chrome-devtools__list_pages

// 应该看到你已打开的Chrome标签页，而不是空白页
```

##### 调试技巧

**1. 确认只有一个Chrome实例运行：**
```bash
ps aux | grep google-chrome | grep -v grep | wc -l
# 应该只有一个主进程（可能有多个子进程）
```

**2. 查看Chrome进程的启动参数：**
```bash
ps aux | grep google-chrome | grep remote-debugging-port
# 确认看到 --remote-debugging-port=9222
```

**3. 测试MCP工具是否工作：**
```bash
# 在Claude Code中依次测试：
mcp__chrome-devtools__list_pages          # 列出页面
mcp__chrome-devtools__take_snapshot       # 抓取页面快照
mcp__chrome-devtools__list_console_messages  # 查看控制台消息
```

**4. 如果MCP连接失败，重启流程：**
```bash
# 1. 杀掉所有Chrome进程
pkill -f google-chrome

# 2. 确认9222端口没被占用
lsof -i :9222  # 应该没有输出

# 3. 重新启动Chrome
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=~/.config/google-chrome-debug &

# 4. 验证端口
curl http://127.0.0.1:9222/json/version

# 5. 重启Claude Code
# 退出并重新启动 claude 命令
```

#### 核心要点总结

✅ **必做事项：**
1. Chrome启动时必须带 `--remote-debugging-port=9222`
2. Chrome启动时必须带 `--user-data-dir=非默认目录`
3. MCP配置必须包含 `--browserUrl http://127.0.0.1:9222`
4. 只保留项目级MCP配置（`.mcp.json`），避免多重配置冲突

⚠️ **常见错误：**
1. 忘记 `--browserUrl` 参数 → MCP自己开新Chrome
2. 多重配置冲突 → `--browserUrl` 参数丢失
3. 使用默认数据目录 → Chrome拒绝启动调试
4. 命令换行格式错误 → Bash解析失败

🔍 **验证配置的终极方法：**
```bash
# 这条命令能看到MCP进程的真实参数
cat /proc/$(pgrep -f chrome-devtools-mcp)/cmdline | tr '\0' ' '

# 如果看不到 "--browserUrl http://127.0.0.1:9222"，说明配置没生效！
```

💡 **最佳实践：**
- 使用项目级配置（`.mcp.json`）而非全局配置
- 开启调试日志（`--logFile` + `DEBUG=*`）便于排查问题
- 先启动Chrome，再启动Claude Code
- 用 `ps` 和 `curl` 验证配置是否正确

---

## 📊 性能监控

### 内存使用监控
```javascript
// 监控事件监听器数量
if (window.EventListenerManager) {
  console.log('事件监听器数量:', window.EventListenerManager.getListenerCount());
}

// 检查DOM元素
console.log('翻译按钮存在:', !!document.getElementById('vid-translate-toggle-button'));
console.log('字幕容器存在:', !!document.getElementById('yt-translate-subtitle-overlay'));
```

### API调用监控
```javascript
// 检查最近的翻译缓存时间
chrome.storage.local.get(null).then(items => {
  const caches = Object.keys(items)
    .filter(key => key.startsWith('subtitle_translation_cache_'))
    .map(key => ({
      key,
      timestamp: items[key].timestamp,
      date: new Date(items[key].timestamp).toLocaleString()
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
  
  console.log('最近翻译缓存:', caches.slice(0, 5));
});
```

## 🛠️ 具体修复案例

### 案例1: Session Storage修复
**问题**：扩展使用session storage存储临时数据，但在某些情况下数据丢失

**原因**：Chrome扩展环境中session storage生命周期不稳定

**解决方案**：
1. 将临时数据迁移到local storage
2. 添加数据过期机制
3. 实现自动清理功能

**实施步骤**：
```typescript
// 替换session storage使用
// 旧代码
sessionStorage.setItem('tempData', JSON.stringify(data));

// 新代码  
const tempKey = `temp_${Date.now()}_${Math.random()}`;
chrome.storage.local.set({[tempKey]: {data, expires: Date.now() + 3600000}});
```

### 案例2: 侧边栏初始化误触发
**问题**：侧边栏初始化时误触发设置保存

**解决方案**：
```typescript
// 添加初始化保护
if (isInitializingPopupUI) {
  console.log('[popup] 跳过保存，正在初始化');
  return;
}
```

### 案例3: 按钮重复调用
**问题**：翻译按钮点击导致事件循环

**解决方案**：
```typescript
// 改为直接调用模式
translateButton.addEventListener('click', () => {
  const newState = !this.state.translateActive;
  this.setTranslateActive(newState); // 直接调用，避免事件循环
});
```

### 案例4: 存储事件重复触发导致SessionAbortError ⭐
**问题**：更改目标语言时触发双重事件（TARGET_LANG_CHANGED + TRANSLATION_SERVICE_CHANGED），导致翻译流程被重复执行，出现SessionAbortError。

**症状**：
```
[user-preferences-manager] 🔔 用户偏好变更事件: TARGET_LANG_CHANGED
[user-preferences-manager] 🔔 用户偏好变更事件: TRANSLATION_SERVICE_CHANGED  ← 不应该触发
[service-worker] SessionAbortError: 翻译已被新的请求中断
```

**根本原因**：
1. **JSON.stringify的undefined字段省略特性**：
   ```typescript
   JSON.stringify({a: undefined, b: 'value'})  // → '{"b":"value"}'  字段a被省略
   JSON.stringify({a: null, b: 'value'})       // → '{"a":null,"b":"value"}'  字段a保留
   ```

2. **Popup构造translationService时可能产生undefined**：
   ```typescript
   // src/popup/popup.ts (修复前)
   const updatedService = {
     ...userPreferences.translationService,
     model: modelSelect?.value || userPreferences.translationService.model,  // ← 可能返回undefined
     temperature: temperatureInput?.value ? parseFloat(temperatureInput.value) : userPreferences.translationService.temperature
   };
   ```
   - 当UI元素不存在或为空时，`modelSelect?.value` 返回 `undefined`
   - `undefined || existingValue` 如果 `existingValue` 也是 `undefined`，结果仍是 `undefined`
   - `chrome.storage.local.set()` 使用JSON序列化，会省略undefined字段

3. **存储数据缺失字段导致比较失败**：
   ```typescript
   // 存储中的数据（字段被省略）
   oldValue: { type: 'google_free', apiKey: '', rpm: 100 }  // 缺少model、temperature
   newValue: { type: 'google_free', apiKey: '', model: null, temperature: null, rpm: 100 }  // 完整字段

   // JSON.stringify后不相等 → 误触发TRANSLATION_SERVICE_CHANGED事件
   ```

**解决方案（双层防御）**：

**Layer 1 - 源头修复（Popup）**：确保始终使用 `null` 而不是 `undefined`
```typescript
// src/popup/popup.ts (修复后)
const updatedService = {
  ...userPreferences.translationService,
  type: (translationApiSelect?.value as TranslationServiceType) || userPreferences.translationService.type,
  apiKey: apiKeyInput?.value || userPreferences.translationService.apiKey || '',
  // 🔧 确保model和temperature始终是null而不是undefined（避免JSON序列化时字段丢失）
  model: modelSelect?.value || userPreferences.translationService.model || null,  // ← 添加 || null
  temperature: temperatureInput?.value
    ? parseFloat(temperatureInput.value)
    : (userPreferences.translationService.temperature ?? null)  // ← 使用 ?? null
};
```

**Layer 2 - 防御层（Storage Listener）**：补全新旧值的字段后再比较
```typescript
// src/shared/storage/user-preferences-manager.ts
private setupStorageListener(): void {
  const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local') return;

    const userPrefsKey = StorageKeys.USER_PREFERENCES_PREFIX;
    Object.keys(changes).forEach((key) => {
      if (key.startsWith(userPrefsKey)) {
        console.log('[user-preferences-manager] 检测到UserPreferences存储变更:', key);

        // 🔧 补全oldValue和newValue的translationService字段（防御性处理）
        let newPrefs = changes[key].newValue;
        let oldPrefs = changes[key].oldValue;

        // 补全newValue的translationService字段
        if (newPrefs?.translationService?.type) {
          const template = TRANSLATION_SERVICE_TEMPLATES[newPrefs.translationService.type];
          if (template) {
            newPrefs = {
              ...newPrefs,
              translationService: {
                ...template,                    // 模板提供完整字段（包含null值）
                ...newPrefs.translationService  // 用户数据覆盖模板
              }
            };
          }
        }

        // 补全oldValue的translationService字段
        if (oldPrefs?.translationService?.type) {
          const template = TRANSLATION_SERVICE_TEMPLATES[oldPrefs.translationService.type];
          if (template) {
            oldPrefs = {
              ...oldPrefs,
              translationService: {
                ...template,
                ...oldPrefs.translationService
              }
            };
          }
        }

        // 触发变更事件（此时新旧值字段完整，比较公平）
        this.triggerPreferencesChangeEvent(newPrefs, oldPrefs);
      }
    });
  };

  this.storageManager.addChangeListener(StorageKeys.USER_PREFERENCES_PREFIX, handleStorageChange);
}
```

**关键技术点**：
1. **undefined vs null**：
   - `undefined` → JSON.stringify会省略字段
   - `null` → JSON.stringify会保留字段
   - 存储数据时必须使用 `null` 表示"无值"，而不是 `undefined`

2. **字段补全模板**：
   ```typescript
   // src/shared/types/user-preferences-types.ts
   export const TRANSLATION_SERVICE_TEMPLATES = {
     [TranslationServiceType.GOOGLE_FREE]: {
       type: TranslationServiceType.GOOGLE_FREE,
       name: 'Google 翻译（免费）',
       model: null,        // ← 必须明确定义为null
       temperature: null,  // ← 必须明确定义为null
       rpm: 100,
       tpm: null
     },
     // ... 其他模板
   };
   ```

3. **Nullish Coalescing Operator（??）**：
   - `value || fallback` - 当value为falsy（0, false, ''等）时都会使用fallback
   - `value ?? fallback` - 只有当value为null或undefined时才使用fallback
   - 对于可能为0的数值字段，应使用 `??` 而不是 `||`

**验证修复**：
```bash
# 1. 构建扩展
npm run build

# 2. 重新加载扩展并测试
# 3. 在YouTube页面更改目标语言
# 4. 检查Service Worker日志

# 预期结果（修复后）：
# [user-preferences-manager] 🔔 用户偏好变更事件: TARGET_LANG_CHANGED
# （不再出现TRANSLATION_SERVICE_CHANGED事件）
# （不再出现SessionAbortError）
```

**相关文件**：
- `src/popup/popup.ts:2021-2031` - Popup构造逻辑修复
- `src/shared/storage/user-preferences-manager.ts:74-126` - Storage监听器字段补全
- `src/shared/storage/user-preferences-manager.ts:300-312` - getUserPreferences字段补全
- `src/shared/types/user-preferences-types.ts:75-83` - 模板定义

**经验教训**：
1. 在Chrome扩展中操作存储时，始终使用 `null` 而不是 `undefined`
2. 对于可选字段，应在类型定义中明确包含 `| null`，而不是依赖 `?:` 可选属性
3. 存储数据的新旧值比较前，应确保数据结构完整性
4. JSON序列化会改变数据结构（省略undefined字段），需特别注意

## 📋 自检清单

### 安装后检查
- [ ] 扩展正确加载到Chrome
- [ ] YouTube页面显示翻译按钮
- [ ] 侧边栏可以正常打开
- [ ] 基本翻译功能工作正常

### 功能测试检查
- [ ] 不同语言组合翻译正常
- [ ] 多种翻译API工作正常
- [ ] 视频导航后功能正常
- [ ] 页面刷新后设置保持

### 性能检查
- [ ] 内存使用稳定
- [ ] 没有控制台错误
- [ ] API调用频率合理
- [ ] 页面响应速度正常

## 📋 完整功能测试指南

### 基础功能测试

#### 1. 扩展安装与初始化测试
```bash
测试步骤：
1. 在 chrome://extensions/ 中加载扩展
2. 访问任意YouTube视频页面
3. 检查扩展UI是否正确显示
4. 验证侧边栏是否可以正常打开

预期结果：
✅ 翻译按钮出现在播放器控制栏
✅ 设置按钮可以点击
✅ 侧边栏正常打开并显示设置选项
✅ 控制台无错误日志
```

#### 2. 翻译开关功能测试
```bash
测试步骤：
1. 点击翻译按钮激活翻译模式
2. 观察按钮状态变化和UI反馈
3. 再次点击关闭翻译模式
4. 验证状态正确保存

预期结果：
✅ 按钮状态正确切换（颜色/文字变化）
✅ 翻译开始时显示加载提示
✅ 关闭翻译时清除翻译结果
✅ 页面刷新后状态保持
```

#### 3. 字幕翻译核心功能测试
```bash
测试步骤：
1. 选择有字幕的YouTube视频
2. 设置不同的源语言和目标语言
3. 激活翻译功能
4. 观察翻译结果显示

预期结果：
✅ 翻译文本正确显示在原字幕下方
✅ 翻译时机与原字幕同步
✅ 翻译质量合理（无明显错误）
✅ 页面滚动时翻译位置正确
```

### 高级功能测试

#### 4. 语言设置与缓存测试
```bash
测试步骤：
1. 测试不同语言对组合（中英、日英、韩中等）
2. 切换翻译API服务
3. 验证翻译缓存功能
4. 测试语言冲突处理

预期结果：
✅ 支持的语言对都能正常翻译
✅ API切换后翻译服务正常工作
✅ 相同视频的重复翻译从缓存加载
✅ 语言冲突时显示合理的用户提示
```

#### 5. 页面导航与状态保持测试
```bash
测试步骤：
1. 在翻译激活状态下切换到新视频
2. 使用浏览器前进/后退按钮
3. 在同一标签页内导航多个视频
4. 验证设置的持久化

预期结果：
✅ 切换视频后翻译状态正确恢复
✅ 浏览器导航不影响翻译功能
✅ 用户设置在页面刷新后保持
✅ 多视频切换时性能稳定
```

#### 6. 错误场景与边界测试
```bash
测试步骤：
1. 测试无字幕视频的处理
2. 测试网络断开时的行为
3. 测试API密钥错误的情况
4. 测试长时间使用的内存表现

预期结果：
✅ 无字幕时显示适当提示
✅ 网络错误时有重试机制
✅ API错误时提供清晰的错误信息
✅ 长时间使用无内存泄漏
```

### 性能与兼容性测试

#### 7. 性能压力测试
```bash
测试场景：
- 快速连续切换多个视频
- 长时间观看带字幕的视频
- 频繁开关翻译功能
- 多标签页同时使用扩展

监控指标：
📊 CPU使用率 < 10%
📊 内存占用 < 50MB
📊 翻译响应时间 < 2秒
📊 UI操作响应时间 < 500ms
```

#### 8. 浏览器兼容性测试
```bash
测试环境：
- Chrome 最新版本
- Chrome 稳定版本
- 不同操作系统（Windows/macOS/Linux）
- 不同屏幕分辨率

预期结果：
✅ 在所有支持的Chrome版本正常工作
✅ UI在不同分辨率下正确显示
✅ 快捷键和交互在不同系统一致
```

### 自动化测试验证

#### 9. 数据完整性测试
```javascript
// 在控制台执行的测试脚本
async function testDataIntegrity() {
  // 测试存储数据结构
  const data = await chrome.storage.local.get(null);
  console.log('存储数据检查:', data);
  
  // 验证必要设置存在
  const requiredKeys = ['translateActive', 'sourceLang', 'targetLang'];
  const missing = requiredKeys.filter(key => !(key in data));
  console.log('缺失设置:', missing.length ? missing : '无');
  
  // 检查缓存数据格式
  const cacheKeys = Object.keys(data).filter(k => k.includes('cache'));
  console.log('缓存条目数:', cacheKeys.length);
}
```

#### 10. 事件监听器泄漏检查
```javascript
// 检查事件监听器数量
function checkEventListeners() {
  // 检查DOM事件监听器
  const buttons = document.querySelectorAll('[id*="translate"]');
  console.log('翻译相关按钮数量:', buttons.length);
  
  // 检查Chrome API监听器
  console.log('Runtime监听器:', chrome.runtime.onMessage.hasListeners());
  console.log('Storage监听器:', chrome.storage.onChanged.hasListeners());
}
```

### 验收测试清单

#### 🎯 核心功能验收
- [ ] 扩展能够在YouTube页面正确加载
- [ ] 翻译按钮显示且功能正常
- [ ] 字幕翻译准确且同步显示
- [ ] 设置能够正确保存和恢复
- [ ] 侧边栏界面完整且响应正常

#### ⚡ 性能验收  
- [ ] 翻译响应时间在可接受范围
- [ ] 内存使用稳定无泄漏
- [ ] 页面切换时功能快速恢复
- [ ] 长时间使用性能保持稳定

#### 🛡️ 稳定性验收
- [ ] 各种异常情况有合理处理
- [ ] 网络问题不导致功能崩溃
- [ ] API错误有清晰的用户提示
- [ ] 浏览器导航不影响扩展状态

#### 📱 用户体验验收
- [ ] UI交互直观易懂
- [ ] 错误信息友好清晰
- [ ] 设置选项分类合理
- [ ] 快捷操作流畅便捷

所有测试完成后，请在TODO.md中更新对应的任务状态，并在CHANGELOG.md中记录测试结果和发现的问题。

## 📞 获取帮助

如果问题仍未解决：

1. **收集调试信息**：
   - Chrome版本
   - 扩展版本
   - 控制台错误信息
   - 复现步骤

2. **提供详细日志**：
   - 打开开发者工具
   - 复现问题
   - 复制相关日志输出

3. **查看文档**：
   - [开发指南](../DEVELOPMENT.md)
   - [架构文档](architecture.md)
   - [API参考](api.md)

---

*最后更新: 2025-05-28* 