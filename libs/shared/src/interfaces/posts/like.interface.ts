export interface LikePostRequest {
  postId: string;
  userId: string;
  idempotencyKey: string;
}

export interface LikePostResponse {
  success: boolean;
  liked: boolean; // true = กดไลก์, false = ยกเลิกไลก์
  likes: number;
}
