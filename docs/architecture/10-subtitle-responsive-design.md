# YouTube字幕响应式设计分析

## 更新历史
- 2025-09-25: 通过实际测试发现YouTube使用播放器宽度的2.5%作为字体大小
- 2025-09-25: 实现了精确匹配YouTube原生字幕的响应式方案
- 2025-09-25: 解决了字幕换行问题，移除了max-width限制
- 2025-09-25: 设计了字幕按钮状态保持架构

## 1. YouTube原生字幕自适应机制（实测数据）

### 1.1 核心发现
通过实际测试和线性回归分析，我们发现YouTube字幕的精确公式：

```javascript
// YouTube原生字幕大小公式（R² = 1.0000）
fontSize = playerWidth * 0.025

// 实测数据示例：
// 播放器宽度 136px → 字体大小 3.4px
// 播放器宽度 767px → 字体大小 19.18px
// 播放器宽度 1574px → 字体大小 39.35px
// 播放器宽度 2048px → 字体大小 51.2px
```

### 1.2 重要区别
- **不是视口宽度（vw）**：字幕大小基于播放器宽度，而非浏览器窗口宽度
- **线性关系**：简单的2.5%比例，没有复杂的calc或基础值
- **无最小限制**：即使在极小窗口（136px）也会显示3.4px的字体

### 1.2 自适应策略

#### 1.2.1 视口单位（vw/vh）
- **vw (viewport width)**: 视口宽度的1%
- **vh (viewport height)**: 视口高度的1%
- **vmin**: vw和vh中的较小值
- **vmax**: vw和vh中的较大值

YouTube主要使用 **vw** 单位，因为视频宽度是主要的限制因素。

#### 1.2.2 计算函数（calc）
结合固定像素值和相对单位：
```css
font-size: calc(基础大小 + 视口相对大小 * 系数)
```

#### 1.2.3 CSS clamp函数（现代方案）
```css
font-size: clamp(最小值, 理想值, 最大值);
font-size: clamp(14px, 2vw + 10px, 48px);
```

### 1.3 字幕大小限制

根据YouTube的实现和用户体验研究：

| 播放器尺寸 | 最小字体 | 默认字体 | 最大字体 |
|-----------|---------|----------|---------|
| 手机竖屏(360px) | 12px | 16-18px | 24px |
| 手机横屏(640px) | 14px | 20-22px | 32px |
| 平板(768px) | 14px | 22-24px | 36px |
| 桌面(1280px) | 16px | 24-28px | 42px |
| 全屏(1920px) | 18px | 28-32px | 48px |
| 4K(3840px) | 20px | 36-42px | 64px |

### 1.4 用户设置的100%含义

YouTube设置中的"100%"是一个**缩放系数**：
- 50% = 缩放系数 0.5
- 75% = 缩放系数 0.75
- 100% = 缩放系数 1.0（默认）
- 150% = 缩放系数 1.5
- 200% = 缩放系数 2.0

实际字体大小 = 基础响应式大小 * 用户缩放系数

## 2. 我们的实现方案（2025-09-25）

### 2.1 精确匹配YouTube的实现
```typescript
// subtitle-overlay.ts 中的实现
private setupResponsiveObserver(): void {
  this.playerObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width;

      // 直接在JavaScript中计算，避免CSS calc()精度问题
      const fontSize = width * 0.025;
      const fontSizeSmall = width * 0.0225;

      // 设置CSS变量
      this.overlayElement.style.setProperty('--calculated-font-size', `${fontSize}px`);
      this.overlayElement.style.setProperty('--calculated-font-size-small', `${fontSizeSmall}px`);
    }
  });
}

// HTML中使用预计算的CSS变量
<div style="font-size: var(--calculated-font-size);">译文</div>
<div style="font-size: var(--calculated-font-size-small);">原文</div>
```

### 2.2 解决精度问题
**问题**：CSS calc()在处理小数时可能有精度损失
**解决**：使用JavaScript预计算，通过CSS变量传递精确值

### 2.3 容器宽度优化
**问题**：max-width: 800px 导致断层式变化，引起字幕换行
**解决**：移除max-width，保持容器始终为播放器宽度的90%

### 2.2 位置固定
```typescript
bottom: 140px;  // 正常模式固定
bottom: 180px;  // 全屏模式固定
```

**问题**：
- 不同屏幕尺寸下位置不合适
- 没有考虑播放器控制栏高度变化

## 3. 改进方案

### 3.1 响应式字体大小

