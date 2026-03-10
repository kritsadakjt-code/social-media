import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common'; // <-- เพิ่มตัวนี้
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalRpcExceptionFilter } from './common/filters/rpc-exception.filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // เปิดใช้งานระบบตรวจสอบข้อมูล (Validation) ทั่วทั้ง API Gateway
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัดฟิลด์ขยะที่ส่งมาเกิน DTO ทิ้ง
      forbidNonWhitelisted: true, // ถ้าส่งฟิลด์แปลกๆ มาให้ Error ทันที
      transform: true, // แปลง Type ให้ตรงกับ DTO อัตโนมัติ
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new GlobalRpcExceptionFilter());

  // ตั้งค่า Swagger สำหรับทำ API Documentation
  const config = new DocumentBuilder()
    .setTitle('Social Media Microservices API')
    .setDescription('The API documentation for social media platform')
    .setVersion('1.0')
    .addBearerAuth() // เผื่อไว้ใส่ JWT Token
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ให้ API Gateway รันที่พอร์ต 3000
  await app.listen(process.env.PORT || 3000);
  console.log(`🚀 API Gateway is running on: http://localhost:3000`);
  console.log(`📚 Swagger Docs available at: http://localhost:3000/api/docs`);
}
bootstrap();
