/**
 * 存储权限测试文件
 * 注意：此测试功能已在实际代码中禁用，但保留导出函数以避免破坏依赖关系
 */

// 检查chrome.storage权限
export function testStoragePermissions() {
  console.log("[权限测试] 开始测试存储权限...");
  
  try {
    // 测试local存储
    chrome.storage.local.set({test_key: "test_value"}, () => {
      if (chrome.runtime.lastError) {
        console.error("[权限测试] local存储写入失败:", chrome.runtime.lastError.message);
      } else {
        console.log("[权限测试] local存储写入成功");
        
        // 测试读取
        chrome.storage.local.get("test_key", (result) => {
          if (chrome.runtime.lastError) {
            console.error("[权限测试] local存储读取失败:", chrome.runtime.lastError.message);
          } else {
            console.log("[权限测试] local存储读取成功:", result);
          }
        });
      }
    });
    
    // 测试sync存储
    chrome.storage.sync.set({sync_test_key: "sync_test_value"}, () => {
      if (chrome.runtime.lastError) {
        console.error("[权限测试] sync存储写入失败:", chrome.runtime.lastError.message);
      } else {
        console.log("[权限测试] sync存储写入成功");
        
        // 测试读取
        chrome.storage.sync.get("sync_test_key", (result) => {
          if (chrome.runtime.lastError) {
            console.error("[权限测试] sync存储读取失败:", chrome.runtime.lastError.message);
          } else {
            console.log("[权限测试] sync存储读取成功:", result);
          }
        });
      }
    });
    
    // 测试临时数据前缀键 (存储在local中)
    console.log("[权限测试] 测试临时数据前缀键 (存储在local中)");
    chrome.storage.local.set({"temp.test_key": "temp_test_value"}, () => {
      if (chrome.runtime.lastError) {
        console.error("[权限测试] 临时数据键写入失败:", chrome.runtime.lastError.message);
      } else {
        console.log("[权限测试] 临时数据键写入成功 (存储在local中)");
        
        // 测试读取
        chrome.storage.local.get("temp.test_key", (result) => {
          if (chrome.runtime.lastError) {
            console.error("[权限测试] 临时数据键读取失败:", chrome.runtime.lastError.message);
          } else {
            console.log("[权限测试] 临时数据键读取成功 (从local中):", result);
          }
        });
      }
    });
    
    return true;
  } catch (error) {
    console.error("[权限测试] 存储权限测试出错:", error);
    return false;
  }
} 