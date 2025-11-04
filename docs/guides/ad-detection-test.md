# YouTube 广告检测控制台脚本

## 🎯 目标
调试 YouTube 视频广告时，快速判断播放器当前是否处于广告阶段，并比较不同检测手段的准确性。复制本文的脚本到浏览器开发者工具 Console 即可使用。

---

## 🔧 代码片段
```javascript
// 方法1：Player API 状态（getAdState）
function checkAdByPlayerAPI() {
  const player = document.getElementById('movie_player');
  const getAdState = typeof player?.getAdState === 'function' ? player.getAdState() : undefined;
  return {
    adState: getAdState,                 // -1 表示无广告
    isAdPlaying: getAdState !== undefined && getAdState !== -1,
  };
}

// 方法2：播放器 class 标志（推荐）
function checkAdByClassList() {
  const player = document.getElementById('movie_player');
  const classList = player?.classList ?? new DOMTokenList();
  const AD_CLASS_NAMES = ['ad-showing', 'ad-interrupting', 'ad-playing', 'playing-ad'];
  const matchedClasses = AD_CLASS_NAMES.filter(cls => classList.contains(cls));
  return {
    matchedClasses,
    isAdPlaying: matchedClasses.length > 0
  };
}

// 方法3：playerResponse 中的广告信息（可能滞留）
function checkAdByPlayerResponse() {
  const player = document.getElementById('movie_player');
  const playerResponse = typeof player?.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
  const adPlacements = playerResponse?.adPlacements || [];
  const hasPlayerAds = Array.isArray(playerResponse?.playerAds) && playerResponse.playerAds.length > 0;
  return {
    adPlacementsCount: adPlacements.length,
    hasPlayerAds,
    isAdPlaying: adPlacements.length > 0 || hasPlayerAds
  };
}

// 一键输出对比
(function runAllAdChecks() {
  try {
    console.table({
      playerAPI: checkAdByPlayerAPI(),
      classList: checkAdByClassList(),
      playerResponse: checkAdByPlayerResponse(),
    });
  } catch (error) {
    console.error('检测失败:', error);
  }
})();
```

---

## 📋 使用建议
1. 在广告开始、广告结束的瞬间分别执行脚本，观察三种方法返回值的变化。
2. **最可靠**：播放器 class 标志（方法2）；广告结束后该标志会立即清除。
3. **辅助**：`getAdState()`（方法1）。
4. **仅参考**：`playerResponse.adPlacements` / `playerAds`（方法3），广告结束后数据可能短时间滞留。
```
