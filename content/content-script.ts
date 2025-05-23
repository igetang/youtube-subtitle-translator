import { UIManager, UIEvent, ButtonType } from '../src/components/ui-manager';
import { ControlPanel } from '../src/components/control-panel';
import { 
  TranslationDispatcher, 
  TranslationContext as DispatcherContext,
  TranslationPriority
} from '../src/translation/translation-dispatcher';
import { SubtitleMode, TranslationApiType } from '../src/storage/settings-manager';
import { testStoragePermissions } from '../src/storage/storage-test';
import { EventBus, EventPriority } from '../src/events/event-bus';
import { EventTypes } from '../src/events/event-types';

/**
 * @file content-script.ts
 * @description 内容脚本，负责注入主世界脚本、处理消息和控制翻译流程
 */

// 在文件顶部添加接口声明，扩展Window类型
declare global {
  interface Window {
    __uiManagerInitialized?: boolean;
    __uiManagerObserverSetup?: boolean;
    __uiManagerInjecting?: boolean;
    __eventSystemInitialized?: boolean;
    translatedSubtitles?: any[];
  }
}

console.log('>>>>>> 内容脚本已加载 - TS版本 <<<<<<');

// 创建本地事件总线实例
const eventBus = EventBus.getInstance({
  enableLogging: true // 启用日志记录
});

// 全局变量，跟踪主世界脚本的就绪状态
let mainWorldReady = false;
let eventBusReady = false;

// 注入主世界脚本 - 无重试逻辑，简单可靠
function injectMainWorldScript() {
  try {
    const scriptId = 'yt-translator-main-world-script';
    // 如果脚本已存在，不会重复注入
    if (document.getElementById(scriptId)) {
      console.log('[Content Script] 主世界脚本已注入，无需重复操作');
      return;
    }
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = chrome.runtime.getURL('main-world.js');
    
    // 确保插入到<head>
    (document.head || document.documentElement).appendChild(script);
    console.log('[Content Script] 已注入主世界脚本:', script.src);
    
    // 监听脚本加载完成事件
    script.onload = () => {
      console.log('[Content Script] 主世界脚本加载完成');
    };
    
    // 处理脚本加载失败
    script.onerror = (e) => {
      console.error('[Content Script] 主世界脚本加载失败:', e);
    };
  } catch (error) {
    console.error('[Content Script] 注入主世界脚本时出错:', error);
  }
}

// 事件处理
function handleMainWorldEvent(eventType: string, eventData: any): boolean {
  try {
    // 检查是否有处理程序
    if (eventBus.listenerCount(eventType) > 0) {
      // 调用emit方法，使用类型断言忽略返回值类型检查
      (eventBus.emit(eventType, eventData) as any);
      // 成功处理
      return true;
    }
  } catch (error) {
    console.error(`[Content Script] 处理事件 ${eventType} 时出错:`, error);
  }
  
  // 无处理程序或处理出错
  return false;
}

