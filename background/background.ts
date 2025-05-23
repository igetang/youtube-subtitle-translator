/**
 * 后台脚本 - 主模块
 */

console.log('[background/background.ts] >>>>>> 后台脚本已加载 - 版本2 <<<<<<');

/**
 * 后台脚本 (Service Worker)
 */

// 引入优化模块
import { OpenAITranslator } from './openai-translator';
import { RateLimitManager } from './rate-limit-manager';
import { BatchProcessor } from './batch-processor';
import { CacheManager } from './cache-manager';
// --- 新增导入 ---
import { StorageManager, StorageKeys } from '../src/storage/storage-manager';
import { VideoSettingsCache, VideoSettings } from '../src/storage/video-settings-cache';
// --- 新增导入语言处理工具 ---
import { findMatchingTargetLanguage, isLanguageRelevantToUI } from '../src/utils/language-processing';
import { targetLanguages } from '../src/utils/languages'; // 可能需要访问语言列表以获取默认值
// ----------------

console.log('[background/background.ts] 后台脚本 (Service Worker) 已启动。');

// --- 设置侧边栏行为：允许点击工具栏图标打开 ---
// (即使我们的主要触发是内容脚本按钮，也与官方示例保持一致)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log('[background/background.ts] 侧边栏行为已设置。'))
  .catch((error) => console.error('[background/background.ts] 设置侧边栏行为时出错:', error));

/**
 * 检查 URL 是否为 YouTube 视频或频道等相关页面。
 * @param {string | undefined} urlString - 标签页的 URL。
 * @returns {boolean} 如果是 YouTube 相关页面则返回 true。
 */
function isYoutubeUrl(urlString?: string): boolean {
    if (!urlString) return false;
    try {
        const url = new URL(urlString);
        // 仅匹配 https://www.youtube.com 的 origin
        return url.origin === 'https://www.youtube.com';
    } catch (e) {
        return false; // 无效 URL
    }
}

/**
 * 更新指定标签页的 Side Panel 状态。
 * @param {number} tabId - 目标标签页 ID。
 */
async function updateSidePanelState(tabId: number) {
    console.log(`[background/background.ts] 调用 updateSidePanelState，标签页ID: ${tabId}`);
    try {
        const tab = await chrome.tabs.get(tabId);
        // --- 关键检查：确保 tab 和 tab.url 有效 ---
        if (tab && tab.url) {
            if (isYoutubeUrl(tab.url)) {
                console.log(`[background/background.ts] 为 YouTube 标签页 ${tabId} (${tab.url}) 启用侧边栏`);
                await chrome.sidePanel.setOptions({
                    tabId: tabId,
                    path: 'sidepanel/sidepanel.html', // 在启用时设置路径
                    enabled: true
                });
                console.log(`[background/background.ts] 侧边栏已为标签页 ${tabId} 设置为启用`);
            } else {
                console.log(`[background/background.ts] 为非 YouTube 标签页 ${tabId} (${tab.url}) 禁用侧边栏`);
                await chrome.sidePanel.setOptions({
                    tabId: tabId,
                    enabled: false
                });
                console.log(`[background/background.ts] 侧边栏已为标签页 ${tabId} 设置为禁用`);
            }
        } else {
             console.warn(`[background/background.ts] updateSidePanelState：标签页ID ${tabId} 的标签页或URL无效，标签页对象:`, tab);
        }
    } catch (error) {
        console.error(`[background/background.ts] updateSidePanelState：标签页ID ${tabId} 出错:`, error);
    }
}

// --- 监听标签页更新 (保持) --- 
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // --- 关键检查：确保 tab.url 或 changeInfo.url 至少有一个存在 ---
    // (避免在加载初期 URL 未定时过早触发 update)
    if (tab.url || changeInfo.url) { 
        // 直接调用 updateSidePanelState，它内部会 get 最新 tab 信息并检查 URL
        updateSidePanelState(tabId);
    } else {
        // 在 status === 'complete' 时也检查一次，确保最终状态正确
        if (changeInfo.status === 'complete') {
             updateSidePanelState(tabId);
        }
    }
});

// --- 移除 onActivated 监听器 --- 
/*
chrome.tabs.onActivated.addListener(activeInfo => {
    updateSidePanelState(activeInfo.tabId);
});
*/

// --- 恢复 onActivated 监听器 ---
chrome.tabs.onActivated.addListener(activeInfo => {
    console.log(`[background/background.ts] 标签页激活: tabId=${activeInfo.tabId}`);
    updateSidePanelState(activeInfo.tabId);
});

