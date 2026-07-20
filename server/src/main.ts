import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { corsOriginDelegate } from './cors.config';
import { buildHealthResponse } from './health-response';

function registerHealthRoute(app: NestExpressApplication) {
  const express = app.getHttpAdapter().getInstance();
  express.get('/api/v1/health', (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(200).json(buildHealthResponse());
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  registerHealthRoute(app);
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  console.log(`API listening on http://127.0.0.1:${port}/api/v1 (health: http://127.0.0.1:${port}/api/v1/health)`);
}

void bootstrap();
