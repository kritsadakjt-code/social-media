import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'สวัสดีครับ ผมเป็นนักธุรกิจ' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'https://example.com/my-avatar.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
