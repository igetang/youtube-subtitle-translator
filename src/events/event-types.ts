export const EventTypes = {
  // 导航相关事件
  NAVIGATION_STARTED: 'navigation:started',
  NAVIGATION_FINISHED: 'navigation:finished',

  // 初始化相关事件
  BASIC_INIT_DONE: 'init:basic_done',
  FULL_INIT_DONE: 'init:full_done',
  MAIN_WORLD_READY: 'main-world:ready',
  EVENTBUS_READY: 'eventbus:ready',

  // DOM & UI 相关事件 (Aligning with UIManager and main-world's UI_*)
  UI_CONTROLS_INJECTED: 'ui.controlsInjected',
  UI_OVERLAY_CREATED: 'ui.overlayCreated',
  UI_INJECTION_FAILED: 'ui.injectionFailed',
  UI_CONTROLS_RECOVERED: 'ui.controlsRecovered',
  PLAYER_READY: 'dom:player_ready',

  // 翻译相关事件
  TRANSLATION_STARTED: 'translation:started',
  TRANSLATION_FINISHED: 'translation:finished',
  TRANSLATION_ERROR: 'translation:error',
  TRANSLATION_START_REQUESTED: 'translation:start_requested',
  TRANSLATION_STOP_REQUESTED: 'translation:stop_requested',

  // 字幕相关事件
  SUBTITLES_LOADED: 'subtitles:loaded',
  SUBTITLES_UPDATED: 'subtitles:updated',
  SUBTITLE_MODE_CHANGED: 'subtitles:mode_changed',
  TRACKS_AVAILABLE: 'tracks:available',

  // 设置相关事件
  SETTINGS_CHANGED: 'settings:changed',
  TARGET_LANG_CHANGED: 'settings:target_lang_changed',
  SOURCE_LANG_CHANGED: 'settings:source_lang_changed',

  // 状态相关事件
  STATE_CHANGED: 'state:changed',
  TRANSLATE_ACTIVE_CHANGED: 'state:translate_active_changed',
  TRANSLATE_STATE_CHANGED_NOTIFICATION: 'translate_state_changed_notification',

  // 消息/请求类事件
  REQUEST_CAPTION_TRACKS: 'request:track_info'
}; 