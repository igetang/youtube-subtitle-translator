/**
 * @file state-manager.ts
 * @description 状态管理器 - 根据组件重构计划.md第3步实现
 * 职责：纯状态管理，不发送消息，只被动接收状态
 */

/**
 * 状态管理器类
 * 核心原则：
 * - 只做状态存储和更新
 * - 被动接收状态，不主动获取
 * - 不发送UI消息，只通知协调器
 * - 职责单一：专注状态管理
 */
export class StateManager {
  private coordinator: any = null;
  private runtimeState: any = {};
  private userPreferences: any = {};

  constructor() {
    // 状态管理器已创建（无需打印）
  }

  /**
   * 初始化状态管理器 - 被动接收状态
   * @param runtimeState 运行时状态
   * @param userPreferences 用户偏好设置
   */
  initialize(runtimeState: any, userPreferences: any): void {
    this.runtimeState = runtimeState || {};
    this.userPreferences = userPreferences || {};

    console.log('[StateManager] ✅ 状态管理器就绪');
  }

  /**
   * 设置协调器引用
   */
  setCoordinator(coordinator: any): void {
    this.coordinator = coordinator;
  }

  /**
   * 只做状态更新
   * @param key 状态键
   * @param value 状态值
   */
  async updateState(key: string, value: any): Promise<void> {
    try {
      // 先检查本地状态是否已经是目标值
      if (this.runtimeState[key] === value) {
        console.debug(`[debug][StateManager] 状态已是 ${value}，直接更新UI`);
        // 即使状态相同也要通知UI更新，因为UI可能还没有同步
        this.notifyStateChange(key, value);
        return;
      }

      // 发送状态更新到background
      const result = await chrome.runtime.sendMessage({
        type: 'setRuntimeState',
        data: { stateKey: key, value }
      });

      if (result && result.success) {
        // 更新本地状态
        this.runtimeState[key] = value;
        
        // 只做状态变化通知
        this.notifyStateChange(key, value);
        
        // 只在成功时输出一条简洁日志
        console.debug(`[StateManager] ✅ ${key}: ${value}`);
      } else {
        console.error(`[StateManager] ✗ ${key}: ${result?.error}`);
      }
    } catch (error) {
      console.error(`[StateManager] ❌ 状态更新出错: ${key}`, error);
    }
  }

  /**
   * 批量更新运行时状态
   * @param updates 要更新的状态键值对
   */
  async updateStates(updates: Record<string, any>): Promise<void> {
    // 注释掉开始和结束日志，避免前后确认型冗余
    // console.log('[StateManager] 🔄 批量更新状态');

    try {
      // 批量发送状态更新到background
      for (const [key, value] of Object.entries(updates)) {
        const result = await chrome.runtime.sendMessage({
          type: 'setRuntimeState',
          data: { stateKey: key, value }
        });
        
        if (result && result.success) {
          this.runtimeState[key] = value;
        }
      }

      // 批量通知UI更新 - 一次性传递所有更新
      if (this.coordinator) {
        this.coordinator.handleUserAction('stateChange', {
          updates,  // 传递整个更新对象
          timestamp: Date.now()
        });
      }

      // 只输出关键信息
      const keys = Object.keys(updates);
      if (keys.length > 0) {
        console.debug(`[StateManager] ✅ 批量更新: ${keys.join(', ')}`);
      }
    } catch (error) {
      console.error(`[StateManager] ✗ 批量更新失败:`, error);
    }
  }

