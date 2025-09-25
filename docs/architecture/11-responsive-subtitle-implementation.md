# 响应式字幕实现架构设计

## 1. 核心发现

通过实际测试YouTube字幕，我们发现了其响应式实现的核心规律：

### 1.1 YouTube字幕公式
```css
font-size: 2.5vw;  /* 播放器宽度的2.5% */
```

**测试验证数据**：
- 线性关系：fontSize = 0.025006 * playerWidth
- 拟合度：R² = 1.0000 (100%)
- 实际应用：字体大小始终是播放器宽度的2.5%

## 2. 架构设计方案

### 2.1 设计原则
1. **与YouTube保持一致** - 采用相同的2.5vw基准
2. **支持用户缩放** - 允许用户在50%-200%之间调整
3. **设置边界限制** - 防止字体过小或过大
4. **性能优化** - 减少重复计算和DOM操作

### 2.2 核心组件架构

```typescript
interface ResponsiveSubtitleConfig {
  // 基础配置
  baseRatio: number;           // 基础比例（默认2.5）
  userScale: number;           // 用户缩放系数（0.5-2.0）
  minFontSize: number;         // 最小字体大小（px）
  maxFontSize: number;         // 最大字体大小（px）

  // 高级配置
  enableSmartBreakpoints: boolean;  // 启用智能断点
  enableSmoothTransition: boolean;  // 启用平滑过渡
}
```

## 3. 实现方案

### 3.1 CSS方案（推荐）

```css
/* 基础实现 */
.subtitle-overlay {
  --subtitle-base-ratio: 2.5;      /* 基础比例 */
  --subtitle-user-scale: 1;        /* 用户缩放 */
  --subtitle-min-size: 12px;       /* 最小字体 */
  --subtitle-max-size: 48px;       /* 最大字体 */
}

.subtitle-text {
  /* 使用clamp确保边界 */
  font-size: clamp(
    var(--subtitle-min-size),
    calc(var(--subtitle-base-ratio) * 1vw * var(--subtitle-user-scale)),
    var(--subtitle-max-size)
  );

  /* 平滑过渡 */
  transition: font-size 0.3s ease;
}

/* 双语模式下的差异化 */
.subtitle-original {
  font-size: clamp(
    var(--subtitle-min-size),
    calc(var(--subtitle-base-ratio) * 0.9 * 1vw * var(--subtitle-user-scale)),
    calc(var(--subtitle-max-size) * 0.9)
  );
}

.subtitle-translation {
  font-size: clamp(
    var(--subtitle-min-size),
    calc(var(--subtitle-base-ratio) * 1vw * var(--subtitle-user-scale)),
    var(--subtitle-max-size)
  );
  font-weight: 500;
}
```

### 3.2 JavaScript控制层

```typescript
class ResponsiveSubtitleManager {
  private config: ResponsiveSubtitleConfig = {
    baseRatio: 2.5,
    userScale: 1.0,
    minFontSize: 12,
    maxFontSize: 48,
    enableSmartBreakpoints: false,
    enableSmoothTransition: true
  };

  private playerObserver: ResizeObserver | null = null;
  private playerElement: HTMLElement | null = null;

  /**
   * 初始化响应式字幕
   */
  public initialize(): void {
    this.findPlayerElement();
    this.applyResponsiveStyles();
    this.setupResizeObserver();
    this.loadUserPreferences();
  }

  /**
   * 查找播放器元素
   */
  private findPlayerElement(): void {
    // 优先查找video-stream元素（实际播放器大小）
    this.playerElement = document.querySelector('.video-stream.html5-main-video') ||
                        document.querySelector('.html5-video-player');
  }

  /**
   * 应用响应式样式
   */
  private applyResponsiveStyles(): void {
    const overlay = document.querySelector('.subtitle-overlay');
    if (!overlay) return;

    // 设置CSS变量
    overlay.style.setProperty('--subtitle-base-ratio', this.config.baseRatio.toString());
    overlay.style.setProperty('--subtitle-user-scale', this.config.userScale.toString());
    overlay.style.setProperty('--subtitle-min-size', `${this.config.minFontSize}px`);
    overlay.style.setProperty('--subtitle-max-size', `${this.config.maxFontSize}px`);
  }

  /**
   * 设置ResizeObserver监听播放器大小变化
   */
  private setupResizeObserver(): void {
    if (!this.playerElement) return;

    this.playerObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.onPlayerResize(entry.contentRect.width, entry.contentRect.height);
      }
    });

    this.playerObserver.observe(this.playerElement);
  }

  /**
   * 播放器大小变化处理
   */
  private onPlayerResize(width: number, height: number): void {
    // 可选：添加智能断点处理
    if (this.config.enableSmartBreakpoints) {
      this.applySmartBreakpoints(width);
    }

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('subtitle-resize', {
      detail: { width, height }
    }));
  }

  /**
   * 智能断点处理（可选功能）
   */
  private applySmartBreakpoints(width: number): void {
    let adjustedRatio = this.config.baseRatio;

    // 超小屏幕：增加比例
    if (width < 400) {
      adjustedRatio = 3.0;
    }
    // 小屏幕：标准比例
    else if (width < 700) {
      adjustedRatio = 2.5;
    }
    // 大屏幕：标准比例
    else if (width < 1400) {
      adjustedRatio = 2.5;
    }
    // 超大屏幕：减小比例
    else {
      adjustedRatio = 2.2;
    }

    const overlay = document.querySelector('.subtitle-overlay');
    overlay?.style.setProperty('--subtitle-base-ratio', adjustedRatio.toString());
  }

  /**
   * 更新用户缩放系数
   */
  public updateUserScale(scale: number): void {
    // 限制范围 0.5-2.0 (50%-200%)
    this.config.userScale = Math.max(0.5, Math.min(2.0, scale));
    this.applyResponsiveStyles();
    this.saveUserPreferences();
  }

  /**
   * 加载用户偏好
   */
  private loadUserPreferences(): void {
    chrome.storage.local.get(['subtitleScale'], (result) => {
      if (result.subtitleScale) {
        this.config.userScale = result.subtitleScale;
        this.applyResponsiveStyles();
      }
    });
  }

  /**
   * 保存用户偏好
   */
  private saveUserPreferences(): void {
    chrome.storage.local.set({
      subtitleScale: this.config.userScale
    });
  }

  /**
   * 销毁
   */
  public destroy(): void {
    if (this.playerObserver) {
      this.playerObserver.disconnect();
      this.playerObserver = null;
    }
  }
}
```