/**
 * 监听来自 Content Script 或其他部分的扩展消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 打印收到的每条消息及其来源，方便调试
  console.log(
    `[background/background.ts] 收到消息: action='${message.action}', 来自: ${sender.tab ? `标签页ID ${sender.tab.id} (${sender.tab.url})` : '扩展内部'}, 消息体:`, message
  );

  // --- 处理打开 Side Panel 的请求 ---
  if (message.action === 'openSidePanel') {
    if (!sender.tab || !sender.tab.id) {
        console.warn('[background/background.ts] 收到 openSidePanel 请求，但缺少有效的发送者标签页ID信息。', sender);
        sendResponse({ status: 'error', message: 'Invalid sender for opening side panel.' });
        return false; // 同步返回错误
    }
    const tabId = sender.tab.id;
    console.log(`[background/background.ts] openSidePanel 处理程序启动，标签页ID = ${tabId}`);

    // 直接打开 Side Panel。
    // 依赖 updateSidePanelState 确保其已为目标标签页启用并设置了路径。
    // chrome.sidePanel.open() 必须在用户手势的直接上下文中调用。
    chrome.sidePanel.open({ tabId })
        .then(() => {
            console.log(`[background/background.ts] 侧边栏已为标签页 ${tabId} 成功打开。`);
            sendResponse({ status: 'success', message: 'Side Panel opened.' });
        })
        .catch((error) => {
            console.error(`[background/background.ts] 为标签页 ${tabId} 打开侧边栏时出错:`, error);
            // 重要的是将具体的错误消息传回，因为它可能包含如\"用户手势\"相关的提示
            sendResponse({ status: 'error', message: error.message || 'Error opening side panel.' });
        });
    return true; // 表明将异步发送响应
  }
  // --- 新增：处理来自内容脚本的导航完成通知 ---
  else if (message.action === 'youtubeNavigationFinished') {
    if (sender.tab && sender.tab.id) {
        const navigatedTabId = sender.tab.id;
        console.log(`[background/background.ts] 收到来自标签页 ${navigatedTabId} 的导航完成消息。正在广播通知...`);
        chrome.runtime.sendMessage({ action: 'youtubeNavigationOccurred', navigatedTabId: navigatedTabId });
    } else {
         console.warn('[background/background.ts] 收到 youtubeNavigationFinished 消息，但缺少发送者标签页ID。');
    }
    return false;
  }
  else if (message.action === 'sidePanelOpened') {
    const { tabId, videoId } = message;
    if (!tabId) {
        console.error('[background/background.ts] sidePanelOpened 消息缺少 tabId。');
        return false;
    }
    console.log(`[background/background.ts] 侧边栏为标签页ID ${tabId} 打开，视频ID: ${videoId}。准备初始化数据。`);
    initializeSidePanel(tabId, videoId);
    return false;
  }
  // --- 新增：处理来自 Side Panel 的设置更新请求 ---
  else if (message.action === 'updateSettings') {
    console.log('[background/background.ts] 收到设置更新请求:', message);
    const { settings, videoId, tabId: msgTabId, sourceTrackKind } = message;
    if (!settings) {
      console.error('[background/background.ts] updateSettings 消息缺少 settings 字段。');
      sendResponse({ success: false, message: '缺少设置数据' });
      return false;
    }
    (async () => {
      try {
        const globalSettingsToSave: Record<string, any> = {
          [StorageKeys.SETTINGS.SUBTITLE_MODE]: settings.subtitleMode,
          [StorageKeys.SETTINGS.TRANSLATION_API]: settings.translationApi,
          [StorageKeys.SETTINGS.API_KEY]: settings.apiKey,
          [StorageKeys.SETTINGS.SERVICE_TYPE]: settings.serviceType,
          [StorageKeys.SETTINGS.CUSTOM_API_CONFIG]: settings.customApiConfig,
          [StorageKeys.SETTINGS.OPENAI_CONFIG]: settings.openaiConfig,
          [StorageKeys.SETTINGS.SOURCE_LANG]: settings.sourceLang, 
          [StorageKeys.SETTINGS.TARGET_LANG]: settings.targetLang
        };
        await StorageManager.getInstance().setBatch(globalSettingsToSave, 'local');
        console.log("[background/background.ts] 全局设置已保存:", globalSettingsToSave);
        if (videoId) {
          const currentVideoSettings = await VideoSettingsCache.getInstance().getVideoSettings(videoId);
          const hasSubtitles = currentVideoSettings?.hasSubtitles ?? true; 
          const videoSpecificSettings: VideoSettings = {
            videoId: videoId,
            sourceLang: settings.sourceLang,
            targetLang: settings.targetLang,
            lastUsed: Date.now(),
            hasSubtitles: hasSubtitles,
            sourceTrackKind: sourceTrackKind
          };
          await VideoSettingsCache.getInstance().saveVideoSettings(videoSpecificSettings);
          console.log(`[background/background.ts] 视频 ${videoId} 的特定设置已保存。`);
        }
        sendResponse({ 
          success: true, 
          message: videoId ? '全局设置和视频特定设置已保存' : '全局设置已保存'
        });
        if (msgTabId) {
          try {
            await chrome.tabs.sendMessage(msgTabId, { 
              action: 'settingsUpdated',
              videoId: videoId,
              settings: {
                sourceLang: settings.sourceLang,
                targetLang: settings.targetLang,
                subtitleMode: settings.subtitleMode,
                translationApi: settings.translationApi
              }
            });
            console.log(`[background/background.ts] 通知标签页 ${msgTabId} 设置已更新。`);
          } catch (notifyError) {
            console.warn(`[background/background.ts] 通知内容脚本设置已更新时出错:`, notifyError);
          }
        }
      } catch (error) {
        console.error('[background/background.ts] 保存设置时出错:', error);
        sendResponse({ 
          success: false, 
          message: error instanceof Error ? error.message : '保存设置时出现未知错误'
        });
      }
    })();
    return true;
  }
  // --- 新增：处理关闭 Side Panel 的请求 ---
  else if (message.action === 'closeSidePanel') {
    if (!sender.tab || !sender.tab.id) {
        console.warn('[background/background.ts] 收到 closeSidePanel 请求，但缺少有效的发送者标签页ID信息。', sender);
        sendResponse({ status: 'error', message: 'Invalid sender for closing side panel.' });
        return false; // 同步返回错误
    }
    const tabId = sender.tab.id;
    console.log(`[background/background.ts] closeSidePanel 处理程序启动，标签页ID = ${tabId}`);

    chrome.sidePanel.setOptions({
        tabId: tabId,
        enabled: false
    }).then(() => {
        console.log(`[background/background.ts] 已禁用标签页 ${tabId} 的侧边栏 (关闭).`);
        // 关键：禁用后，立即调用 updateSidePanelState
        // 这会确保如果该标签页仍符合条件（例如是YouTube页面），
        // 侧边栏会再次被设置为 enabled: true（但不会打开），
        // 为下一次用户点击 openSidePanel 做好准备。
        updateSidePanelState(tabId).then(() => {
            console.log(`[background/background.ts] 禁用标签页 ${tabId} 后调用 updateSidePanelState。`);
        }).catch(error => {
            // 即使 updateSidePanelState 失败，关闭操作本身可能已成功
            console.error(`[background/background.ts] 禁用标签页 ${tabId} 后调用 updateSidePanelState 失败:`, error);
        });
        sendResponse({ status: 'success', message: 'Side Panel closed and state updated.' });
    }).catch((error) => {
        console.error(`[background/background.ts] 为标签页 ${tabId} 关闭侧边栏时出错:`, error);
        sendResponse({ status: 'error', message: error.message || 'Error closing side panel.' });
    });
    return true; // 表明将异步发送响应
  }
  // --- 处理来自内容脚本的翻译请求 ---
  else if (message.action === 'translateSubtitles') {
    console.log('[background/background.ts] 收到翻译请求:', message.payload);
    const { subtitles, targetLang, sourceLang, videoId } = message.payload;

    if (!Array.isArray(subtitles) || !targetLang || !videoId) {
         console.error("[background/background.ts] translateSubtitles 操作的载荷无效");
         sendResponse({ status: 'error', message: 'Invalid payload'});
         return false; // 同步响应错误
    }

    // 从存储中获取API设置
    chrome.storage.sync.get(['translationApi', 'apiKey', 'serviceType', 'membershipCredentials', 'customApiConfig', 'openaiConfig'], async (settings) => {
      try {
        const apiType = settings.translationApi || 'dummy';
        console.log(`[background/background.ts] 使用翻译API: ${apiType}`);
        
        // 导入字幕缓存管理器
        const { SubtitleCacheManager } = await import('./subtitle-cache-manager');
        const subtitleCacheManager = SubtitleCacheManager.getInstance();
        
        // 尝试从缓存获取翻译结果
        const cache = await subtitleCacheManager.getSubtitleCache(videoId, targetLang, apiType);
        
        if (cache) {
          // 检查是否所有字幕都在缓存中
          const allIdsInCache = subtitles.every(subtitle => cache.translations[subtitle.id] !== undefined);
          
          if (allIdsInCache) {
            // 所有字幕都找到缓存，直接使用缓存结果
            console.log(`[背景脚本] 使用缓存的翻译结果, ${Object.keys(cache.translations).length} 条字幕`);
            sendResponse({ 
              status: 'success', 
              translatedSubtitles: cache.translations,
              _fromCache: true // 添加标记，表示使用了缓存
            });
            return;
          } else {
            // 部分字幕未缓存，只翻译缺失的部分
            console.log(`[背景脚本] 部分字幕在缓存中，只翻译缺失部分`);
            
            // 筛选出需要翻译的字幕
            const uncachedSubtitles = subtitles.filter(subtitle => !cache.translations[subtitle.id]);
            
            // 使用已有缓存
            const combinedResults = { ...cache.translations };
            
            // 根据API类型选择翻译方法，并只翻译缺失的部分
            const newResults = await translateWithAPI(uncachedSubtitles, sourceLang, targetLang, apiType, settings);
            
            // 合并结果
            Object.assign(combinedResults, newResults);
            
            // 更新缓存
            await subtitleCacheManager.saveSubtitleCache(videoId, targetLang, apiType, combinedResults);
            
            // 返回完整的翻译结果
            sendResponse({ 
              status: 'success', 
              translatedSubtitles: combinedResults,
              _fromCache: 'partial' // 添加标记，表示部分使用了缓存
            });
            return;
          }
        }
        
        // 缓存未命中，执行完整翻译
        console.log(`[背景脚本] 缓存未命中，执行完整翻译`);
        const translatedSubtitles = await translateWithAPI(subtitles, sourceLang, targetLang, apiType, settings);
        
        // 保存到缓存
        await subtitleCacheManager.saveSubtitleCache(videoId, targetLang, apiType, translatedSubtitles);
        
        // 返回翻译结果
        console.log(`[背景脚本] 翻译完成并已缓存, ${Object.keys(translatedSubtitles).length} 条字幕`);
        sendResponse({ 
          status: 'success', 
          translatedSubtitles,
          _fromCache: false // 添加标记，表示未使用缓存
        });
      } catch (error) {
        console.error('背景脚本翻译失败:', error);
        sendResponse({ 
          status: 'error', 
          message: error instanceof Error ? error.message : '未知翻译错误' 
        });
      }
    });

    return true; // 表明我们将异步响应
  }
  // --- 新增：处理API密钥测试请求 ---
  else if (message.action === 'testApiKey') {
    console.log('Testing API key:', message.apiType);
    
    // 进行异步API测试
    const testText = 'Hello, this is a test message.';
    const sourceLang = 'en';
    const targetLang = 'zh-Hans';
    
    testApiKeyFunction(message.apiType, message.apiKey, testText, sourceLang, targetLang, message.customConfig)
        .then(result => {
            console.log('API test result:', result);
            sendResponse(result);
        })
        .catch(error => {
            console.error('API test error:', error);
            sendResponse({
                success: false,
                message: `测试失败: ${error.message || '未知错误'}`
            });
        });
    
    return true; // 异步响应
  }
  // --- 新增：处理OpenAI模型测试请求 ---
  else if (message.action === 'testOpenAIModel') {
    console.log('Testing OpenAI model:', message.model);
    
    testOpenAIModel(message.apiKey, message.model)
        .then(result => {
            console.log('OpenAI model test result:', result);
            sendResponse(result);
        })
        .catch(error => {
            console.error('OpenAI model test error:', error);
            sendResponse({
                success: false,
                message: `测试失败: ${error instanceof Error ? error.message : '未知错误'}`
            });
        });
    
    return true; // 异步响应
  }
  // 处理免费API测试请求
  else if (message.action === 'testFreeTranslation') {
    console.log('Testing free translation:', message.apiType);
    
    const testText = 'Hello, this is a test message.';
    const sourceLang = 'en';
    const targetLang = 'zh-Hans';
    
    // 根据API类型选择测试函数
    let testFunction: (text: string, source: string, target: string) => Promise<string>;
    
    if (message.apiType === 'google-free') {
        testFunction = testGoogleTranslateFunction;
    } else if (message.apiType === 'microsoft-free') {
        testFunction = testMicrosoftTranslateFunction;
    } else {
        sendResponse({
            success: false,
            message: `不支持的API类型: ${message.apiType}`
        });
        return true;
    }
    
    testFunction(testText, sourceLang, targetLang)
        .then(result => {
            console.log('Free translation test result:', result);
            sendResponse({
                success: true,
                message: result
            });
        })
        .catch(error => {
            console.error('Free translation test error:', error);
            sendResponse({
                success: false,
                message: `测试失败: ${error instanceof Error ? error.message : '未知错误'}`
            });
        });
    
    return true; // 异步响应
  }
  // --- 新增：处理会员账号测试登录请求 ---
  else if (message.action === 'testMembershipLogin') {
    console.log('Background received membership login test request:', message.payload);
    const { apiType, provider } = message.payload;

    if (!apiType || !provider) {
        console.error("Invalid payload for testMembershipLogin action");
        sendResponse({ 
            success: false, 
            message: '无效的登录参数' 
        });
        return false; // 同步响应错误
    }

    // 模拟第三方登录过程
    // 在实际应用中，这里应该使用OAuth或其他第三方验证流程
    console.log(`尝试通过${provider}登录${apiType}服务`);
    
    setTimeout(() => {
        // 模拟登录成功
        console.log(`${provider}登录${apiType}成功`);
        sendResponse({ 
            success: true, 
            message: `${provider}账号登录成功` 
        });
    }, 1000);

    return true; // 表明我们将异步响应
  }
  // --- 新增：处理OpenAI API调用并获取限流信息 ---
  else if (message.action === 'callOpenAI') {
    const { apiKey, endpoint, payload } = message;
    console.log(`[Background] 收到调用OpenAI API请求: ${endpoint}`);
    
    callOpenAIWithRateLimitInfo(apiKey, endpoint, payload)
      .then(result => {
        console.log('[Background] OpenAI API调用成功，获取到限流信息');
        sendResponse({ success: true, info: result });
      })
      .catch(error => {
        console.error('[Background] OpenAI API调用失败:', error);
        // 发送结构化错误信息
        const errorInfo = {
          status: error.status || null,
          message: error.message,
          type: error.type || null,
          code: error.code || null,
          param: error.param || null
        };
        sendResponse({ success: false, error: errorInfo });
      });
      
    return true; // 保持通道开放，延迟回应
  }
  // --- 新增：处理更新速率限制信息请求 ---
  else if (message.action === 'updateRateLimits' && message.headers) {
    try {
      // 获取RateLimitManager实例
      const rateLimitManager = RateLimitManager.getInstance();
      
      // 创建Headers对象
      const headers = new Headers();
      for (const [key, value] of Object.entries(message.headers)) {
        headers.append(key, value as string);
      }
      
      // 更新限流管理器
      rateLimitManager.updateLimits(headers);
      
      // 发送成功响应
      sendResponse({ status: 'success' });
    } catch (error) {
      console.error('更新速率限制信息失败:', error);
      sendResponse({ 
        status: 'error', 
        message: error instanceof Error ? error.message : '未知错误' 
      });
    }
    return true; // 表明我们将异步响应
  }
  // --- 结束处理 ---

  // 可以添加其他消息处理逻辑...

  // 对于未明确处理的消息
  console.warn('收到未处理的消息动作:', message.action);
  // 返回 false 或不返回，表示没有响应或同步处理
  return false; // 默认返回 false
});

/**
 * 测试API密钥功能
 * @param apiType API类型
 * @param apiKey API密钥
 * @param testText 测试文本
 * @param sourceLang 源语言
 * @param targetLang 目标语言
 * @param customConfig 自定义配置
 * @returns 测试结果
 */
