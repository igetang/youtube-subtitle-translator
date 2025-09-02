# YouTube Player API 字幕控制测试指南

## 更新内容

已经集成了YouTube Player API来控制字幕语言切换，使用ISO 639-1标准语言代码。

### 主要改动：

1. **main-world.ts** - 添加了`SubtitleAPIController`类
   - `getAvailableTracks()` - 获取可用字幕轨道（ISO 639-1代码）
   - `setSubtitleTrack(langCode)` - 设置字幕语言
   - `getCurrentTrack()` - 获取当前字幕语言

2. **content-script.ts** - 添加了API消息处理
   - `handleGetSubtitleTracksAPI()` - 处理获取轨道请求
   - `handleSetSubtitleTrackAPI()` - 处理设置语言请求

3. **service-worker.ts** - Step 5优化
   - Step 5.1: 优先使用Player API获取轨道
   - Step 5.2: 智能选择源语言
   - Step 5.3: 通过API设置字幕语言
   - Step 5.4: 异步缓存轨道信息

## 测试步骤

### 1. 加载扩展
1. 打开Chrome扩展管理页面 `chrome://extensions/`
2. 重新加载扩展

### 2. 测试API功能

在YouTube视频页面的控制台执行以下测试代码：

```javascript
// 测试1: 获取可用字幕轨道（通过扩展API）
(async function testGetTracks() {
  console.log('=== 测试获取字幕轨道 ===');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getSubtitleTracksAPI'
    });
    
    if (response && response.success) {
      console.log('✅ 成功获取轨道:', response.tracks);
      console.table(response.tracks.map(t => ({
        语言代码: t.languageCode,
        语言名称: t.languageName,
        类型: t.kind,
        默认: t.isDefault
      })));
    } else {
      console.error('❌ 获取失败:', response);
    }
  } catch (error) {
    console.error('❌ 调用失败:', error);
  }
})();
```

```javascript
// 测试2: 设置字幕语言（使用ISO 639-1代码）
async function testSetLanguage(langCode) {
  console.log(`=== 测试设置字幕语言: ${langCode} ===`);
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'setSubtitleTrackAPI',
      langCode: langCode  // ISO 639-1代码
    });
    
    if (response && response.success) {
      console.log(`✅ 成功切换到: ${langCode}`);
    } else {
      console.error('❌ 切换失败:', response);
    }
  } catch (error) {
    console.error('❌ 调用失败:', error);
  }
}

// 测试切换到不同语言
await testSetLanguage('en');  // 英语
await testSetLanguage('fr');  // 法语
await testSetLanguage('de');  // 德语
await testSetLanguage('zh');  // 中文
```

### 3. 测试翻译流程

1. 点击扩展的翻译按钮
2. 观察控制台日志，应该看到：
   - `[service-worker] Step 5.1: 获取轨道信息`
   - `[service-worker] ✓ 通过Player API获取到X条轨道`
   - `[service-worker] Step 5.2: 选择源语言: XX`
   - `[service-worker] Step 5.3: 通过API设置字幕语言: XX`
   - `[service-worker] ✓ 成功通过API切换到语言: XX`

### 4. 验证功能

- **语言代码标准化**：所有语言使用ISO 639-1代码（en, fr, de, zh等）
- **不受界面语言影响**：无论YouTube界面是什么语言，API都使用标准代码
- **自动降级**：如果API失败，自动回退到原有拦截器方案
- **智能选择**：自动选择最佳源语言

## 支持的语言代码

| 语言 | ISO 639-1代码 |
|------|--------------|
| 英语 | en |
| 法语 | fr |
| 德语 | de |
| 西班牙语 | es |
| 意大利语 | it |
| 葡萄牙语 | pt |
| 葡萄牙语(巴西) | pt-BR |
| 俄语 | ru |
| 中文 | zh |
| 日语 | ja |
| 韩语 | ko |
| 阿拉伯语 | ar |
| 印地语 | hi |
| 土耳其语 | tr |
| 波兰语 | pl |
| 荷兰语 | nl |
| 印尼语 | id |
| 乌克兰语 | uk |
| 匈牙利语 | hu |

## 注意事项

1. **播放器就绪**：API需要视频开始播放后才能完全工作
2. **模块检测**：自动检测使用captions或cc模块
3. **错误处理**：所有API调用都有超时和错误处理
4. **向后兼容**：保留原有功能，API失败时自动降级

## 调试提示

如果遇到问题，检查：
1. 视频是否已开始播放
2. 视频是否有字幕
3. 控制台是否有错误信息
4. 扩展是否已正确加载

## 优势总结

✅ **使用ISO 639-1标准** - 国际标准，统一规范
✅ **不受界面语言影响** - 日文、韩文界面都能正常工作  
✅ **直接API控制** - 比DOM操作更快更稳定
✅ **智能降级** - API失败时自动使用备用方案
✅ **完整日志** - 便于调试和问题排查