import { Module } from '@nestjs/common';
import { LegacyWriteGate } from './legacy-write-gate';

@Module({ providers: [LegacyWriteGate], exports: [LegacyWriteGate] })
export class LegacyWriteGateModule {}
