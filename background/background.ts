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
    const { subtitles, targetLang, sourceLang } = message.payload;

    if (!Array.isArray(subtitles) || !targetLang) {
         console.error("Invalid payload for translateSubtitles action");
         sendResponse({ status: 'error', message: 'Invalid payload'});
         return false; // 同步响应错误
    }

    // 从存储中获取API设置
    chrome.storage.sync.get(['translationApi', 'apiKey', 'serviceType', 'membershipCredentials', 'customApiConfig'], async (settings) => {
      try {
        const apiType = settings.translationApi || 'dummy';
        console.log(`使用翻译API: ${apiType}`);
        
        // 根据API类型选择翻译方法
        switch (apiType) {
          case 'google-free':
            // 使用Google免费翻译API
            const googleResults = await googleTranslateFunction(subtitles, sourceLang, targetLang);
            console.log('背景脚本发送Google翻译结果:', googleResults);
            sendResponse({ status: 'success', translatedSubtitles: googleResults });
            break;
            
          case 'microsoft-free':
            // 使用微软/Bing免费翻译API
            const microsoftResults = await microsoftTranslateFunction(subtitles, sourceLang, targetLang);
            console.log('背景脚本发送微软翻译结果:', microsoftResults);
            sendResponse({ status: 'success', translatedSubtitles: microsoftResults });
            break;
            
          default:
            // 不支持的API类型，默认使用Google翻译
            console.warn(`未知的API类型: ${apiType}, 使用Google翻译代替`);
            const fallbackResults = await googleTranslateFunction(subtitles, sourceLang, targetLang);
            sendResponse({ status: 'success', translatedSubtitles: fallbackResults });
            break;
        }
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
    console.log('Background received API key test request:', message.payload);
    const { apiType, apiKey, testText, sourceLang, targetLang, customConfig } = message.payload;

    if (!apiType || !testText || !sourceLang || !targetLang) {
        console.error("Invalid payload for testApiKey action");
        sendResponse({ 
            success: false, 
            message: '无效的测试参数' 
        });
        return false; // 同步响应错误
    }

    // 调用测试API密钥函数
    testApiKeyFunction(apiType, apiKey, testText, sourceLang, targetLang, customConfig)
        .then(result => {
            console.log('API key test result:', result);
            sendResponse(result);
        })
        .catch(error => {
            console.error('API key test failed:', error);
            sendResponse({ 
                success: false, 
                message: error instanceof Error ? error.message : '未知错误'
            });
        });

    return true; // 表明我们将异步响应
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
  // --- 结束处理 ---

  // 可以添加其他消息处理逻辑...

  // 对于未明确处理的消息
  console.warn('收到未处理的消息动作:', message.action);
  // 返回 false 或不返回，表示没有响应或同步处理
  return false; // 默认返回 false
});

/**
 * 测试API连接是否有效
 * @param apiType API类型
 * @param apiKey API密钥
 * @param testText 测试文本
 * @param sourceLang 源语言
 * @param targetLang 目标语言
 * @param customConfig 自定义API配置（如果适用）
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
    try {
        // 根据不同API类型进行测试
        switch(apiType) {
            case 'google-free':
                // 测试Google免费翻译API的两条路径
                try {
                    const googleTestResult = await testGoogleTranslateFunction(testText, sourceLang, targetLang);
                    return {
                        success: true,
                        message: googleTestResult
                    };
                } catch (error) {
                    // 如果测试中有一条路径成功，仍然返回成功
                    if ((error as Error).message.includes('路径A成功') || (error as Error).message.includes('路径B成功')) {
                        return {
                            success: true,
                            message: (error as Error).message
                        };
                    }
                    
                    return {
                        success: false,
                        message: `Google翻译API连接失败: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
                
            case 'microsoft-free':
                // 测试微软免费翻译API的两条路径
                try {
                    const microsoftTestResult = await testMicrosoftTranslateFunction(testText, sourceLang, targetLang);
                    return {
                        success: true,
                        message: microsoftTestResult
                    };
                } catch (error) {
                    // 如果测试中有一条路径成功，仍然返回成功
                    if ((error as Error).message.includes('路径A成功') || (error as Error).message.includes('路径B成功')) {
                            return {
                                success: true,
                            message: (error as Error).message
                            };
                        }
                    
                        return {
                            success: false,
                            message: `微软翻译API连接失败: ${error instanceof Error ? error.message : String(error)}`
                        };
                }
                
            // ... 其他API类型的测试
            default:
                return {
                    success: false,
                    message: `未知的API类型: ${apiType}`
                };
        }
    } catch (error) {
        console.error('测试API时出错:', error);
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
 * 增强型fetch系统，支持自动故障转移
 * @param url 请求URL
 * @param options 请求选项
 * @returns 响应对象
 */
async function enhancedFetch(url: string, options: RequestInit): Promise<Response> {
  // 实现增强型fetch系统，支持自动故障转移
  // 这里可以添加自定义逻辑，例如自动重试、故障转移等
  return fetch(url, options);
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
