import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { AuthorizationSDK, CapabilityService, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, inArray } from 'drizzle-orm';
import { integer, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { userProfile } from '../../database/schema';

const WIKI_URL = 'https://ycn3zdw6f1p7.feishu.cn/wiki/I6uzwNwd7izfPCkQHJDcoxdRnRb';
const title = '鸭鸭日历发布新版本-更新说明';
const payloadSchema = z.object({
  version: z.string().regex(/^v\d+\.\d+\.\d+$/),
  highlights: z.array(z.string().trim().min(2).max(90)).min(1).max(5),
}).strict();
type AnnouncementPayload = z.infer<typeof payloadSchema>;

const announcement = pgTable('calendar_release_announcement', {
  version: varchar('version', { length: 32 }).primaryKey(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  expectedCount: integer('expected_count').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('sending'),
  createdBy: userProfile('_created_by'),
});
const delivery = pgTable('calendar_release_delivery', {
  version: varchar('version', { length: 32 }).notNull(),
  recipient: varchar('recipient', { length: 32 }).notNull(),
  state: varchar('state', { length: 24 }).notNull().default('pending'),
  createdBy: userProfile('_created_by'),
}, table => [uniqueIndex('calendar_release_delivery_version_recipient_key').on(table.version, table.recipient)]);

function content(input: AnnouncementPayload): string {
  return `**${input.version} 更新上线啦**\n${input.highlights.map(item => `- ${item}`).join('\n')}\n\n[查看完整更新说明](${WIKI_URL})`;
}

@Injectable()
export class ReleaseAnnouncementService {
  private readonly logger = new Logger(ReleaseAnnouncementService.name);
  constructor(
    private readonly authz: AuthorizationSDK,
    @Inject(CapabilityService) private readonly capability: CapabilityService,
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private async recipients(): Promise<string[]> {
    const ids = new Set<string>();
    let total: number | undefined;
    for (let page = 1; page <= 100; page++) {
      const response = await this.authz.search.search({
        query: '', pageSize: 100, page,
        includeExternalUser: false, includeExternalGroup: false,
      });
      const resultSchema = z.object({result: z.object({userResult: z.object({
        total: z.number().int().nonnegative(),
        items: z.array(z.object({userID: z.string().regex(/^\d+$/)}).passthrough()),
      })})});
      const result = z.union([resultSchema, z.object({data: resultSchema})]).parse(response as unknown);
      const batch = 'data' in result ? result.data.result.userResult : result.result.userResult;
      if (total !== undefined && batch.total !== total) throw new BadGatewayException('通讯录人数在读取期间变化，请重新预览。');
      total = batch.total;
      for (const item of batch.items) ids.add(item.userID);
      if (ids.size >= total) break;
      if (batch.items.length === 0) throw new BadGatewayException('通讯录分页不完整，已停止群发。');
    }
    if (!total || ids.size !== total) throw new BadGatewayException('无法核实完整的企业内部员工名单，已停止群发。');
    return [...ids].sort();
  }

  async preview() {
    const ids = await this.recipients();
    return {recipientCount: ids.length, wikiUrl: WIKI_URL};
  }

  async publish(raw: unknown, actorId: string) {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('请填写有效版本号和 1 至 5 条简短更新内容。');
    const input = parsed.data;
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const [existing] = await this.db.select().from(announcement).where(eq(announcement.version, input.version)).limit(1);
    if (existing) {
      if (existing.payloadHash !== hash) throw new ConflictException('该版本已创建通知，请勿改写同一版本的通知内容。');
      return this.summary(input.version);
    }
    const ids = await this.recipients();
    const created = await this.db.transaction(async tx => {
      const [row] = await tx.insert(announcement).values({
        version: input.version, payloadHash: hash, expectedCount: ids.length, status: 'sending', createdBy: actorId,
      }).onConflictDoNothing({target: announcement.version}).returning();
      if (!row) return false;
      await tx.insert(delivery).values(ids.map(recipient => ({version: input.version, recipient, state: 'pending', createdBy: actorId})));
      return true;
    });
    if (!created) return this.summary(input.version);

    // Batches stay well under the plugin's 200-user limit. A failed or uncertain
    // batch is never retried automatically: the platform may have accepted it.
    for (let offset = 0; offset < ids.length; offset += 50) {
      const candidateIds = ids.slice(offset, offset + 50);
      const claimed = await this.db.update(delivery).set({state: 'sending'}).where(and(
        eq(delivery.version, input.version), inArray(delivery.recipient, candidateIds), eq(delivery.state, 'pending'),
      )).returning();
      const recipientIds = claimed.map(item => item.recipient);
      if (recipientIds.length === 0) continue;
      try {
        const result = z.object({success: z.boolean()}).parse(await this.capability.load('duck-notify').call('send_feishu_message', {
          recipients: recipientIds, title, content: content(input),
        }));
        await this.db.update(delivery).set({state: result.success ? 'accepted' : 'needs_review'}).where(and(
          eq(delivery.version, input.version), inArray(delivery.recipient, recipientIds),
        ));
      } catch (error) {
        await this.db.update(delivery).set({state: 'needs_review'}).where(and(
          eq(delivery.version, input.version), inArray(delivery.recipient, recipientIds),
        ));
        this.logger.warn({event: 'release_notice_requires_review', version: input.version, batchSize: recipientIds.length, error: error instanceof Error ? error.message : 'unknown'});
      }
    }
    const result = await this.summary(input.version);
    await this.db.update(announcement).set({status: result.needsReview === 0 ? 'accepted' : 'needs_review'}).where(eq(announcement.version, input.version));
    return result;
  }

  async summary(version: string) {
    if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new BadRequestException('版本号无效。');
    const [row] = await this.db.select().from(announcement).where(eq(announcement.version, version)).limit(1);
    if (!row) throw new BadRequestException('该版本尚未创建通知。');
    const rows = await this.db.select().from(delivery).where(eq(delivery.version, version));
    const accepted = rows.filter(item => item.state === 'accepted').length;
    return {version, expected: row.expectedCount, accepted, needsReview: row.expectedCount - accepted,
      message: rows.length === row.expectedCount && accepted === row.expectedCount ? '全部通知请求已被平台受理。' : '部分通知需人工核对，请勿重复发送。',
      wikiUrl: WIKI_URL};
  }
}
