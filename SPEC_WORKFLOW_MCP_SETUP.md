# Spec Workflow MCP 安装完成

## ✅ 安装状态

1. **MCP配置已更新**
   - 位置：`~/.config/claude/mcp.json`
   - 已添加 spec-workflow 服务器配置
   - 项目路径：`/home/k/chrome-9.15`
   - 自动启动仪表盘：已启用

2. **配置备份**
   - 原配置已备份到：`~/.config/claude/mcp.json.bak_[timestamp]`

## 🚀 激活步骤（重要！）

### 必须重启VS Code才能生效

1. **完全关闭VS Code**
   - 确保所有VS Code窗口都已关闭

2. **重新打开VS Code**
   - 重新打开你的项目

3. **验证激活**
   - 重启后，Claude Code应该能够使用spec-workflow相关命令

## 📋 使用方法

重启VS Code后，你可以：

### 创建规范
```
"为购物车功能创建一个spec"
"创建用户认证系统的规范"
```

### 查看进度
```
"列出所有specs"
"显示用户认证spec的状态"
```

### 执行任务
```
"执行spec user-auth中的任务1.1"
"完成购物车spec的所有任务"
```

## 🎯 工作流程

Spec Workflow采用三阶段开发流程：

1. **需求阶段（Requirements）**
   - 定义功能需求
   - 明确用户故事
   - 设定验收标准

2. **设计阶段（Design）**
   - 技术架构设计
   - 数据结构定义
   - API接口设计

3. **任务阶段（Tasks）**
   - 具体实现步骤
   - 代码编写
   - 测试验证

## 🌐 Web仪表盘

启用了 `--AutoStartDashboard` 参数，重启后会自动启动Web仪表盘：
- 默认地址：`http://localhost:3000`（具体端口看启动提示）
- 实时查看spec进度
- 可视化任务管理

## 🔧 可选：安装VSCode插件

如需在VSCode侧边栏查看进度：
1. 打开VSCode扩展商店
2. 搜索"Spec Workflow MCP"
3. 安装由Pimzino发布的插件

## ⚠️ 注意事项

1. **必须重启VS Code** - 配置不会立即生效
2. **项目路径** - 已设置为当前Chrome扩展项目路径
3. **首次使用** - 可能需要下载npm包，请耐心等待

## 📝 配置详情

当前spec-workflow配置：
```json
"spec-workflow": {
  "command": "npx",
  "args": ["-y", "@pimzino/spec-workflow-mcp@latest", "/home/k/chrome-9.15", "--AutoStartDashboard"]
}
```

---
安装时间：2025-09-19
项目：YouTube字幕翻译Chrome扩展