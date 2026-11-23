import { createHash, timingSafeEqual } from 'node:crypto';
import { handler, HttpError, requireBusinessWrites, setting } from '../../lib/feishu-auth.js';
import { json } from '../../lib/business-http.js';
import { dutyDay, remind } from '../../lib/duty.js';
import { Feishu } from '../../lib/feishu-platform.js';
import { beijingDate } from '../../shared/duty-calendar.js';

const digest = (text: string) => createHash('sha256').update(text).digest();
export default handler(
  async (ctx) => {
    const secret = setting('CRON_SECRET');
    if (
      secret.length < 32 ||
      !timingSafeEqual(digest(ctx.req.headers.authorization || ''), digest('Bearer ' + secret))
    ) {
      throw new HttpError(401, '调度凭证无效。');
    }
    if (ctx.url.searchParams.get('dryRun') === '1') {
      const day = await dutyDay(beijingDate());
      return json(ctx, {
        dryRun: true,
        dutyDate: day.today,
        recipientResolved: Boolean(day.duty && day.personValid),
        sent: false,
      });
    }
    requireBusinessWrites();
    json(ctx, await remind(new Feishu(), ctx.origin));
  },
  ['GET', 'POST'],
);