```typescript
// 推荐的响应式实现
private calculateFontSize(): { original: string, translation: string } {
  const videoContainer = this.videoElement?.closest('.html5-video-player');
  if (!videoContainer) {
    return { original: '20px', translation: '22px' };
  }

  const containerWidth = videoContainer.clientWidth;

  // 使用阶梯式响应
  let baseFontSize = 16;
  if (containerWidth < 426) {        // 小屏手机
    baseFontSize = 14;
  } else if (containerWidth < 640) { // 手机横屏
    baseFontSize = 16;
  } else if (containerWidth < 854) { // 480p
    baseFontSize = 18;
  } else if (containerWidth < 1280) { // 720p
    baseFontSize = 20;
  } else if (containerWidth < 1920) { // 1080p
    baseFontSize = 22;
  } else {                           // 4K+
    baseFontSize = 26;
  }

  // 应用用户缩放系数（从设置中获取）
  const userScale = this.getUserFontScale(); // 默认1.0
  const originalSize = Math.round(baseFontSize * userScale);
  const translationSize = Math.round(baseFontSize * 1.1 * userScale);

  // 应用限制
  const clampedOriginal = Math.max(12, Math.min(48, originalSize));
  const clampedTranslation = Math.max(14, Math.min(52, translationSize));

  return {
    original: `${clampedOriginal}px`,
    translation: `${clampedTranslation}px`
  };
}
```

### 3.2 CSS变量方案

```css
/* 使用CSS自定义属性实现 */
#youtube-subtitle-overlay {
  --base-font-size: clamp(14px, calc(1.2vw + 10px), 48px);
  --subtitle-scale: 1; /* 用户设置的缩放系数 */
}

.subtitle-original {
  font-size: calc(var(--base-font-size) * var(--subtitle-scale));
}

.subtitle-translation {
  font-size: calc(var(--base-font-size) * var(--subtitle-scale) * 1.1);
}
```

### 3.3 ResizeObserver监听

```typescript
private setupResizeObserver(): void {
  const videoContainer = this.videoElement?.closest('.html5-video-player');
  if (!videoContainer) return;

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      this.updateResponsiveSizes();
    }
  });

  resizeObserver.observe(videoContainer);
  this.resizeObserver = resizeObserver;
}
```

### 3.4 响应式位置

```typescript
private calculateSubtitlePosition(): string {
  const videoContainer = this.videoElement?.closest('.html5-video-player');
  if (!videoContainer) return '140px';

  const containerHeight = videoContainer.clientHeight;

  // 根据容器高度计算底部距离（约10-12%的高度）
  const bottomOffset = Math.round(containerHeight * 0.11);

  // 设置最小和最大值
  return `${Math.max(60, Math.min(200, bottomOffset))}px`;
}
```

## 4. 完整的响应式实现示例

```typescript
class ResponsiveSubtitleOverlay extends SubtitleOverlay {
  private resizeObserver: ResizeObserver | null = null;
  private userFontScale: number = 1.0; // 100%

  private createResponsiveOverlay(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'youtube-subtitle-overlay';

    // 使用CSS变量和相对单位
    this.overlayElement.style.cssText = `
      position: absolute;
      bottom: 10%;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2100;
      pointer-events: none;
      width: 90%;
      max-width: min(800px, 80vw);
      text-align: center;
      --subtitle-base-size: clamp(14px, calc(1.5vw + 10px), 48px);
      --subtitle-scale: ${this.userFontScale};
    `;

    this.subtitleContainer = document.createElement('div');
    this.subtitleContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.75);
      padding: min(1.5vw, 16px) min(3vw, 32px);
      border-radius: min(0.5vw, 8px);
      display: none;
      backdrop-filter: blur(2px);
    `;

    // 设置响应式字体
    const style = document.createElement('style');
    style.textContent = `
      #youtube-subtitle-overlay .subtitle-original {
        font-size: calc(var(--subtitle-base-size) * var(--subtitle-scale) * 0.9);
        line-height: 1.4;
        margin-bottom: 0.25em;
      }

      #youtube-subtitle-overlay .subtitle-translation {
        font-size: calc(var(--subtitle-base-size) * var(--subtitle-scale));
        line-height: 1.4;
        font-weight: 500;
      }

      /* 针对不同屏幕尺寸的媒体查询 */
      @media (max-width: 640px) {
        #youtube-subtitle-overlay {
          --subtitle-base-size: clamp(12px, calc(2.5vw + 8px), 28px);
        }
      }

      @media (min-width: 1920px) {
        #youtube-subtitle-overlay {
          --subtitle-base-size: clamp(20px, calc(1.2vw + 14px), 64px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  public updateUserFontScale(scale: number): void {
    this.userFontScale = scale;
    if (this.overlayElement) {
      this.overlayElement.style.setProperty('--subtitle-scale', scale.toString());
    }
  }
}
```

