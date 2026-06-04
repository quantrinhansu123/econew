import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

import { Request, Response } from 'express';

function registerHealthRoute(app: NestExpressApplication) {
  const payload = () => ({
    ok: true,
    service: 'eco-transport-api',
    prefix: '/api/v1',
    timestamp: new Date().toISOString(),
  });
  const express = app.getHttpAdapter().getInstance();
  express.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json(payload());
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? [
      'http://localhost:5173',
      'http://localhost:6060',
      'http://127.0.0.1:6060',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ],
    credentials: true,
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
