import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthNPaasService, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { dutyAssetManifest } from '../../../shared/duty-assets';
import { applyAvatarBinding, beijingDate, canInitiateExchange, parseBeijingDate, planDutySelection, resolveDuty, weekdayOf, type DutyAvatarBinding, type DutyOverride, type DutyRule, type ExchangeState } from '../../../shared/duty-calendar';
import { exchangeCutoffMs, exchangeOpenUrl, reduceExchange, type DutyExchangeAction, type DutyExchangeDecision } from '../../../shared/duty-exchange';
import { buildDutyExchangeOpenCard } from '../../../shared/duty-exchange-card';
import { dutyAvatarBinding, dutyExchangeRequest, dutyOverride, dutyWeeklyRule } from '../../database/schema';
import { buildDutyNotificationPlan } from './duty-notification';

@Injectable()
export class DutyService {
  private readonly logger = new Logger(DutyService.name);
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase, @Inject(AuthNPaasService) private readonly authn: AuthNPaasService) {}

  manifest() { return dutyAssetManifest; }

  private async rules(): Promise<DutyRule[]> {
    const rows = await this.db.select().from(dutyWeeklyRule);
    return rows.map(row => ({ weekday: row.weekday as DutyRule['weekday'], personId: row.personId, duckKey: row.duckKey, validFrom: row.validFrom, validTo: row.validTo, status: row.status as DutyRule['status'] }));
  }

  private async overrides(date: string): Promise<DutyOverride[]> {
    const rows = await this.db.select().from(dutyOverride).where(and(eq(dutyOverride.dutyDate, date), eq(dutyOverride.status, 'active')));
    return rows.map(row => ({ dutyDate: row.dutyDate, originalPersonId: row.originalPersonId, replacementPersonId: row.replacementPersonId, replacementDuckKey: row.replacementDuckKey ?? undefined, status: row.status as DutyOverride['status'] }));
  }

  private async avatarBinding(personId: string): Promise<DutyAvatarBinding | null> {
    const [row] = await this.db.select().from(dutyAvatarBinding).where(and(eq(dutyAvatarBinding.personId, personId), eq(dutyAvatarBinding.status, 'active'))).limit(1);
    if (!row || !dutyAssetManifest.roles[row.duckKey]) return null;
    return { personId: row.personId, duckKey: row.duckKey, manifestVersion: row.manifestVersion, status: row.status as DutyAvatarBinding['status'] };
  }

  async day(date = beijingDate()) {
    try { parseBeijingDate(date); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '日期无效。'); }
    const [rules, overrides] = await Promise.all([this.rules(), this.overrides(date)]);
    const plan = planDutySelection(date, beijingDate(), rules, overrides);
    const duty = plan.duty ? applyAvatarBinding(plan.duty, await this.avatarBinding(plan.duty.personId)) : null;
    if (!duty) return { ...plan, weekday: weekdayOf(date), personName: null, personValid: false, manifestVersion: dutyAssetManifest.manifestVersion };
    let personName = '帐号暂不可用';
    let personValid = false;
    try {
      const [profile] = await this.authn.listUsersByIds([duty.personId]);
      personName = profile?.name?.zh_cn || profile?.name?.en_us || personName;
      personValid = Boolean(profile);
    } catch (error) {
      this.logger.warn({ event: 'duty_person_lookup_failed', personId: duty.personId, error: error instanceof Error ? error.message : 'unknown' });
    }
    return { ...plan, duty, weekday: duty.weekday, personName, personValid, manifestVersion: dutyAssetManifest.manifestVersion };
  }

  async notificationPreview(date = beijingDate(), entryUrl = '/app/app_17fstqsqv1c') {
    try { parseBeijingDate(date); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '日期无效。'); }
    const [rules, overrides] = await Promise.all([this.rules(), this.overrides(date)]);
    const duty = resolveDuty(date, rules, overrides);
    if (!duty) return { state: 'needs_review', dutyDate: date, reason: '没有可用的固定排班或临时覆盖。' };
    const [profile] = await this.authn.listUsersByIds([duty.personId]);
    if (!profile) return { state: 'needs_review', dutyDate: date, reason: '最终负责人 ID 无效或已离职。' };
    const personName = profile.name?.zh_cn || profile.name?.en_us || '帐号暂不可用';
    return buildDutyNotificationPlan(duty, personName, entryUrl);
  }

  private async people(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const profiles = await this.authn.listUsersByIds(unique);
    return new Map(unique.map((id, index) => [id, profiles[index]]));
  }

  private async exchangeDto(row: typeof dutyExchangeRequest.$inferSelect, viewerId: string) {
    const profiles = await this.people([row.initiatorId, row.inviteeId, row.originalPersonId, row.replacementPersonId]);
    const name = (id: string) => profiles.get(id)?.name?.zh_cn || profiles.get(id)?.name?.en_us || '帐号暂不可用';
    const state = row.state as ExchangeState;
    const viewerRole = viewerId === row.inviteeId ? 'invitee' : viewerId === row.initiatorId ? 'initiator' : 'observer';
    const card = buildDutyExchangeOpenCard({
      title: '值日换班确认',
      text: `${row.dutyDate}：${name(row.initiatorId)} 邀请 ${name(row.inviteeId)} 接替值日。`,
      requestId: row.id,
    });
    return {
      requestId: row.id,
      dutyDate: row.dutyDate,
      state,
      expiresAt: row.expiresAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() || null,
      initiatorName: name(row.initiatorId),
      inviteeName: name(row.inviteeId),
      originalPersonName: name(row.originalPersonId),
      replacementPersonName: name(row.replacementPersonId),
      viewerRole,
      openUrl: exchangeOpenUrl(row.id),
      card,
      controlledMode: true,
      message: '已更新换班数据库状态；受控模式未发送任何员工消息。',
    };
  }

  private async expireIfNeeded(row: typeof dutyExchangeRequest.$inferSelect, now = Date.now()) {
    const reduced = reduceExchange(row.state as ExchangeState, 'expire', row.expiresAt.getTime(), now);
    if (reduced.state !== row.state) {
      const [expired] = await this.db.update(dutyExchangeRequest).set({ state: reduced.state, updatedBy: row.initiatorId }).where(and(eq(dutyExchangeRequest.id, row.id), eq(dutyExchangeRequest.state, row.state))).returning();
      return expired || { ...row, state: reduced.state };
    }
    return row;
  }

  async createExchange(raw: unknown, actorId: string) {
    const input = z.object({ dutyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), inviteeId: z.string().min(1).max(160) }).strict().parse(raw);
    const date = input.dutyDate;
    try { parseBeijingDate(date); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '日期无效。'); }
    const resolved = await this.day(date);
    if (!resolved.duty) throw new BadRequestException('当天没有可用的值日负责人。');
    if (!canInitiateExchange(actorId, resolved.duty.personId, date)) throw new ForbiddenException('只有当天值日负责人可以发起换班。');
    if (input.inviteeId === actorId) throw new BadRequestException('换班对象不能是自己。');
    const expiresAt = exchangeCutoffMs(date);
    if (Date.now() >= expiresAt) throw new BadRequestException('该日期已过 16:00 换班截止时间。');
    const profiles = await this.people([actorId, input.inviteeId]);
    if (!profiles.get(actorId) || !profiles.get(input.inviteeId)) throw new BadRequestException('换班对象帐号无效或已离职。');
    const created = await this.db.transaction(async tx => {
      const [draft] = await tx.insert(dutyExchangeRequest).values({
        dutyDate: date,
        initiatorId: actorId,
        inviteeId: input.inviteeId,
        originalPersonId: resolved.duty!.personId,
        replacementPersonId: input.inviteeId,
        state: 'draft',
        expiresAt: new Date(expiresAt),
        createdBy: actorId,
        updatedBy: actorId,
      }).returning();
      if (!draft) throw new ConflictException('换班请求创建失败。');
      const [submitted] = await tx.update(dutyExchangeRequest).set({ state: reduceExchange('draft', 'submit').state, updatedBy: actorId }).where(and(eq(dutyExchangeRequest.id, draft.id), eq(dutyExchangeRequest.state, 'draft'))).returning();
      return submitted || draft;
    });
    return this.exchangeDto(created, actorId);
  }

  async getExchange(id: string, actorId: string) {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) throw new BadRequestException('换班请求 ID 无效。');
    const [found] = await this.db.select().from(dutyExchangeRequest).where(eq(dutyExchangeRequest.id, id)).limit(1);
    if (!found) throw new NotFoundException('换班请求不存在。');
    if (actorId !== found.initiatorId && actorId !== found.inviteeId) throw new ForbiddenException('你无权查看该换班请求。');
    const row = await this.expireIfNeeded(found);
    return this.exchangeDto(row, actorId);
  }

  async decideExchange(id: string, raw: unknown, actorId: string) {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) throw new BadRequestException('换班请求 ID 无效。');
    const { decision } = z.object({ decision: z.enum(['confirm', 'reject', 'cancel']) }).strict().parse(raw) as { decision: DutyExchangeDecision };
    const [found] = await this.db.select().from(dutyExchangeRequest).where(eq(dutyExchangeRequest.id, id)).limit(1);
    if (!found) throw new NotFoundException('换班请求不存在。');
    if (decision === 'cancel' && actorId !== found.initiatorId) throw new ForbiddenException('只有发起人可以取消换班。');
    if ((decision === 'confirm' || decision === 'reject') && actorId !== found.inviteeId) throw new ForbiddenException('只有被邀请人可以处理换班。');
    const expired = await this.expireIfNeeded(found);
    if (expired.state === 'expired') return this.exchangeDto(expired, actorId);
    if (['applied', 'rejected', 'cancelled', 'expired'].includes(expired.state)) return this.exchangeDto(expired, actorId);

    if (decision !== 'confirm') {
      const next = reduceExchange(expired.state as ExchangeState, decision).state;
      const [updated] = await this.db.update(dutyExchangeRequest).set({ state: next, updatedBy: actorId }).where(and(eq(dutyExchangeRequest.id, id), eq(dutyExchangeRequest.state, expired.state))).returning();
      return this.exchangeDto(updated || { ...expired, state: next }, actorId);
    }

    const applied = await this.db.transaction(async tx => {
      const [current] = await tx.select().from(dutyExchangeRequest).where(eq(dutyExchangeRequest.id, id)).limit(1);
      if (!current) throw new NotFoundException('换班请求不存在。');
      if (current.state !== 'awaiting_confirmation') return current;
      const confirmedState = reduceExchange(current.state as ExchangeState, 'confirm').state;
      const [confirmed] = await tx.update(dutyExchangeRequest).set({ state: confirmedState, confirmedAt: new Date(), updatedBy: actorId }).where(and(eq(dutyExchangeRequest.id, id), eq(dutyExchangeRequest.state, 'awaiting_confirmation'))).returning();
      if (!confirmed) return current;
      const binding = await this.avatarBinding(current.inviteeId);
      const [override] = await tx.insert(dutyOverride).values({
        dutyDate: current.dutyDate,
        originalPersonId: current.originalPersonId,
        replacementPersonId: current.replacementPersonId,
        replacementDuckKey: binding?.duckKey,
        requestId: current.id,
        status: 'active',
        createdBy: actorId,
        updatedBy: actorId,
      }).onConflictDoNothing({ target: dutyOverride.dutyDate }).returning();
      if (!override) throw new ConflictException('该日期已有生效的换班覆盖。');
      const [final] = await tx.update(dutyExchangeRequest).set({ state: reduceExchange(confirmedState, 'apply').state, updatedBy: actorId }).where(and(eq(dutyExchangeRequest.id, id), eq(dutyExchangeRequest.state, confirmedState))).returning();
      return final || confirmed;
    });
    return this.exchangeDto(applied, actorId);
  }
}