  /**
   * 更新用户偏好设置
   * @param key 偏好键
   * @param value 偏好值
   */
  async updateUserPreference(key: string, value: any): Promise<void> {
    // 注释掉开始日志，避免链路冗余
    // console.log(`[StateManager] 🔄 更新用户偏好: ${key} = ${value}`);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'setUserPreferences',
        data: { stateKey: key, value }
      });

      if (result && result.success) {
        this.userPreferences[key] = value;
        this.notifyStateChange(key, value);
        // 简化成功日志
        console.debug(`[StateManager] ✅ 偏好设置: ${key}=${value}`);
      } else {
        console.error(`[StateManager] ✗ 偏好设置失败: ${key}`, result?.error);
      }
    } catch (error) {
      console.error(`[StateManager] ❌ 用户偏好更新出错: ${key}`, error);
    }
  }

  /**
   * 只做状态变化通知
   * @param key 变化的状态键
   * @param value 变化的状态值
   */
  private notifyStateChange(key: string, value: any): void {
    if (this.coordinator) {
      this.coordinator.handleUserAction('stateChange', {
        key,
        value,
        timestamp: Date.now()
      });
    } else {
      console.warn('[StateManager] 协调器未设置，无法通知状态变化');
    }
  }

  /**
   * 获取运行时状态（只读）
   */
  getRuntimeState(): any {
    return { ...this.runtimeState };
  }

  /**
   * 获取用户偏好设置（只读）
   */
  getUserPreferences(): any {
    return { ...this.userPreferences };
  }

  /**
   * 获取特定状态值
   * @param key 状态键
   */
  getState(key: string): any {
    return this.runtimeState[key] ?? this.userPreferences[key];
  }

  /**
   * 检查翻译是否激活
   */
  isTranslateActive(): boolean {
    // 只检查枚举值，不再兼容布尔值
    return this.runtimeState.translateActive === 'active';
  }
  
  /**
   * 获取当前翻译状态
   */
  getTranslateState(): string {
    // 返回当前的翻译状态枚举值
    return this.runtimeState.translateActive || 'inactive';
  }

  /**
   * 获取目标语言
   */
  getTargetLanguage(): string {
    return this.userPreferences.targetLang || 'zh-CN';
  }

  /**
   * 获取源语言
   */
  getSourceLanguage(): string {
    return this.userPreferences.sourceLang || 'en';
  }

  /**
   * 获取翻译服务配置
   */
  getTranslationService(): any {
    return this.userPreferences.translationService || {
      type: 'google-free',
      apiKey: ''
    };
  }

  /**
   * 设置当前视频ID（用于缓存管理）
   * @param videoId 视频ID
   */
  async setCurrentVideo(videoId: string): Promise<void> {
    console.log(`[StateManager] 📹 设置当前视频: ${videoId}`);
    
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'setCurrentVideo',
        data: { videoId }
      });

      if (result && result.success) {
        this.runtimeState.currentVideoId = videoId;
        console.log('[StateManager] ✅ 当前视频设置成功');
      } else {
        console.error('[StateManager] ❌ 当前视频设置失败:', result?.error);
      }
    } catch (error) {
      console.error('[StateManager] ❌ 当前视频设置出错:', error);
    }
  }

  /**
   * 检查Popup是否打开
   */
  isPopupOpen(): boolean {
    return this.runtimeState.popupOpen === true;
  }

  /**
   * 获取完整状态快照（用于调试）
   */
  getStateSnapshot(): {
    runtimeState: any;
    userPreferences: any;
    timestamp: number;
  } {
    return {
      runtimeState: { ...this.runtimeState },
      userPreferences: { ...this.userPreferences },
      timestamp: Date.now()
    };
  }

  /**
   * 重置状态（用于测试或清理）
   */
  reset(): void {
    console.log('[StateManager] 🔄 重置状态');
    this.runtimeState = {};
    this.userPreferences = {};
  }

  /**
   * 验证状态完整性
   */
  validateState(): {
    isValid: boolean;
    missingKeys: string[];
    issues: string[];
  } {
    const requiredRuntimeKeys = ['translateActive'];
    const requiredPreferenceKeys = ['targetLang', 'sourceLang'];
    
    const missingRuntime = requiredRuntimeKeys.filter(key => !(key in this.runtimeState));
    const missingPreferences = requiredPreferenceKeys.filter(key => !(key in this.userPreferences));
    
    const missingKeys = [...missingRuntime, ...missingPreferences];
    const issues: string[] = [];
    
    if (missingRuntime.length > 0) {
      issues.push(`缺少运行时状态: ${missingRuntime.join(', ')}`);
    }
    if (missingPreferences.length > 0) {
      issues.push(`缺少用户偏好: ${missingPreferences.join(', ')}`);
    }
    
    return {
      isValid: missingKeys.length === 0,
      missingKeys,
      issues
    };
  }
}
