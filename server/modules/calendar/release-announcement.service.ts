import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { CapabilityService, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, inArray } from 'drizzle-orm';
import { integer, jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { userProfile } from '../../database/schema';

const WIKI_URL = 'https://ycn3zdw6f1p7.feishu.cn/wiki/I6uzwNwd7izfPCkQHJDcoxdRnRb';
const title = '鸭鸭日历发布新版本-更新说明';
const ENTRY_NOTICE_KEY = 'notice-entry-20261025';
const ENTRY_NOTICE_TITLE = '鸭鸭日历｜两个入口，一份日历';
const ENTRY_NOTICE_CONTENT = [
  '大家好！有同事在手机飞书的“最近使用”里看到了两个“鸭鸭日历”。这是飞书将妙搭直达入口（蓝色图标）和公司应用入口（灰底头像图标）分别记录，并不是程序故障，也不是两个不同版本。',
  '',
  '- **两个都能点**：它们最终打开同一套鸭鸭日历，日历展示和知会登记使用同一份数据，**无需重复登记**。',
  '- **日常建议**：优先使用灰底头像图标的“鸭鸭日历”，这是公司面向全员开放的应用入口。习惯蓝色图标的同事继续使用也没问题。',
  '- 电脑端左侧的“鸭鸭日历”是单独配置的快捷入口，也通往同一页面。',
  '',
  '如果发现两边内容确实不一致，请把截图反馈给日历维护者，我们会核查。',
].join('\n');
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
const roster = pgTable('calendar_release_roster', {
  version: varchar('version', { length: 32 }).primaryKey(),
  recipientIds: jsonb('recipient_ids').$type<string[]>().notNull(),
  recipientCount: integer('recipient_count').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
  source: varchar('source', { length: 80 }).notNull(),
});

function content(input: AnnouncementPayload): string {
  return `**${input.version} 更新上线啦**\n${input.highlights.map(item => `- ${item}`).join('\n')}\n\n[查看完整更新说明](${WIKI_URL})`;
}

@Injectable()
export class ReleaseAnnouncementService {
  private readonly logger = new Logger(ReleaseAnnouncementService.name);
  constructor(
    @Inject(CapabilityService) private readonly capability: CapabilityService,
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private async recipients(key: string): Promise<string[]> {
    const [snapshot] = await this.db.select().from(roster).where(eq(roster.version, key)).limit(1);
    if (!snapshot) throw new BadGatewayException('尚未核对该版本的企业员工名单，已停止发送。');
    const parsed = z.array(z.string().regex(/^\d+$/)).min(1).safeParse(snapshot.recipientIds);
    if (!parsed.success) throw new BadGatewayException('员工名单格式异常，已停止发送。');
    const ids = [...new Set(parsed.data)].sort();
    if (ids.length !== snapshot.recipientCount || ids.length !== parsed.data.length) {
      throw new BadGatewayException('员工名单人数不一致，已停止发送。');
    }
    const ageMs = Date.now() - snapshot.verifiedAt.getTime();
    if (ageMs < 0 || ageMs > 24 * 60 * 60 * 1000 || snapshot.source !== 'feishu-contact-v3') {
      throw new BadGatewayException('员工名单已过期或来源不明，请重新核对。');
    }
    return ids;
  }

  async preview(version: string) {
    if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new BadRequestException('版本号无效。');
    const ids = await this.recipients(version);
    return {recipientCount: ids.length, wikiUrl: WIKI_URL};
  }

  async entryNoticePreview() {
    const ids = await this.recipients(ENTRY_NOTICE_KEY);
    return {recipientCount: ids.length, title: ENTRY_NOTICE_TITLE, content: ENTRY_NOTICE_CONTENT};
  }

  async publish(raw: unknown, actorId: string) {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('请填写有效版本号和 1 至 5 条简短更新内容。');
    const input = parsed.data;
    return this.publishPrepared(
      input.version, title, content(input), actorId,
      createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    );
  }

  async publishEntryNotice(actorId: string) {
    return this.publishPrepared(ENTRY_NOTICE_KEY, ENTRY_NOTICE_TITLE, ENTRY_NOTICE_CONTENT, actorId);
  }

  private async publishPrepared(
    key: string, messageTitle: string, messageContent: string, actorId: string,
    payloadHash = createHash('sha256').update(JSON.stringify({messageTitle, messageContent})).digest('hex'),
  ) {
    const [existing] = await this.db.select().from(announcement).where(eq(announcement.version, key)).limit(1);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new ConflictException('该批通知已创建，请勿改写同一批次的内容。');
      return this.campaignSummary(key);
    }
    const ids = await this.recipients(key);
    const created = await this.db.transaction(async tx => {
      const [row] = await tx.insert(announcement).values({
        version: key, payloadHash, expectedCount: ids.length, status: 'sending', createdBy: actorId,
      }).onConflictDoNothing({target: announcement.version}).returning();
      if (!row) return false;
      await tx.insert(delivery).values(ids.map(recipient => ({version: key, recipient, state: 'pending', createdBy: actorId})));
      return true;
    });
    if (!created) return this.campaignSummary(key);

    // Batches stay well under the plugin's 200-user limit. A failed or uncertain
    // batch is never retried automatically: the platform may have accepted it.
    for (let offset = 0; offset < ids.length; offset += 50) {
      const candidateIds = ids.slice(offset, offset + 50);
      const claimed = await this.db.update(delivery).set({state: 'sending'}).where(and(
        eq(delivery.version, key), inArray(delivery.recipient, candidateIds), eq(delivery.state, 'pending'),
      )).returning();
      const recipientIds = claimed.map(item => item.recipient);
      if (recipientIds.length === 0) continue;
      try {
        const result = z.object({success: z.boolean()}).parse(await this.capability.load('duck-notify').call('send_feishu_message', {
          recipients: recipientIds, title: messageTitle, content: messageContent,
        }));
        await this.db.update(delivery).set({state: result.success ? 'accepted' : 'needs_review'}).where(and(
          eq(delivery.version, key), inArray(delivery.recipient, recipientIds),
        ));
      } catch (error) {
        await this.db.update(delivery).set({state: 'needs_review'}).where(and(
          eq(delivery.version, key), inArray(delivery.recipient, recipientIds),
        ));
        this.logger.warn({event: 'company_notice_requires_review', key, batchSize: recipientIds.length, error: error instanceof Error ? error.message : 'unknown'});
      }
    }
    const result = await this.campaignSummary(key);
    await this.db.update(announcement).set({status: result.needsReview === 0 ? 'accepted' : 'needs_review'}).where(eq(announcement.version, key));
    return result;
  }

  async summary(version: string) {
    if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new BadRequestException('版本号无效。');
    return this.campaignSummary(version);
  }

  async entryNoticeSummary() {
    return this.campaignSummary(ENTRY_NOTICE_KEY);
  }

  private async campaignSummary(key: string) {
    const [row] = await this.db.select().from(announcement).where(eq(announcement.version, key)).limit(1);
    if (!row) throw new BadRequestException('该批通知尚未创建。');
    const rows = await this.db.select().from(delivery).where(eq(delivery.version, key));
    const accepted = rows.filter(item => item.state === 'accepted').length;
    return {expected: row.expectedCount, accepted, needsReview: row.expectedCount - accepted,
      message: rows.length === row.expectedCount && accepted === row.expectedCount ? '全部通知请求已被平台受理。' : '部分通知需人工核对，请勿重复发送。',
      ...(key.startsWith('v') ? {version: key, wikiUrl: WIKI_URL} : {})};
  }
}