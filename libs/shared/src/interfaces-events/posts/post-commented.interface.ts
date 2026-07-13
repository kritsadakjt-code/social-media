export interface PostCommentedPayload {
  postId: string;
  postOwnerId: string;
  commenterId: string;
  commenterName: string;
  content: string;
  timestamp: string;
}
