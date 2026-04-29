import { PostCommentedPayload } from '@app/shared';

export class PostCommentEvent {
  constructor(public readonly payload: PostCommentedPayload) {}
}
