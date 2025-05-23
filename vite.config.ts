import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url'; // 用于处理 ES Module 中的 __dirname
import { viteStaticCopy } from 'vite-plugin-static-copy'; // 导入插件

// 获取当前文件的目录路径，适用于 ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 共享的基础配置
const baseConfig = {
  base: './', // 设置为相对路径，确保所有资源都使用相对路径引用
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  build: {
    sourcemap: true,
  },
};

// 为多个配置创建一个条件配置函数
export default defineConfig(({ command, mode }) => {
  // 内容脚本配置 - 使用IIFE格式
  if (mode === 'content-script') {
    return mergeConfig(baseConfig, {
      build: {
        outDir: 'dist',
        rollupOptions: {
          input: {
            'content-script': path.resolve(__dirname, 'content/content-script.ts'),
          },
          output: {
            entryFileNames: '[name].js',
            format: 'iife',
            dir: 'dist',
          },
        },
        // 不清空输出目录，因为我们需要保留其他构建的文件
        emptyOutDir: false,
      },
    });
  }
  
  // 默认配置 - 其他所有脚本使用ES模块
  return mergeConfig(baseConfig, {
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: 'manifest.json',
            dest: '.',
          },
          {
            src: 'icons',
            dest: '.',
          },
          {
            src: 'assets',
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
          background: path.resolve(__dirname, 'background/index.ts'),
          sidepanel: path.resolve(__dirname, 'sidepanel/sidepanel.html'),
          'main-world': path.resolve(__dirname, 'content/main-world.ts'),
        },
        output: {
          entryFileNames: '[name].js',
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