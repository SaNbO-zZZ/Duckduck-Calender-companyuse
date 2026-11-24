import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

// Only persist business identifiers that can be used for reconciliation. Never
// store a registration payload, actor, mentor, or message text in the work log.
function workReference(input: unknown): string | null {
  if (input && typeof input === 'object') {
    const form = input as Record<string, unknown>;
    input = form.requestKey ?? form.dutyDate ?? form.version;
  }
  if (typeof input !== 'string') return null;
  const reference = /^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|\d{4}-\d{2}-\d{2}|v\d+\.\d+\.\d+)$/i;
  return input.length <= 36 && reference.test(input) ? input : null;
}

@Injectable()
export class LegacyWriteGate {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async run<T>(
    operation: string,
    reference: unknown,
    perform: () => Promise<T>,
    settled: (value: T) => boolean = () => true,
  ): Promise<T> {
    const ticket = randomUUID();
    const ref = workReference(reference);
    let admitted: boolean;
    try {
      const [row] = await this.db.execute(sql`
        SELECT ducky_legacy_admit(${ticket}::uuid, ${operation}, ${ref}) AS admitted
      `);
      admitted = row?.admitted === true;
    } catch {
      throw new ServiceUnavailableException('暂时无法核实旧版写入状态，请稍后重试。');
    }
    if (!admitted) throw new ServiceUnavailableException('鸭鸭日历正在迁移，旧版已暂停写入。');
    // Only a completed operation releases its ticket. An unknown outcome (or a
    // killed instance) remains explicitly visible to the cutover operator.
    let result: T;
    try {
      result = await perform();
    } catch (error) {
      await this.markForReview(ticket);
      throw error;
    }
    if (!settled(result)) {
      await this.markForReview(ticket);
      return result;
    }
    const [completed] = await this.db.execute(sql`
      DELETE FROM ducky_legacy_work WHERE id = ${ticket}::uuid RETURNING id
    `);
    if (completed?.id !== ticket) throw new ServiceUnavailableException('旧版操作回执待核对。');
    return result;
  }

  private async markForReview(ticket: string) {
    await this.db.execute(sql`UPDATE ducky_legacy_work SET state = 'needs_review' WHERE id = ${ticket}::uuid`);
  }
}
