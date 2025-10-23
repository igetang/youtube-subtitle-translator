# 翻译服务多配置架构迁移方案

**⚠️ 状态**: 未实施 - 方案过于复杂，暂缓执行
**文档版本**: v1.0
**创建日期**: 2025-10-10
**预计工作量**: 4.5小时

## 📋 目录

- [1. 方案概述](#1-方案概述)
- [2. 架构设计](#2-架构设计)
- [3. 详细修改步骤](#3-详细修改步骤)
- [4. 测试验证](#4-测试验证)
- [5. 回滚策略](#5-回滚策略)

---

## 1. 方案概述

### 1.1 问题描述

当前架构中，用户偏好设置只保存**单一的翻译服务配置**：

```typescript
interface UserPreferences {
  translationService: TranslationServiceComplete;  // 单一配置
}
```

**存在的问题**：
- ❌ 用户从 OpenAI 切换到 Google 翻译时，OpenAI 的配置（apiKey, model）会丢失
- ❌ 切换回 OpenAI 时需要重新输入所有配置
- ❌ 用户体验差，不符合业界最佳实践

### 1.2 解决方案

采用 **Active Profile 模式**（业界标准），为每个翻译服务独立存储配置：

```typescript
interface UserPreferences {
  activeTranslationService: TranslationServiceType;  // 当前激活的服务
  translationServiceConfigs: {                       // 每个服务独立配置
    [key in TranslationServiceType]?: TranslationServiceComplete;
  };
}
```

**优势**：
- ✅ 符合业界标准（Spring Profile Pattern）
- ✅ 符合Chrome官方推荐（嵌套options对象）
- ✅ 切换服务不丢失配置
- ✅ 用户体验优秀

---

## 2. 架构设计

### 2.1 数据结构对比

#### 变更前（当前架构）

```typescript
interface UserPreferences {
  targetLang: string;                              // 目标语言
  subtitleMode: SubtitleMode;                      // 字幕模式
  translationService: TranslationServiceComplete;  // 单一翻译服务配置
  hash: string;                                    // 数据hash
}

// 示例数据
{
  targetLang: 'zh-CN',
  subtitleMode: 'bilingual',
  translationService: {
    type: 'openai',
    name: 'OpenAI GPT',
    model: 'gpt-5-mini',
    apiKey: 'sk-xxx',
    temperature: 1,
    rpm: 60,
    tpm: 40000
  },
  hash: 'abc123'
}
```

#### 变更后（新架构）

```typescript
interface UserPreferences {
  targetLang: string;                               // 目标语言
  subtitleMode: SubtitleMode;                       // 字幕模式
  activeTranslationService: TranslationServiceType; // 当前激活的服务
  translationServiceConfigs: {                      // 每个服务独立配置
    [key in TranslationServiceType]?: TranslationServiceComplete;
  };
  hash: string;                                     // 数据hash
}

// 示例数据
{
  targetLang: 'zh-CN',
  subtitleMode: 'bilingual',
  activeTranslationService: 'openai',               // 当前使用OpenAI
  translationServiceConfigs: {
    'google-free': {                                // Google配置
      type: 'google-free',
      name: 'Google 翻译（免费）',
      model: null,
      temperature: null,
      rpm: 100,
      tpm: null,
      apiKey: undefined
    },
    'openai': {                                     // OpenAI配置
      type: 'openai',
      name: 'OpenAI GPT',
      model: 'gpt-5-mini',
      apiKey: 'sk-xxx',                             // 切换后保留
      temperature: 1,
      rpm: 60,
      tpm: 40000
    },
    'microsoft-free': { ... },
    'gemini': { ... },
    // ... 其他服务
  },
  hash: 'def456'
}
```

### 2.2 核心逻辑变更

#### 获取当前激活的服务配置

```typescript
// 变更前
const service = preferences.translationService;

// 变更后
const activeType = preferences.activeTranslationService;
const service = preferences.translationServiceConfigs[activeType];
```

#### 切换服务

```typescript
// 变更前：整体替换（丢失旧配置）
preferences.translationService = newServiceConfig;

// 变更后：只切换activeTranslationService（保留所有配置）
preferences.activeTranslationService = newServiceType;
```

#### 修改服务参数

```typescript
// 变更前：修改会影响单一配置
preferences.translationService.apiKey = 'new-key';

// 变更后：修改对应服务的配置
preferences.translationServiceConfigs[serviceType].apiKey = 'new-key';
```

---

## 3. 详细修改步骤

### 阶段1：类型定义修改（30分钟）

#### 📁 文件：`src/shared/types/user-preferences-types.ts`

#### 步骤1.1：修改UserPreferences接口

**位置**：Line 60-70

```typescript
// ========== 修改前 ==========
export interface UserPreferences {
  targetLang: string;
  subtitleMode: SubtitleMode;
  translationService: TranslationServiceComplete;
  hash: string;
}

// ========== 修改后 ==========
export interface UserPreferences {
  targetLang: string;
  subtitleMode: SubtitleMode;

  // === 新架构：多配置独立存储 ===
  activeTranslationService: TranslationServiceType;  // 当前激活的服务
  translationServiceConfigs: {                       // 每个服务的独立配置
    [key in TranslationServiceType]?: TranslationServiceComplete;
  };

  hash: string;
}
```

#### 步骤1.2：修改DEFAULT_USER_PREFERENCES

**位置**：Line 145-153

```typescript
// ========== 修改前 ==========
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  targetLang: 'zh-CN',
  subtitleMode: SubtitleMode.BILINGUAL,
  translationService: {
    ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.GOOGLE_FREE],
    apiKey: undefined
  },
  hash: ''
};

// ========== 修改后 ==========
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  targetLang: 'zh-CN',
  subtitleMode: SubtitleMode.BILINGUAL,

  // 默认激活Google免费翻译
  activeTranslationService: TranslationServiceType.GOOGLE_FREE,

  // 初始化所有服务的默认配置
  translationServiceConfigs: {
    [TranslationServiceType.GOOGLE_FREE]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.GOOGLE_FREE],
      apiKey: undefined
    },
    [TranslationServiceType.MICROSOFT_FREE]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.MICROSOFT_FREE],
      apiKey: undefined
    },
    [TranslationServiceType.OPENAI]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.OPENAI],
      apiKey: undefined
    },
    [TranslationServiceType.GEMINI]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.GEMINI],
      apiKey: undefined
    },
    [TranslationServiceType.DEEPSEEK]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.DEEPSEEK],
      apiKey: undefined
    },
    [TranslationServiceType.QWEN]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.QWEN],
      apiKey: undefined
    },
    [TranslationServiceType.DUMMY]: {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.DUMMY],
      apiKey: undefined
    }
  },

  hash: ''
};
```

#### 步骤1.3：修改calculateUserPreferencesHash

**位置**：Line 149-166

```typescript
// ========== 修改前 ==========
export function calculateUserPreferencesHash(preferences: Omit<UserPreferences, 'hash'>): string {
  const str = JSON.stringify({
    targetLang: preferences.targetLang,
    subtitleMode: preferences.subtitleMode,
    translationService: {
      ...preferences.translationService,
      apiKey: '[REDACTED]'
    }
  });

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ========== 修改后 ==========
export function calculateUserPreferencesHash(preferences: Omit<UserPreferences, 'hash'>): string {
  const str = JSON.stringify({
    targetLang: preferences.targetLang,
    subtitleMode: preferences.subtitleMode,
    activeTranslationService: preferences.activeTranslationService,
    translationServiceConfigs: Object.keys(preferences.translationServiceConfigs || {}).reduce((acc, key) => {
      const config = preferences.translationServiceConfigs[key as TranslationServiceType];
      if (config) {
        acc[key] = { ...config, apiKey: '[REDACTED]' };
      }
      return acc;
    }, {} as any)
  });

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
```

---

### 阶段2：UserPreferencesManager修改（1.5小时）

#### 📁 文件：`src/shared/storage/user-preferences-manager.ts`

#### 步骤2.1：新增辅助方法 - getActiveTranslationService()

**位置**：在 `getUserPreferences()` 方法后面添加

```typescript
/**
 * 获取当前激活的翻译服务配置
 * @returns 当前激活服务的完整配置
 */
public async getActiveTranslationService(): Promise<TranslationServiceComplete> {
  try {
    const preferences = await this.getUserPreferences();
    const activeType = preferences.activeTranslationService;
    const config = preferences.translationServiceConfigs[activeType];

    if (!config) {
      console.warn(`[user-preferences-manager] 当前激活服务 ${activeType} 配置不存在，使用默认模板`);
      return {
        ...TRANSLATION_SERVICE_TEMPLATES[activeType],
        apiKey: undefined
      };
    }

    return config;
  } catch (error) {
    console.error('[user-preferences-manager] 获取激活服务配置失败:', error);
    return {
      ...TRANSLATION_SERVICE_TEMPLATES[TranslationServiceType.GOOGLE_FREE],
      apiKey: undefined
    };
  }
}
```

#### 步骤2.2：新增辅助方法 - updateServiceConfig()

```typescript
/**
 * 更新特定服务的配置
 * @param serviceType 服务类型
 * @param config 新的配置（部分或完整）
 */
public async updateServiceConfig(
  serviceType: TranslationServiceType,
  config: Partial<TranslationServiceComplete>
): Promise<void> {
  try {
    const preferences = await this.getUserPreferences();

    // 获取该服务的现有配置或模板
    const existingConfig = preferences.translationServiceConfigs[serviceType] ||
      { ...TRANSLATION_SERVICE_TEMPLATES[serviceType], apiKey: undefined };

    // 合并新配置到现有配置
    const updatedConfig: TranslationServiceComplete = {
      ...existingConfig,
      ...config
    };

    // 更新该服务的配置
    const updatedConfigs = {
      ...preferences.translationServiceConfigs,
      [serviceType]: updatedConfig
    };

    await this.updateUserPreferences({
      translationServiceConfigs: updatedConfigs
    });

    console.log(`[user-preferences-manager] 服务配置已更新: ${serviceType}`, updatedConfig);
  } catch (error) {
    console.error(`[user-preferences-manager] 更新服务配置失败: ${serviceType}`, error);
    throw error;
  }
}
```

#### 步骤2.3：新增辅助方法 - switchActiveService()

```typescript
/**
 * 切换当前激活的翻译服务
 * @param serviceType 要切换到的服务类型
 */
public async switchActiveService(serviceType: TranslationServiceType): Promise<void> {
  try {
    const preferences = await this.getUserPreferences();

    if (preferences.activeTranslationService === serviceType) {
      console.log(`[user-preferences-manager] 已经是激活服务: ${serviceType}`);
      return;
    }

    // 确保该服务有配置，如果没有则使用默认模板
    if (!preferences.translationServiceConfigs[serviceType]) {
      console.log(`[user-preferences-manager] 服务 ${serviceType} 无配置，使用默认模板`);
      const defaultConfig = {
        ...TRANSLATION_SERVICE_TEMPLATES[serviceType],
        apiKey: undefined
      };

      await this.updateUserPreferences({
        activeTranslationService: serviceType,
        translationServiceConfigs: {
          ...preferences.translationServiceConfigs,
          [serviceType]: defaultConfig
        }
      });
    } else {
      await this.updateUserPreferences({
        activeTranslationService: serviceType
      });
    }

    console.log(`[user-preferences-manager] 切换激活服务: ${preferences.activeTranslationService} → ${serviceType}`);
  } catch (error) {
    console.error(`[user-preferences-manager] 切换激活服务失败: ${serviceType}`, error);
    throw error;
  }
}
```

#### 步骤2.4：修改getUserPreferences() - 补全配置

**位置**：Line 248-292

```typescript
public async getUserPreferences(): Promise<UserPreferences> {
  try {
    const storageKey = `${StorageKeys.USER_PREFERENCES_PREFIX}main`;
    const data = await this.storageManager.get<UserPreferences | null>(storageKey, null);

    if (data) {
      // 🔧 补全缺失的服务配置
      if (data.translationServiceConfigs) {
        // 确保所有服务都有配置（使用模板补全）
        const allServiceTypes = Object.values(TranslationServiceType);
        allServiceTypes.forEach((serviceType) => {
          if (!data.translationServiceConfigs[serviceType]) {
            data.translationServiceConfigs[serviceType] = {
              ...TRANSLATION_SERVICE_TEMPLATES[serviceType],
              apiKey: undefined
            };
          } else {
            // 补全现有配置的缺失字段
            const template = TRANSLATION_SERVICE_TEMPLATES[serviceType];
            data.translationServiceConfigs[serviceType] = {
              ...template,
              ...data.translationServiceConfigs[serviceType]
            };
          }
        });

        console.log('[user-preferences-manager] 🔧 translationServiceConfigs字段已补全');
      }

      // 验证数据完整性
      const validation = this.validateUserPreferences(data);
      if (validation.isValid) {
        return data;
      } else {
        console.warn('[user-preferences-manager] 存储的偏好设置数据无效:', validation.errors);
      }
    }

    // 如果没有找到有效数据，返回默认设置
    console.log('[user-preferences-manager] 使用默认偏好设置');
    return DEFAULT_USER_PREFERENCES;

  } catch (error) {
    console.error('[user-preferences-manager] 获取偏好设置失败:', error);
    return DEFAULT_USER_PREFERENCES;
  }
}
```

#### 步骤2.5：修改validateUserPreferences() - 验证逻辑

**位置**：Line 140-190

```typescript
private validateUserPreferences(userPreferences: Partial<UserPreferences>): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!userPreferences) {
    errors.push('UserPreferences 对象不能为空');
    return { isValid: false, errors, warnings };
  }

  // 1. 检查顶级字段
  if (typeof userPreferences.targetLang !== 'string' || !userPreferences.targetLang) {
    errors.push('targetLang 必须是一个非空字符串');
  }
  if (!Object.values(SubtitleMode).includes(userPreferences.subtitleMode as SubtitleMode)) {
    errors.push('subtitleMode 必须是有效的SubtitleMode枚举值');
  }

  // 2. 检查 activeTranslationService
  if (!Object.values(TranslationServiceType).includes(userPreferences.activeTranslationService as TranslationServiceType)) {
    errors.push('activeTranslationService 必须是有效的TranslationServiceType枚举值');
  }

  // 3. 检查 translationServiceConfigs
  const configs = userPreferences.translationServiceConfigs;
  if (!configs || typeof configs !== 'object') {
    errors.push('translationServiceConfigs 必须是一个对象');
  } else {
    // 检查每个服务配置
    Object.keys(configs).forEach((key) => {
      const serviceType = key as TranslationServiceType;
      const config = configs[serviceType];

      if (!config) return;

      if (!Object.values(TranslationServiceType).includes(serviceType)) {
        warnings.push(`translationServiceConfigs 包含无效的服务类型: ${key}`);
      }

      if (typeof config.name !== 'string' || !config.name) {
        errors.push(`translationServiceConfigs.${key}.name 必须是非空字符串`);
      }

      if (config.type !== serviceType) {
        errors.push(`translationServiceConfigs.${key}.type 必须与键名一致`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

#### 步骤2.6：修改setupStorageListener() - 事件触发

**位置**：Line 74-122

```typescript
private setupStorageListener(): void {
  const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local') return;

    const userPrefsKey = StorageKeys.USER_PREFERENCES_PREFIX;
    Object.keys(changes).forEach((key) => {
      if (key.startsWith(userPrefsKey)) {
        console.log('[user-preferences-manager] 检测到UserPreferences存储变更:', key);

        let newPrefs = changes[key].newValue;
        let oldPrefs = changes[key].oldValue;

        // 🔧 补全newValue的translationServiceConfigs字段
        if (newPrefs?.translationServiceConfigs) {
          Object.values(TranslationServiceType).forEach((serviceType) => {
            if (!newPrefs.translationServiceConfigs[serviceType]) {
              const template = TRANSLATION_SERVICE_TEMPLATES[serviceType];
              newPrefs.translationServiceConfigs[serviceType] = {
                ...template,
                apiKey: undefined
              };
            } else {
              const template = TRANSLATION_SERVICE_TEMPLATES[serviceType];
              newPrefs.translationServiceConfigs[serviceType] = {
                ...template,
                ...newPrefs.translationServiceConfigs[serviceType]
              };
            }
          });
        }

        // 🔧 补全oldValue的translationServiceConfigs字段
        if (oldPrefs?.translationServiceConfigs) {
          Object.values(TranslationServiceType).forEach((serviceType) => {
            if (!oldPrefs.translationServiceConfigs[serviceType]) {
              const template = TRANSLATION_SERVICE_TEMPLATES[serviceType];
              oldPrefs.translationServiceConfigs[serviceType] = {
                ...template,
                apiKey: undefined
              };
            } else {
              const template = TRANSLATION_SERVICE_TEMPLATES[serviceType];
              oldPrefs.translationServiceConfigs[serviceType] = {
                ...template,
                ...oldPrefs.translationServiceConfigs[serviceType]
              };
            }
          });
        }

        // 触发变更事件
        this.triggerPreferencesChangeEvent(newPrefs, oldPrefs);
      }
    });
  };

  this.storageManager.addChangeListener(StorageKeys.USER_PREFERENCES_PREFIX, handleStorageChange);
}
```

#### 步骤2.7：修改triggerPreferencesChangeEvent() - 比较逻辑

**位置**：Line 133-178

```typescript
private triggerPreferencesChangeEvent(newPrefs: UserPreferences, oldPrefs: UserPreferences | null): void {
  if (!newPrefs) return;

  const previousPrefs = oldPrefs ?? DEFAULT_USER_PREFERENCES;

  if (!oldPrefs) {
    console.log('[user-preferences-manager] 未检测到旧的偏好设置，使用默认值作为比较基准');
  }

  // 对比targetLang
  const targetLangChanged = newPrefs.targetLang !== previousPrefs.targetLang;
  if (targetLangChanged) {
    this.triggerChangeEvent(UserPreferenceChangeEvent.TARGET_LANG_CHANGED, newPrefs.targetLang, previousPrefs.targetLang);
  }

  // 对比subtitleMode
  const subtitleModeChanged = newPrefs.subtitleMode !== previousPrefs.subtitleMode;
  if (subtitleModeChanged) {
    this.triggerChangeEvent(UserPreferenceChangeEvent.SUBTITLE_MODE_CHANGED, newPrefs.subtitleMode, previousPrefs.subtitleMode);
  }

  // 对比translationService - 新逻辑：比较activeService和对应的config
  const activeServiceChanged = newPrefs.activeTranslationService !== previousPrefs.activeTranslationService;
  const newActiveConfig = newPrefs.translationServiceConfigs[newPrefs.activeTranslationService];
  const oldActiveConfig = previousPrefs.translationServiceConfigs[previousPrefs.activeTranslationService];

  const activeConfigChanged = JSON.stringify(newActiveConfig) !== JSON.stringify(oldActiveConfig);

  if (activeServiceChanged || activeConfigChanged) {
    this.triggerChangeEvent(
      UserPreferenceChangeEvent.TRANSLATION_SERVICE_CHANGED,
      newActiveConfig,
      oldActiveConfig
    );
  }
}
```

---

### 阶段3：Popup界面修改（1小时）

#### 📁 文件：`src/popup/popup.ts`

#### 步骤3.1：修改updateUserPreferencesUI() - 读取激活服务配置

**位置**：Line 1505-1555

```typescript
async function updateUserPreferencesUI(userPreferences: UserPreferences): Promise<void> {
  try {
    // 更新目标语言显示
    if (userPreferences.targetLang) {
      currentTargetLang = userPreferences.targetLang;
      if (targetLangSelectedValue) {
        const lang = targetLanguages.find(l => l.code === userPreferences.targetLang);
        if (lang) {
          targetLangSelectedValue.textContent = generateTargetLanguageDisplayName(lang);
        }
      }
    }

    // 更新字幕模式
    if (subtitleTypeSwitch) {
      subtitleTypeSwitch.checked = userPreferences.subtitleMode === SubtitleMode.BILINGUAL;
    }

    // 更新翻译服务配置 - 新逻辑：读取当前激活的服务配置
    const activeServiceType = userPreferences.activeTranslationService;
    const activeServiceConfig = userPreferences.translationServiceConfigs[activeServiceType];

    if (activeServiceConfig) {
      console.log('[popup] 正在设置翻译服务UI:', activeServiceConfig);

      // 设置翻译API选择器
      if (translationApiSelect) {
        console.log('[popup] 设置翻译API选择器:', activeServiceType);
        translationApiSelect.value = activeServiceType;
        updateApiPanels(activeServiceType);
        console.log('[popup] 翻译API选择器设置完成，当前值:', translationApiSelect.value);
      } else {
        console.warn('[popup] translationApiSelect 元素未找到');
      }

      // 设置API密钥
      if (apiKeyInput && activeServiceConfig.apiKey) {
        apiKeyInput.value = activeServiceConfig.apiKey;
        console.log('[popup] API密钥已设置');
      }

      // 设置模型选择
      if (modelSelect && activeServiceConfig.model) {
        modelSelect.value = activeServiceConfig.model;
        console.log('[popup] 模型选择已设置:', activeServiceConfig.model);
      }
    }

    // 填充目标语言列表
    populateTargetLanguages();

    console.log('[popup] 用户偏好设置UI更新完成');

  } catch (error) {
    console.error('[popup] 更新用户偏好设置UI失败:', error);
  }
}
```

#### 步骤3.2：修改handleTranslationServiceChange() - 保存逻辑

**位置**：Line 2053-2089（完全重写）

```typescript
async function handleTranslationServiceChange(): Promise<void> {
  try {
    console.log('[popup] 统一监听器 - 翻译服务变更');

    // 从UI读取完整的翻译服务配置
    const translationApiSelect = document.getElementById('translation-api') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelSelect = document.getElementById('openai-model') as HTMLSelectElement;

    const newServiceType = (translationApiSelect?.value as TranslationServiceType);

    if (!newServiceType) {
      console.warn('[popup] 无法获取新的服务类型');
      return;
    }

    // 获取当前用户设置
    const userPreferences = await userPreferencesManager.getUserPreferences();
    const oldServiceType = userPreferences.activeTranslationService;

    // 判断是切换服务还是修改参数
    if (newServiceType !== oldServiceType) {
      // 场景1：切换服务
      console.log(`[popup] 切换服务: ${oldServiceType} → ${newServiceType}`);
      await userPreferencesManager.switchActiveService(newServiceType);
    } else {
      // 场景2：修改当前服务的参数
      console.log(`[popup] 修改服务参数: ${newServiceType}`);

      // x
      const template = TRANSLATION_SERVICE_TEMPLATES[newServiceType];

      // 构建新的配置（基于模板 + UI输入）
      const updatedConfig: Partial<TranslationServiceComplete> = {
        apiKey: apiKeyInput?.value || undefined,
        model: modelSelect?.value || template.model
      };

      // 更新该服务的配置
      await userPreferencesManager.updateServiceConfig(newServiceType, updatedConfig);
    }

    // 更新UI面板显示
    if (translationApiSelect?.value) {
      updateApiPanels(translationApiSelect.value);
    }

    console.log('[popup] 统一监听器 - 翻译服务配置已更新');

  } catch (error) {
    console.error('[popup] 统一监听器 - 翻译服务变更失败:', error);
  }
}
```

---

### 阶段4：翻译器修改（30分钟）

#### 📁 文件：`src/background/handle-toggle-translate-v4.ts`

#### 步骤4.1：全局搜索替换 `preferences.translationService`

使用搜索功能找到所有 `preferences.translationService` 的引用，替换为：

```typescript
preferences.translationServiceConfigs[preferences.activeTranslationService]
```

**主要修改位置**：

1. **Line 125** - 验证配置存在
```typescript
// 修改前
if (!preferences || !preferences.translationService) {
  throw new Error('用户偏好设置缺失');
}

// 修改后
if (!preferences || !preferences.activeTranslationService || !preferences.translationServiceConfigs) {
  throw new Error('用户偏好设置缺失');
}
```

2. **Line 131, 239, 496** - 读取服务配置
```typescript
// 修改前
preferences.translationService

// 修改后
preferences.translationServiceConfigs[preferences.activeTranslationService]
```

3. **Line 588** - 获取服务类型
```typescript
// 修改前
const serviceType = preferences.translationService?.type;

// 修改后
const activeConfig = preferences.translationServiceConfigs[preferences.activeTranslationService];
const serviceType = activeConfig?.type;
```

#### 📁 文件：`src/background/components/two-phase-translator-v4.ts`

**主要修改位置**：

1. **Line 102, 232** - 读取服务类型
```typescript
// 修改前
const serviceType = preferences.translationService?.type;

// 修改后
const activeConfig = preferences.translationServiceConfigs[preferences.activeTranslationService];
const serviceType = activeConfig?.type;
```

2. **Line 161, 342** - 传递服务配置
```typescript
// 修改前
preferences.translationService

// 修改后
preferences.translationServiceConfigs[preferences.activeTranslationService]
```

3. **Line 239** - 服务类型检查
```typescript
// 修改前
if ((preferences.translationService?.type === 'google' ||
     preferences.translationService?.type === 'google-free') &&
    !this.preferredGoogleEndpoint) {
  // ...
}

// 修改后
const activeConfig = preferences.translationServiceConfigs[preferences.activeTranslationService];
if ((activeConfig?.type === 'google' ||
     activeConfig?.type === 'google-free') &&
    !this.preferredGoogleEndpoint) {
  // ...
}
```

#### 📁 文件：`src/background/service-worker.ts` (可选)

**说明**：此文件包含旧的翻译流程（非V4），可以先不修改，只修改V4相关的代码。如果需要修改，遵循相同的替换原则。

**主要修改位置**：

1. **Line 2285-2286** - 调试日志
```typescript
// 修改前
hasTranslationService: preferences ? !!preferences.translationService : false,
translationServiceType: preferences?.translationService ? typeof preferences.translationService : 'N/A',

// 修改后
hasTranslationService: preferences ? !!preferences.activeTranslationService : false,
translationServiceType: preferences?.activeTranslationService || 'N/A',
```

2. **Line 2296, 2723** - 验证配置
```typescript
// 修改前
if (!preferences || !preferences.translationService) {
  throw new Error('用户偏好设置或翻译服务配置缺失');
}

// 修改后
if (!preferences || !preferences.activeTranslationService || !preferences.translationServiceConfigs) {
  throw new Error('用户偏好设置或翻译服务配置缺失');
}
```

---

## 4. 测试验证

### 4.1 测试清单

#### 基础功能测试

- [ ] **首次安装测试**
  - 加载扩展后，打开DevTools → Application → Storage → Local Storage
  - 检查 `user_preferences_main` 键
  - 验证：
    - `activeTranslationService` = `'google-free'`
    - `translationServiceConfigs` 包含所有7个服务的默认配置
    - 所有服务的 `apiKey` 都是 `undefined`

- [ ] **读取配置测试**
  - 打开Popup，检查当前选择的翻译服务是 "Google 翻译（免费）"
  - 检查UI显示是否正确

#### 切换服务测试

- [ ] **场景1：Google → OpenAI → Google（配置保留测试）**
  1. 打开Popup，选择OpenAI
  2. 输入 apiKey: `test-key-123`
  3. 选择 model: `gpt-5`
  4. 关闭Popup，重新打开
  5. 切换到 Google 免费翻译
  6. 再切换回 OpenAI
  7. **验证**：apiKey 和 model 应该还是 `test-key-123` 和 `gpt-5`

- [ ] **场景2：多次切换测试**
  1. 配置 OpenAI: apiKey=`sk-openai`, model=`gpt-5-mini`
  2. 配置 Gemini: apiKey=`sk-gemini`, model=`gemini-pro`
  3. 切换顺序：Google → OpenAI → Gemini → Google → OpenAI
  4. **验证**：每次切换回来，配置都应该保留

#### 参数修改测试

- [ ] **修改当前服务参数**
  1. 选择 OpenAI
  2. 设置 apiKey: `key-1`
  3. 关闭Popup，重新打开
  4. 修改 apiKey 为 `key-2`
  5. 修改 model 为 `gpt-5`
  6. **验证**：配置应该正确更新

#### 翻译功能测试

- [ ] **Google免费翻译执行**
  1. 选择 Google 免费翻译
  2. 打开YouTube视频
  3. 点击翻译开关
  4. **验证**：翻译正常工作

- [ ] **OpenAI翻译执行（需要有效apiKey）**
  1. 选择 OpenAI
  2. 配置有效的 apiKey
  3. 点击翻译开关
  4. **验证**：翻译正常工作

- [ ] **切换服务后翻译**
  1. 从 OpenAI 切换到 Google
  2. 点击翻译开关
  3. **验证**：使用 Google 翻译，工作正常

#### 缓存兼容性测试

- [ ] **缓存键生成测试**
  1. 使用 OpenAI 翻译一个视频
  2. 检查 Local Storage 中的缓存键
  3. **验证**：缓存键应该包含 `openai` 和模型信息

- [ ] **切换服务后缓存独立**
  1. 用 Google 翻译视频A，生成缓存
  2. 切换到 OpenAI，翻译同一视频A
  3. **验证**：应该生成新的缓存（因为服务不同）

#### 数据完整性测试

- [ ] **Storage数据结构验证**
  - 打开 DevTools → Application → Storage → Local Storage
  - 检查 `user_preferences_main` 的数据结构
  - **验证**：
    - 包含 `activeTranslationService` 字段
    - 包含 `translationServiceConfigs` 对象
    - `translationServiceConfigs` 中有修改过的服务配置

- [ ] **Hash值计算验证**
  - 修改任何配置
  - 检查 `hash` 字段是否更新
  - **验证**：hash值应该改变

### 4.2 调试工具

#### Chrome DevTools查看存储数据

```javascript
// 在Console中执行
chrome.storage.local.get('user_preferences_main', (result) => {
  console.log('当前配置:', JSON.stringify(result, null, 2));
});
```

#### 查看当前激活的服务配置

```javascript
// 在Service Worker Console中执行
const manager = UserPreferencesManager.getInstance();
manager.getActiveTranslationService().then(config => {
  console.log('激活服务:', config);
});
```

#### 清除所有数据（重新测试）

```javascript
// 在Console中执行
chrome.storage.local.clear(() => {
  console.log('存储已清除');
  chrome.runtime.reload();
});
```

---

## 5. 回滚策略

### 5.1 代码回滚

如果修改后出现严重问题，立即回滚：

```bash
# 方式1：回滚所有未提交的修改
git checkout .

# 方式2：回滚特定文件
git checkout -- src/shared/types/user-preferences-types.ts
git checkout -- src/shared/storage/user-preferences-manager.ts
git checkout -- src/popup/popup.ts

# 方式3：回滚到特定commit（假设之前的commit是 abc123）
git reset --hard abc123
```

### 5.2 清除用户数据

回滚后，需要清除用户的Local Storage数据：

1. 打开 Chrome DevTools
2. Application → Storage → Local Storage
3. 找到扩展的存储条目
4. 点击 "Clear site data"
5. 重新加载扩展

或使用代码清除：

```javascript
chrome.storage.local.clear(() => {
  console.log('存储已清除');
});
```

### 5.3 用户通知

如果已经发布给用户，回滚后需要：

1. 通知用户需要重新配置翻译服务
2. 提供文档说明如何迁移（如果保留了旧版本数据）

---

## 6. 完整修改文件清单

| 序号 | 文件路径 | 修改内容 | 预计时间 | 优先级 |
|------|---------|---------|---------|--------|
| 1 | `src/shared/types/user-preferences-types.ts` | 类型定义、默认值、hash计算 | 30分钟 | 🔴 必须 |
| 2 | `src/shared/storage/user-preferences-manager.ts` | 核心存储逻辑、新增3个方法、修改验证逻辑 | 1.5小时 | 🔴 必须 |
| 3 | `src/popup/popup.ts` | UI读写逻辑 | 1小时 | 🔴 必须 |
| 4 | `src/background/handle-toggle-translate-v4.ts` | 读取配置逻辑 | 15分钟 | 🔴 必须 |
| 5 | `src/background/components/two-phase-translator-v4.ts` | 读取配置逻辑 | 15分钟 | 🔴 必须 |
| 6 | `src/background/service-worker.ts` | 旧翻译流程（可选） | 30分钟 | 🟡 可选 |

**总计时间**：4.5小时（不含service-worker.ts）

---

## 7. 验收标准

### 7.1 功能验收

- ✅ 用户切换翻译服务时，之前配置的参数（apiKey, model等）不丢失
- ✅ 首次安装时所有服务都有默认配置
- ✅ 翻译功能正常工作（Google和OpenAI都测试通过）
- ✅ Popup UI正确显示当前激活服务的配置

### 7.2 代码质量

- ✅ 无TypeScript编译错误
- ✅ 无ESLint警告
- ✅ 无运行时错误（Console无红色错误）
- ✅ 代码格式符合项目规范

### 7.3 性能验收

- ✅ 切换服务响应时间 < 100ms
- ✅ 首次加载Popup时间 < 500ms
- ✅ 存储读写性能无明显下降

### 7.4 兼容性验收

- ✅ 翻译缓存键生成正确
- ✅ 不影响现有的翻译缓存数据
- ✅ 与现有的源语言缓存兼容

---

## 8. 注意事项

### 8.1 数据迁移

⚠️ **重要**：虽然项目未上线，不需要数据迁移逻辑，但如果在开发过程中已经有测试数据，需要：

1. 清除浏览器的Local Storage
2. 重新加载扩展
3. 重新配置翻译服务

### 8.2 TypeScript类型检查

修改后务必运行TypeScript类型检查：

```bash
npm run typecheck
```

确保没有类型错误。

### 8.3 调试日志

修改过程中保留详细的日志，方便调试：

```typescript
console.log('[user-preferences-manager] 切换服务:', oldType, '→', newType);
console.log('[popup] 当前配置:', config);
```

上线前可以考虑移除或使用条件编译。

### 8.4 备份重要配置

在开始修改前，备份当前的配置文件：

```bash
cp src/shared/types/user-preferences-types.ts src/shared/types/user-preferences-types.ts.backup
cp src/shared/storage/user-preferences-manager.ts src/shared/storage/user-preferences-manager.ts.backup
```

---

## 9. 参考资料

- [Chrome Storage API文档](https://developer.chrome.com/docs/extensions/reference/storage)
- [Spring Profile Pattern](https://spring.io/blog/2011/02/14/spring-3-1-m1-introducing-profile)
- [业界调研报告](./research-translation-service-config-2025.md)（如果有）

---

## 附录A：关键代码片段

### A.1 获取当前激活服务的简便方法

```typescript
// 在任何需要获取当前服务配置的地方
const manager = UserPreferencesManager.getInstance();
const activeConfig = await manager.getActiveTranslationService();
```

### A.2 切换服务的简便方法

```typescript
// 切换到OpenAI
await manager.switchActiveService(TranslationServiceType.OPENAI);
```

### A.3 更新服务参数的简便方法

```typescript
// 只更新apiKey
await manager.updateServiceConfig(TranslationServiceType.OPENAI, {
  apiKey: 'new-key'
});
```

---

**文档结束**

**最后更新**: 2025-10-10
**维护者**: AI Assistant
**审核者**: 待定
