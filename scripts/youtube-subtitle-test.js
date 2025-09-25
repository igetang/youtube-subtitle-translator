/**
 * YouTube字幕测试脚本
 * 监听窗口大小变化，记录字体大小，分析函数关系
 * 测试结果：YouTube字幕使用 font-size: 2.5vw
 */

(function() {
  console.log('%c=== YouTube字幕窗口监控 ===', 'color: #ff6b6b; font-size: 20px; font-weight: bold');

  // 数据收集
  const records = [];
  const maxRecords = 10;
  let isMonitoring = false;
  let resizeTimer = null;

  // 获取当前字幕字体大小
  function getCurrentFontSize() {
    const selectors = [
      '.ytp-caption-segment',
      '.caption-visual-line',
      '.caption-window span'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element && element.textContent && element.textContent.trim()) {
          const styles = window.getComputedStyle(element);
          const fontSize = parseFloat(styles.fontSize);
          if (fontSize > 0) {
            return fontSize;
          }
        }
      }
    }
    return 0;
  }

  // 获取播放器实际大小
  function getPlayerSize() {
    const player = document.querySelector('.html5-video-player');
    const videoStream = document.querySelector('.video-stream.html5-main-video');

    if (videoStream) {
      return {
        width: videoStream.offsetWidth || videoStream.clientWidth,
        height: videoStream.offsetHeight || videoStream.clientHeight,
        element: 'video-stream'
      };
    } else if (player) {
      return {
        width: player.clientWidth,
        height: player.clientHeight,
        element: 'player'
      };
    }
    return { width: 0, height: 0, element: 'none' };
  }

  // 记录当前状态
  function recordData() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const player = getPlayerSize();
    const fontSize = getCurrentFontSize();

    if (fontSize > 0) {
      const record = {
        time: new Date().toLocaleTimeString(),
        windowWidth: windowWidth,
        windowHeight: windowHeight,
        playerWidth: player.width,
        playerHeight: player.height,
        playerElement: player.element,
        fontSize: fontSize,
        fontSizePx: fontSize.toFixed(3) + 'px',
        vwRatio: player.width > 0 ? (fontSize / player.width * 100).toFixed(4) + '%' : 'N/A'
      };

      records.push(record);

      console.log(`%c[${records.length}/${maxRecords}] 已记录`, 'color: #2ecc71');
      console.log(`  窗口: ${windowWidth}×${windowHeight}`);
      console.log(`  播放器: ${player.width}×${player.height} (${player.element})`);
      console.log(`  字体: ${fontSize.toFixed(3)}px`);

      // 检查是否达到记录数量
      if (records.length >= maxRecords) {
        stopMonitoring();
        analyzeData();
      }
    } else {
      console.log('⚠️ 未检测到字幕，跳过记录');
    }

    return record;
  }

  // 分析数据
  function analyzeData() {
    console.log('\n%c=== 数据分析 ===', 'color: #4ecdc4; font-weight: bold');

    if (records.length < 2) {
      console.log('数据不足，需要至少2条记录');
      return;
    }

    // 1. 显示收集的数据
    console.log('\n收集的数据:');
    console.table(records.map((r, i) => ({
      序号: i + 1,
      窗口宽度: r.windowWidth,
      播放器宽度: r.playerWidth,
      字体大小: r.fontSize.toFixed(3),
      比例: r.vwRatio
    })));

    // 2. 线性回归分析
    const n = records.length;
    const sumX = records.reduce((sum, r) => sum + r.playerWidth, 0);
    const sumY = records.reduce((sum, r) => sum + r.fontSize, 0);
    const sumXY = records.reduce((sum, r) => sum + r.playerWidth * r.fontSize, 0);
    const sumX2 = records.reduce((sum, r) => sum + r.playerWidth * r.playerWidth, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    console.log('\n%c=== 函数关系 ===', 'color: #f39c12; font-weight: bold');
    console.log(`线性公式: fontSize = ${slope.toFixed(6)} * playerWidth + ${intercept.toFixed(2)}`);
    console.log(`转换为CSS: font-size: calc(${(slope * 100).toFixed(4)}vw + ${intercept.toFixed(2)}px);`);

    // 3. 计算拟合度
    const yMean = sumY / n;
    const ssTotal = records.reduce((sum, r) => sum + Math.pow(r.fontSize - yMean, 2), 0);
    const ssResidual = records.reduce((sum, r) => {
      const predicted = slope * r.playerWidth + intercept;
      return sum + Math.pow(r.fontSize - predicted, 2);
    }, 0);
    const r2 = 1 - (ssResidual / ssTotal);

    console.log(`拟合度 R²: ${r2.toFixed(4)} (${(r2 * 100).toFixed(2)}%)`);

    if (r2 < 0.9) {
      console.log('⚠️ 拟合度较低，可能不是简单的线性关系');
    }

    // 4. 检查是否有阶梯变化
    const uniqueFontSizes = [...new Set(records.map(r => r.fontSize.toFixed(2)))];
    console.log(`\n检测到 ${uniqueFontSizes.length} 个不同的字体大小:`);
    console.log(uniqueFontSizes.map(s => s + 'px').join(', '));

    if (uniqueFontSizes.length <= 3) {
      console.log('⚠️ 可能是阶梯式变化而非连续变化');

      // 找出断点
      const sorted = records.sort((a, b) => a.playerWidth - b.playerWidth);
      const breakpoints = [];

      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].fontSize - sorted[i-1].fontSize) > 0.5) {
          breakpoints.push({
            atWidth: (sorted[i].playerWidth + sorted[i-1].playerWidth) / 2,
            fromSize: sorted[i-1].fontSize,
            toSize: sorted[i].fontSize
          });
        }
      }

      if (breakpoints.length > 0) {
        console.log('\n断点位置:');
        breakpoints.forEach(bp => {
          console.log(`  在 ${bp.atWidth.toFixed(0)}px 处: ${bp.fromSize.toFixed(2)}px → ${bp.toSize.toFixed(2)}px`);
        });
      }
    }

    // 5. 输出推荐实现
    console.log('\n%c=== 推荐实现方案 ===', 'color: #2ecc71; font-weight: bold');

    if (r2 > 0.95) {
      console.log('✓ 线性关系良好，推荐CSS实现:');
      console.log(`
.subtitle-text {
  font-size: calc(${(slope * 100).toFixed(3)}vw + ${intercept.toFixed(1)}px);
}`);
    } else if (uniqueFontSizes.length <= 3) {
      console.log('✓ 阶梯式变化，推荐媒体查询:');
      const small = Math.min(...records.map(r => r.fontSize));
      const large = Math.max(...records.map(r => r.fontSize));
      const breakpoint = records.find(r => r.fontSize === large)?.playerWidth || 700;

      console.log(`
.subtitle-text {
  font-size: ${small.toFixed(1)}px;
}

@media (min-width: ${breakpoint}px) {
  .subtitle-text {
    font-size: ${large.toFixed(1)}px;
  }
}`);
    } else {
      console.log('✓ 复杂关系，建议JavaScript动态计算');
    }

    // 6. 生成CSV数据
    const csv = 'WindowWidth,PlayerWidth,FontSize\n' +
                records.map(r => `${r.windowWidth},${r.playerWidth},${r.fontSize}`).join('\n');

    console.log('\n%cCSV数据（可复制）:', 'color: #9b59b6; font-weight: bold');
    console.log(csv);

    // 7. 创建预测函数
    window.predictFontSize = (width) => {
      const predicted = slope * width + intercept;
      console.log(`播放器宽度 ${width}px → 预测字体 ${predicted.toFixed(2)}px`);
      return predicted;
    };

    console.log('\n使用 predictFontSize(width) 可以预测任意宽度的字体大小');
  }

  // 开始监听
  function startMonitoring() {
    if (isMonitoring) {
      console.log('已在监听中...');
      return;
    }

    records.length = 0; // 清空之前的数据
    isMonitoring = true;

    console.log('%c开始监听窗口变化...', 'color: #e74c3c; font-weight: bold');
    console.log(`将记录 ${maxRecords} 次窗口变化`);
    console.log('请调整浏览器窗口大小...\n');

    // 记录初始状态
    recordData();

    // 监听窗口resize事件
    window.addEventListener('resize', onWindowResize);
  }

  // 停止监听
  function stopMonitoring() {
    isMonitoring = false;
    window.removeEventListener('resize', onWindowResize);
    console.log('\n监听已停止');
  }

  // 窗口大小变化处理
  function onWindowResize() {
    clearTimeout(resizeTimer);

    // 延迟记录，等待窗口稳定
    resizeTimer = setTimeout(() => {
      if (isMonitoring && records.length < maxRecords) {
        recordData();
      }
    }, 1000); // 1秒后记录
  }

  // 手动记录
  window.record = () => {
    const data = recordData();
    console.log('手动记录完成');
    return data;
  };

  // 导出函数
  window.start = startMonitoring;
  window.stop = stopMonitoring;
  window.analyze = analyzeData;
  window.getData = () => records;
  window.clear = () => {
    records.length = 0;
    console.log('数据已清空');
  };

  // 显示使用说明
  console.log('\n%c使用说明:', 'color: #2ecc71; font-weight: bold');
  console.log('1. start() - 开始监听（自动记录10次）');
  console.log('2. record() - 手动记录当前状态');
  console.log('3. analyze() - 分析已收集的数据');
  console.log('4. stop() - 停止监听');
  console.log('5. clear() - 清空数据');
  console.log('6. getData() - 获取原始数据');

  console.log('\n建议操作流程:');
  console.log('1. 运行 start()');
  console.log('2. 调整窗口大小10次（大、中、小各种尺寸）');
  console.log('3. 等待自动分析结果');

  // 检查字幕是否存在
  if (getCurrentFontSize() > 0) {
    console.log('\n✓ 检测到字幕，可以开始测试');
  } else {
    console.log('\n⚠️ 未检测到字幕，请确保字幕显示后再测试');
  }

  return {
    start,
    stop,
    record,
    analyze,
    getData,
    clear
  };
})();