// 设置消息处理
function setupMessageHandlers() {
  window.addEventListener('message', (event: MessageEvent) => {
    // 只处理来自同一窗口的消息
    if (event.source !== window) return;
    
    const { data } = event;
    if (!data || typeof data !== 'object') return;
    
    // 处理主世界脚本就绪消息
    if (data.source === 'main-world' && data.type === 'MAIN_WORLD_READY') {
      console.log('[Content Script] 收到主世界脚本就绪消息');
      mainWorldReady = true;
    }
    
    // 处理EventBus就绪消息
    if (data.source === 'main-world' && data.type === 'EVENTBUS_READY') {
      console.log('[Content Script] 收到EventBus就绪消息');
      eventBusReady = true;
    }
    
    // 处理字幕轨道响应
    if (data.source === 'main-world' && data.type === 'CAPTION_TRACKS_RESPONSE') {
      console.log('[Content Script] 收到字幕轨道响应:', data.payload);
      
      if (data.error) {
        console.error('[Content Script] 获取字幕轨道失败:', data.error);
        // 发送错误事件
        eventBus.emit(EventTypes.TRANSLATION_ERROR, {
          error: `字幕获取失败: ${data.error}`,
          source: 'main_world',
          timestamp: Date.now()
        });
        
        // 向 background 回复错误信息
        chrome.runtime.sendMessage({
          action: 'availableTracksResult',
          error: data.error
        });
        
        return;
      }
      
      const captionTracks = data.payload?.captionTracks;
      if (!captionTracks || captionTracks.length === 0) {
        console.warn('[Content Script] 没有可用的字幕轨道');
        // 发送错误事件
        eventBus.emit(EventTypes.TRANSLATION_ERROR, {
          error: '该视频没有可用的字幕轨道',
          source: 'main_world',
          timestamp: Date.now()
        });
        
        // 向 background 回复无字幕信息
        chrome.runtime.sendMessage({
          action: 'availableTracksResult',
          tracks: []
        });
        
        return;
      }
      
      // 发送字幕加载事件
      eventBus.emit(EventTypes.SUBTITLES_LOADED, {
        tracks: captionTracks,
        videoId: getVideoId(),
        timestamp: Date.now()
      });
      
      // 处理字幕轨道信息，转换为侧边栏需要的格式
      const processedTracks = captionTracks.map((track: any) => ({
        languageCode: track.languageCode,
        languageName: track.name?.simpleText || track.languageCode,
        kind: track.kind || 'standard'
      }));
      
      // 发送轨道信息到后台服务工作器，供侧边栏使用
      console.log('[Content Script] 向后台服务工作器发送字幕轨道信息:', processedTracks.length, '条');
      
      // 添加直接响应getAvailableTracks请求的代码
      chrome.runtime.sendMessage({
        action: 'availableTracksResult',
        tracks: processedTracks
      });
    }
    
    // 处理转发的事件
    if (data.source === 'main-world-eventbus' && data.type === 'EVENT_FORWARDED') {
      const { eventType, eventData } = data;
      if (eventType) {
        console.log(`[Content Script] 收到主世界转发的事件: ${eventType}`);
        const handled = handleMainWorldEvent(eventType, eventData);
        if (handled) {
          console.log(`[Content Script] 已处理主世界转发的事件: ${eventType}`);
        } else {
          console.log(`[Content Script] 没有处理程序处理事件: ${eventType}`);
        }
      }
    }
  });
}

// 替代旧的getEventBus和safeEmit函数
function safeEmit(eventType: string, data: any): boolean {
  return eventBus.emit(eventType, data) > 0;
}

// 初始化事件系统和消息处理
function initializeEventSystem() {
  console.log('[Content Script] 初始化事件系统');
  
  // 记录事件系统初始化状态
  if (window.__eventSystemInitialized) {
    console.log('[Content Script] 事件系统已初始化过，跳过');
    return;
  }
  
  // 标记事件系统初始化
  window.__eventSystemInitialized = true;
  
  // 设置消息处理
  setupMessageHandlers();
  
  // 注入主世界脚本
  injectMainWorldScript();
  
  // 注册处理字幕轨道请求的事件处理函数
  eventBus.on(EventTypes.REQUEST_CAPTION_TRACKS, (data) => {
    console.log('[Content Script] 收到请求字幕轨道信息事件');
    requestCaptionTracks();
  });
  
  // 添加main-world:ready事件监听器，用于初始化UI管理器
  eventBus.on(EventTypes.MAIN_WORLD_READY, (data) => {
    console.log('[Content Script] 收到main-world:ready事件，初始化UI管理器');
    initializeUIManager();
    initializeControlPanel();
  });
  
  console.log('[Content Script] 事件系统初始化完成');
}

// 立即初始化事件系统
initializeEventSystem();

