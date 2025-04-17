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
        // 定义多个入口点
        // HTML 入口会自动处理相关的 CSS 和 JS
        popup: path.resolve(__dirname, 'popup/popup.html'),
        options: path.resolve(__dirname, 'options/options.html'),
        // JS/TS 入口 (例如 Service Worker, Content Scripts)
        'service-worker': path.resolve(__dirname, 'background/service-worker.ts'),
        'content-script': path.resolve(__dirname, 'content/content-script.ts'),
      },
      output: {
        // 配置输出格式和文件名
        entryFileNames: `src/[name].js`, // 输出 JS 入口文件名 (避免哈希，固定路径)
        chunkFileNames: `chunks/[name]-[hash].js`, // 输出代码块文件名 (可以有哈希)
        assetFileNames: `assets/[name]-[hash].[ext]`, // 输出资源文件名 (可以有哈希)
        format: 'esm', // 输出为 ES Module 格式
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