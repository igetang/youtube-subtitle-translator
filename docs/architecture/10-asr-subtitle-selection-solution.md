# YouTube ASR（自动生成）字幕轨道选择解决方案

## 📋 文档信息
- **版本**: 1.0.0
- **创建日期**: 2025-01-29
- **状态**: 🔬 已验证
- **重要性**: ⭐⭐⭐⭐⭐

## 🎯 问题背景

在实现YouTube字幕翻译功能时，发现无法通过常规API选择自动生成（ASR）的字幕轨道。这个问题影响了用户对自动生成字幕的翻译需求。

## 🔍 问题分析

### 1. API能力对比

| 方法 | 获取普通轨道 | 获取ASR轨道 | 设置普通轨道 | 设置ASR轨道 |
|------|-------------|------------|-------------|------------|
| Player API (`getOption`) | ✅ | ❌ | ✅ | ❌ |
| PlayerResponse | ✅ | ✅ | N/A | N/A |
| UI菜单 | ✅ | ✅ | ✅ | ✅ |

### 2. 测试结果

经过详细测试，发现：

```javascript
// ❌ 失败：API无法设置ASR轨道
player.setOption('captions', 'track', {
  languageCode: "en",
  kind: "asr"
});

// ❌ 失败：使用vssId也无效
player.setOption('captions', 'track', {
  vssId: "a.en"  // ASR轨道的vssId
});

// ✅ 成功：只有UI点击有效
// 通过模拟点击设置菜单 -> 字幕 -> 英语（自动生成）
```

### 3. 根本原因

YouTube故意限制了API对ASR轨道的访问：
- `getOption('captions', 'tracklist')` 不返回ASR轨道
- `setOption('captions', 'track')` 忽略kind参数或无法识别ASR的vssId
- ASR轨道的选择被限制在UI层面

推测这是YouTube的产品策略，可能是为了：
- 控制自动生成字幕的使用
- 防止程序化批量获取
- 保持ASR作为备用选项的定位

## ✅ 解决方案

### 核心策略：双轨道处理

```javascript
/**
 * 智能选择字幕轨道
 * - 普通轨道：使用Player API
 * - ASR轨道：使用UI点击
 */
async function setSubtitleTrack(langCode: string, kind?: string): Promise<boolean> {
  if (kind === 'asr') {
    // ASR轨道必须通过UI选择
    return await selectASRViaUI(langCode);
  } else {
    // 普通轨道使用API
    player.setOption('captions', 'track', {
      languageCode: langCode
    });
    return true;
  }
}
```

### UI选择实现

```javascript
/**
 * 通过UI菜单选择ASR轨道
 */
async function selectASRViaUI(langCode: string): Promise<boolean> {
  // Step 1: 打开设置菜单
  const settingsBtn = document.querySelector('.ytp-settings-button');
  if (!settingsBtn) return false;
  settingsBtn.click();
  await sleep(300);

  // Step 2: 进入字幕菜单
  const menuItems = document.querySelectorAll('.ytp-settings-menu .ytp-menuitem');
  let subtitleMenuItem = null;

  menuItems.forEach(item => {
    const label = item.querySelector('.ytp-menuitem-label');
    if (label && (label.textContent.includes('字幕') ||
                 label.textContent.includes('Subtitle') ||
                 label.textContent.includes('Caption'))) {
      subtitleMenuItem = item;
    }
  });

  if (!subtitleMenuItem) {
    settingsBtn.click(); // 关闭菜单
    return false;
  }

  subtitleMenuItem.click();
  await sleep(300);

  // Step 3: 选择ASR选项
  const subtitleOptions = document.querySelectorAll('.ytp-panel-menu .ytp-menuitem');
  let asrOption = null;

  subtitleOptions.forEach(option => {
    const label = option.querySelector('.ytp-menuitem-label');
    if (label) {
      const text = label.textContent.trim();
      // 匹配自动生成的选项
      if (matchesLanguage(text, langCode) &&
          (text.includes('自动生成') || text.includes('auto-generated'))) {
        asrOption = option;
      }
    }
  });

  if (asrOption) {
    asrOption.click();
    await sleep(300);

    // Step 4: 关闭菜单
    const backBtn = document.querySelector('.ytp-panel-back-button');
    if (backBtn) backBtn.click();
    await sleep(100);
    settingsBtn.click();

    return true;
  }

  // 关闭菜单
  settingsBtn.click();
  return false;
}
```

