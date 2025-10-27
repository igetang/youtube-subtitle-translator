# 开发文档索引

## 📖 开发指南

### 基础文档
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - 开发环境配置与基础指南
- **[project-structure.md](project-structure.md)** - 项目目录结构说明

### 编码规范
- **[naming-conventions.md](naming-conventions.md)** - 命名与日志规范

### 调试与任务追踪
- **[docs/tasks/log-optimization-progress.md](../tasks/log-optimization-progress.md)** - 日志治理任务进度

## 🛠️ 开发流程

1. **环境准备** - 参考 DEVELOPMENT.md
2. **了解项目结构** - 参考 project-structure.md
3. **遵循编码规范** - 参考 naming-conventions.md
4. **代码重构** - 参考 refactor-guide.md

## 📝 注意事项

- 使用TypeScript进行开发
- 遵循Chrome Extension Manifest V3规范
- 使用MessageBus进行消息通信（不要使用EventBus）
- UI使用Popup方案（不要使用SidePanel）
