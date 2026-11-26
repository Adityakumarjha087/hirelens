import { Global, Module } from '@nestjs/common';
import { ObjectStorage, S3Storage } from './storage.service';

@Global()
@Module({ providers: [{ provide: ObjectStorage, useClass: S3Storage }], exports: [ObjectStorage] })
export class StorageModule {}
