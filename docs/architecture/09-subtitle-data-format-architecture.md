# YouTube字幕翻译扩展 - 字幕数据格式架构设计

> **文档创建**: 2025-01-18
> **版本**: v1.0.0
> **状态**: ✅ 生产规范

## 1. 概述

本文档定义了字幕数据在整个翻译流程中的格式规范，明确了各环节应该使用的数据格式及其原因，为开发提供统一的数据格式指南。

## 2. 核心原则

### 2.1 格式选择原则
- **传输用数组**：处理效率高，无需序列化
- **存储用VTT**：节省空间，标准格式
- **显示用数组**：便于时间查找和条件渲染
- **转换要及时**：在合适的边界进行格式转换
- **接口要兼容**：支持多种输入格式

### 2.2 设计理念
- **性能优先**：实时处理使用数组，避免频繁解析
- **空间优化**：持久化存储使用字符串，减少存储占用
- **标准兼容**：使用WebVTT标准格式，确保兼容性

## 3. 数据格式定义

### 3.1 原始格式（YouTube API）
```typescript
interface YouTubeSubtitle {
  start: number;      // 开始时间（秒）
  dur: number;        // 持续时间（秒）
  text: string;       // 字幕文本
}
```

### 3.2 统一处理格式（内部使用）
```typescript
interface SubtitleEntry {
  start: number;        // 开始时间（秒）
  duration: number;     // 持续时间（秒，统一命名）
  text: string;         // 原文
  translation?: string; // 译文（可选）
  id?: string;          // 唯一标识（通常用start时间）
  isUrgent?: boolean;   // 是否为紧急翻译（可选）
}
```

### 3.3 VTT存储格式（WebVTT标准）
```
WEBVTT

00:00:01.000 --> 00:00:03.000
Hello world

00:00:03.500 --> 00:00:05.000
This is a subtitle
```

### 3.4 缓存数据结构
```typescript
interface TranslationCacheData {
  videoId: string;
  sourceLang: string;
  targetLang: string;
  originalSubtitles: string;      // VTT格式字符串
  translatedSubtitles: string;     // VTT格式字符串
  availableSourceLanguages: SimplifiedCaptionTrack[];
  translationService: TranslationServiceForStorage;
  lastUsed: number;
  dataHash: string;
}
```

## 4. 数据流格式映射

### 4.1 完整数据流

```mermaid
graph LR
    A[YouTube API] -->|YouTubeSubtitle[]| B[SubtitleInterceptor]
    B -->|SubtitleEntry[]| C[Content Script]
    C -->|SubtitleEntry[]| D[Service Worker]
    D -->|SubtitleEntry[]| E[TwoPhaseTranslator]
    E -->|SubtitleEntry[]| F[Service Worker]
    F -->|两种路径| G{分流}
    G -->|实时显示| H[SubtitleEntry[]]
    G -->|缓存存储| I[VTT String]
    H --> J[SubtitleOverlay]
    I --> K[TranslationCache]
    K -->|读取时| L[VTT String]
    L -->|解析| M[SubtitleEntry[]]
    M --> J
```

### 4.2 各环节数据格式

| 环节 | 组件 | 输入格式 | 输出格式 | 原因 |
|------|------|----------|----------|------|
| **捕获** | SubtitleInterceptor | YouTube JSON | `YouTubeSubtitle[]` | API原生格式 |
| **规范化** | SubtitleInterceptor | `YouTubeSubtitle[]` | `SubtitleEntry[]` | 统一字段名 |
| **传递** | Content→Background | `SubtitleEntry[]` | `SubtitleEntry[]` | 无需转换 |
| **翻译** | TwoPhaseTranslator | `SubtitleEntry[]` | `SubtitleEntry[]` | 索引对应 |
| **缓存写入** | TranslationCache | `SubtitleEntry[]` | `VTT String` | 节省空间 |
| **缓存读取** | TranslationCache | `VTT String` | `VTT String` | 原样返回 |
| **显示** | SubtitleOverlay | `VTT String` 或 `SubtitleEntry[]` | - | 兼容两种输入 |

## 5. 格式转换实现

### 5.1 转换函数位置
所有格式转换函数位于 `/src/shared/utils/vtt-utils.ts`

### 5.2 核心转换函数

#### 5.2.1 数组转VTT
```typescript
// 将字幕数组转换为VTT格式字符串
function createVttString(
  subtitles: SubtitleEntry[],
  useTranslation: boolean = false
): string
```

#### 5.2.2 VTT转数组
```typescript
// 将VTT格式字符串解析为字幕数组
function parseVttString(
  vttString: string,
  includeTranslation: boolean = false
): SubtitleEntry[]
```

#### 5.2.3 合并原文译文
```typescript
// 合并原始字幕和翻译字幕数组
function mergeSubtitles(
  originals: SubtitleEntry[],
  translations: SubtitleEntry[]
): SubtitleEntry[]
```

#### 5.2.4 格式规范化
```typescript
// YouTube格式转换为统一格式
function normalizeSubtitles(
  youtubeData: YouTubeSubtitle[]
): SubtitleEntry[] {
  return youtubeData.map(item => ({
    start: item.start,
    duration: item.dur,  // 注意字段名转换
    text: item.text,
    id: String(item.start)
  }));
}
```

## 6. 具体场景实现

### 6.1 场景一：实时翻译流程

