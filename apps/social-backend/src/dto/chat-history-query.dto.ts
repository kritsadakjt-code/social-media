import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ChatHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'จำนวนข้อความที่ต้องการดึง',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number) // แปลง string จาก URL เป็น number
  @IsInt()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor (ID ข้อความสุดท้าย) เพื่อดึงหน้าถัดไป',
  })
  @IsOptional()
  @IsString()
  cursor: string = '';
}
