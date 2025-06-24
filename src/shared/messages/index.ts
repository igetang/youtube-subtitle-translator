export * from './message-handlers';
export * from './message-bus';

// 导出统一的消息系统（替换GlobalMessageSystem）
export { SharedMessageSystem } from './message-system-shared';

// 导出向后兼容的消息系统函数
export { 
  initializeMessageSystem,
  getMessageSystem
} from './messages'; 