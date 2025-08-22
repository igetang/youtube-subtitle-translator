# SidePanel源代码归档说明

**归档日期**: 2025年8月21日  
**归档原因**: 项目已从SidePanel架构迁移到Popup架构

## 📁 归档内容

### 从 /src/sidepanel/ 移动的文件
- **src-sidepanel/sidepanel/** - 原sidepanel目录的完整内容
  - sidepanel.html - SidePanel主HTML文件
  - sidepanel.ts - SidePanel主逻辑文件
  - components/side-panel.tsx - React组件
  - styles/sidepanel.css - 样式文件
  - templates/template.ts - 模板逻辑

### 从 /src/background/ 移动的文件
- **sidepanel-controller.ts** - SidePanel控制器逻辑

## ⚠️ 重要说明

这些文件已不再被项目使用，归档原因：

1. **架构迁移**: 项目已完全迁移到Popup架构
2. **构建配置**: vite.config.ts已移除sidepanel构建入口
3. **清理目的**: 避免混淆和维护负担

## 📝 相关文档

- 迁移文档: [SIDEPANEL-TO-POPUP-MIGRATION.md](./SIDEPANEL-TO-POPUP-MIGRATION.md)
- 架构文档: [sidepanel-architecture.md](./sidepanel-architecture.md)
- 当前架构: [/docs/architecture/popup.md](/docs/architecture/popup.md)

## 🔍 如果需要恢复

如果将来需要参考或恢复这些代码：

```bash
# 查看归档内容
ls -la docs/archive/deprecated-sidepanel/src-sidepanel/

# 如需恢复（不推荐）
cp -r docs/archive/deprecated-sidepanel/src-sidepanel/sidepanel src/
cp docs/archive/deprecated-sidepanel/sidepanel-controller.ts src/background/
```

---

**注意**: 当前项目使用Popup架构，这些归档文件仅供历史参考。