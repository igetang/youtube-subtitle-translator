# 检查参考项目字幕容器CSS参数

## 📋 使用说明

1. **打开YouTube视频页面**（确保Immersive Translate翻译已开启）
2. **按 F12** 打开浏览器控制台（DevTools）
3. **切换到 Console 标签**
4. **复制下面的JavaScript代码并粘贴到控制台**
5. **按回车执行**
6. **将输出的JSON数据复制给Claude**

---

## 🔍 检查脚本

```javascript
// 🔍 检查参考项目（Immersive Translate）的字幕容器CSS
// 在YouTube视频页面的浏览器控制台执行此脚本

console.log('========== 参考项目字幕容器CSS检查 ==========\n');

const selectors = [
  '.imt-caption-container',
  '#immersive-translate-caption-window',
  '.imt-caption-window'
];

const result = {};

selectors.forEach(selector => {
  const el = document.querySelector(selector);

  if (el) {
    const styles = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    console.log(`\n📦 ${selector}`);
    console.log('-------------------');
    console.log('基本信息:');
    console.log(`  tagName: ${el.tagName}`);
    console.log(`  id: ${el.id}`);
    console.log(`  className: ${el.className}`);

    console.log('\n定位相关:');
    console.log(`  position: ${styles.position}`);
    console.log(`  top: ${styles.top}`);
    console.log(`  bottom: ${styles.bottom}`);
    console.log(`  left: ${styles.left}`);
    console.log(`  right: ${styles.right}`);

    console.log('\n尺寸:');
    console.log(`  width: ${styles.width}`);
    console.log(`  height: ${styles.height}`);

    console.log('\n动画:');
    console.log(`  transition: ${styles.transition}`);

    console.log('\n实际位置(rect):');
    console.log(`  top: ${Math.round(rect.top)}px`);
    console.log(`  bottom: ${Math.round(rect.bottom)}px`);
    console.log(`  height: ${Math.round(rect.height)}px`);

    result[selector] = {
      position: styles.position,
      top: styles.top,
      bottom: styles.bottom,
      left: styles.left,
      right: styles.right,
      width: styles.width,
      height: styles.height,
      transition: styles.transition
    };
  } else {
    console.log(`\n❌ ${selector} - 未找到`);
  }
});

// YouTube播放器容器
const player = document.querySelector('#movie_player');
if (player) {
  const rect = player.getBoundingClientRect();
  console.log(`\n\n📺 YouTube播放器容器 (#movie_player)`);
  console.log('-------------------');
  console.log(`  宽度: ${Math.round(rect.width)}px`);
  console.log(`  高度: ${Math.round(rect.height)}px`);

  result['#movie_player'] = {
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

console.log('\n\n========== JSON格式数据 ==========');
console.log(JSON.stringify(result, null, 2));

console.log('\n\n✅ 检查完成！请将上述信息反馈给Claude。');

// 返回结果供程序使用
result;
```

---

## 📊 预期输出示例

控制台应该会显示类似这样的信息：

```
========== 参考项目字幕容器CSS检查 ==========

📦 .imt-caption-container
-------------------
基本信息:
  tagName: DIV
  id:
  className: imt-caption-container

定位相关:
  position: absolute
  top: 0px
  bottom: 0px
  left: 0px
  right: 0px

尺寸:
  width: 1280px
  height: 720px

动画:
  transition: all 0s ease 0s

实际位置(rect):
  top: 50px
  bottom: 770px
  height: 720px

📦 #immersive-translate-caption-window
-------------------
定位相关:
  position: absolute
  top: 0px
  bottom: 0px
  left: 0px
  right: auto

尺寸:
  width: 1280px
  height: 720px

动画:
  transition: bottom 0.25s ease 0s

📦 .imt-caption-window
-------------------
定位相关:
  position: absolute
  top: auto
  bottom: 30px
  left: 64px
  right: auto

尺寸:
  width: 1152px
  height: auto

动画:
  transition: all 0s ease 0s

📺 YouTube播放器容器 (#movie_player)
-------------------
  宽度: 1280px
  高度: 720px

========== JSON格式数据 ==========
{
  ".imt-caption-container": {
    "position": "absolute",
    "top": "0px",
    "bottom": "0px",
    ...
  },
  ...
}

✅ 检查完成！请将上述信息反馈给Claude。
```

---

## 🎯 关键信息

重点关注以下CSS属性：

### 第二层 (#immersive-translate-caption-window)
- `top`: 是否为 `0px`
- `bottom`: 是否为 `0px`
- `transition`: 是否包含 `bottom 0.25s`

### 第三层 (.imt-caption-window)
- `position`: 是否为 `absolute`
- `bottom`: 是否为固定值（如 `30px`）

这些参数将帮助我们确定正确的实现方案。

---

*文档创建时间: 2025-10-09*
*用途: 验证参考项目的实际CSS实现*
