// 地図（道順・住所探し）。Apps Script に最初からある地図機能を使い、料金はかからない。
// Google の上限（個人のアカウントは 1 日 1,000 回）の 1 割に収まるよう、1 日 100 回までに制限する。
const DAILY_ROUTE_LIMIT = 100;
const DAILY_GEO_LIMIT = 100;

function limitError_() {
  const e = new Error('LIMIT');
  e.code = 'LIMIT';
  return e;
}

// その日（日本時間）の回数を数える。足すと上限を超えるなら LIMIT
function useQuota_(prefix, n, limit) {
  const key = prefix + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const used = Number(props_().getProperty(key) || 0);
  if (used + n > limit) throw limitError_();
  props_().setProperty(key, String(used + n));
}

function mapsCall_(fn) {
  try {
    return fn();
  } catch (e) {
    if (/too many times/i.test(String(e && e.message))) throw limitError_();
    throw e;
  }
}

function oneRoute_(origin, destination, avoidHighways) {
  const f = Maps.newDirectionFinder().setOrigin(origin).setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING).setLanguage('ja').setRegion('jp');
  if (avoidHighways) f.setAvoid(Maps.DirectionFinder.Avoid.HIGHWAYS);
  const res = mapsCall_(() => f.getDirections());
  if (!res || res.status !== 'OK' || !res.routes || !res.routes.length) return null;
  const leg = res.routes[0].legs[0];
  return { minutes: Math.round(leg.duration.value / 60), km: Math.round(leg.distance.value / 100) / 10, leg: leg };
}

function cleanAddress_(a) {
  return String(a || '').replace(/^日本、\s*/, '').replace(/^〒\d{3}-\d{4}\s*/, '');
}

function route_(p) {
  useQuota_('ROUTE_COUNT_', 2, DAILY_ROUTE_LIMIT);
  const withHighways = oneRoute_(p.origin, p.destination, false);
  const withoutHighways = oneRoute_(p.origin, p.destination, true);
  const leg = (withHighways || withoutHighways || {}).leg;
  const strip = r => (r ? { minutes: r.minutes, km: r.km } : null);
  return {
    withHighways: strip(withHighways),
    withoutHighways: strip(withoutHighways),
    destinationAddress: leg ? cleanAddress_(leg.end_address) : null,
    destination: leg ? { lat: leg.end_location.lat, lng: leg.end_location.lng } : null,
  };
}

function placeName_(r) {
  const named = (r.address_components || []).find(c => (c.types || []).some(t => t === 'establishment' || t === 'point_of_interest'));
  return named ? named.long_name : cleanAddress_(r.formatted_address);
}

function geocode_(p) {
  useQuota_('GEO_COUNT_', 1, DAILY_GEO_LIMIT);
  const g = Maps.newGeocoder().setLanguage('ja').setRegion('jp');
  if (p.near) g.setBounds(p.near.lat - 0.27, p.near.lng - 0.33, p.near.lat + 0.27, p.near.lng + 0.33);
  const res = mapsCall_(() => g.geocode(p.address));
  const results = (res && res.status === 'OK' ? res.results : []).slice(0, 5).map(r => ({
    name: placeName_(r), address: cleanAddress_(r.formatted_address),
    lat: r.geometry.location.lat, lng: r.geometry.location.lng,
  }));
  return { results: results };
}

function reverseGeocode_(p) {
  useQuota_('GEO_COUNT_', 1, DAILY_GEO_LIMIT);
  const res = mapsCall_(() => Maps.newGeocoder().setLanguage('ja').setRegion('jp').reverseGeocode(p.lat, p.lng));
  if (!res || res.status !== 'OK' || !res.results.length) return null;
  return { address: cleanAddress_(res.results[0].formatted_address) };
}
