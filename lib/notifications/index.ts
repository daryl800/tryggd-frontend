// lib/notifications/index.ts
export {
    CAN_USE_PUSH_NOTIFICATIONS,
    // Database functions
    getUserNotifications, hasPushToken,
    // Environment detection
    IS_EXPO_GO, markNotificationAsRead,
    // Push token functions
    registerForPushNotificationsAsync,
    savePushToken, sendContactAcceptedNotification, sendContactRequestNotification,
    // Main functions
    sendNotification
} from './core';

export type {
    NotificationData,
    NotificationType,
    StoredNotification
} from './types';
