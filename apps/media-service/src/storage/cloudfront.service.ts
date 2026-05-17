import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

@Injectable()
export class CloudFrontService {
  private readonly domain: string;
  private readonly keyPairId: string;
  private readonly privateKey: string;

  constructor(private readonly configService: ConfigService) {
    this.domain = configService.getOrThrow<string>('CLOUDFRONT_DOMAIN');
    this.keyPairId = configService.getOrThrow<string>('CLOUDFRONT_KEY_PAIR_ID');
    this.privateKey = configService.getOrThrow<string>(
      'CLOUDFRONT_PRIVATE_KEY',
    );
  }

  // แปลง S3 key → CloudFront URL
  getPublicUrl(key: string): string {
    return `${this.domain}/${key}`;
  }

  // สร้าง signed URL สำหรับ private content (เช่น วิดีโอ)
  getSignedUrl(key: string, expiresInSeconds: number = 3600): string {
    const url = `${this.domain}/${key}`;
    const dateLessThan = new Date(
      Date.now() + expiresInSeconds * 1000,
    ).toISOString();

    return getSignedUrl({
      url,
      keyPairId: this.keyPairId,
      dateLessThan,
      privateKey: this.privateKey,
    });
  }
}
