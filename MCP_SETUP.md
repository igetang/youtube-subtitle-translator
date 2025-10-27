# MCP 集成说明（可选）

> 默认开发环境为 Cursor，本项目已不依赖 VS Code + Claude Code + MCP。  
> 以下内容保留历史配置步骤，供需要在 VS Code 环境下启用 Claude Code MCP 的成员参考。

## 适用范围与现状

- 仅当你在 **VS Code** 中使用 **Claude Code**（原 Claude DevTools）时才需要这些步骤。  
- 当前仓库最近一次配置更新时间：2025-09-20 前后，已在 `~/.config/claude/mcp.json` 增加以下服务器：  
  - `context7`（@upstash/context7-mcp）  
  - `browsermcp`（@browsermcp/mcp@latest）  
  - `playwright`（playwright-mcp）  
  - `spec-workflow`（@pimzino/spec-workflow-mcp@latest）  
- Cursor 环境中无需执行本文档操作。

## ⚙️ 通用步骤

1. 在目标机器（WSL2 / Linux / macOS / Windows）执行文档中的 `npx ...` 命令前，确保具备网络权限。  
2. 修改 `~/.config/claude/mcp.json` 后需 **完全关闭 VS Code** 并重新打开，使 MCP 生效。  
3. 若在 WSL2 内修改配置，但 VS Code 主进程运行在 Windows，需要在 Windows 侧的 `C:\Users\<你>\.config\claude\mcp.json` 同步配置。  
4. 配置变更时建议手动备份原文件，例如 `cp ~/.config/claude/mcp.json ~/.config/claude/mcp.json.bak_YYYYMMDDHHMM`.
5. 如需使用 Browser MCP，请提前安装 Chrome 扩展，并视需求启用远程调试端口（示例命令见下方）。

以下分节为两个 MCP 服务的详细记录。

---

## Context7 MCP（技术资料检索）

### 已完成配置
- MCP 配置文件：`~/.config/claude/mcp.json`
- 服务器：`@upstash/context7-mcp`（同时保留 `browsermcp`、`playwright`）
- 状态：手工测试通过，可在 Claude Code 中查询技术文档/示例。

### 激活步骤
1. **关闭 VS Code**（确保所有窗口退出）。  
2. **重新打开 VS Code 并加载本仓库**。  
3. **验证**：在 Claude Code 面板执行 `context7` 相关命令（如“搜索 TypeScript AbortController 示例”）。

### 手动测试命令
```bash
npx @upstash/context7-mcp           # Context7
npx @browsermcp/mcp@latest          # Browser MCP
npx -y playwright-mcp               # Playwright MCP
```

### 注意事项
- 运行在 WSL2 时，配置文件位于 `~/.config/claude/mcp.json`（WSL 路径）；VS Code 若运行在 Windows 需同步 Windows 侧配置。  
- 确保 `npx` 拥有执行权限，且网络访问未被阻断。

---

## Spec Workflow MCP（规范驱动开发）

### 已完成配置
- 新增 `spec-workflow` 服务器，命令：  
  ```json
  "spec-workflow": {
    "command": "npx",
    "args": ["-y", "@pimzino/spec-workflow-mcp@latest", "/home/k/chrome-9.15", "--AutoStartDashboard"]
  }
  ```
- 添加时已自动备份原配置（`~/.config/claude/mcp.json.bak_<timestamp>`）。
- 启用了 `--AutoStartDashboard`，VS Code 重启后会自动打开 Web 仪表盘（默认 `http://localhost:3000`，以终端提示为准）。

### 激活步骤
与 Context7 相同：**完整重启 VS Code → 重新打开项目 → 在 Claude Code 中验证 `spec-workflow` 命令可用**。

### 常用指令示例
```text
"为购物车功能创建一个spec"
"列出所有specs"
"执行spec user-auth中的任务1.1"
```

### 工作流概览
1. **需求阶段**：明确用户故事与验收标准。  
2. **设计阶段**：输出架构设计、数据结构、API。  
3. **任务阶段**：拆解具体实现与测试步骤。  

### VS Code 插件（可选）
若希望在侧边栏查看进度，可搜索并安装官方扩展 “Spec Workflow MCP”（作者 pimzino）。  

---

## Browser MCP / Playwright 附加说明

1. **安装 Chrome 扩展**（仅 Browser MCP 需要）  
   - 访问 Chrome Web Store：<https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc>  
   - 点击“添加至 Chrome”完成安装。

2. **可选：启动 Chrome 远程调试端口**（供 `chrome-devtools-mcp` 或手动调试使用）  
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
   > 在 macOS 上需先完全退出所有 Chrome 实例再执行；Windows / WSL 环境请根据平台自行调整路径。

3. **手动测试命令**  
   ```bash
   npx @browsermcp/mcp@latest     # Browser MCP
   npx -y playwright-mcp         # Playwright MCP
   ```

4. **常见故障排查**  
   - `which npx` / `npm --version` 确认 npm 工具链正常；  
   - 手动运行上述 `npx` 命令，确认不会出现权限或网络错误；  
   - 查看 VS Code “输出 → Claude Code” 面板的日志定位报错；  
   - 修改配置后务必重启 VS Code。

---

## 附录：示例配置文件

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["@upstash/context7-mcp"],
      "env": {}
    },
    "browsermcp": {
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "playwright-mcp"]
    },
    "spec-workflow": {
      "command": "npx",
      "args": ["-y", "@pimzino/spec-workflow-mcp@latest", "/home/k/chrome-9.15", "--AutoStartDashboard"]
    }
  }
}
```

---

*最近维护：2025-09-20（合并历史记录，当前默认环境为 Cursor）。*  
如未来完全放弃 VS Code + Claude Code 环境，可将本文件移至 `docs/archive/`。  
