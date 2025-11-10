import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url'; // 用于处理 ES Module 中的 __dirname
import { viteStaticCopy } from 'vite-plugin-static-copy'; // 导入插件
import removeConsole from 'vite-plugin-remove-console'; // 导入console删除插件

// 获取当前文件的目录路径，适用于 ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 共享的基础配置
const baseConfig = {
  base: './', // 设置为相对路径，确保所有资源都使用相对路径引用
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    sourcemap: true,
  },
  define: {
    __CAPTION_TRANSLATION_DEBUG__: true,
  },
  plugins: [
    // 生产构建时删除console.log/debug/info，保留warn/error
    removeConsole({
      includes: ['log', 'debug', 'info'],
    }),
  ],
};

// 为多个配置创建一个条件配置函数
export default defineConfig(({ command, mode }) => {
  
  // Content Script 模式配置
  if (mode === 'content-script') {
    return mergeConfig(baseConfig, {
      build: {
        outDir: 'dist',
        rollupOptions: {
          input: {
            'content-script': path.resolve(__dirname, 'src/content-scripts/content-script.ts'),
          },
          output: {
            entryFileNames: '[name].js',
            chunkFileNames: 'assets/[name].js',
            assetFileNames: 'assets/[name].[ext]',
            format: 'iife',
            name: 'ContentScript',
          },
        },
        // 在content-script模式下不要清空目录
        emptyOutDir: false,
      },
    });
  }

  // Main World Script 模式配置  
  if (mode === 'main-world') {
    return mergeConfig(baseConfig, {
      build: {
        outDir: 'dist',
        rollupOptions: {
          input: {
            'main-world': path.resolve(__dirname, 'src/content-scripts/main-world.ts'),
          },
          output: {
            entryFileNames: '[name].js',
            chunkFileNames: 'assets/[name].js',
            assetFileNames: 'assets/[name].[ext]',
            format: 'iife',
            name: 'MainWorld',
          },
        },
        emptyOutDir: false,
      },
    });
  }

  // Service Worker 单独模式配置
  if (mode === 'service-worker') {
    return mergeConfig(baseConfig, {
      build: {
        outDir: 'dist',
        rollupOptions: {
          input: {
            'background': path.resolve(__dirname, 'src/background/service-worker.ts'),
          },
          output: {
            entryFileNames: '[name].js',
            // 关键：将chunk文件也放在根目录，避免路径问题
            chunkFileNames: '[name]-[hash].js',
            assetFileNames: '[name].[ext]',
            // 改回ES格式，因为IIFE与动态导入不兼容
            format: 'es',
          },
          // 重要：为service worker禁用modulePreload
          external: [],
        },
        emptyOutDir: false,
        // 关键：完全禁用modulePreload
        modulePreload: false,  // 直接设为false而不是对象
      },
    });
  }

  // 默认配置 - 构建popup
  return mergeConfig(baseConfig, {
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: 'manifest.json',
            dest: '.',
          },
          {
            src: 'public/icons',
            dest: '.',
          },
          {
            src: 'public/assets',
            dest: '.',
          },
          {
            src: '_locales',
            dest: '.',
          },
        ],
      }),
    ],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          'popup/popup': path.resolve(__dirname, 'src/popup/popup.html'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
          format: 'es',
        },
      },
      // 第一次构建时清空目录
      emptyOutDir: true,
    },
  });
}); 
