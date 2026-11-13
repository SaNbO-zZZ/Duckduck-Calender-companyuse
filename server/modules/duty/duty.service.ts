import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthNPaasService, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { dutyAssetManifest } from '../../../shared/duty-assets';
import { applyAvatarBinding, beijingDate, parseBeijingDate, planDutySelection, resolveDuty, weekdayOf, type DutyAvatarBinding, type DutyOverride, type DutyRule } from '../../../shared/duty-calendar';
import { dutyAvatarBinding, dutyOverride, dutyWeeklyRule } from '../../database/schema';
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
}