async function testApiKeyFunction(
    apiType: string,
    apiKey: string,
    testText: string,
    sourceLang: string,
    targetLang: string,
    customConfig?: any
): Promise<{success: boolean, message: string}> {
    console.log(`测试API密钥: ${apiType}`);
    
    try {
        // 针对不同API类型进行测试处理
        if (apiType === 'openai') {
            // 测试OpenAI API连接
            const modelResult = await testOpenAIModel(apiKey, 'gpt-3.5-turbo');
            return modelResult;
        }
        else if (apiType === 'deepl') {
            // 测试DeepL API连接
            // TODO: 实现DeepL API测试
            return {
                success: false,
                message: 'DeepL API测试功能尚未实现'
            };
        }
        else if (apiType === 'gemini') {
            // 测试Gemini API连接
            // TODO: 实现Gemini API测试
            return {
                success: false,
                message: 'Gemini API测试功能尚未实现'
            };
        }
        else if (apiType === 'deepseek') {
            // 测试DeepSeek API连接
            // TODO: 实现DeepSeek API测试
            return {
                success: false,
                message: 'DeepSeek API测试功能尚未实现'
            };
        }
        else if (apiType === 'qwen') {
            // 测试阿里Qwen API连接
            // TODO: 实现阿里Qwen API测试
            return {
                success: false,
                message: '阿里Qwen API测试功能尚未实现'
            };
        }
        else {
            // 其他API类型，使用原有的测试逻辑
            return {
                success: false,
                message: `API类型 ${apiType} 测试功能尚未实现`
            };
        }
    } catch (error) {
        console.error(`测试API密钥失败: ${apiType}`, error);
        return {
            success: false,
            message: error instanceof Error ? error.message : '未知错误'
        };
    }
}

/**
 * 测试Google翻译路径A
 * @param testText 测试文本
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 测试结果
 */
async function testGoogleTranslatePathA(
  testText: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  try {
    // 使用增强型fetch系统进行测试
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(testText)}`;
    const options = {
      headers: {
        'User-Agent': BROWSER_PROFILES[0].userAgent,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://translate.google.com/',
        'Origin': 'https://translate.google.com'
      }
    };
    
    // 使用增强型fetch系统，支持自动故障转移
    const response = await enhancedFetch(url, options);
    
    const data = await response.json();
    // 解析结果：Google API返回格式为: [[["翻译结果","原文",""],null,"en"]]
    if (data && Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      // 拼接所有翻译段落
      let translatedText = '';
      for (const item of data[0]) {
        if (Array.isArray(item) && item.length > 0) {
          translatedText += item[0];
        }
      }
      return translatedText;
    } else {
      throw new Error('翻译返回格式异常');
    }
  } catch (error) {
    throw new Error(`路径A失败: ${(error as Error).message}`);
  }
}

/**
 * 测试Google翻译路径B
 * @param testText 测试文本
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 测试结果
 */
async function testGoogleTranslatePathB(
  testText: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  try {
    // 简化URL参数，只保留关键参数
    const url = `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(testText)}`;
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://translate.google.com/',
        'Origin': 'https://translate.google.com'
      }
    };
    
    const response = await fetch(url, options);
    
    const data = await response.json();
    // 解析结果
    if (data) {
      if (Array.isArray(data) && data.length > 0) {
        if (typeof data[0] === 'string') {
          // 简单格式：["翻译结果"]
          return data[0];
        } else if (Array.isArray(data[0])) {
          // 复杂格式：[["翻译片段1"],["翻译片段2"]]
          let translatedText = '';
          for (const item of data) {
            if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
              translatedText += item[0];
            }
          }
          return translatedText;
        }
      }
      throw new Error('翻译返回格式异常');
    } else {
      throw new Error('翻译返回空数据');
    }
  } catch (error) {
    throw new Error(`路径B失败: ${(error as Error).message}`);
  }
}

/**
 * 测试Google翻译双路径可用性
 * @param testText 测试文本
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 测试结果消息
 */
async function testGoogleTranslateFunction(
  testText: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  let pathAResult = '失败';
  let pathBResult = '失败';
  let pathATranslation = '';
  let pathBTranslation = '';
  
  // 测试路径A
  try {
    console.log('测试Google翻译路径A...');
    pathATranslation = await testGoogleTranslatePathA(testText, sourceLang, targetLang);
    pathAResult = '成功✅';
  } catch (error) {
    console.error('Google翻译路径A测试失败:', error);
    pathAResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 测试路径B
  try {
    console.log('测试Google翻译路径B...');
    pathBTranslation = await testGoogleTranslatePathB(testText, sourceLang, targetLang);
    pathBResult = '成功✅';
  } catch (error) {
    console.error('Google翻译路径B测试失败:', error);
    pathBResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 生成测试结果消息
  let resultMessage = `Google翻译测试结果:\n`;
  resultMessage += `- 路径A (/translate_a/single): ${pathAResult}\n`;
  resultMessage += `- 路径B (/translate_a/t): ${pathBResult}\n`;
  
  if (pathAResult.includes('成功') || pathBResult.includes('成功')) {
    resultMessage += `\n翻译示例:\n`;
    if (pathAResult.includes('成功')) {
      resultMessage += `- 路径A: "${pathATranslation}"\n`;
    }
    if (pathBResult.includes('成功')) {
      resultMessage += `- 路径B: "${pathBTranslation}"\n`;
    }
    
    // 检查是否有至少一条路径成功
    if (pathAResult.includes('成功') && pathBResult.includes('成功')) {
      return `${resultMessage}\n✅ 两条路径均可用!`;
    } else {
      return `${resultMessage}\n⚠️ 部分路径可用，系统将自动切换`;
    }
  } else {
    return `${resultMessage}\n❌ 所有Google翻译路径均不可用!`;
    }
}

/**
 * 使用Google免费翻译API翻译字幕
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function googleTranslateFunction(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string
): Promise<{ [id: string]: string }> {
  console.log(`使用Google翻译API翻译 ${subtitles.length} 条字幕，从 ${sourceLang} 到 ${targetLang}`);
  
  // 尝试双路径翻译，如果第一条路径失败，自动回退到第二条路径
  try {
    // 首先尝试路径A (优化后的现有实现)
    console.log('尝试Google翻译路径A (/translate_a/single)...');
    return await googleTranslatePathA(subtitles, sourceLang, targetLang);
  } catch (error) {
    // 如果路径A失败，尝试路径B
    console.warn(`Google翻译路径A失败: ${(error as Error).message}`);
    console.log('尝试Google翻译路径B (/translate_a/t)...');
    try {
      return await googleTranslatePathB(subtitles, sourceLang, targetLang);
    } catch (secondError) {
      // 如果两个路径都失败，抛出错误
      console.error(`Google翻译路径B也失败: ${(secondError as Error).message}`);
      throw new Error(`所有Google翻译路径均失败: ${(error as Error).message}; ${(secondError as Error).message}`);
    }
  }
}

/**
 * Google翻译路径A：使用/translate_a/single端点
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function googleTranslatePathA(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string
): Promise<{ [id: string]: string }> {
  const results: { [id: string]: string } = {};
  
  // 批量处理，避免请求过大
  const batchSize = 10;
  const batches = [];
  
  for (let i = 0; i < subtitles.length; i += batchSize) {
    batches.push(subtitles.slice(i, i + batchSize));
  }
  
  // 常见浏览器的User-Agent列表，随机选择以减少被识别为自动化工具的风险
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0'
  ];
  
  for (const batch of batches) {
    // 创建并行请求
    const promises = batch.map(async (subtitle) => {
      try {
        // 随机选择一个User-Agent
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        // 使用增强型fetch系统进行请求
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(subtitle.text)}`;
        const options = {
          headers: {
            'User-Agent': randomUserAgent,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://translate.google.com/',
            'Origin': 'https://translate.google.com'
          }
        };
        
        // 使用增强型fetch系统，支持自动故障转移
        const response = await enhancedFetch(url, options);
        
        const data = await response.json();
        // 解析结果：Google API返回格式为: [[["翻译结果","原文",""],null,"en"]]
        if (data && Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
          // 拼接所有翻译段落
          let translatedText = '';
          for (const item of data[0]) {
            if (Array.isArray(item) && item.length > 0) {
              translatedText += item[0];
            }
          }
          results[subtitle.id] = translatedText;
        } else {
          console.error('Google翻译API返回格式异常:', data);
          throw new Error('翻译返回格式异常');
        }
      } catch (error) {
        console.error(`翻译字幕 "${subtitle.text}" 时出错:`, error);
        throw error; // 重新抛出错误，允许外层处理
      }
    });
    
    try {
    // 等待批次完成
    await Promise.all(promises);
    
    // 添加轻微延迟，避免请求过频
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      throw error; // 重新抛出错误，允许外层处理
    }
  }
  
  // 添加成功提示
  const successCount = Object.keys(results).length;
  console.log(`✅ Google翻译路径A成功完成！共翻译 ${successCount}/${subtitles.length} 条字幕`);
  
  return results;
}

