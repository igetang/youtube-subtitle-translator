/**
 * @file sidepanel-controller.ts
 * @description 统一的 SidePanel 控制器 - 基于 enabled 状态的开关控制
 * @version 1.0.0
 */

import { RuntimeStateManager } from '../shared/storage/runtime-state-manager';

console.log('[sidepanel-controller] 模块已加载');

/**
 * SidePanel 操作来源枚举
 */
export enum SidePanelSource {
  EXTENSION_ICON = 'extension-icon',
  TRANSLATION_BUTTON = 'translation-button',
  KEYBOARD_SHORTCUT = 'keyboard-shortcut',
  PROGRAMMATIC = 'programmatic'
}

/**
 * SidePanel 状态接口
 */
export interface SidePanelState {
  enabled: boolean;
  isOpen: boolean;
  lastUpdateTime: number;
  source?: SidePanelSource;
}

/**
 * YouTube 域名常量
 */
const YOUTUBE_ORIGINS = [
  'https://www.youtube.com',
  'https://youtube.com', 
  'https://m.youtube.com'
];

/**
 * 统一的 SidePanel 控制器类
 * 基于 setOptions({enabled: false/true}) 的开关控制
 */
export class SidePanelController {
  private static instance: SidePanelController;
  private runtimeStateManager: RuntimeStateManager;
  private stateCache: Map<number, SidePanelState> = new Map();
  
  private constructor() {
    this.runtimeStateManager = RuntimeStateManager.getInstance();
    console.log('[sidepanel-controller] 控制器实例已创建');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): SidePanelController {
    if (!SidePanelController.instance) {
      SidePanelController.instance = new SidePanelController();
    }
    return SidePanelController.instance;
  }

  /**
   * 检查URL是否为YouTube页面
   * @param url 页面URL
   * @returns 是否为YouTube页面
   */
  private isYoutubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return YOUTUBE_ORIGINS.includes(urlObj.origin);
    } catch (error) {
      console.warn('[sidepanel-controller] URL解析失败:', url, error);
      return false;
    }
  }

  /**
   * 检测 SidePanel 的真实状态
   * 基于存储读取获取状态，高性能方案
   * @param tabId 标签页ID
   * @returns SidePanel 状态
   */
  public async detectRealState(tabId: number): Promise<SidePanelState> {
    try {
      console.log(`[sidepanel-controller] 检测标签页 ${tabId} 的真实状态`);
      
      // 直接从存储读取状态，高性能方案
      const enabled = await this.runtimeStateManager.getSettingPanelState();
      
      console.log(`[sidepanel-controller] 标签页 ${tabId} 的存储状态:`, enabled);
      
      const state: SidePanelState = {
        enabled,
        isOpen: enabled, // enabled 即表示打开状态
        lastUpdateTime: Date.now()
      };
      
      // 更新缓存
      this.stateCache.set(tabId, state);
      
      return state;
    } catch (error) {
      console.error(`[sidepanel-controller] 检测标签页 ${tabId} 状态失败:`, error);
      
      // 返回默认状态
      const defaultState: SidePanelState = {
        enabled: false,
        isOpen: false,
        lastUpdateTime: Date.now()
      };
      
      this.stateCache.set(tabId, defaultState);
      return defaultState;
    }
  }

  /**
   * 获取 SidePanel 状态
   * 存储读取优先，简化缓存逻辑
   * @param tabId 标签页ID
   * @returns SidePanel 状态
   */
  public async getSidePanelState(tabId: number): Promise<SidePanelState> {
    // 存储读取已经很快，直接从存储获取最新状态
    console.log(`[sidepanel-controller] 从存储获取标签页 ${tabId} 状态`);
    return await this.detectRealState(tabId);
  }

  /**
   * 切换 SidePanel 状态
   * 核心功能：基于 enabled 状态的开关控制
   * @param tabId 标签页ID
   * @param source 操作来源
   * @returns 操作结果
   */
  public async toggleSidePanel(tabId: number, source: SidePanelSource = SidePanelSource.PROGRAMMATIC): Promise<{
    success: boolean;
    state?: SidePanelState;
    error?: string;
    fallback?: string;
  }> {
    try {
      console.log(`[sidepanel-controller] 切换标签页 ${tabId} 的 SidePanel 状态，来源: ${source}`);
      
      // 获取标签页信息
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url) {
        throw new Error('无效的标签页URL');
      }
      
      // 检查是否为YouTube页面
      if (!this.isYoutubeUrl(tab.url)) {
        console.warn(`[sidepanel-controller] 非YouTube页面不能打开SidePanel: ${tab.url}`);
        return {
          success: false,
          error: '只有YouTube页面才能打开翻译设置面板',
          fallback: 'popup'
        };
      }
      
      // 获取当前状态
      const currentState = await this.getSidePanelState(tabId);
      const newEnabled = !currentState.enabled;
      
      console.log(`[sidepanel-controller] 当前状态: ${currentState.enabled}, 目标状态: ${newEnabled}`);
      
      if (newEnabled) {
        // 打开 SidePanel
        await chrome.sidePanel.setOptions({
          tabId,
          path: 'src/sidepanel/sidepanel.html',
          enabled: true
        });
        
        // 显式调用 open()
        await chrome.sidePanel.open({ tabId });
        
        console.log(`[sidepanel-controller] ✅ SidePanel 已打开 (标签页: ${tabId})`);
      } else {
        // 关闭 SidePanel
        await chrome.sidePanel.setOptions({
          tabId,
          enabled: false
        });
        
        console.log(`[sidepanel-controller] ❌ SidePanel 已关闭 (标签页: ${tabId})`);
      }
      
      // 更新状态缓存
      const newState: SidePanelState = {
        enabled: newEnabled,
        isOpen: newEnabled,
        lastUpdateTime: Date.now(),
        source
      };
      
      this.stateCache.set(tabId, newState);
      
      // 更新运行时状态
      await this.runtimeStateManager.setSettingPanelState(newEnabled);
      
      // 🔥 移除重复广播：由service-worker.ts统一处理状态广播
      // this.broadcastStateChange(tabId, newState); // 已移除
      
      return {
        success: true,
        state: newState
      };
      
    } catch (error) {
      console.error(`[sidepanel-controller] 切换标签页 ${tabId} SidePanel 状态失败:`, error);
      
      // 尝试降级到 popup
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        fallback: 'popup'
      };
    }
  }

  // 🔥 移除重复广播方法：由service-worker.ts统一处理状态广播
  // private broadcastStateChange() - 已移除，避免重复广播
  // private broadcastGlobalStateChange() - 已移除，避免重复广播

  /**
   * 清理指定标签页的状态缓存
   * @param tabId 标签页ID
   */
  public clearStateCache(tabId: number): void {
    this.stateCache.delete(tabId);
    console.log(`[sidepanel-controller] 已清理标签页 ${tabId} 的状态缓存`);
  }

  /**
   * 获取所有缓存的状态
   * @returns 状态缓存映射
   */
  public getAllCachedStates(): Map<number, SidePanelState> {
    return new Map(this.stateCache);
  }
}

// 导出单例实例
export const sidePanelController = SidePanelController.getInstance(); 