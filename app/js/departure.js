// 出発の目安。予定の時刻は変えず、目安の時刻を別に計算するだけ。
import { addMinutes, diffMinutes, dateOf, formatTime } from './dates.js';

// 開始 − 移動時間 − 余裕 を、5 分単位で早いほうへ丸める
export function computeDeparture(start, travelMinutes, bufferMinutes) {
  const midnight = `${dateOf(start)}T00:00`;
  const total = diffMinutes(midnight, start) - travelMinutes - bufferMinutes;
  return addMinutes(midnight, Math.floor(total / 5) * 5);
}

export function departureSummary(ev, settings) {
  if (!ev || ev.allDay || !ev.route) return null;
  const one = r => (r && typeof r.minutes === 'number'
    ? { minutes: r.minutes, departAt: computeDeparture(ev.start, r.minutes, settings.bufferMinutes) } : null);
  const withHighways = one(ev.route.withHighways), withoutHighways = one(ev.route.withoutHighways);
  return withHighways || withoutHighways ? { withHighways, withoutHighways } : null;
}

export function departureHintText(summary) {
  if (!summary) return '';
  const times = [summary.withoutHighways, summary.withHighways].filter(Boolean).map(x => x.departAt).sort();
  const [early, late] = [times[0], times[times.length - 1]];
  return early === late ? `出発の目安 ${formatTime(early)}ごろ` : `出発の目安 ${formatTime(early)}〜${formatTime(late)}ごろ`;
}
