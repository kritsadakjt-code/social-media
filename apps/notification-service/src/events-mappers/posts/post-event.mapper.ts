import { PostLikedEventPayload } from '@app/shared';
import { PostLikedEvent } from './post-liked.event';
import { IEvent } from '@nestjs/cqrs';

// กำหนดว่า Topic ชื่อนี้ ต้องใช้ Payload Interface ตัวไหน
export interface NotificationEventRegistry {
  post_liked: PostLikedEventPayload;
}

// map ให้เป็น IEvent
export type EventMapperFactory = {
  [K in keyof NotificationEventRegistry]: (
    payload: NotificationEventRegistry[K],
  ) => IEvent;
};

// สร้าง object ที่ต้องมีอยู่ข้อมูลเหมือนกับ EventMapperFactory ไว้สําหรับสร้าง instance
export const PostEventMapper: EventMapperFactory = {
  post_liked: (payload) => new PostLikedEvent(payload),
};

export function isKnowNotificationEvent(
  eventType: string,
): eventType is keyof NotificationEventRegistry {
  // console.log(eventType in PostEventMapper);
  return eventType in PostEventMapper;
}

export function createNotificationEvent<
  K extends keyof NotificationEventRegistry,
>(eventType: K, payload: NotificationEventRegistry[K]): IEvent {
  // ไปดึง value ของ key ใน PostEventMapper return ออกมาจะเป็น function
  const factory = PostEventMapper[eventType] as (
    p: NotificationEventRegistry[K],
  ) => IEvent;

  // ส่ง payload เข้า func ที่ factory เก็บไว้ ได้เป็น instance ออกมา
  return factory(payload);
}