// 确保在初始内容加载后检查是否需要重试注入UI
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Content Script] DOMContentLoaded - 检查UI管理器状态');
  
  // 检查是否已有UI管理器实例并已初始化
  if (window.__uiManagerInitialized) {
    // 检查是否已经成功注入控件
    const uiManager = UIManager.getInstance();
    
    // 只有当控件尚未注入时才尝试注入
    if (!uiManager.getState().controlsInjected && 
        !document.getElementById('vid-translate-toggle-button') && 
        !document.getElementById('vid-translate-settings-button')) {
      console.log('[Content Script] DOMContentLoaded - 控件尚未注入，尝试重新注入');
      uiManager.injectControls().then(success => {
        console.log(`[Content Script] DOMContentLoaded后重新注入控件: ${success ? '成功' : '失败'}`);
      });
    } else {
      console.log('[Content Script] DOMContentLoaded - 控件已注入，无需操作');
    }
  } else {
    console.log('[Content Script] DOMContentLoaded - UI管理器尚未初始化，等待主世界脚本的MAIN_WORLD_READY事件');
  }
});

/**
 * 初始化UI管理器
 */
function initializeUIManager() {
  console.log('[Content Script] >>>>>>> 初始化UI管理器 <<<<<<<');
  
  // 防止重复初始化
  if (window.__uiManagerInitialized) {
    console.log('[Content Script] UI管理器已初始化过，跳过');
    return;
  }
  
  // 标记已初始化
  window.__uiManagerInitialized = true;
  
  console.log('[Content Script] 初始化UI管理器');
  
  // 获取UI管理器实例
  const uiManager = UIManager.getInstance();
  
  // 设置DOM观察器，自动注入控件
  uiManager.setupObserver();
  
  // 监听翻译状态变更事件，处理来自其他组件的状态变更请求
  eventBus.on(EventTypes.TRANSLATE_ACTIVE_CHANGED, (active: boolean) => {
    uiManager.setTranslateActive(active);
  });
  
  // 监听翻译开始请求
  eventBus.on(EventTypes.TRANSLATION_START_REQUESTED, (data) => {
    console.log('[ContentScript] 收到翻译开始请求');
    eventBus.emit(EventTypes.TRANSLATION_STARTED, {
      source: 'ui_manager',
      timestamp: Date.now(),
      ...data
    });
  });
  
  // 监听翻译停止请求
  eventBus.on(EventTypes.TRANSLATION_STOP_REQUESTED, (data) => {
    console.log('[ContentScript] 收到翻译停止请求');
    eventBus.emit(EventTypes.TRANSLATION_FINISHED, {
      source: 'ui_manager',
      reason: 'user_stopped',
      timestamp: Date.now(),
      ...data
    });
  });
  
  console.log('[Content Script] UI管理器初始化完成');
}

/**
 * 初始化翻译控制面板
 */
function initializeControlPanel() {
  console.log('[Content Script] 初始化翻译控制面板');
  
  try {
    // 获取控制面板实例
    const controlPanel = ControlPanel.getInstance();
    
    // 监听翻译开始事件，此时需要加载字幕
    eventBus.on(EventTypes.TRANSLATION_STARTED, (data) => {
      console.log('[ContentScript] 处理翻译开始事件:', data);
      
      // 获取当前视频ID
      const videoId = getVideoId();
      if (videoId) {
        controlPanel.setCurrentVideo(videoId)
          .then(() => {
            // 请求字幕轨道信息
            requestCaptionTracks();
          })
          .catch((error) => {
            console.error('[ContentScript] 设置当前视频ID失败:', error);
          });
      } else {
        console.warn('[ContentScript] 无法获取视频ID，无法开始翻译');
      }
    });
    
    // 监听字幕轨道加载完成事件
    eventBus.on(EventTypes.SUBTITLES_LOADED, (data) => {
      console.log('[ContentScript] 字幕轨道加载完成，开始翻译处理:', data);
      startTranslationProcess(data.tracks, data.videoId);
    });
    
    console.log('[Content Script] 翻译控制面板初始化完成');
  } catch (error) {
    console.error('[Content Script] 初始化翻译控制面板时出错:', error);
  }
}

