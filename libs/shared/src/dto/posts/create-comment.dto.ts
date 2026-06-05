import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    description: 'ข้อความคอมเมนต์',
    example: 'สุดยอดไปเลยครับโพสต์นี้!',
  })
  @IsString()
  @IsNotEmpty({ message: 'กรุณาพิมพ์ข้อความคอมเมนต์ด้วยครับ' })
  content: string;
}