/**
 * Google翻译路径B：使用/translate_a/t端点
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function googleTranslatePathB(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string
): Promise<{ [id: string]: string }> {
  const results: { [id: string]: string } = {};
  
  // 批量处理，避免请求过大
  const batchSize = 5; // 路径B使用更小的批量
  const batches = [];
  
  for (let i = 0; i < subtitles.length; i += batchSize) {
    batches.push(subtitles.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    // 创建并行请求
    const promises = batch.map(async (subtitle) => {
      try {
        // 简化URL参数，只保留关键参数
        const url = `https://translate.googleapis.com/translate_a/t?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(subtitle.text)}`;
        const options = {
          method: 'GET',
          headers: {
            'Accept': '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://translate.google.com/',
            'Origin': 'https://translate.google.com'
          }
        };
        
        // 使用增强型fetch系统，支持自动故障转移
        const response = await enhancedFetch(url, options);
        
        const data = await response.json();
        // 解析结果：这个端点可能有不同的返回格式
        if (data) {
          if (Array.isArray(data) && data.length > 0) {
            if (typeof data[0] === 'string') {
              // 简单格式：["翻译结果"]
              results[subtitle.id] = data[0];
            } else if (Array.isArray(data[0])) {
              // 复杂格式：[["翻译片段1"],["翻译片段2"]]
              let translatedText = '';
              for (const item of data) {
                if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
                  translatedText += item[0];
                }
              }
              results[subtitle.id] = translatedText;
            }
          } else {
            console.error('Google翻译API路径B返回格式异常:', data);
            throw new Error('翻译返回格式异常');
          }
        } else {
          console.error('Google翻译API路径B返回空数据');
          throw new Error('翻译返回空数据');
        }
      } catch (error) {
        console.error(`路径B翻译字幕 "${subtitle.text}" 时出错:`, error);
        throw error; // 重新抛出错误，允许外层处理
      }
    });
    
    try {
      // 等待批次完成
      await Promise.all(promises);
      
      // 路径B使用更长的延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      throw error; // 重新抛出错误，允许外层处理
    }
  }
  
  // 添加成功提示
  const successCount = Object.keys(results).length;
  console.log(`✅ Google翻译路径B成功完成！共翻译 ${successCount}/${subtitles.length} 条字幕`);
  
  return results;
}

/**
 * 生成Google翻译API请求中使用的tk参数
 * 注意：这是一个简化实现，实际的tk生成算法更复杂
 * @param text 要翻译的文本
 * @returns tk参数值
 */
function generateGoogleTk(text: string): string {
  // 这里使用一个简化的算法，实际的tk生成更复杂
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * 使用微软/Bing免费翻译API翻译字幕
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function microsoftTranslateFunction(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string
): Promise<{ [id: string]: string }> {
  console.log(`使用微软翻译API翻译 ${subtitles.length} 条字幕，从 ${sourceLang} 到 ${targetLang}`);
  
  // 尝试双路径翻译，如果第一条路径失败，自动回退到第二条路径
  try {
    // 首先尝试路径A (Edge认证令牌实现)
    console.log('尝试微软翻译路径A (Edge认证令牌)...');
    return await microsoftTranslatePathA(subtitles, sourceLang, targetLang);
  } catch (error) {
    // 如果路径A失败，尝试路径B
    console.warn(`微软翻译路径A失败: ${(error as Error).message}`);
    console.log('尝试微软翻译路径B (API-Edge端点)...');
    try {
      return await microsoftTranslatePathB(subtitles, sourceLang, targetLang);
    } catch (secondError) {
      // 如果两个路径都失败，抛出错误
      console.error(`微软翻译路径B也失败: ${(secondError as Error).message}`);
      throw new Error(`所有微软翻译路径均失败: ${(error as Error).message}; ${(secondError as Error).message}`);
    }
  }
}

/**
 * 微软翻译路径A：使用Edge认证令牌实现
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function microsoftTranslatePathA(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string
): Promise<{ [id: string]: string }> {
  const results: { [id: string]: string } = {};
  
  // 微软API语言代码映射
  const msLangMap: Record<string, string> = {
    'zh-Hans': 'zh-Hans', // 简体中文
    'zh-Hant': 'zh-Hant', // 繁体中文
    'en': 'en',           // 英语
    // 微软翻译支持大多数ISO语言代码，基本不需要映射
  };
  
  // 转换语言代码格式
  const from = msLangMap[sourceLang] || sourceLang;
  const to = msLangMap[targetLang] || targetLang;
  
  // 批量处理，避免请求过大
  const batchSize = 10; // 微软API支持批量请求，每次请求最多10个文本
  const batches = [];
  
  for (let i = 0; i < subtitles.length; i += batchSize) {
    batches.push(subtitles.slice(i, i + batchSize));
  }
  
  try {
    // 使用增强型fetch获取认证令牌
    const tokenUrl = 'https://edge.microsoft.com/translate/auth';
    const tokenOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': '*/*',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      }
    };
    
    const authResponse = await enhancedFetch(tokenUrl, tokenOptions);
    
    if (!authResponse.ok) {
      throw new Error(`无法获取微软翻译认证令牌，状态码: ${authResponse.status}`);
    }
    
    const authToken = await authResponse.text();
    console.log('获取微软翻译认证令牌成功');
    
    for (const batch of batches) {
      try {
        // 准备批量翻译请求体
        const texts = batch.map(subtitle => subtitle.text);
        
        // 使用增强型fetch调用翻译API
        const translationUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}`;
        const translationOptions = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
              'Accept': 'application/json',
              'Origin': 'https://www.bing.com',
              'Referer': 'https://www.bing.com/translator'
            },
            body: JSON.stringify(texts.map(text => ({ Text: text })))
        };
        
        const response = await enhancedFetch(translationUrl, translationOptions);
        
        const data = await response.json();
        
        // 处理翻译结果
        if (Array.isArray(data) && data.length === texts.length) {
          data.forEach((result, index) => {
            const subtitle = batch[index];
            if (result.translations && Array.isArray(result.translations) && result.translations.length > 0) {
              results[subtitle.id] = result.translations[0].text;
            } else {
              throw new Error('微软翻译API返回的结果格式异常');
            }
          });
        } else {
          throw new Error('微软翻译API返回的结果数量与请求不匹配');
        }
      } catch (error) {
        console.error(`批次翻译失败:`, error);
        throw error; // 重新抛出错误，允许外层处理
      }
      
      // 添加轻微延迟，避免请求过频
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 添加成功提示
    const successCount = Object.keys(results).length;
    console.log(`✅ 微软翻译路径A成功完成！共翻译 ${successCount}/${subtitles.length} 条字幕`);
    
    return results;
  } catch (error) {
    console.error('微软翻译路径A失败:', error);
    throw error; // 重新抛出错误，允许外层处理
  }
}

/**
 * 测试微软翻译路径A
 * @param testText 测试文本
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 测试结果
 */
async function testMicrosoftTranslatePathA(
  testText: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  try {
    // 微软API语言代码映射
    const msLangMap: Record<string, string> = {
      'zh-Hans': 'zh-Hans', // 简体中文
      'zh-Hant': 'zh-Hant', // 繁体中文
      'en': 'en',           // 英语
    };
    
    // 转换语言代码格式
    const from = msLangMap[sourceLang] || sourceLang;
    const to = msLangMap[targetLang] || targetLang;
    
    // 使用增强型fetch获取认证令牌
    const tokenUrl = 'https://edge.microsoft.com/translate/auth';
    const tokenOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': '*/*',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      }
    };
    
    const authResponse = await enhancedFetch(tokenUrl, tokenOptions);
    
    if (!authResponse.ok) {
      throw new Error(`无法获取微软翻译认证令牌，状态码: ${authResponse.status}`);
    }
    
    const authToken = await authResponse.text();
    
    // 使用增强型fetch调用翻译API
    const translationUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}`;
    const translationOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': 'application/json',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      },
      body: JSON.stringify([{ Text: testText }])
    };
    
    const response = await enhancedFetch(translationUrl, translationOptions);
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0 && data[0].translations && 
        Array.isArray(data[0].translations) && data[0].translations.length > 0) {
      return data[0].translations[0].text;
        } else {
      throw new Error('翻译结果格式异常');
        }
      } catch (error) {
    throw new Error(`路径A失败: ${(error as Error).message}`);
  }
}

