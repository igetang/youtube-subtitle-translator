import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url'; // 用于处理 ES Module 中的 __dirname
import { viteStaticCopy } from 'vite-plugin-static-copy'; // 导入插件

// 获取当前文件的目录路径，适用于 ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
  plugins: [ // 添加 plugins 数组
    viteStaticCopy({ // 配置插件
      targets: [
        {
          src: 'manifest.json', // 源文件
          dest: '.' // 目标目录 (相对于 dist)
        },
        {
          src: 'icons', // 源目录
          dest: '.' // 目标目录 (相对于 dist)
        }
        // 你可以在这里添加更多需要复制的文件或目录
      ]
    })
  ],
  resolve: {
    alias: {
      // 设置路径别名，与 tsconfig.json 保持一致
      '@': path.resolve(__dirname, './'),
    },
  },
  build: {
    outDir: 'dist', // 指定打包输出目录
    rollupOptions: {
      input: {
        // 注意：这里的 key (例如 'background') 会影响输出文件名
        // 背景脚本
        background: path.resolve(__dirname, 'background/background.ts'),
        // 内容脚本
        content: path.resolve(__dirname, 'content/content-script.ts'),
        // 侧边栏 HTML (Vite 会自动处理其引用的 JS 和 CSS)
        sidepanel: path.resolve(__dirname, 'sidepanel/sidepanel.html'),
        // 新增：主世界脚本入口
        'main-world': path.resolve(__dirname, 'content/main-world.ts'),
        // 如果你还有 popup 或 options 页面，也在这里添加
        // popup: path.resolve(__dirname, 'popup/popup.html'),
        // options: path.resolve(__dirname, 'options/options.html'),
      },
      output: {
        // 配置输出文件名格式
        // [name] 会被替换为上面 input 中的 key (例如 'background', 'content')
        entryFileNames: `src/[name].js`, // 将 JS 输出到 dist/src/ 目录
        chunkFileNames: `assets/[name].js`, // 代码分割产生的 chunk
        assetFileNames: `assets/[name].[ext]`, // 其他资源 (如 CSS)
        // 特别为 Service Worker 指定格式 (如果使用 ES Modules)
        // format: 'esm', // 根据需要设置
      },
    },
    // 关闭 sourcemap 生成，如果需要调试可以改为 true 或 'inline'
    sourcemap: false,
    // 关闭 CSS 代码分割，因为 Chrome 扩展中通常不需要
    // cssCodeSplit: false, // 较新版本的 Vite 可能不再需要明确设置此项
    // 设置为空目录，构建前清空输出目录
    emptyOutDir: true,
  },
}); 