// 获取当前YouTube视频ID
function getVideoId(): string | null {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  } catch (error) {
    console.error('[ContentScript] 获取视频ID时出错:', error);
    return null;
  }
}

// 请求字幕轨道信息
function requestCaptionTracks() {
  console.log('[ContentScript] 请求字幕轨道信息');
  
  // 向主世界脚本发送请求
  window.postMessage({
    source: 'content-script',
    type: 'REQUEST_CAPTION_TRACKS'
  }, '*');
}

/**
 * 翻译流程处理函数
 * 负责获取字幕数据、翻译处理、显示等完整流程
 * @param captionTracks 字幕轨道数据
 * @param videoId 视频ID
 */
async function startTranslationProcess(captionTracks: any[], videoId: string): Promise<void> {
  console.log('[翻译处理] 开始翻译流程处理...');
  
  try {
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('没有可用的字幕轨道');
    }
    
    // 获取翻译设置
    const settings = await chrome.storage.sync.get(['sourceLang', 'targetLang', 'translationApi']);
    const sourceLang = settings.sourceLang || 'en';
    const targetLang = settings.targetLang || 'zh-CN';
    const translationApi = settings.translationApi || 'google';
    
    console.log(`[翻译处理] 使用设置: 源语言=${sourceLang}, 目标语言=${targetLang}, API=${translationApi}`);
    
    // 查找最匹配的源语言轨道
    const sourceTrack = findBestMatchingTrack(captionTracks, sourceLang);
    if (!sourceTrack) {
      throw new Error(`未找到匹配的${sourceLang}源语言轨道`);
    }
    
    console.log(`[翻译处理] 已找到源语言轨道: ${sourceTrack.languageCode}`);
    
    // 查找是否有原生目标语言轨道
    const targetTrack = findBestMatchingTrack(captionTracks, targetLang);
    const needsTranslation = !targetTrack;
    
    // 获取源字幕数据
    const sourceSubtitles = await fetchSubtitleData(sourceTrack.baseUrl);
    if (!sourceSubtitles || sourceSubtitles.length === 0) {
      throw new Error('无法获取源字幕数据');
    }
    
    console.log(`[翻译处理] 已获取${sourceSubtitles.length}条源字幕`);
    
    if (needsTranslation) {
      // 需要翻译的情况
      console.log('[翻译处理] 未找到原生目标轨道，启动翻译...');
      
      // 创建翻译上下文
      const context: any = {
        videoId,
        sourceEvents: sourceSubtitles,
        sourceLang: sourceTrack.languageCode,
        targetLang,
        translationApi: translationApi as any,
        subtitleMode: 'bilingual' // 使用字符串字面量代替枚举
      };
      
      // 获取翻译调度器实例
      const translationDispatcher = TranslationDispatcher.getInstance();
      
      // 启动渐进式翻译
      translationDispatcher.startProgressiveTranslation(context, (processedEvents) => {
        // 翻译回调处理
        console.log(`[翻译处理] 翻译完成，收到${processedEvents.length}条处理后字幕`);
        
        // 显示翻译后的字幕
        displayTranslatedSubtitles(processedEvents);
      });
    } else {
      // 有原生目标轨道的情况
      console.log('[翻译处理] 找到原生目标轨道，获取目标字幕数据...');
      
      // 获取目标字幕数据
      const targetSubtitles = await fetchSubtitleData(targetTrack.baseUrl);
      if (!targetSubtitles || targetSubtitles.length === 0) {
        throw new Error('无法获取目标字幕数据');
      }
      
      // 合并源和目标字幕
      const mergedSubtitles = mergeSubtitleData(sourceSubtitles, targetSubtitles, targetLang);
      
      // 显示合并后的字幕
      displayTranslatedSubtitles(mergedSubtitles);
    }
  } catch (error) {
    console.error('[翻译处理] 翻译处理出错:', error);
    // 发送翻译错误事件
    eventBus.emit(EventTypes.TRANSLATION_ERROR, {
      error: error instanceof Error ? error.message : '翻译处理未知错误',
      timestamp: Date.now()
    });
    
    // 重置翻译状态
    const uiManager = UIManager.getInstance();
    uiManager.setTranslateActive(false);
  }
}