/**
 * 微软翻译路径B：使用API-Edge端点实现
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function microsoftTranslatePathB(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string
): Promise<{ [id: string]: string }> {
  const results: { [id: string]: string } = {};
  
  // 微软API语言代码映射
  const msLangMap: Record<string, string> = {
    'zh-Hans': 'zh-Hans', // 简体中文
    'zh-Hant': 'zh-Hant', // 繁体中文
    'en': 'en',           // 英语
    // 微软翻译支持大多数ISO语言代码，基本不需要映射
  };
  
  // 转换语言代码格式
  const from = msLangMap[sourceLang] || sourceLang;
  const to = msLangMap[targetLang] || targetLang;
  
  // 批量处理，避免请求过大
  const batchSize = 3; // 路径B使用更小的批量
  const batches = [];
  
  for (let i = 0; i < subtitles.length; i += batchSize) {
    batches.push(subtitles.slice(i, i + batchSize));
  }
  
  try {
    // 使用增强型fetch获取认证令牌（与路径A相同）
    const tokenUrl = 'https://edge.microsoft.com/translate/auth';
    const tokenOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': '*/*',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      }
    };
    
    const authResponse = await enhancedFetch(tokenUrl, tokenOptions);
    
    if (!authResponse.ok) {
      throw new Error(`无法获取微软翻译认证令牌，状态码: ${authResponse.status}`);
    }
    
    const authToken = await authResponse.text();
    console.log('获取微软翻译路径B认证令牌成功');
    
    for (const batch of batches) {
      try {
        // 准备批量翻译请求体
        const texts = batch.map(subtitle => subtitle.text);
        
        // 使用增强型fetch调用翻译API
        const translationUrl = `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}&includeSentenceLength=true`;
        const translationOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Accept': 'application/json',
            'Origin': 'https://www.bing.com',
            'Referer': 'https://www.bing.com/translator'
          },
          body: JSON.stringify(texts.map(text => ({ Text: text })))
        };
        
        const response = await enhancedFetch(translationUrl, translationOptions);
        
        // 调试：打印所有响应头，检查 rate limit 头是否存在
        console.log('[Background] OpenAI 响应头:');
        response.headers.forEach((value, key) => console.log(`${key}: ${value}`));

        if (!response.ok) {
          // 尝试获取详细错误信息
          let errorDetail = '';
          try {
            errorDetail = await response.text();
          } catch (e) {
            errorDetail = '无法获取详细错误信息';
          }
          
          throw new Error(`微软翻译路径B请求失败，状态码: ${response.status}，错误详情: ${errorDetail}`);
        }
        
        const data = await response.json();
        
        // 处理翻译结果
        if (Array.isArray(data) && data.length === texts.length) {
          data.forEach((result, index) => {
            const subtitle = batch[index];
            if (result.translations && Array.isArray(result.translations) && result.translations.length > 0) {
              results[subtitle.id] = result.translations[0].text;
            } else {
              throw new Error('微软翻译API-Edge返回的结果格式异常');
            }
          });
        } else {
          throw new Error('微软翻译API-Edge返回的结果数量与请求不匹配');
        }
      } catch (error) {
        console.error(`批次翻译失败:`, error);
        throw error; // 重新抛出错误，允许外层处理
      }
      
      // 路径B使用更长的延迟
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // 添加成功提示
    const successCount = Object.keys(results).length;
    console.log(`✅ 微软翻译路径B成功完成！共翻译 ${successCount}/${subtitles.length} 条字幕`);
    
    return results;
  } catch (error) {
    console.error('微软翻译路径B失败:', error);
    throw error; // 重新抛出错误，允许外层处理
  }
}

/**
 * 测试微软翻译路径B
 * @param testText 测试文本
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 测试结果
 */
