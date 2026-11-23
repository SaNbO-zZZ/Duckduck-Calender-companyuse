import { currentUser, handler, HttpError } from '../lib/feishu-auth.js';
import { body, directory, json, method, resource } from '../lib/business-http.js';
import { holidays, monthData } from '../lib/calendar-reads.js';
import { register, registrationStatus } from '../lib/registration.js';
import { Feishu } from '../lib/feishu-platform.js';
import { hefeiWeather } from '../shared/hefei-weather.js';
import { notice } from '../lib/notices.js';

export default handler(
  async (ctx) => {
    const route = resource(ctx, '/api/calendar'),
      api = new Feishu();
    // Only public weather and the designated non-personal holiday fields are shared by the CDN.
    if (route === 'weather' || route === 'holidays') {
      method(ctx, 'GET');
      return json(
        ctx,
        route === 'weather'
          ? await hefeiWeather()
          : await holidays(api, ctx.url.searchParams.get('month')),
        true,
      );
    }
    const user = await currentUser(ctx);
    if (/^(release-announcement|entry-notice)\/(preview|status|publish)$/.test(route))
      return notice(ctx, route, user, api);
    method(ctx, route === 'register' ? 'POST' : 'GET');
    switch (route) {
      case 'config':
        return json(ctx, { hrUserId: await api.hr(), serverTime: Date.now() });
      case 'month':
        return json(ctx, await monthData(api, ctx.url.searchParams.get('month')));
      case 'people':
        return json(
          ctx,
          (await directory())
            .filter((p) => p.name)
            .map((p) => ({ id: p.open_id, name: p.name, avatar: p.avatar_url })),
        );
      case 'register':
        return json(ctx, await register(api, user.open_id, await body(ctx)));
      case 'registration-status':
        return json(ctx, await registrationStatus(ctx.url.searchParams.get('requestKey'), user.open_id));
      case 'sprites':
        ctx.res.writeHead(302, { Location: '/assets/weather-sprites/embed-sprites.json' }).end();
        return;
      default:
        throw new HttpError(404, '接口不存在。');
    }
  },
  ['GET', 'POST'],
);
