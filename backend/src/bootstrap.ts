import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { EnvConfig } from './config/configuration';

/** Shared app configuration used by main.ts and the integration tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('HireLens API')
    .setDescription(
      'Public REST API for the HireLens hiring platform. AI features are delegated to the internal AI service (see docs/ai-service.openapi.json).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth('hl_refresh')
    .build();
  return SwaggerModule.createDocument(app, doc);
}
