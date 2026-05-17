import { MediaGrpcService } from '@app/shared';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GatewayMediaService implements OnModuleInit {
  private mediaGrpcService!: MediaGrpcService;

  constructor(@Inject('MEDIA_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.mediaGrpcService =
      this.client.getService<MediaGrpcService>('MediaService');
  }

  createPresignedUrl(
    userId: string,
    fileType: string,
    fileSize: number,
    purpose: string,
  ) {
    return firstValueFrom(
      this.mediaGrpcService.createPresignedUrl({
        userId,
        fileType,
        fileSize,
        purpose,
      }),
    );
  }

  confirmUpload(mediaId: string, userId: string) {
    return firstValueFrom(
      this.mediaGrpcService.confirmUpload({ mediaId, userId }),
    );
  }

  getMediaStatus(mediaId: string, userId: string) {
    return firstValueFrom(
      this.mediaGrpcService.getMediaStatus({ mediaId, userId }),
    );
  }
}