## 5. 性能优化建议

### 5.1 防抖处理
```typescript
private debouncedResize = debounce(() => {
  this.updateResponsiveSizes();
}, 100);
```

### 5.2 使用CSS优先
- 尽量使用CSS的响应式特性（vw、calc、clamp）
- 减少JavaScript计算
- 使用CSS变量便于动态调整

### 5.3 缓存计算结果
```typescript
private cachedSizes: { width: number; sizes: any } | null = null;

private getResponsiveSizes(): any {
  const currentWidth = this.videoContainer.clientWidth;
  if (this.cachedSizes?.width === currentWidth) {
    return this.cachedSizes.sizes;
  }
  // 计算新的尺寸...
}
```

## 6. 字幕按钮状态保持架构（2025-09-25设计）

### 6.1 需求背景
用户可能有不同的字幕使用习惯：
- 有些用户平时关闭字幕，只在需要翻译时才看
- 有些用户平时就开启字幕，翻译是额外增强

我们需要在拦截字幕后恢复用户的原始偏好。

### 6.2 架构设计

#### 6.2.1 状态流转
```
用户点击翻译按钮
    ↓
[Content Script] 记录字幕按钮状态
    ↓
[Main World] 触发字幕拦截（可能改变按钮状态）
    ↓
[Main World] 拦截完成，传递原始状态
    ↓
[Content Script] 恢复原始状态（如需要）
```

#### 6.2.2 数据结构
```typescript
interface SubtitleButtonState {
  originallyEnabled: boolean;  // 原始是否开启
  recordTime: number;          // 记录时间
  videoId: string;             // 关联的视频ID
}

// 消息传递中包含状态
interface SubtitleCaptureMessage {
  type: 'REQUEST_SUBTITLE_CAPTURE';
  data: {
    videoId: string;
    sourceLang: string;
    sourceKind: string;
    originalSubtitleState: boolean;  // 新增
  }
}
```

#### 6.2.3 实现要点
1. **记录时机**：在触发拦截前记录`.ytp-subtitles-button`的`aria-pressed`属性
2. **恢复时机**：拦截完成后1秒（确保拦截完全结束）
3. **边界处理**：
   - 超过5分钟的状态不恢复（避免误操作）
   - 用户手动改变状态则不恢复
   - 拦截失败立即恢复

### 6.3 状态管理器设计
```typescript
class SubtitleStateManager {
  private states = new Map<string, SubtitleButtonState>();

  recordState(videoId: string): void {
    const btn = document.querySelector('.ytp-subtitles-button');
    this.states.set(videoId, {
      originallyEnabled: btn?.getAttribute('aria-pressed') === 'true',
      recordTime: Date.now(),
      videoId
    });
  }

  shouldRestore(videoId: string): boolean {
    const state = this.states.get(videoId);
    if (!state) return false;
    // 5分钟内的状态才恢复
    return Date.now() - state.recordTime < 5 * 60 * 1000;
  }

  restoreState(videoId: string): void {
    const state = this.states.get(videoId);
    if (!state || !this.shouldRestore(videoId)) return;

    const btn = document.querySelector('.ytp-subtitles-button');
    const currentState = btn?.getAttribute('aria-pressed') === 'true';

    if (currentState !== state.originallyEnabled) {
      btn?.click();
      console.log(`恢复字幕状态为: ${state.originallyEnabled ? '开启' : '关闭'}`);
    }

    this.states.delete(videoId);
  }
}
```

## 7. 总结

### 7.1 响应式设计关键点
1. **YouTube公式**：字体大小 = 播放器宽度 × 2.5%
2. **精度处理**：使用JavaScript计算 + CSS变量，避免calc()精度损失
3. **容器宽度**：保持90%比例，无max-width限制
4. **监听变化**：使用ResizeObserver实时响应

### 7.2 用户体验优化
1. **状态保持**：记录并恢复用户的字幕显示偏好
2. **平滑过渡**：字幕大小连续变化，无突变
3. **极限支持**：即使3.4px的极小字体也正确显示

### 7.3 实现成果
- 完全匹配YouTube原生字幕行为
- 解决了字幕换行问题
- 保持用户的使用习惯
- 支持所有窗口尺寸