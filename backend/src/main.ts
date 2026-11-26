import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import type { EnvConfig } from './config/configuration';
import { SeedService } from './seed/seed.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  SwaggerModule.setup('api/docs', app, buildOpenApi(app), { jsonDocumentUrl: 'api/docs-json' });
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  await app.init();
  if (config.get('SEED_ON_START', { infer: true })) {
    await app.get(SeedService).seedIfEmpty();
  }
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