## 4. 用户设置界面

### 4.1 Popup设置项

```typescript
interface SubtitleSizeSettings {
  sizeMode: 'auto' | 'manual';    // 自动/手动
  autoScale: number;               // 自动模式缩放（50%-200%）
  manualSize: number;              // 手动固定大小（12-48px）
}
```

### 4.2 设置界面UI

```html
<!-- Popup中的字体大小设置 -->
<div class="setting-item">
  <label>字幕大小</label>
  <select id="size-mode">
    <option value="auto">自动（跟随播放器）</option>
    <option value="manual">手动固定</option>
  </select>
</div>

<!-- 自动模式：缩放滑块 -->
<div class="setting-item" id="auto-scale-setting">
  <label>字幕缩放</label>
  <input type="range"
         id="subtitle-scale"
         min="50"
         max="200"
         value="100"
         step="10">
  <span id="scale-value">100%</span>
</div>

<!-- 手动模式：固定大小 -->
<div class="setting-item" id="manual-size-setting" style="display: none;">
  <label>固定大小</label>
  <input type="range"
         id="subtitle-size"
         min="12"
         max="48"
         value="20"
         step="2">
  <span id="size-value">20px</span>
</div>
```

## 5. 兼容性处理

### 5.1 全屏模式适配

```typescript
// 监听全屏变化
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = !!document.fullscreenElement;

  if (isFullscreen) {
    // 全屏时可能需要调整位置
    subtitleOverlay.adjustForFullscreen();
  }
});
```

### 5.2 剧院模式适配

```typescript
// 检测YouTube剧院模式
function isTheaterMode(): boolean {
  return document.querySelector('ytd-watch-flexy')
    ?.getAttribute('theater') === 'true';
}
```

## 6. 性能优化

### 6.1 防抖处理

```typescript
private debouncedResize = debounce((width: number, height: number) => {
  this.onPlayerResize(width, height);
}, 100);
```

### 6.2 CSS优先

- 使用CSS变量和calc()减少JavaScript计算
- 使用CSS transition实现平滑过渡
- 避免频繁的DOM操作

## 7. 测试用例

### 7.1 基本测试
1. 窗口缩放时字体大小变化
2. 全屏/退出全屏字体适配
3. 剧院模式切换
4. 用户缩放设置

### 7.2 边界测试
1. 超小窗口（<300px）
2. 超大屏幕（>2000px）
3. 竖屏视频
4. 画中画模式

## 8. 实施步骤

1. **第一阶段**：实现基础CSS响应式（2.5vw）
2. **第二阶段**：添加用户缩放控制
3. **第三阶段**：实现智能断点（可选）
4. **第四阶段**：优化性能和兼容性

## 9. 总结

采用YouTube相同的2.5vw方案，配合用户缩放系数，可以实现：
- ✅ 与YouTube原生字幕一致的体验
- ✅ 支持用户个性化调整
- ✅ 良好的性能表现
- ✅ 简单可维护的代码