export interface MediaUploadedPayload {
  mediaId: string;
  userId: string;
  key: string;
  fileType: string;
  purpose: 'post' | 'avatar' | 'chat';
}

export interface MediaProcessedPayload {
  mediaId: string;
  userId: string;
  purpose: 'post' | 'avatar' | 'chat';
  originalUrl: string;
  thumbnailUrl?: string;
  mediumUrl?: string;
  p360Url?: string;
  p720Url?: string;
  p1080Url?: string;
}
