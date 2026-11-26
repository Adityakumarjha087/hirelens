import { Global, Module } from '@nestjs/common';
import { AiClient, HttpAiClient } from './ai-client';

@Global()
@Module({ providers: [{ provide: AiClient, useClass: HttpAiClient }], exports: [AiClient] })
export class AiModule {}