## 🏗️ 实施细节

### 1. 轨道信息获取策略

```javascript
/**
 * 获取完整的轨道列表（包含ASR）
 */
function getAllSubtitleTracks() {
  // 从Player API获取普通轨道
  const apiTracks = player.getOption('captions', 'tracklist') || [];

  // 从PlayerResponse获取所有轨道（包含ASR）
  const response = player.getPlayerResponse();
  const prTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  // 合并信息，以PlayerResponse为准
  return prTracks.map(track => ({
    languageCode: track.languageCode,
    name: track.name?.simpleText || track.name?.runs?.[0]?.text,
    kind: track.kind,  // 'asr' 或 undefined
    vssId: track.vssId,
    isASR: track.kind === 'asr'
  }));
}
```

### 2. 文件修改清单

#### `src/content-scripts/main-world.ts`
```typescript
class SubtitleAPIController {
  async setSubtitleTrack(langCode: string, kind?: string): Promise<boolean> {
    // 检测ASR轨道
    if (kind === 'asr') {
      console.log('[SubtitleAPIController] 检测到ASR轨道，使用UI方法');
      return await this.selectASRViaUI(langCode);
    }

    // 普通轨道继续使用API
    this.player.setOption(this.captionsModule, 'track', {
      languageCode: langCode
    });
    return true;
  }

  private async selectASRViaUI(langCode: string): Promise<boolean> {
    // UI选择实现
  }
}
```

#### `src/background/handle-toggle-translate-v4.ts`
```typescript
// 获取轨道信息时，需要从PlayerResponse获取
const getTrackInfo = async (tabId: number) => {
  // 发送消息到content-script
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'getPlayerResponse'
  });

  // 解析ASR轨道
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return tracks;
};
```

## ⚠️ 注意事项

### 1. UI方法的局限性
- **速度慢**: 需要多次DOM操作和等待
- **稳定性**: 依赖页面结构，YouTube更新可能导致失效
- **用户体验**: 会有明显的菜单闪烁

### 2. 优化建议
- **缓存选择状态**: 记住用户的ASR选择，减少重复操作
- **智能降级**: UI方法失败时，回退到最接近的普通轨道
- **异步处理**: UI操作不阻塞其他功能

### 3. 维护要点
- 定期测试UI选择器是否有效
- 监控YouTube页面结构变化
- 准备多个选择器备选方案

## 📊 性能影响

| 操作 | API方法 | UI方法 |
|-----|---------|--------|
| 耗时 | <100ms | 1000-2000ms |
| 可靠性 | 高 | 中 |
| 维护成本 | 低 | 高 |

## 🔄 版本历史

### v1.0.0 (2025-01-29)
- 初始文档
- 确认YouTube API限制
- 实现UI选择方案

## 📝 相关文档

- [02-core-implementation.md](./02-core-implementation.md) - 核心实现逻辑
- [04-message-system.md](./04-message-system.md) - 消息系统架构
- [09-subtitle-data-format-architecture.md](./09-subtitle-data-format-architecture.md) - 字幕数据格式

## 🎯 总结

YouTube限制了API对ASR轨道的访问是产品设计决策，不是技术缺陷。我们的解决方案是：
1. **双轨道策略**: 普通轨道用API，ASR轨道用UI
2. **信息源分离**: 从PlayerResponse获取完整轨道信息
3. **优雅降级**: UI方法失败时的备选方案

这个方案虽然不完美，但是目前唯一可行的解决方案。