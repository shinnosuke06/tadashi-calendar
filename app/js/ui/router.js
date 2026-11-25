// 画面の経路（URL の # のあと）。id は encodeURIComponent で入れる。
const enc = encodeURIComponent;
const dec = s => decodeURIComponent(s);
const HOME = { name: 'home', params: {} };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!raw) return HOME;
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/');
  const q = new URLSearchParams(query);
  switch (parts[0]) {
    case 'setup': case 'list': case 'search': case 'settings':
      return parts.length === 1 ? { name: parts[0], params: {} } : HOME;
    case 'month':
      if (!YM.test(parts[1] ?? '')) return HOME;
      return { name: 'month', params: q.get('d') ? { ym: parts[1], d: q.get('d') } : { ym: parts[1] } };
    case 'week': case 'day': case 'new':
      return DATE.test(parts[1] ?? '') ? { name: parts[0], params: { date: parts[1] } } : HOME;
    case 'event': case 'edit':
      return parts.length === 3 && parts[1] && parts[2] ? { name: parts[0], params: { calId: dec(parts[1]), eventId: dec(parts[2]) } } : HOME;
    default:
      return HOME;
  }
}

export function routeTo(name, params = {}) {
  switch (name) {
    case 'month': return `#/month/${params.ym}${params.d ? `?d=${params.d}` : ''}`;
    case 'week': case 'day': case 'new': return `#/${name}/${params.date}`;
    case 'event': case 'edit': return `#/${name}/${enc(params.calId)}/${enc(params.eventId)}`;
    case 'home': return '#/';
    default: return `#/${name}`;
  }
}
