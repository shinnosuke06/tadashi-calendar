// Apps Script（父の Google アカウントで動く小さなプログラム）との窓口。
// 合言葉は URL に入れず、POST の本文で送る。Content-Type を text/plain にして CORS の事前確認を避ける。

const MESSAGES = {
  offline: '電波が弱いようです。少したってから、もう一度お試しください。',
  timeout: '電波が弱いようです。少したってから、もう一度お試しください。',
  badKey: '接続の設定が正しくありません。家族に連絡してください。',
  notFound: 'この予定は見つかりませんでした。',
  limit: '今日は移動時間を計算できる回数を使い切りました。明日また計算できます。',
  server: 'うまくいきませんでした。少したってから、もう一度お試しください。',
};
const CODE_TO_KIND = { BAD_KEY: 'badKey', NOT_FOUND: 'notFound', LIMIT: 'limit' };

export class ApiError extends Error {
  constructor(kind) {
    super(MESSAGES[kind] ?? MESSAGES.server);
    this.name = 'ApiError';
    this.kind = MESSAGES[kind] ? kind : 'server';
  }
}

// action 名と関数名の対応（お試し用の偽物も同じ形を持つ）
export function bindApi(call) {
  return {
    ping: () => call('ping'),
    listCalendars: () => call('calendars.list'),
    listEvents: p => call('events.list', p),
    getEvent: p => call('events.get', p),
    insertEvent: p => call('events.insert', p),
    patchEvent: p => call('events.patch', p),
    deleteEvent: p => call('events.delete', p),
    getSettings: () => call('settings.get'),
    saveSettings: settings => call('settings.save', { settings }),
    route: p => call('route', p),
    geocode: p => call('geocode', p),
    reverseGeocode: p => call('reverseGeocode', p),
  };
}

export function createApi({ url, key }, { fetchImpl = (...a) => fetch(...a), timeoutMs = 25000 } = {}) {
  async function call(action, params = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key, action, params }),
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new ApiError(e?.name === 'AbortError' ? 'timeout' : 'offline');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new ApiError('server');
    let body;
    try { body = await res.json(); } catch { throw new ApiError('server'); }
    if (!body || body.ok !== true) throw new ApiError(CODE_TO_KIND[body?.error?.code] ?? 'server');
    return body.data;
  }
  return bindApi(call);
}
