import { Controller, Logger } from '@nestjs/common';
import { MediaService } from '../media-service.service';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
} from '@nestjs/microservices';
import { MediaUploadedPayload, registry } from '@app/shared';

@Controller()
export class MediaProcessorController {
  private readonly logger = new Logger(MediaProcessorController.name);

  constructor(private readonly mediaService: MediaService) {}

  @EventPattern('media_events')
  async handleMediaEvent(
    @Payload() encodedMessage: Buffer | { value: Buffer | string },
    @Ctx() context: KafkaContext,
  ) {
    const eventType = context.getMessage().headers?.['event_type']?.toString();

    if (eventType !== 'media_uploaded') {
      this.logger.log(`ข้าม event: ${eventType}`);
      return;
    }

    let payload: MediaUploadedPayload;

    try {
      const bufferData = Buffer.isBuffer(encodedMessage)
        ? encodedMessage
        : Buffer.from(encodedMessage.value || '');
      payload = (await registry.decode(bufferData)) as MediaUploadedPayload;
    } catch (error) {
      this.logger.error(
        '❌ decode payload ไม่สำเร็จ',
        (error as Error).message,
      );
      return;
    }
    this.logger.log(`🎬 กำลัง process media: ${payload.mediaId}`);

    await this.mediaService.processMedia(
      payload.mediaId,
      payload.key,
      payload.fileType,
      payload.userId,
      payload.purpose,
    );
  }
}