/**
 * 查找最匹配的字幕轨道
 * @param tracks 字幕轨道数组
 * @param langCode 目标语言代码
 */
function findBestMatchingTrack(tracks: any[], langCode: string): any {
  // 首先尝试完全匹配
  let track = tracks.find(t => t.languageCode === langCode && t.kind !== 'asr' && t.baseUrl);
  
  if (!track) {
    // 尝试基础语言代码匹配
    const baseCode = langCode.split(/[-_]/)[0];
    track = tracks.find(t => t.languageCode === baseCode && t.kind !== 'asr' && t.baseUrl);
    
    if (!track) {
      // 尝试以基础语言开头的匹配
      track = tracks.find(t => t.languageCode.startsWith(baseCode + '-') && t.kind !== 'asr' && t.baseUrl);
    }
  }
  
  return track;
}

/**
 * 获取字幕数据
 * @param baseUrl 字幕URL
 */
async function fetchSubtitleData(baseUrl: string): Promise<any[]> {
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      throw new Error(`字幕请求失败: ${response.status}`);
    }
    
    const text = await response.text();
    return parseSubtitleData(text);
  } catch (error) {
    console.error('[字幕获取] 获取字幕数据出错:', error);
    throw error;
  }
}

/**
 * 解析字幕数据
 * @param subtitleText 字幕文本
 */
function parseSubtitleData(subtitleText: string): any[] {
  // 简单解析实现，可以根据实际字幕格式调整
  try {
    // 尝试解析XML格式字幕
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(subtitleText, 'text/xml');
    
    const events = [];
    const textElements = xmlDoc.getElementsByTagName('text');
    
    for (let i = 0; i < textElements.length; i++) {
      const el = textElements[i];
      const start = parseFloat(el.getAttribute('start') || '0');
      const dur = parseFloat(el.getAttribute('dur') || '0');
      const end = start + dur;
      const text = el.textContent || '';
      
      events.push({
        id: `sub-${i}`,
        start,
        end,
        text,
        langCode: 'unknown' // 会在合并时被覆盖
      });
    }
    
    return events;
  } catch (error) {
    console.error('[字幕解析] 解析字幕数据出错:', error);
    return [];
  }
}

/**
 * 合并源和目标字幕数据
 * @param sourceEvents 源字幕事件
 * @param targetEvents 目标字幕事件
 * @param targetLang 目标语言代码
 */
function mergeSubtitleData(sourceEvents: any[], targetEvents: any[], targetLang: string): any[] {
  // 根据时间匹配合并字幕
  const processed = [];
  
  for (const sourceEvent of sourceEvents) {
    // 查找时间重叠的目标字幕
    const matchingTarget = targetEvents.find(t => 
      (t.start <= sourceEvent.start && t.end > sourceEvent.start) ||
      (t.start >= sourceEvent.start && t.start < sourceEvent.end)
    );
    
    processed.push({
      start: sourceEvent.start,
      end: sourceEvent.end,
      sourceText: sourceEvent.text,
      targetText: matchingTarget ? matchingTarget.text : null,
      sourceLangCode: sourceEvent.langCode,
      targetLangCode: targetLang
    });
  }
  
  return processed;
}

/**
 * 显示翻译后的字幕
 * @param subtitles 处理后的字幕事件
 */
