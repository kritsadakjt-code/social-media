import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../interfaces/request.interface';
import { GatewayMediaService } from './media.service';

class CreatePresignedUrlDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  fileType!: string;

  @ApiProperty({ example: 1024000 })
  @IsNumber()
  @Min(1)
  fileSize!: number;

  @ApiProperty({ enum: ['post', 'avatar', 'chat'] })
  @IsEnum(['post', 'avatar', 'chat'])
  purpose!: 'post' | 'avatar' | 'chat';
}

class ConfirmUploadDto {
  @ApiProperty()
  @IsString()
  mediaId!: string;
}

@ApiTags('Media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GatewayMediaController {
  constructor(private readonly mediaService: GatewayMediaService) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'ขอ Presigned URL สำหรับ upload ไปที่ S3' })
  createPresignedUrl(
    @Request() req: RequestWithUser,
    @Body() dto: CreatePresignedUrlDto,
  ) {
    return this.mediaService.createPresignedUrl(
      req.user.userId,
      dto.fileType,
      dto.fileSize,
      dto.purpose,
    );
  }

  @Post('confirm')
  @ApiOperation({ summary: 'แจ้งว่า upload ขึ้น S3 สำเร็จแล้ว' })
  confirmUpload(
    @Request() req: RequestWithUser,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.mediaService.confirmUpload(dto.mediaId, req.user.userId);
  }

  @Get(':mediaId/status')
  @ApiOperation({ summary: 'เช็คสถานะการ process ไฟล์' })
  getStatus(
    @Request() req: RequestWithUser,
    @Param('mediaId') mediaId: string,
  ) {
    return this.mediaService.getMediaStatus(mediaId, req.user.userId);
  }
}
