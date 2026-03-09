import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'วันนี้กินข้าวกับอะไรดี?' })
  @IsNotEmpty({ message: 'เนื้อหาโพสต์ห้ามว่างเปล่า' })
  @IsString()
  content: string;
}
