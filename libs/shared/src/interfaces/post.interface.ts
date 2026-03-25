import { Observable } from 'rxjs';

export interface PostData {
  id: string;
  userId: string;
  username: string;
  content: string;
  likes: number;
  createdAt: string;
}
export interface PostListResponse {
  posts: PostData[];
}
export interface CommentData {
  id: string;
  postId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}
export interface CommentListResponse {
  comments: CommentData[];
}

export interface PostGrpcService {
  getPosts(data: Record<string, never>): Observable<PostListResponse>;
  getPostsByIds(data: { ids: string[] }): Observable<PostListResponse>;
  getPostsByUserId(data: { userId: string }): Observable<PostListResponse>;
  likePost(data: { postId: string; userId: string }): Observable<PostData>;
  addComment(data: {
    postId: string;
    userId: string;
    username: string;
    content: string;
  }): Observable<CommentData>;
  getCommentsByPostId(data: {
    postId: string;
  }): Observable<CommentListResponse>;
}
