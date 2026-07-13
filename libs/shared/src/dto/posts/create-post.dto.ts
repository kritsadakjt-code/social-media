import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'วันนี้กินข้าวกับอะไรดี?' })
  @IsNotEmpty({ message: 'เนื้อหาโพสต์ห้ามว่างเปล่า' })
  @IsString()
  content: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mediaId?: string;
}
