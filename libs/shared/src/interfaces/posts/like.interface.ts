export interface LikePostRequest {
  postId: string;
  userId: string;
  idempotencyKey: string;
}
