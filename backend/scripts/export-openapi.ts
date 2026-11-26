/* Writes docs/backend.openapi.json without connecting to any dependency (app is never initialised). */
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
process.env.JWT_ACCESS_SECRET ??= 'openapi-export-secret-000000';

async function main(): Promise<void> {
  const { AppModule } = await import('../src/app.module');
  const { buildOpenApi, configureApp } = await import('../src/bootstrap');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  const doc = buildOpenApi(app);
  const out = join(__dirname, '..', '..', 'docs', 'backend.openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${out} (${Object.keys(doc.paths).length} paths)`);
  process.exit(0);
}

void main();
