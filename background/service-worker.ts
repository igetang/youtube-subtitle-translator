/**
 * Chrome Extension Service Worker
 */

console.log('Service Worker started.');

// 存储最近的字幕轨道信息
// let cachedTrackInfo: any[] = []; // 再次确保这行重复定义被删除

// 示例：监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed.');
  // 在这里可以进行一些初始化设置，比如设置默认 storage 值
  chrome.storage.sync.set({ featureEnabled: true });
});

// --- 设置侧边栏行为：允许点击工具栏图标打开 ---
// (即使我们的主要触发是内容脚本按钮，也与官方示例保持一致)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log('Side panel behavior set.'))
  .catch((error) => console.error('Error setting side panel behavior:', error));

// --- 处理来自 Content Script 或 Side Panel 的消息 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Service Worker 收到消息:', message, '发送者:', sender);

  // 处理打开侧边栏的请求
  if (message.action === 'openSidePanel') {
    // 确保 windowId 存在且为数字
    const windowId = sender.tab?.windowId;
    if (typeof windowId === 'number') {
      chrome.sidePanel.open({ windowId })
        .then(() => {
          console.log('Side panel opened successfully');
          sendResponse({ status: 'success' });
          
          // 如果有缓存的轨道信息，延迟发送到新打开的 Side Panel
          if (cachedTrackInfo.length > 0) {
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'updateAvailableTracks',
                data: cachedTrackInfo,
                source: 'background',
                note: '这是从缓存中发送的数据'
              }).catch(err => console.error('发送缓存轨道信息出错:', err));
            }, 500); // 延迟500ms，确保 Side Panel 已完全加载
          }
        })
        .catch(error => {
          console.error('Error opening side panel:', error);
          sendResponse({ status: 'error', error: error.message });
        });
    } else {
      console.error('无效的 windowId');
      sendResponse({ status: 'error', error: 'Invalid windowId' });
    }
    return true; // 保持消息通道开放以异步发送响应
  }

  // 处理字幕轨道信息更新
  if (message.action === 'updateAvailableTracks') {
    // 获取当前标签页的 ID
    const tabId = sender.tab?.id;
    
    // 保存到缓存
    if (Array.isArray(message.data)) {
      cachedTrackInfo = [...message.data];
      console.log('字幕轨道信息已缓存:', cachedTrackInfo);
    }

    // 转发消息到 Side Panel
    try {
      chrome.runtime.sendMessage({
        action: 'updateAvailableTracks',
        data: message.data,
        source: 'background',
        forTabId: tabId
      }).then(response => {
        console.log('字幕轨道信息已转发到 Side Panel:', response);
        sendResponse({ status: 'success', response });
      }).catch(error => {
        console.error('转发字幕轨道信息时出错:', error);
        if (error.message.includes('Could not establish connection')) {
          console.log('Side Panel 可能尚未打开，已缓存数据供后续使用');
        }
        sendResponse({ status: 'error', error: error.message });
      });
    } catch (err) {
      console.error('尝试转发时出错:', err);
      sendResponse({ status: 'error', error: String(err) });
    }

    return true; // 保持消息通道开放以异步发送响应
  }

  // 处理 Side Panel 请求字幕轨道信息
  if (message.action === 'requestAvailableTracks') {
    console.log('收到请求字幕轨道信息消息:', message);
    
    if (cachedTrackInfo.length > 0) {
      console.log('正在发送缓存的字幕轨道信息，数量:', cachedTrackInfo.length);
      sendResponse({
        status: 'success',
        data: cachedTrackInfo,
        source: 'cache'
      });
    } else {
      console.log('没有缓存的字幕轨道信息');
      sendResponse({
        status: 'empty',
        message: '没有可用的字幕轨道信息，请在 YouTube 页面点击翻译按钮'
      });
    }
    return true; // 确保返回 true，保持消息通道开放
  }

  // 处理测试连接请求
  if (message.action === 'test') {
    console.log('收到测试消息:', message);
    sendResponse({
      status: 'success',
      message: '连接测试成功',
      timestamp: new Date().toISOString(),
      cachedTracksCount: cachedTrackInfo.length
    });
    return true; // 确保返回 true，保持消息通道开放
  }

  // --- 新增：处理来自 Side Panel 的获取可翻译语言列表的请求 ---
  else if (message.type === 'GET_TRANSLATABLE_LANGUAGES_REQUEST') {
    console.log('收到 GET_TRANSLATABLE_LANGUAGES_REQUEST 请求，来自:', sender);
    const targetTabId = sender.tab?.id;

    if (!targetTabId) {
      console.error('错误：无法从发送者信息获取目标 Tab ID');
      sendResponse({ success: false, error: '无法确定目标 Tab ID' });
      return false; // 不再异步发送
    }

    console.log(`转发 GET_TRANSLATABLE_LANGUAGES 请求到 Tab ID: ${targetTabId}`);
    chrome.tabs.sendMessage(targetTabId, { type: 'GET_TRANSLATABLE_LANGUAGES' }, (response) => {
      if (chrome.runtime.lastError) {
        // 捕获 sendMessage 可能发生的错误 (例如目标 Tab 不存在或 Content Script 未加载)
        console.error('转发消息到 Content Script 时出错:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: `与目标页面通信失败: ${chrome.runtime.lastError.message}` });
      } else if (response) {
        // 将 Content Script 的响应原样转发回 Side Panel
        console.log('收到 Content Script 对语言列表的响应:', response);
        sendResponse(response); // response 应该包含 { success: boolean, languages?: LanguageInfo[], error?: string }
      } else {
        // Content Script 可能没有响应 (例如未返回 true 或没有调用 sendResponse)
        console.error('Content Script 未响应语言列表请求。');
        sendResponse({ success: false, error: 'Content Script 未响应。' });
      }
    });

    return true; // 返回 true，因为我们将异步发送响应
  }
  // --- 新增结束 ---

  // 未处理的消息
  console.log('未处理的消息类型:', message.action);
  return false;
});

// 可以在这里添加其他的后台任务初始化代码
console.log('Service Worker 初始化完成，等待消息...'); 