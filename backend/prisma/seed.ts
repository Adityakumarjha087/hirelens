/* Standalone seed: `npm run seed` (compiled) or `npm run seed:dev`. Seeds only an empty database. */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/seed/seed.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  try {
    const seeded = await app.get(SeedService).seedIfEmpty();
    console.log(seeded ? 'Seed complete' : 'Seed skipped (database not empty)');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
