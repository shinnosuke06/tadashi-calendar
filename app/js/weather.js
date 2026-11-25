// 天気予報（Open-Meteo。API キー不要、非商用は無料）。1 時間は同じ場所の予報を使い回し、1 日 200 回まで。
import { todayKey, dateOf } from './dates.js';

export const WEATHER_CREDIT = '天気予報: Open-Meteo';
const CACHE_MS = 60 * 60 * 1000;
const DAILY_LIMIT = 200;

export function forecastUrl(lat, lng) {
  return 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&hourly=precipitation_probability&timezone=Asia%2FTokyo&forecast_days=16';
}

const GROUPS = [
  [[0], '晴れ', '☀️'], [[1, 2], '晴れ時々くもり', '🌤️'], [[3], 'くもり', '☁️'], [[45, 48], '霧', '🌫️'],
  [[51, 52, 53, 54, 55, 56, 57, 61, 62, 63, 64, 65, 66, 67, 80, 81, 82], '雨', '🌧️'],
  [[71, 72, 73, 74, 75, 76, 77, 85, 86], '雪', '❄️'], [[95, 96, 97, 98, 99], '雷雨', '⛈️'],
];

export function describeWeather(code) {
  const g = GROUPS.find(([codes]) => codes.includes(code));
  return g ? { label: g[1], icon: g[2] } : { label: '', icon: '' };
}

export function parseForecast(json) {
  const daily = {}, hourly = {};
  const d = json?.daily ?? {}, h = json?.hourly ?? {};
  (d.time ?? []).forEach((k, i) => {
    daily[k] = {
      code: d.weather_code?.[i], max: Math.round(d.temperature_2m_max?.[i]),
      min: Math.round(d.temperature_2m_min?.[i]), pop: d.precipitation_probability_max?.[i] ?? null,
    };
  });
  (h.time ?? []).forEach((k, i) => { hourly[k] = h.precipitation_probability?.[i] ?? null; });
  return { daily, hourly };
}

export function weatherFor(forecast, dateKeyOrEvent) {
  if (!forecast) return null;
  const ev = typeof dateKeyOrEvent === 'string' ? null : dateKeyOrEvent;
  const key = ev ? dateOf(ev.start) : dateKeyOrEvent;
  const day = forecast.daily[key];
  if (!day) return null;
  const out = { ...describeWeather(day.code), max: day.max, min: day.min, pop: day.pop };
  if (ev && !ev.allDay) {
    const pop = forecast.hourly[`${ev.start.slice(0, 13)}:00`];
    if (pop !== undefined && pop !== null) out.popAtTime = pop;
  }
  return out;
}

export async function fetchForecast(lat, lng, { fetchImpl = fetch, kv, now = () => new Date() } = {}) {
  const cacheKey = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const t = now();
  const cached = await kv.get('kv', cacheKey);
  if (cached && t.getTime() - cached.at < CACHE_MS) return cached.data;
  const countKey = `weatherCount:${todayKey(t)}`;
  const count = (await kv.get('kv', countKey)) ?? 0;
  if (count >= DAILY_LIMIT) return cached?.data ?? null;
  await kv.put('kv', countKey, count + 1);
  try {
    const res = await fetchImpl(forecastUrl(lat, lng));
    if (!res.ok) return cached?.data ?? null;
    const data = parseForecast(await res.json());
    await kv.put('kv', cacheKey, { at: t.getTime(), data });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}
