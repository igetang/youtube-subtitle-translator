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
   * 基于 getOptions() API 获取实际的 enabled 状态
   * @param tabId 标签页ID
   * @returns SidePanel 状态
   */
  public async detectRealState(tabId: number): Promise<SidePanelState> {
    try {
      console.log(`[sidepanel-controller] 检测标签页 ${tabId} 的真实状态`);
      
      // 使用 getOptions() 获取真实的 enabled 状态
      const options = await chrome.sidePanel.getOptions({ tabId });
      const enabled = options.enabled ?? false;
      
      console.log(`[sidepanel-controller] 标签页 ${tabId} 的 enabled 状态:`, enabled);
      
      const state: SidePanelState = {
        enabled,
        isOpen: enabled, // 在这个方案中，enabled 即表示打开状态
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
   * 优先从缓存获取，缓存失效时重新检测
   * @param tabId 标签页ID
   * @returns SidePanel 状态
   */
  public async getSidePanelState(tabId: number): Promise<SidePanelState> {
    const cached = this.stateCache.get(tabId);
    const now = Date.now();
    
    // 如果缓存存在且在5秒内，直接返回缓存
    if (cached && (now - cached.lastUpdateTime) < 5000) {
      console.log(`[sidepanel-controller] 返回标签页 ${tabId} 的缓存状态:`, cached);
      return cached;
    }
    
    // 缓存不存在或已过期，重新检测
    console.log(`[sidepanel-controller] 缓存不存在或已过期，重新检测标签页 ${tabId} 状态`);
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
      
      // 广播状态变化
      this.broadcastStateChange(tabId, newState);
      
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

  /**
   * 广播状态变化到相关标签页
   * @param tabId 标签页ID
   * @param state 新状态
   */
  private broadcastStateChange(tabId: number, state: SidePanelState): void {
    try {
      console.log(`[sidepanel-controller] 广播状态变化到标签页 ${tabId}:`, state);
      
      // 向指定标签页发送状态更新消息
      chrome.tabs.sendMessage(tabId, {
        action: 'sidePanelStateChanged',
        data: {
          enabled: state.enabled,
          isOpen: state.isOpen,
          source: state.source,
          timestamp: state.lastUpdateTime
        }
      }).catch(error => {
        // 忽略发送失败的错误（可能是标签页已关闭）
        console.log(`[sidepanel-controller] 向标签页 ${tabId} 发送消息失败:`, error.message);
      });
      
      // 发送全局状态变化事件
      this.broadcastGlobalStateChange(state.isOpen);
      
    } catch (error) {
      console.error('[sidepanel-controller] 广播状态变化失败:', error);
    }
  }

  /**
   * 广播全局状态变化到所有YouTube标签页
   * @param isOpen 是否打开
   */
  private async broadcastGlobalStateChange(isOpen: boolean): Promise<void> {
    try {
      // 查询所有YouTube标签页
      const tabs = await chrome.tabs.query({
        url: YOUTUBE_ORIGINS.map(origin => `${origin}/*`).flat()
      });
      
      console.log(`[sidepanel-controller] 向 ${tabs.length} 个YouTube标签页广播全局状态变化: ${isOpen}`);
      
      // 向所有YouTube标签页发送消息
      const promises = tabs.map(tab => {
        if (tab.id) {
          return chrome.tabs.sendMessage(tab.id, {
            action: 'sidePanelGlobalStateChanged',
            data: { isOpen, timestamp: Date.now() }
          }).catch(error => {
            // 忽略发送失败的错误
            console.log(`[sidepanel-controller] 向标签页 ${tab.id} 发送全局消息失败:`, error.message);
          });
        }
      });
      
      await Promise.allSettled(promises);
      
    } catch (error) {
      console.error('[sidepanel-controller] 广播全局状态变化失败:', error);
    }
  }

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