// 通知の選択肢と、Google カレンダーの通知（reminders）との変換
import { diffMinutes } from './dates.js';
import { departureSummary } from './departure.js';

export const TIMED_PRESETS = [
  { id: 'week', label: '1週間前', minutes: 10080 },
  { id: '2days', label: '2日前', minutes: 2880 },
  { id: '1day', label: '前日（同じ時刻）', minutes: 1440 },
  { id: '3h', label: '3時間前', minutes: 180 },
  { id: '1h', label: '1時間前', minutes: 60 },
  { id: '30m', label: '30分前', minutes: 30 },
  { id: 'depart', label: '出発の目安の時刻', minutes: null },
];
// 終日の予定は、その日の 0 時より前にしか鳴らせない（Google の仕組み）
export const ALLDAY_PRESETS = [
  { id: 'ad_week', label: '1週間前の朝9時', minutes: 9540 },
  { id: 'ad_2days', label: '2日前の朝9時', minutes: 2340 },
  { id: 'ad_prevMorning', label: '前日の朝9時', minutes: 900 },
  { id: 'ad_prevEvening', label: '前日の夜8時', minutes: 240 },
];
const MAX_REMINDERS = 5;
const MAX_MINUTES = 40320;
const presetsFor = allDay => (allDay ? ALLDAY_PRESETS : TIMED_PRESETS);

export function defaultNotifyFor(allDay, settings) {
  if (allDay) return { on: true, presets: ['ad_prevEvening'] };
  const d = settings.defaultNotify;
  return { on: d.on, presets: [...d.presets] };
}

function departMinutes(ev, settings) {
  const s = departureSummary(ev, settings);
  if (!s) return null;
  const chosen = settings.departRoute === 'withHighways' ? (s.withHighways || s.withoutHighways) : (s.withoutHighways || s.withHighways);
  return diffMinutes(chosen.departAt, ev.start);
}

export function toGoogleReminders(ev, settings) {
  const notify = ev.notify ?? defaultNotifyFor(ev.allDay, settings);
  if (notify.googleDefault) return { useDefault: true };
  if (!notify.on) return { useDefault: false, overrides: [] };
  const minutes = [];
  for (const p of presetsFor(ev.allDay)) {
    if (!notify.presets.includes(p.id)) continue;
    minutes.push(p.id === 'depart' ? departMinutes(ev, settings) : p.minutes);
  }
  minutes.push(...(notify.custom ?? []));
  const unique = [...new Set(minutes.filter(m => Number.isInteger(m) && m >= 0 && m <= MAX_MINUTES))];
  return { useDefault: false, overrides: unique.slice(0, MAX_REMINDERS).map(m => ({ method: 'popup', minutes: m })) };
}

export function presetsFromOverrides(overrides, allDay) {
  const presets = [], custom = [];
  for (const o of overrides ?? []) {
    const p = presetsFor(allDay).find(x => x.minutes === o.minutes);
    if (p) presets.push(p.id); else custom.push(o.minutes);
  }
  return { presets, custom };
}

const minutesLabel = m => (m % 1440 === 0 ? `${m / 1440}日前` : m % 60 === 0 ? `${m / 60}時間前` : `${m}分前`);

export function describeNotify(notify, allDay) {
  if (!notify) return '通知なし';
  if (notify.googleDefault) return 'いつもの通知（Google の設定）';
  if (!notify.on) return '通知なし';
  const labels = presetsFor(allDay).filter(p => notify.presets.includes(p.id)).map(p => p.label);
  labels.push(...(notify.custom ?? []).map(minutesLabel));
  return labels.length ? labels.join('・') : '通知なし';
}
