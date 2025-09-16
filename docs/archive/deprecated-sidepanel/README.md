# SidePanel方案归档文档

> ⚠️ **重要说明**：SidePanel方案已被废弃，当前项目采用Popup方案。本目录保留SidePanel相关文档仅供历史参考。

## 📁 文档列表

- **[sidepanel-architecture.md](sidepanel-architecture.md)** - SidePanel架构设计文档
- **[sidepanel-开关实现指南.md](sidepanel-开关实现指南.md)** - SidePanel开关实现细节

## 🚫 废弃原因

### 1. 兼容性问题
- 仅Chrome 114+支持，限制了用户群体
- 不同Chrome版本API行为不一致
- 其他基于Chromium的浏览器支持不完整

### 2. 用户体验问题
- **跨标签页同步困难**：每个标签页的SidePanel独立，状态同步复杂
- **按钮响应不一致**：非YouTube页面按钮无响应，造成用户困惑
- **打开/关闭逻辑复杂**：用户难以理解何时可以使用SidePanel

### 3. 技术实现问题
- 需要额外的`scripting`权限
- Port连接管理复杂，容易内存泄漏
- 状态管理需要多层同步，增加Bug风险

### 4. 维护成本
- 需要同时维护SidePanel和Popup两套UI
- 调试困难，DevTools支持不完善
- 文档和培训成本高

## ✅ Popup方案优势

1. **通用性强**：所有Chrome版本都支持
2. **用户体验一致**：所有页面行为统一
3. **实现简单**：标准Chrome Extension API
4. **维护方便**：单一UI系统，调试工具完善

## 📚 历史价值

虽然SidePanel方案被废弃，但其技术探索仍有价值：
- Chrome Extension新API的早期实践
- 复杂状态同步的解决方案
- 跨标签页通信的设计模式

这些经验为后续的架构决策提供了重要参考。