// lib/notifications/types.ts
export type NotificationType =
    | 'contact_request'
    | 'contact_accepted'
    | 'checkin_alert'
    | 'checkin_response'
    | 'welfare_check'
    | 'system';

export interface NotificationData {
    type: NotificationType;
    title: string;
    body: string;
    recipientUserId: string;
    senderUserId?: string;
    relatedId?: string;
    data?: Record<string, any>;
}

export interface StoredNotification {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    data: any;
    sender_user_id?: string;
    related_id?: string;
    read: boolean;
    read_at?: string;
    delivery_method: 'push' | 'local' | 'alert';
    created_at: string;
}
