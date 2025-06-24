/**
 * ⚠️ 此文件已废弃
 * 
 * 基于错误的架构设计创建，现已移除。
 * 字幕轨道信息现在统一通过 Background Service Worker 的 MemoryCache 管理。
 * 
 * 替代方案：
 * - 请参考 src/background/service-worker.ts 中的 MemoryCacheManager
 * - 字幕轨道信息存储在 Memory Cache 而非 Session Storage
 * 
 * 架构文档：docs/architecture.md 7.1.5 MemoryCache
 */

// 此文件已废弃，请勿使用
export {}; 