async function testMicrosoftTranslatePathB(
  testText: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  try {
    // 微软API语言代码映射
    const msLangMap: Record<string, string> = {
      'zh-Hans': 'zh-Hans', // 简体中文
      'zh-Hant': 'zh-Hant', // 繁体中文
      'en': 'en',           // 英语
    };
    
    // 转换语言代码格式
    const from = msLangMap[sourceLang] || sourceLang;
    const to = msLangMap[targetLang] || targetLang;
    
    // 使用增强型fetch获取认证令牌
    const tokenUrl = 'https://edge.microsoft.com/translate/auth';
    const tokenOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': '*/*',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      }
    };
    
    const authResponse = await enhancedFetch(tokenUrl, tokenOptions);
    
    if (!authResponse.ok) {
      throw new Error(`无法获取微软翻译认证令牌，状态码: ${authResponse.status}`);
    }
    
    const authToken = await authResponse.text();
    
    // 使用增强型fetch调用翻译API
    const translationUrl = `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${to}&includeSentenceLength=true`;
    const translationOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': 'application/json',
        'Origin': 'https://www.bing.com',
        'Referer': 'https://www.bing.com/translator'
      },
      body: JSON.stringify([{ Text: testText }])
    };
    
    const response = await enhancedFetch(translationUrl, translationOptions);
    
    if (!response.ok) {
      // 尝试获取详细错误信息
      let errorDetail = '';
      try {
        errorDetail = await response.text();
      } catch (e) {
        errorDetail = '无法获取详细错误信息';
      }
      
      throw new Error(`微软翻译路径B请求失败，状态码: ${response.status}，错误详情: ${errorDetail}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0 && data[0].translations && 
        Array.isArray(data[0].translations) && data[0].translations.length > 0) {
      return data[0].translations[0].text;
    } else {
      throw new Error('翻译结果格式异常');
    }
  } catch (error) {
    throw new Error(`路径B失败: ${(error as Error).message}`);
  }
}

/**
 * 测试微软翻译双路径可用性
 * @param testText 测试文本
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @returns 测试结果消息
 */
async function testMicrosoftTranslateFunction(
  testText: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  let pathAResult = '失败';
  let pathBResult = '失败';
  let pathATranslation = '';
  let pathBTranslation = '';
  
  // 测试路径A
  try {
    console.log('测试微软翻译路径A...');
    pathATranslation = await testMicrosoftTranslatePathA(testText, sourceLang, targetLang);
    pathAResult = '成功✅';
  } catch (error) {
    console.error('微软翻译路径A测试失败:', error);
    pathAResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 测试路径B
  try {
    console.log('测试微软翻译路径B...');
    pathBTranslation = await testMicrosoftTranslatePathB(testText, sourceLang, targetLang);
    pathBResult = '成功✅';
  } catch (error) {
    console.error('微软翻译路径B测试失败:', error);
    pathBResult = `失败❌ (${(error as Error).message})`;
  }
  
  // 生成测试结果消息
  let resultMessage = `微软翻译测试结果:\n`;
  resultMessage += `- 路径A (Edge认证令牌): ${pathAResult}\n`;
  resultMessage += `- 路径B (API-Edge端点): ${pathBResult}\n`;
  
  if (pathAResult.includes('成功') || pathBResult.includes('成功')) {
    resultMessage += `\n翻译示例:\n`;
    if (pathAResult.includes('成功')) {
      resultMessage += `- 路径A: "${pathATranslation}"\n`;
    }
    if (pathBResult.includes('成功')) {
      resultMessage += `- 路径B: "${pathBTranslation}"\n`;
    }
    
    // 检查是否有至少一条路径成功
    if (pathAResult.includes('成功') && pathBResult.includes('成功')) {
      return `${resultMessage}\n✅ 两条路径均可用!`;
    } else {
      return `${resultMessage}\n⚠️ 部分路径可用，系统将自动切换`;
    }
  } else {
    return `${resultMessage}\n❌ 所有微软翻译路径均不可用!`;
  }
}

/**
 * 使用OpenAI API翻译字幕
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言代码
 * @param targetLang 目标语言代码
 * @param apiKey OpenAI API密钥
 * @param openaiConfig OpenAI配置
 * @returns 翻译结果的对象 {id: translatedText}
 */
async function openaiTranslateFunction(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  openaiConfig: { model: string, customModel: string, temperature: number } = { 
    model: 'gpt-4o', 
    customModel: '', 
    temperature: 0.7 
  }
): Promise<{ [id: string]: string }> {
  console.log(`使用OpenAI翻译API翻译 ${subtitles.length} 条字幕，从 ${sourceLang} 到 ${targetLang}`);
  
  // 使用优化后的OpenAITranslator类
  try {
    const translator = new OpenAITranslator(apiKey, openaiConfig);
    const results = await translator.translateSubtitles(subtitles, sourceLang, targetLang);
    return results;
  } catch (error) {
    console.error('[Background] OpenAI翻译失败:', error);
    throw error;
  }
}

/**
 * 调用OpenAI API并获取限流信息
 * @param apiKey 用户的OpenAI API Key
 * @param endpoint OpenAI接口路径，例如'/v1/chat/completions'
 * @param payload 请求体对象
 * @returns 包含限流信息和响应体的对象
 * @throws 网络或接口异常时抛出错误
 */
async function callOpenAIWithRateLimitInfo(apiKey: string, endpoint: string, payload: any) {
  const url = `https://api.openai.com${endpoint}`;
  const controller = new AbortController();
  
  // 设置10秒超时
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    // 获取和更新速率限制信息
    const rateLimitManager = RateLimitManager.getInstance();
    rateLimitManager.updateLimits(response.headers);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseErr) {
        const errText = await response.text();
        throw new Error(`OpenAI 接口调用失败: ${response.status} ${errText}`);
      }
      const { message, type, code, param } = errorData.error || {};
      const error = new Error(`OpenAI 接口调用失败: ${message}`);
      Object.assign(error, { status: response.status, type, code, param });
      throw error;
    }

    // 获取限流相关响应头
    const rateLimitRequests = response.headers.get('x-ratelimit-limit-requests');
    const rateLimitTokens = response.headers.get('x-ratelimit-limit-tokens');
    const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
    const remainingTokens = response.headers.get('x-ratelimit-remaining-tokens');
    const resetRequests = response.headers.get('x-ratelimit-reset-requests');
    const resetTokens = response.headers.get('x-ratelimit-reset-tokens');

    const data = await response.json();
    // 更新限流信息：若 header 缺失则返回 undefined
    return {
      rateLimitRequests: rateLimitRequests !== null ? Number(rateLimitRequests) : undefined,
      rateLimitTokens: rateLimitTokens !== null ? Number(rateLimitTokens) : undefined,
      remainingRequests: remainingRequests !== null ? Number(remainingRequests) : undefined,
      remainingTokens: remainingTokens !== null ? Number(remainingTokens) : undefined,
      resetRequests: resetRequests !== null ? resetRequests : undefined,
      resetTokens: resetTokens !== null ? resetTokens : undefined,
      responseBody: data
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenAI API请求超时');
    }
    throw error;
  }
}

/**
 * 测试OpenAI模型连接并获取限流信息
 * @param apiKey API密钥
 * @param model 模型名称
 * @returns 测试结果，包含成功状态、消息和可能的限流信息
 */
async function testOpenAIModel(
  apiKey: string,
  model: string
): Promise<{
  success: boolean, 
  message: string, 
  limits?: {
    maxTokens?: number, 
    maxRequests?: number, 
    remainingTokens?: number,
    remainingRequests?: number,
    resetTokens?: string,
    resetRequests?: string
  }
}> {
  try {
    console.log(`测试OpenAI模型: ${model}`);
    
    // 构建简单的chat completions请求
    const payload = {
      model: model,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello, this is a test message. Please respond with 'OK'." }
      ],
      max_tokens: 5
    };
    
    // 使用新的函数调用API并获取限流信息
    const result = await callOpenAIWithRateLimitInfo(apiKey, "/v1/chat/completions", payload);
    console.log("OpenAI API测试成功，获取到限流信息:", result);
    
    // 获取RateLimitManager实例的当前状态
    const rateLimitManager = RateLimitManager.getInstance();
    const limitStatus = rateLimitManager.getLimitStatus();
    
    return {
      success: true,
      message: "API连接成功！",
      limits: {
        maxTokens: limitStatus.tokensLimit,
        maxRequests: limitStatus.requestsLimit,
        remainingTokens: limitStatus.tokensRemaining,
        remainingRequests: limitStatus.requestsRemaining,
        resetTokens: result.resetTokens,
        resetRequests: result.resetRequests
      }
    };
  } catch (error) {
    console.error("OpenAI模型测试失败:", error);
    return {
      success: false,
      message: `测试失败: ${(error as Error).message}`
    };
  }
}

/**
 * 增强型fetch系统，支持自动故障转移和重试
 * @param url 请求URL
 * @param options 请求选项
 * @returns 响应对象
 */
