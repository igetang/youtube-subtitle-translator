/**
 * 后台脚本 (Service Worker)
 */

console.log('后台脚本 (Service Worker) 已启动。');

// --- 设置侧边栏行为：允许点击工具栏图标打开 ---
// (即使我们的主要触发是内容脚本按钮，也与官方示例保持一致)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log('Side panel behavior set.'))
  .catch((error) => console.error('Error setting side panel behavior:', error));

/**
 * 检查 URL 是否为 YouTube 视频或频道等相关页面。
 * @param {string | undefined} urlString - 标签页的 URL。
 * @returns {boolean} 如果是 YouTube 相关页面则返回 true。
 */
function isYoutubeUrl(urlString?: string): boolean {
    if (!urlString) return false;
    try {
        const url = new URL(urlString);
        // 匹配 www.youtube.com 域名，可以根据需要放宽或收紧匹配规则
        return url.hostname === 'www.youtube.com'; 
    } catch (e) {
        return false; // 无效 URL
    }
}

/**
 * 更新指定标签页的 Side Panel 状态。
 * @param {number} tabId - 目标标签页 ID。
 */
async function updateSidePanelState(tabId: number) {
    try {
        const tab = await chrome.tabs.get(tabId);
        // --- 关键检查：确保 tab 和 tab.url 有效 ---
        if (tab && tab.url) { 
            if (isYoutubeUrl(tab.url)) {
                console.log(`启用 Tab ${tabId} (${tab.url}) 的 Side Panel`);
                // --- 动态设置路径并启用 ---
                await chrome.sidePanel.setOptions({
                    tabId: tabId,
                    path: 'sidepanel/sidepanel.html', // 在启用时设置路径
                    enabled: true
                });
            } else {
                console.log(`禁用 Tab ${tabId} (${tab.url}) 的 Side Panel (非 YouTube URL)`);
                await chrome.sidePanel.setOptions({
                    tabId: tabId,
                    enabled: false
                });
            }
        } else {
             console.warn(`无法获取 Tab ${tabId} 的有效 URL，不更改 Side Panel 状态。`);
        }
    } catch (error) {
        console.warn(`更新 Tab ${tabId} 的 Side Panel 状态时出错:`, error);
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

/**
 * 监听来自 Content Script 或其他部分的扩展消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 打印收到的每条消息及其来源，方便调试
  console.log(
    `收到消息: action='${message.action}'`, 
    '来自:', sender.tab ? `Tab ID ${sender.tab.id} (${sender.tab.url})` : '扩展内部',
    '消息体:', message
  );

  // --- 处理打开 Side Panel 的请求 ---
  if (message.action === 'openSidePanel') {
    if (!sender.tab || !sender.tab.id) { // 只需要 tabId 即可
        console.warn('收到 openSidePanel 请求，但缺少有效的 sender.tab.id 信息。', sender);
        sendResponse({ status: 'error', message: 'Invalid sender for opening side panel.' });
        return false; 
    }
    
    const tabId = sender.tab.id;

    // 检查侧边栏是否已为该标签页启用
    chrome.sidePanel.getOptions({ tabId: tabId }, (options) => {
        if (chrome.runtime.lastError) { 
            console.error(`获取 Tab ${tabId} 的 Side Panel 选项时出错:`, chrome.runtime.lastError.message);
            sendResponse({ status: 'error', message: 'Failed to get side panel options.' });
            return; 
        }
        
        if (options.enabled) {
            chrome.sidePanel.open({ tabId: tabId })
              .then(() => {
                  console.log(`Side Panel 已为 Tab ${tabId} 成功打开。`);
                  sendResponse({ status: 'success', message: 'Side Panel opened.' });
              })
              .catch((error) => {
                  console.error(`为 Tab ${tabId} 打开 Side Panel 时出错:`, error);
                  // 检查是否还是 "No active side panel" 错误，或其他错误
                  console.error('Open error details:', error.message);
                  sendResponse({ status: 'error', message: error.message });
              });
        } else {
            console.warn(`尝试为 Tab ${tabId} 打开 Side Panel，但它已被禁用。`);
            sendResponse({ status: 'error', message: 'Side panel is disabled for this tab.' });
        }
    });

    return true; // 告诉 Chrome 我们将异步发送响应
  }
  // --- 新增：处理来自内容脚本的导航完成通知 ---
  else if (message.action === 'youtubeNavigationFinished') {
    if (sender.tab && sender.tab.id) {
        const navigatedTabId = sender.tab.id;
        console.log(`[BG] Received navigation finished from Tab ${navigatedTabId}. Broadcasting notification...`);
        // 广播消息给所有扩展上下文（包括 Side Panel）
        chrome.runtime.sendMessage({ action: 'youtubeNavigationOccurred', navigatedTabId: navigatedTabId });
    } else {
         console.warn('[BG] Received youtubeNavigationFinished without sender tab ID.');
    }
    // 不需要异步响应，可以返回 false 或省略 return
    return false;
  }
  // --- 处理来自内容脚本的翻译请求 ---
  else if (message.action === 'translateSubtitles') {
    console.log('Background received translation request:', message.payload);
    const { subtitles, targetLang } = message.payload;

    if (!Array.isArray(subtitles) || !targetLang) {
         console.error("Invalid payload for translateSubtitles action");
         sendResponse({ status: 'error', message: 'Invalid payload'});
         return false; // 同步响应错误
    }

    // 调用模拟翻译函数 (异步)
    dummyTranslateFunction(subtitles, targetLang)
        .then(translatedSubtitles => {
             console.log('Background sending translation results:', translatedSubtitles);
             sendResponse({ status: 'success', translatedSubtitles: translatedSubtitles });
         })
         .catch(error => {
             console.error('Background dummy translation failed:', error);
             sendResponse({ status: 'error', message: error.message || 'Unknown translation error' });
        });

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
 * 模拟异步翻译功能。
 * @param subtitles 要翻译的字幕数组 {id: string, text: string}[]。
 * @param targetLang 目标语言代码。
 * @returns {Promise<{[id: string]: string}>} 包含翻译结果的对象 {id: translatedText}。
 */
async function dummyTranslateFunction(
    subtitles: { id: string, text: string }[],
    targetLang: string
): Promise<{ [id: string]: string }> {
    console.log(`DUMMY TRANSLATING ${subtitles.length} items to ${targetLang}...`);
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 50)); // 短暂延迟

    const results: { [id: string]: string } = {};
    subtitles.forEach(sub => {
        // 简单的模拟：添加语言代码前缀
        results[sub.id] = `[${targetLang}] ${sub.text}`;
    });

    return results;
}

// 可以在这里添加其他的后台任务初始化代码
// 例如：监听安装事件、设置定时任务 (chrome.alarms) 等
chrome.runtime.onInstalled.addListener(() => {
  console.log('扩展已安装或更新。');
  // 可以在这里进行一些初始化设置
}); 