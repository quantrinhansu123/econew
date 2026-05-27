import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

type ServerHandler = (request: unknown, response: unknown) => void;

let server: ServerHandler | undefined;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  await app.init();

  return app;
}

export default async function handler(request: unknown, response: unknown) {
  if (!server) {
    const app = await bootstrap();
    server = app.getHttpAdapter().getInstance() as ServerHandler;
  }

  return server(request, response);
}