function displayTranslatedSubtitles(subtitles: any[]): void {
  console.log(`[字幕显示] 开始显示${subtitles.length}条字幕`);
  
  // 查找由UIManager创建的字幕叠加层
  let subtitleOverlay = document.getElementById('yt-translate-subtitle-overlay');
  
  if (!subtitleOverlay) {
    console.log('[字幕显示] 未找到字幕叠加层，等待创建');
    // 无需自行创建，由UI管理器负责创建容器
    // 向UI管理器请求创建（可选择通过事件或其他方式）
    eventBus.emit('request:subtitle_overlay', {});
    return;
  }
  
  // 获取视频元素
  const videoElement = document.querySelector('.html5-main-video') as HTMLVideoElement;
  if (!videoElement) {
    console.error('[字幕显示] 无法找到视频元素');
    return;
  }
  
  // 存储字幕数据
  (window as any).translatedSubtitles = subtitles;
  
  // 添加timeupdate事件监听，动态显示字幕
  videoElement.addEventListener('timeupdate', handleSubtitleUpdate);
  
  // 立即显示当前时间的字幕
  handleSubtitleUpdate.call(videoElement);
}

/**
 * 处理字幕更新
 * 在视频timeupdate事件中调用
 */
function handleSubtitleUpdate(this: HTMLVideoElement): void {
  const currentTime = this.currentTime;
  const subtitles = (window as any).translatedSubtitles;
  
  if (!subtitles || !subtitles.length) return;
  
  // 获取字幕叠加层
  const overlay = document.getElementById('yt-translate-subtitle-overlay');
  if (!overlay) return;
  
  // 确保容器可见性
  const container = overlay.querySelector('.translated-subtitles-container') as HTMLElement;
  if (!container) return;
  
  // 查找翻译文本和原文文本元素
  const translatedTextEl = container.querySelector('.translated-text') as HTMLElement;
  const originalTextEl = container.querySelector('.original-text') as HTMLElement;
  if (!translatedTextEl || !originalTextEl) return;
  
  // 查找当前时间应显示的字幕
  const currentSubtitles = subtitles.filter(
    (sub: any) => currentTime >= sub.start && currentTime <= sub.end
  );
  
  if (currentSubtitles.length > 0) {
    // 更新字幕内容
    const currentSub = currentSubtitles[0]; // 使用第一个匹配的字幕
    
    if (currentSub.targetText) {
      translatedTextEl.textContent = currentSub.targetText;
      originalTextEl.textContent = currentSub.sourceText;
      originalTextEl.style.display = 'block'; // 显示原文
    } else {
      translatedTextEl.textContent = currentSub.sourceText;
      originalTextEl.style.display = 'none'; // 隐藏原文
    }
    
    // 显示字幕容器
    overlay.style.visibility = 'visible';
    container.style.visibility = 'visible';
  } else {
    // 没有当前字幕，隐藏显示
    overlay.style.visibility = 'hidden';
    container.style.visibility = 'hidden';
    
    // 清空内容
    translatedTextEl.textContent = '';
    originalTextEl.textContent = '';
  }
}

/**
 * 添加消息监听器处理来自侧边栏的请求
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ContentScript] 收到消息:', message);
  
  // 处理请求可用字幕轨道
  if (message.action === 'requestAvailableTracks') {
    console.log('[ContentScript] 收到来自侧边栏的请求字幕轨道信息请求');
    
    // 触发字幕轨道信息请求
    requestCaptionTracks();
    
    // 由于requestCaptionTracks是异步的，我们不能立即返回数据
    // 向侧边栏返回一个空的响应，实际数据将通过后台服务工作器转发
    sendResponse({ 
      status: 'processing', 
      message: '正在请求字幕轨道信息，数据将通过后台服务工作器返回'
    });
    
    return true; // 保持消息通道开放
  }
  
  // 处理来自background的获取可用字幕轨道请求
  if (message.action === 'getAvailableTracks') {
    console.log(`[ContentScript] 收到来自background的getAvailableTracks请求，videoId: ${message.videoId}`);
    
    // 向主世界脚本请求字幕轨道信息
    window.postMessage({
      source: 'content-script',
      type: 'REQUEST_CAPTION_TRACKS',
      videoId: message.videoId || getVideoId()
    }, '*');
    
    // 告诉 background 我们正在处理请求
    sendResponse({ 
      status: 'processing', 
      message: '正在请求字幕轨道信息'
    });
    
    return true; // 表示我们会异步回复
  }
  
  return false; // 未处理的消息
});
