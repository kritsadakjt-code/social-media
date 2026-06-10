import { Observable } from 'rxjs';

export interface CreatePresignedUrlRequest {
  userId: string;
  fileType: string;
  fileSize: number;
  purpose: string;
}

export interface CreatePresignedUrlResponse {
  mediaId: string;
  presignedUrl: string;
  uploadFields: Record<string, string>;
  key: string;
}

export interface ConfirmUploadRequest {
  mediaId: string;
  userId: string;
}

export interface ConfirmUploadResponse {
  mediaId: string;
  status: string;
}

export interface GetMediaStatusRequest {
  mediaId: string;
  userId: string;
}

export interface GetMediaStatusResponse {
  mediaId: string;
  status: string;
  originalUrl: string;
  thumbnailUrl: string;
  mediumUrl: string;
  p360Url: string;
  p720Url: string;
  p1080Url: string;
}

export interface MediaGrpcService {
  createPresignedUrl(
    data: CreatePresignedUrlRequest,
  ): Observable<CreatePresignedUrlResponse>;
  confirmUpload(data: ConfirmUploadRequest): Observable<ConfirmUploadResponse>;
  getMediaStatus(
    data: GetMediaStatusRequest,
  ): Observable<GetMediaStatusResponse>;
}
