export interface PostLikedEventPayload {
  postId: string;
  postOwnerId: string;
  likedByUserId: string;
  timestamp: string;
}