async function enhancedFetch(url: string, options: RequestInit): Promise<Response> {
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 300; // 初始重试延迟（毫秒）
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      // 合并选项，添加信号
      const fetchOptions = {
        ...options,
        signal: controller.signal
      };
      
      // 尝试请求
      console.log(`[enhancedFetch] 尝试请求 ${url} (尝试 #${attempt + 1}/${MAX_RETRIES})`);
      const response = await fetch(url, fetchOptions);
      
      // 请求完成，清除超时
      clearTimeout(timeoutId);
      
      // 如果请求成功但状态码不是2xx，且这是可重试的错误，则尝试重试
      if (!response.ok) {
        // 429 Too Many Requests 和 5xx 服务器错误可重试
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES - 1) {
          let retryAfter = 0;
          
          // 尝试从响应头获取重试延迟
          const retryAfterHeader = response.headers.get('retry-after');
          if (retryAfterHeader) {
            // retry-after可以是秒数或日期字符串
            retryAfter = isNaN(Number(retryAfterHeader)) 
              ? new Date(retryAfterHeader).getTime() - Date.now()
              : Number(retryAfterHeader) * 1000;
            
            // 确保重试延迟在合理范围内
            retryAfter = Math.max(0, Math.min(retryAfter, 10000)); // 最多等待10秒
          } else {
            // 指数退避重试策略
            retryAfter = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          }
          
          console.log(`[enhancedFetch] 请求返回状态码 ${response.status}，${retryAfter}ms后重试`);
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          continue; // 尝试下一次请求
        }
      }
      
      // 请求成功或不可重试的错误，直接返回响应
      return response;
      
    } catch (error: any) {
      lastError = error;
      
      // 判断是否为可重试的错误（网络错误、超时等）
      const isRetryable = 
        error.name === 'TypeError' || // 网络错误
        error.name === 'AbortError' || // 超时
        error.message && (
          error.message.includes('network') || 
          error.message.includes('timeout') || 
          error.message.includes('aborted')
        );
      
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        // 指数退避重试策略
        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[enhancedFetch] 请求失败: ${error.message}, ${retryDelay}ms后重试`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      // 不可重试或已达到最大重试次数，抛出最后一个错误
      break;
    }
  }
  
  // 如果所有重试都失败，抛出最后一个错误
  throw lastError || new Error('请求失败，未知原因');
}

/**
 * 常见浏览器的User-Agent列表，随机选择以减少被识别为自动化工具的风险
 */
const BROWSER_PROFILES = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    // 其他属性...
  },
  // 其他浏览器配置...
];

/**
 * 根据API类型选择翻译方法
 * @param subtitles 要翻译的字幕数组
 * @param sourceLang 源语言
 * @param targetLang 目标语言
 * @param apiType API类型
 * @param settings 设置对象
 * @returns 翻译结果对象
 */
async function translateWithAPI(
  subtitles: { id: string, text: string }[],
  sourceLang: string,
  targetLang: string,
  apiType: string,
  settings: any
): Promise<{ [id: string]: string }> {
  switch (apiType) {
    case 'google-free':
      // 使用Google免费翻译API
      return await googleTranslateFunction(subtitles, sourceLang, targetLang);
      
    case 'microsoft-free':
      // 使用微软/Bing免费翻译API
      return await microsoftTranslateFunction(subtitles, sourceLang, targetLang);
    
    case 'openai':
      // 使用OpenAI翻译API
      if (!settings.apiKey) {
        throw new Error('未提供OpenAI API密钥');
      }
      return await openaiTranslateFunction(
        subtitles, 
        sourceLang, 
        targetLang,
        settings.apiKey,
        settings.openaiConfig
      );
      
    default:
      // 不支持的API类型，默认使用Google翻译
      console.warn(`未知的API类型: ${apiType}, 使用Google翻译代替`);
      return await googleTranslateFunction(subtitles, sourceLang, targetLang);
  }
}

// 默认全局设置 (基于 sidepanel.ts 中的 defaultSettings)
const globalDefaultSettings = {
    sourceLang: '',
    targetLang: '',
    subtitleMode: 'bilingual', // 新增或确认默认值
    translationApi: 'google-free', // 新增或确认默认值
    apiKey: '',
    serviceType: 'api-key', // 确认这个是否需要成为一个更明确的全局设置项或依赖于 translationApi
    membershipCredentials: { loggedIn: false, provider: undefined, userId: '' },
    customApiConfig: {
        url: '',
        method: 'POST',
        headers: '{\\"Content-Type\\": \\"application/json\\"}', // JSON stringified
        body: '{\\"text\\": \\"{text}\\", \\"source\\": \\"{source}\\", \\"target\\": \\"{target}\\"}', // JSON stringified
        responsePath: 'data.translations[0].text'
    },
    openaiConfig: {
        model: 'gpt-4o',
        customModel: '',
        temperature: 0.7
    }
};

/**
 * 初始化侧边面板数据
 * @param tabId 标签页ID
 * @param videoIdFromSidePanel 侧边面板传递的videoId (可选)
 */
async function initializeSidePanel(tabId: number, videoIdFromSidePanel?: string | null) {
  console.log(`[background/background.ts] 调用 initializeSidePanel，标签页ID: ${tabId}, 来自侧边栏的视频ID: ${videoIdFromSidePanel}`);

  // 步骤 1: 加载全局设置
  const globalSettings = await loadAndApplyGlobalSettings();
  console.log('[background/background.ts] initializeSidePanel: 加载的全局设置:', globalSettings);

  // 步骤 1.5: 获取浏览器UI语言
  const uiLang = chrome.i18n.getUILanguage();
  console.log(`[background/background.ts] initializeSidePanel: 获取到的浏览器UI语言: ${uiLang}`);

  // 步骤 2: 确定要使用的 Video ID
  const currentVideoId = videoIdFromSidePanel || await getVideoIdForTab(tabId);

  // 新增：用于存储轨道请求相关的错误信息
  let trackRequestErrorMessage: string | undefined = undefined;

  if (!currentVideoId) {
    console.warn(`[background/background.ts] initializeSidePanel: 未能确定标签页 ${tabId} 的视频ID。侧边栏可能无法完全初始化。`);
    // 仍然发送一个包含错误状态的 initializeSidePanelUI，让 sidepanel 知道出了问题
    chrome.runtime.sendMessage({
      action: 'initializeSidePanelUI',
      tabId: tabId,
      data: { 
        state: 'error', 
        message: '无法获取 Video ID', 
        settings: { globalSettings: globalSettings, uiLangCode: uiLang }, // 发送一些基础信息
        availableTracks: [],
        videoId: null
      }
    }).catch(e => console.warn("[background/background.ts] initializeSidePanel: 发送 'error' 状态到侧边栏时出错:", e));
    return;
  }
  console.log(`[background/background.ts] initializeSidePanel: 使用的视频ID: ${currentVideoId}`);

  // 步骤 3: 加载特定视频的设置（检查缓存）
  const videoSettings = await VideoSettingsCache.getInstance().getVideoSettings(currentVideoId);
  
  let hasSubtitles = false;
  let availableTracks: { languageCode: string, languageName: string, kind: string }[] = [];
  let determinedSourceLang = '';
  let determinedTargetLang = '';
  
  if (videoSettings) {
    console.log(`[background/background.ts] initializeSidePanel: 加载的视频 ${currentVideoId} 的特定设置:`, videoSettings);
    hasSubtitles = videoSettings.hasSubtitles;
    if (hasSubtitles) {
      console.log(`[background/background.ts] initializeSidePanel: 缓存显示视频有字幕，使用缓存数据`);
      const cachedTracks = await StorageManager.getInstance().get(
        `${StorageKeys.CACHE.VIDEO_TRACKS_PREFIX}${currentVideoId}`,
        [] as { languageCode: string, languageName: string, kind: string }[],
        'local'
      );
      availableTracks = cachedTracks;
      determinedSourceLang = videoSettings.sourceLang;
      determinedTargetLang = videoSettings.targetLang;
      console.log(`[background/background.ts] initializeSidePanel: 使用缓存的源语言: ${determinedSourceLang}, 目标语言: ${determinedTargetLang}`);
    } else {
      console.log(`[background/background.ts] initializeSidePanel: 缓存显示视频无字幕`);
      hasSubtitles = false;
      availableTracks = [];
    }
  } else {
    console.log(`[background/background.ts] initializeSidePanel: 未找到 videoId: ${currentVideoId} 的特定视频设置，请求内容脚本获取轨道信息`);
    
    // REMOVED: 不再向侧边栏发送 loadingTracks 状态
    
    try {
      console.log(`[background/background.ts] 向内容脚本请求轨道: 标签页ID=${tabId}, 视频ID=${currentVideoId}`);
      chrome.tabs.sendMessage(tabId, {
        action: 'getAvailableTracks',
        videoId: currentVideoId
      });
      
      const tracksResponse = await new Promise<{tracks?: any[], error?: string}>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('请求字幕轨道超时'));
        }, 10000);
        const messageListener = (message: any, senderCandidate: chrome.runtime.MessageSender) => {
          if (senderCandidate.tab && senderCandidate.tab.id === tabId && message.action === 'availableTracksResult') {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(messageListener);
            resolve({
              tracks: message.tracks || [],
              error: message.error
            });
          }
        };
        chrome.runtime.onMessage.addListener(messageListener);
      });
      
      if (tracksResponse.tracks && tracksResponse.tracks.length > 0) {
        console.log(`[background/background.ts] 内容脚本返回了 ${tracksResponse.tracks.length} 条轨道`);
        hasSubtitles = true;
        availableTracks = tracksResponse.tracks;
        determinedSourceLang = selectBestSourceLanguage(availableTracks);
        console.log(`[background/background.ts] 根据优先级规则选择的源语言: ${determinedSourceLang}`);
        await StorageManager.getInstance().set(
          `${StorageKeys.CACHE.VIDEO_TRACKS_PREFIX}${currentVideoId}`,
          availableTracks,
          'local'
        );
      } else {
        console.log(`[background/background.ts] 内容脚本未返回轨道或出错: ${tracksResponse.error || '无轨道'}`);
        trackRequestErrorMessage = tracksResponse.error || '内容脚本未返回轨道信息'; // 捕获错误信息
        hasSubtitles = false;
        availableTracks = [];
      }
    } catch (error) {
      console.error(`[background/background.ts] 请求字幕信息失败:`, error);
      trackRequestErrorMessage = error instanceof Error ? error.message : '请求字幕信息时发生未知错误'; // 捕获错误信息
      hasSubtitles = false;
      availableTracks = [];
    }
  }
  
  if (!determinedSourceLang) {
    determinedSourceLang = globalSettings[StorageKeys.SETTINGS.SOURCE_LANG] || 'en';
    console.log(`[background/background.ts] 使用全局设置或默认源语言: ${determinedSourceLang}`);
  }
  
  if (!determinedTargetLang) {
    determinedTargetLang = globalSettings[StorageKeys.SETTINGS.TARGET_LANG];
    if (!determinedTargetLang || !targetLanguages.some(l => l.code === determinedTargetLang)) {
      const matchedLang = findMatchingTargetLanguage(uiLang);
      determinedTargetLang = matchedLang ? matchedLang.code : 'en';
      console.log(`[background/background.ts] 使用基于UI语言(${uiLang})的目标语言: ${determinedTargetLang}`);
    } else {
      console.log(`[background/background.ts] 使用全局设置的目标语言: ${determinedTargetLang}`);
    }
  }
  
  const settingsForSidePanel = {
    globalSettings: globalSettings,
    videoSettings: videoSettings, 
    determinedSourceLang: determinedSourceLang,
    determinedTargetLang: determinedTargetLang,
    hasSubtitles: hasSubtitles,
    uiLangCode: uiLang
  };
  
  if (!videoSettings || videoSettings.hasSubtitles !== hasSubtitles || videoSettings.sourceLang !== determinedSourceLang || videoSettings.targetLang !== determinedTargetLang) {
    console.log(`[background/background.ts] 更新VideoSettingsCache: 视频ID=${currentVideoId}, 源语言=${determinedSourceLang}, 目标语言=${determinedTargetLang}, 是否有字幕=${hasSubtitles}`);
    await VideoSettingsCache.getInstance().saveVideoSettings({
      videoId: currentVideoId,
      sourceLang: determinedSourceLang,
      targetLang: determinedTargetLang,
      lastUsed: Date.now(),
      hasSubtitles: hasSubtitles,
      sourceTrackKind: availableTracks.find(t => t.languageCode === determinedSourceLang)?.kind
    });
  }
  
  console.log(`[background/background.ts] 向侧边栏发送初始化数据: 是否有字幕=${hasSubtitles}, 字幕轨道数量=${availableTracks.length}`);
  chrome.runtime.sendMessage({
    action: 'initializeSidePanelUI',
    tabId: tabId,
    data: {
      state: hasSubtitles ? 'ready' : (availableTracks.length === 0 && !videoSettings?.hasSubtitles ? 'noTracks' : 'error'),
      videoId: currentVideoId,
      availableTracks: availableTracks,
      settings: settingsForSidePanel,
      message: !hasSubtitles ? (trackRequestErrorMessage || 'No subtitles available') : undefined // 使用 trackRequestErrorMessage
    }
  }).catch(e => console.warn("[background/background.ts] 发送到侧边栏失败:", e));
}

async function getVideoIdForTab(tabId: number): Promise<string | null> {
  try {
    const tabVideoIdMap = await StorageManager.getInstance().get<{[key: number]: string} | undefined>(
        StorageKeys.TEMP.LAST_KNOWN_VIDEO_ID_FOR_TAB, 
        undefined, 
        'local'
    );
    if (tabVideoIdMap && tabVideoIdMap[tabId]) {
      console.log(`[background/background.ts] getVideoIdForTab: 在存储中为标签页 ${tabId} 找到视频ID ${tabVideoIdMap[tabId]}.`);
      return tabVideoIdMap[tabId];
    }
    console.log(`[background/background.ts] getVideoIdForTab: 标签页 ${tabId} 的视频ID不在存储中。正在查询内容脚本。`);
    const response = await chrome.tabs.sendMessage(tabId, { action: 'requestCurrentVideoId' });
    if (response && response.videoId) {
      console.log(`[background/background.ts] getVideoIdForTab: 从内容脚本收到标签页 ${tabId} 的视频ID ${response.videoId}.`);
      const newMap = { ...(tabVideoIdMap || {}), [tabId]: response.videoId };
      await StorageManager.getInstance().set(StorageKeys.TEMP.LAST_KNOWN_VIDEO_ID_FOR_TAB, newMap, 'local');
      return response.videoId;
    }
    console.log(`[background/background.ts] getVideoIdForTab: 内容脚本未返回标签页 ${tabId} 的视频ID。`);
    return null;
  } catch (error) {
    console.warn(`[background/background.ts] getVideoIdForTab: 获取标签页 ${tabId} 的视频ID时出错:`, error);
    return null;
  }
}

async function loadAndApplyGlobalSettings() {
  try {
    const settings = await StorageManager.getInstance().getBatch([
      StorageKeys.SETTINGS.TRANSLATION_API,
      StorageKeys.SETTINGS.API_KEY,
      StorageKeys.SETTINGS.TARGET_LANG,
      StorageKeys.SETTINGS.SOURCE_LANG,
      StorageKeys.SETTINGS.SUBTITLE_MODE, // 新增获取
      StorageKeys.SETTINGS.FONT_SIZE,
      StorageKeys.SETTINGS.FONT_COLOR,
      StorageKeys.SETTINGS.BACKGROUND_COLOR,
      StorageKeys.SETTINGS.TEXT_STROKE_COLOR,
      StorageKeys.SETTINGS.TEXT_STROKE_WIDTH,
      StorageKeys.SETTINGS.LINE_WRAPPING_MODE,
      StorageKeys.SETTINGS.MAX_LINES_PER_CAPTION,
      StorageKeys.SETTINGS.AUTO_DETECT_SOURCE_LANGUAGE,
      StorageKeys.SETTINGS.OPENAI_CONFIG_MODEL,
      StorageKeys.SETTINGS.OPENAI_CONFIG_CUSTOM_MODEL,
      StorageKeys.SETTINGS.OPENAI_CONFIG_TEMPERATURE,
    ], 'local');

    console.log('[background/background.ts] loadAndApplyGlobalSettings: 全局设置已加载:', settings);
    // 将可能未定义的设置补充为null或默认值，确保返回的对象结构完整
    const defaultedSettings: Record<string, any> = {};
    const allGlobalSettingKeys = [
        StorageKeys.SETTINGS.TRANSLATION_API, StorageKeys.SETTINGS.API_KEY, StorageKeys.SETTINGS.TARGET_LANG,
        StorageKeys.SETTINGS.SOURCE_LANG, StorageKeys.SETTINGS.SUBTITLE_MODE, // 新增处理
        StorageKeys.SETTINGS.FONT_SIZE, StorageKeys.SETTINGS.FONT_COLOR,
        StorageKeys.SETTINGS.BACKGROUND_COLOR, StorageKeys.SETTINGS.TEXT_STROKE_COLOR, StorageKeys.SETTINGS.TEXT_STROKE_WIDTH,
        StorageKeys.SETTINGS.LINE_WRAPPING_MODE, StorageKeys.SETTINGS.MAX_LINES_PER_CAPTION, 
        StorageKeys.SETTINGS.AUTO_DETECT_SOURCE_LANGUAGE, StorageKeys.SETTINGS.OPENAI_CONFIG_MODEL,
        StorageKeys.SETTINGS.OPENAI_CONFIG_CUSTOM_MODEL, StorageKeys.SETTINGS.OPENAI_CONFIG_TEMPERATURE
    ];
    allGlobalSettingKeys.forEach(key => {
        defaultedSettings[key] = settings[key] !== undefined ? settings[key] : (globalDefaultSettings as any)[key.replace('settings.', '')] ?? null;
    });

    // 这里可以根据加载的设置执行一些全局操作
    return defaultedSettings;
  } catch (error) {
    console.error('[background/background.ts] loadAndApplyGlobalSettings: 加载或应用全局设置时出错:', error);
    return {}; 
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') { 
    let globalSettingsChanged = false;
    const globalSettingKeysArray: string[] = [
        StorageKeys.SETTINGS.TRANSLATION_API,
        StorageKeys.SETTINGS.API_KEY,
        StorageKeys.SETTINGS.TARGET_LANG,
        StorageKeys.SETTINGS.SOURCE_LANG,
        StorageKeys.SETTINGS.SUBTITLE_MODE, // 新增获取
        StorageKeys.SETTINGS.FONT_SIZE,
        StorageKeys.SETTINGS.FONT_COLOR,
        StorageKeys.SETTINGS.BACKGROUND_COLOR,
        StorageKeys.SETTINGS.TEXT_STROKE_COLOR,
        StorageKeys.SETTINGS.TEXT_STROKE_WIDTH,
        StorageKeys.SETTINGS.LINE_WRAPPING_MODE,
        StorageKeys.SETTINGS.MAX_LINES_PER_CAPTION,
        StorageKeys.SETTINGS.AUTO_DETECT_SOURCE_LANGUAGE,
        StorageKeys.SETTINGS.OPENAI_CONFIG_MODEL,
        StorageKeys.SETTINGS.OPENAI_CONFIG_CUSTOM_MODEL,
        StorageKeys.SETTINGS.OPENAI_CONFIG_TEMPERATURE,
    ];

    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
      if (globalSettingKeysArray.includes(key)) { // No need for 'as StorageKeys.SETTINGS' with string array
        console.log(
          `[background/background.ts] onChanged: 存储项 "${key}" 从`,
          oldValue,
          '变为',
          newValue
        );
        globalSettingsChanged = true;
      }
    }

    if (globalSettingsChanged) {
      console.log('[background/background.ts] onChanged: 检测到全局设置相关存储更改，重新加载设置并通知侧边栏。');
      loadAndApplyGlobalSettings();
      chrome.runtime.sendMessage({ action: 'globalSettingsPossiblyChanged' })
        .catch(e => {
          if (e.message && (e.message.includes("Could not establish connection") || e.message.includes("Receiving end does not exist"))) {
            console.log("[background/background.ts] onChanged: 通知侧边栏全局设置更改失败 (可能未打开或未连接).");
          } else {
            console.warn("[background/background.ts] onChanged: 通知侧边栏全局设置更改时出错:", e);
          }
        });
    }
  }
});

/**
 * 从可用字幕轨道中选择最佳源语言
 * @param tracks 可用字幕轨道
 * @returns 选择的源语言代码
 */
function selectBestSourceLanguage(tracks: { languageCode: string, languageName: string, kind: string }[]): string {
  if (!tracks || tracks.length === 0) {
    return ''; // P4: 无字幕情况 (返回空字符串，initializeSidePanel会据此设置hasSubtitles)
  }
  
  // P1: 选择非ASR英语 (包含各种变种)
  const nonAsrEnglishTrack = tracks.find(track => 
    track.languageCode.startsWith('en') && 
    track.kind !== 'asr'
  );
  if (nonAsrEnglishTrack) {
    return nonAsrEnglishTrack.languageCode;
  }

  // P2: 选择ASR英语 (包含各种变种)
  const asrEnglishTrack = tracks.find(track => 
    track.languageCode.startsWith('en') && 
    track.kind === 'asr'
  );
  if (asrEnglishTrack) {
    return asrEnglishTrack.languageCode;
  }
  
  // P3: 选择获取语言列表中的第一个语言种类
  // (此时availableTracks.length > 0 必然成立，因为P4已处理空数组)
  return tracks[0].languageCode;
}
