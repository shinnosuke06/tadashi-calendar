// 旧暦と六曜（2000〜2099 年）。外部のデータは使わず、天文計算で求める。
// 朔（新月）: Meeus『Astronomical Algorithms』49 章。太陽の黄経: 同 25 章の簡易式。
// 日付の区切りはすべて日本時間。
import { parseKey, addDays } from './dates.js';

const RAD = Math.PI / 180;
const sin = deg => Math.sin(deg * RAD);
const DELTA_T_DAYS = 69.5 / 86400; // 地球時（TT）と世界時（UT）の差（2020 年代のおよその値）
const JST_DAYS = 9 / 24;
const ROKUYO = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'];

// k 番目の朔の時刻（ユリウス日、世界時）
function newMoonJD(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  jde += -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F)
    + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M)
    - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
    - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M)
    + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
    + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
    - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  return jde - DELTA_T_DAYS;
}

// ユリウス日（世界時）→ 日本時間の日付
const jdToKey = jd => new Date((jd - 2440587.5 + JST_DAYS) * 86400000).toISOString().slice(0, 10);
// 日本時間の日付の 0 時 → ユリウス日（世界時）
const keyMidnightJD = key => { const { y, m, d } = parseKey(key); return Date.UTC(y, m - 1, d) / 86400000 + 2440587.5 - JST_DAYS; };

// 太陽の視黄経（度、0〜360）
function sunLongitude(jd) {
  const T = (jd + DELTA_T_DAYS - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  return ((lambda % 360) + 360) % 360;
}

const moonStartKey = k => jdToKey(newMoonJD(k));

// key を含む旧暦の月の k（朔の番号）
function lunationOf(key) {
  const { y, m, d } = parseKey(key);
  let k = Math.floor((y - 2000 + (m - 1) / 12 + (d - 1) / 365) * 12.3685) - 2;
  while (moonStartKey(k + 1) <= key) k++;
  while (moonStartKey(k) > key) k--;
  return k;
}

// k 番目の朔から始まる月に入る中気の黄経（なければ null）
function chukiOf(k) {
  let a = sunLongitude(keyMidnightJD(moonStartKey(k)));
  let b = sunLongitude(keyMidnightJD(moonStartKey(k + 1)));
  if (b < a) b += 360;
  const L = Math.ceil(a / 30) * 30;
  return L < b ? L % 360 : null;
}

function monthInfo(k) {
  const L = chukiOf(k);
  if (L !== null) return { month: ((L / 30 + 2) % 12) || 12, leap: false };
  return { month: monthInfo(k - 1).month, leap: true };
}

export function toLunar(key) {
  const { y } = parseKey(key);
  if (y < 2000 || y > 2099) return null;
  const k = lunationOf(key);
  const start = moonStartKey(k);
  let day = 1;
  for (let p = start; p < key; p = addDays(p, 1)) day++;
  return { ...monthInfo(k), day };
}

export function getRokuyo(key) {
  const lunar = toLunar(key);
  return lunar ? ROKUYO[(lunar.month + lunar.day) % 6] : null;
}
