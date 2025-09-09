# MCP（Model Context Protocol）安装指南

## 已完成的配置

✅ 已创建 `/Users/lizhe/.claude/mcp.json` 配置文件
✅ 已配置 browsermcp 和 playwright MCP服务器

## 需要手动完成的步骤

### 1. 安装Browser MCP Chrome扩展

1. 打开Chrome浏览器
2. 访问：https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc
3. 点击"添加至Chrome"安装扩展

### 2. 启动Chrome调试模式（如果需要使用chrome-devtools-mcp）

```bash
# macOS - 关闭所有Chrome实例后运行
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

### 3. 重启VS Code

- 完全关闭VS Code
- 重新打开VS Code
- 打开你的项目

### 4. 验证MCP是否生效

重启后，我应该能够使用以下MCP工具：
- browsermcp相关命令
- playwright相关命令

## Browser MCP使用示例

安装完成后，可以通过以下方式测试：

```javascript
// 在Claude Code中，我将能够：
// 1. 控制浏览器导航
// 2. 填写表单
// 3. 点击元素
// 4. 截图
// 5. 提取页面内容
```

## 故障排查

如果MCP仍然不可用：

1. 检查npx是否安装：
```bash
which npx
npm --version
```

2. 手动测试MCP服务器：
```bash
npx @browsermcp/mcp@latest
```

3. 查看VS Code输出面板中的Claude Code日志

## 其他可用的MCP服务器

如果你想添加更多MCP功能，可以考虑：

1. **chrome-devtools-mcp** - Chrome DevTools协议集成
```json
{
  "chrome-devtools": {
    "command": "npx",
    "args": ["chrome-devtools-mcp"]
  }
}
```

2. **browser-tools-mcp** - 浏览器自动化工具
```json
{
  "browser-tools": {
    "command": "npx",
    "args": ["@agentdeskai/browser-tools-mcp"]
  }
}
```

## 注意事项

- MCP配置修改后必须重启VS Code才能生效
- 某些MCP服务器需要额外的系统依赖
- Browser MCP需要Chrome扩展配合工作