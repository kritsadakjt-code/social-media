import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MediaService } from './media-service.service';

@Controller()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @GrpcMethod('MediaService', 'CreatePresignedUrl')
  async createPresignedUrl(data: {
    userId: string;
    fileType: string;
    fileSize: number;
    purpose: 'post' | 'avatar' | 'chat';
  }) {
    return this.mediaService.createPresignedUrl(
      data.userId,
      data.fileType,
      data.fileSize,
      data.purpose,
    );
  }

  @GrpcMethod('MediaService', 'ConfirmUpload')
  async confirmUpload(data: { mediaId: string; userId: string }) {
    return this.mediaService.confirmUpload(data.mediaId, data.userId);
  }

  @GrpcMethod('MediaService', 'GetMediaStatus')
  async getMediaStatus(data: { mediaId: string; userId: string }) {
    return this.mediaService.getMediaStatus(data.mediaId, data.userId);
  }
}
