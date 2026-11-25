// 繰り返し（RRULE）の組み立て・読み戻し・説明。このアプリが扱う形だけ。
import { parseKey, dayOfWeek, nthWeekdayOfMonth, addDays, addMinutes, dateOf, WEEKDAYS } from './dates.js';

const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = n => String(n).padStart(2, '0');
const compact = key => key.replace(/-/g, '');

// 日本時間の LocalDateTime → 'YYYYMMDDTHHMMSSZ'（UTC）
function utcStamp(local) {
  const utc = addMinutes(local, -9 * 60);
  return `${compact(utc.slice(0, 10))}T${utc.slice(11, 13)}${utc.slice(14, 16)}00Z`;
}

function untilPart(date, allDay) {
  return allDay ? compact(date) : utcStamp(`${date}T23:59`).replace(/00Z$/, '59Z');
}

export function toRRule(rule, startKey, allDay) {
  const parts = [];
  const wd = CODES[dayOfWeek(startKey)];
  switch (rule.freq) {
    case 'daily': parts.push('FREQ=DAILY'); break;
    case 'weekly': parts.push('FREQ=WEEKLY', `BYDAY=${wd}`); break;
    case 'monthlyDate': parts.push('FREQ=MONTHLY', `BYMONTHDAY=${parseKey(startKey).d}`); break;
    case 'monthlyWeekday': {
      const { n } = nthWeekdayOfMonth(startKey);
      parts.push('FREQ=MONTHLY', `BYDAY=${n === 5 ? -1 : n}${wd}`);
      break;
    }
    case 'yearly': parts.push('FREQ=YEARLY'); break;
    default: throw new Error(`unknown freq ${rule.freq}`);
  }
  if (rule.end?.type === 'until') parts.push(`UNTIL=${untilPart(rule.end.date, allDay)}`);
  if (rule.end?.type === 'count') parts.push(`COUNT=${rule.end.count}`);
  return `RRULE:${parts.join(';')}`;
}

function parseParts(line) {
  return Object.fromEntries(line.replace(/^RRULE:/, '').split(';').filter(Boolean).map(p => p.split('=')));
}

// 'YYYYMMDD' または 'YYYYMMDDTHHMMSSZ' → 日本時間の DateKey
function untilToKey(v) {
  const date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (v.length === 8) return date;
  return dateOf(addMinutes(`${date}T${v.slice(9, 11)}:${v.slice(11, 13)}`, 9 * 60));
}

const UNSUPPORTED = { unsupported: true };
const KNOWN = new Set(['FREQ', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'UNTIL', 'COUNT', 'INTERVAL', 'WKST']);

export function fromRRule(lines, startKey) {
  const rrules = (lines ?? []).filter(l => l.startsWith('RRULE:'));
  if (rrules.length !== 1) return UNSUPPORTED;
  const p = parseParts(rrules[0]);
  if (Object.keys(p).some(k => !KNOWN.has(k)) || (p.INTERVAL && p.INTERVAL !== '1')) return UNSUPPORTED;
  const wd = CODES[dayOfWeek(startKey)];
  const { m, d } = parseKey(startKey);
  let freq = null;
  if (p.FREQ === 'DAILY' && !p.BYDAY && !p.BYMONTHDAY && !p.BYMONTH) freq = 'daily';
  else if (p.FREQ === 'WEEKLY' && (!p.BYDAY || p.BYDAY === wd) && !p.BYMONTHDAY) freq = 'weekly';
  else if (p.FREQ === 'MONTHLY' && !p.BYDAY && (!p.BYMONTHDAY || Number(p.BYMONTHDAY) === d)) freq = 'monthlyDate';
  else if (p.FREQ === 'MONTHLY' && p.BYDAY && !p.BYMONTHDAY) {
    const mm = /^(-?\d)([A-Z]{2})$/.exec(p.BYDAY);
    const { n, isLast } = nthWeekdayOfMonth(startKey);
    if (mm && mm[2] === wd && ((mm[1] === '-1' && isLast) || Number(mm[1]) === n)) freq = 'monthlyWeekday';
  } else if (p.FREQ === 'YEARLY' && !p.BYDAY && (!p.BYMONTH || Number(p.BYMONTH) === m) && (!p.BYMONTHDAY || Number(p.BYMONTHDAY) === d)) freq = 'yearly';
  if (!freq) return UNSUPPORTED;
  const end = p.UNTIL ? { type: 'until', date: untilToKey(p.UNTIL) } : p.COUNT ? { type: 'count', count: Number(p.COUNT) } : { type: 'none' };
  return { freq, end };
}

export function describeRule(rule, startKey) {
  const { y, m, d } = parseKey(startKey);
  const wd = WEEKDAYS[dayOfWeek(startKey)];
  let text;
  switch (rule.freq) {
    case 'daily': text = '毎日'; break;
    case 'weekly': text = `毎週 ${wd}曜`; break;
    case 'monthlyDate': text = `毎月 ${d}日`; break;
    case 'monthlyWeekday': {
      const { n } = nthWeekdayOfMonth(startKey);
      text = n === 5 ? `毎月 最後の${wd}曜` : `毎月 第${n}${wd}曜`;
      break;
    }
    case 'yearly': text = `毎年 ${m}月${d}日`; break;
    default: return '';
  }
  if (rule.end?.type === 'count') text += `（${rule.end.count}回）`;
  if (rule.end?.type === 'until') {
    const u = parseKey(rule.end.date);
    text += `（${u.y !== y ? `${u.y}年` : ''}${u.m}月${u.d}日まで）`;
  }
  return text;
}

// 「これ以降」を分けるとき: 親の繰り返しを、その回の直前で終わらせる（COUNT は外す）
export function untilBefore(lines, instanceStart, allDay) {
  return lines.map(line => {
    if (!line.startsWith('RRULE:')) return line;
    const kept = line.replace(/^RRULE:/, '').split(';').filter(p => p && !/^(UNTIL|COUNT)=/.test(p));
    const until = allDay ? compact(addDays(dateOf(instanceStart), -1)) : utcStamp(addMinutes(instanceStart, -1));
    return `RRULE:${[...kept, `UNTIL=${until}`].join(';')}`;
  });
}