```typescript
// Step 1: 捕获并规范化
const youtubeData: YouTubeSubtitle[] = captureFromYouTube();
const normalized: SubtitleEntry[] = normalizeSubtitles(youtubeData);

// Step 2: 翻译处理（保持数组）
const translated: SubtitleEntry[] = await translateSubtitles(normalized);

// Step 3: 实时显示（直接使用数组）
await subtitleOverlay.showArray(translated);

// Step 4: 异步缓存（转换为VTT）
const cacheData = {
  originalSubtitles: createVttString(normalized),
  translatedSubtitles: createVttString(translated, true),
  // ... 其他字段
};
await translationCache.save(cacheData);
```

### 6.2 场景二：缓存读取流程

```typescript
// Step 1: 读取缓存（VTT格式）
const cached: TranslationCacheData = await translationCache.get(videoId);

// Step 2: 显示处理
if (cached) {
  // 方式A：SubtitleOverlay内部解析
  await subtitleOverlay.showVtt(cached);

  // 方式B：外部解析后传入
  const originals = parseVttString(cached.originalSubtitles);
  const translations = parseVttString(cached.translatedSubtitles, true);
  const merged = mergeSubtitles(originals, translations);
  await subtitleOverlay.showArray(merged);
}
```

## 7. SubtitleOverlay兼容性设计

### 7.1 智能输入识别
```typescript
class SubtitleOverlay {
  public async show(data: any): Promise<void> {
    // 情况1：直接传入数组（V4架构实时翻译）
    if (Array.isArray(data)) {
      this.currentSubtitles = data;
    }
    // 情况2：传入缓存对象（包含VTT字符串）
    else if (typeof data.translatedSubtitles === 'string') {
      const originals = parseVttString(data.originalSubtitles);
      const translations = parseVttString(data.translatedSubtitles, true);
      this.currentSubtitles = mergeSubtitles(originals, translations);
    }
    // 情况3：V4架构当前格式（translatedSubtitles是数组）
    else if (Array.isArray(data.translatedSubtitles)) {
      this.currentSubtitles = data.translatedSubtitles;
    }

    // 应用用户偏好设置
    await this.applyUserPreferences();
    this.startDisplay();
  }
}
```

### 7.2 专用方法（推荐）
```typescript
class SubtitleOverlay {
  // 方法1：数组输入（实时翻译）
  public showArray(subtitles: SubtitleEntry[]): void {
    this.currentSubtitles = subtitles;
    this.applyUserPreferences();
    this.startDisplay();
  }

  // 方法2：VTT输入（缓存读取）
  public showVtt(data: TranslationCacheData): void {
    const originals = parseVttString(data.originalSubtitles);
    const translations = parseVttString(data.translatedSubtitles, true);
    this.currentSubtitles = mergeSubtitles(originals, translations);
    this.applyUserPreferences();
    this.startDisplay();
  }
}
```

## 8. 性能与空间对比

### 8.1 存储空间对比
| 格式 | 100条字幕 | 500条字幕 | 压缩率 |
|------|------------|------------|--------|
| JSON数组 | ~15KB | ~75KB | 基准 |
| VTT字符串 | ~10KB | ~50KB | -33% |
| 压缩后JSON | ~5KB | ~25KB | -67% |
| 压缩后VTT | ~4KB | ~20KB | -73% |

### 8.2 处理性能对比
| 操作 | JSON数组 | VTT字符串 | 说明 |
|------|----------|-----------|------|
| 解析 | 0ms | 5-10ms | JSON.parse vs 正则解析 |
| 查找 | O(n) | 需先解析 | 数组直接遍历 |
| 修改 | 直接 | 需重新生成 | 数组可直接操作 |

## 9. 最佳实践

### 9.1 DO（推荐做法）
- ✅ 实时处理保持数组格式
- ✅ 缓存存储转换为VTT格式
- ✅ 在数据边界进行格式转换
- ✅ 提供格式兼容的接口
- ✅ 缓存转换结果避免重复计算

### 9.2 DON'T（避免做法）
- ❌ 频繁进行格式转换
- ❌ 在传输过程中使用VTT
- ❌ 在翻译处理时使用字符串
- ❌ 混用不同格式不做区分
- ❌ 忽略格式验证

## 10. 问题修复指南

### 10.1 当前V4架构问题
**问题**：V4架构返回数组，但SubtitleOverlay期待VTT字符串

**方案A（推荐）**：修改SubtitleOverlay支持多种输入
- 优点：兼容性好，改动小
- 缺点：需要类型判断

**方案B**：统一V4架构输出格式
- 优点：格式统一
- 缺点：需要修改多处

### 10.2 实施步骤
1. 修改SubtitleOverlay添加格式识别
2. 更新V4架构的缓存保存逻辑
3. 确保格式转换函数正确
4. 测试两种数据流路径
5. 验证字幕显示模式切换

## 11. 版本记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0.0 | 2025-01-18 | 初始版本，定义数据格式架构 |

## 12. 相关文档

- [02-core-implementation.md](./02-core-implementation.md) - 核心数据结构定义
- [03-component-design.md](./03-component-design.md) - 组件存储设计
- [07-batch-translation-architecture.md](./07-batch-translation-architecture.md) - 批量翻译架构
- [08-abort-timeout-architecture.md](./08-abort-timeout-architecture.md) - V4架构设计