import { currentUser, handler, HttpError } from '../lib/feishu-auth.js';
import { body, json, method, resource } from '../lib/business-http.js';
import { dutyDay, exchange } from '../lib/duty.js';
import { Feishu } from '../lib/feishu-platform.js';
import { buildDutyNotificationPlan } from '../server/modules/duty/duty-notification.js';
import { beijingDate } from '../shared/duty-calendar.js';
import { dutyAssetManifest } from '../shared/duty-assets.js';

export default handler(
  async (ctx) => {
    const user = await currentUser(ctx),
      route = resource(ctx, '/api/duty');
    if (route === 'day' || route === 'notification-preview') {
      method(ctx, 'GET');
      const date = ctx.url.searchParams.get('date') ?? beijingDate();
      if (route === 'day') return json(ctx, await dutyDay(date));
      const day = await dutyDay(date, date);
      return json(
        ctx,
        day.duty && day.personName
          ? buildDutyNotificationPlan(day.duty, day.personName, ctx.origin)
          : { dutyDate: date, state: 'needs_review', reason: '未找到有效值日负责人。' },
      );
    }
    if (route === 'manifest') {
      method(ctx, 'GET');
      return json(ctx, dutyAssetManifest);
    }
    const match = /^exchange-requests(?:\/([^/]+)(\/decision)?)?$/.exec(route);
    if (!match) throw new HttpError(404, '接口不存在。');
    const write = !match[1] || Boolean(match[2]);
    method(ctx, write ? 'POST' : 'GET');
    json(
      ctx,
      await exchange(
        new Feishu(),
        user.open_id,
        ctx.origin,
        match[1],
        write ? await body(ctx) : undefined,
      ),
    );
  },
  ['GET', 'POST'],
);
