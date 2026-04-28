import { PostLikedEventPayload } from '@app/shared';

export class PostLikedEvent {
  constructor(public readonly payload: PostLikedEventPayload) {}
}
