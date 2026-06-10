import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { corsOriginDelegate } from '../src/cors.config';

type ServerHandler = (request: unknown, response: unknown) => void;

let server: ServerHandler | undefined;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.enableCors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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
