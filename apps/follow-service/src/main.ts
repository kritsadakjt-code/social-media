import { NestFactory } from '@nestjs/core';
import { FollowServiceModule } from './follow-service.module';

async function bootstrap() {
  const app = await NestFactory.create(FollowServiceModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
