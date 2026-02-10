// lib/notifications/index.ts
// Re-export everything from core
export * from './core';

// Or if you want to be more selective:
// export { 
//   registerForPushNotificationsAsync,
//   savePushToken,
//   getUserNotifications,
//   markNotificationAsRead,
//   IS_EXPO_GO 
// } from './core';

export type {
    NotificationData,
    NotificationType,
    StoredNotification
} from './types';
