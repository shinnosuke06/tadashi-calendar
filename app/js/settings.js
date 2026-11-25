// 設定のひな形と、保存してある設定の読み直し（欠けた値を埋め、おかしな値を直す）
import { FONT_LEVELS, THEMES } from './themes.js';
import { GOOGLE_EVENT_COLORS } from './colors.js';

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1, fontLevel: 2, theme: 'standard', udFont: false, startView: 'month', weekStart: 0,
  showRokuyo: true, monthNames: true, monthScroll: 'h', mapTiles: 'gsi', visibleCalendars: null,
  categories: [
    { id: 'hospital', name: '病院', colorId: '11' }, { id: 'travel', name: '旅行', colorId: '7' },
    { id: 'family', name: '家族', colorId: '2' }, { id: 'errand', name: '用事', colorId: '6' }, { id: 'other', name: 'その他', colorId: '8' },
  ],
  itemSets: [
    { id: 'hospital', name: '病院セット', items: ['保険証', '診察券', 'お薬手帳', 'お金'] },
    { id: 'travel', name: '旅行セット', items: ['着替え', '薬', 'お薬手帳', '保険証', '充電器', '財布'] },
  ],
  templates: [
    { id: 't-hospital', name: '病院', title: '病院', categoryId: 'hospital', durationMinutes: 60, location: '',
      itemSetId: 'hospital', notify: { on: true, presets: ['1day', '1h'] }, memo: '' },
  ],
  bufferMinutes: 10, departRoute: 'withoutHighways', home: { address: '', lat: null, lng: null },
  defaultNotify: { on: true, presets: ['1day', '1h'] },
});

const COLOR_IDS = new Set(GOOGLE_EVENT_COLORS.map(c => c.id));
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
const clone = v => JSON.parse(JSON.stringify(v));

function notify(v, d) {
  if (!isObj(v)) return clone(d);
  return { on: bool(v.on, d.on), presets: Array.isArray(v.presets) ? strList(v.presets) : [...d.presets] };
}

// 配列の項目を 1 つずつ直し、直せない項目は捨てる。全部だめなら初期値に戻す。
function list(v, fix, d) {
  if (!Array.isArray(v)) return clone(d);
  const out = v.map(fix).filter(Boolean);
  return out.length ? out : clone(d);
}

const fixCategory = c => isObj(c) && str(c.id) && str(c.name)
  ? { id: c.id, name: c.name, colorId: COLOR_IDS.has(String(c.colorId)) ? String(c.colorId) : '8' } : null;
const fixItemSet = s => isObj(s) && str(s.id) && str(s.name) ? { id: s.id, name: s.name, items: strList(s.items) } : null;
const fixTemplate = t => isObj(t) && str(t.id) && str(t.name) ? {
  id: t.id, name: t.name, title: str(t.title, t.name), categoryId: typeof t.categoryId === 'string' ? t.categoryId : null,
  durationMinutes: Number.isInteger(t.durationMinutes) && t.durationMinutes > 0 ? t.durationMinutes : 60,
  location: str(t.location), itemSetId: typeof t.itemSetId === 'string' ? t.itemSetId : null,
  notify: notify(t.notify, DEFAULT_SETTINGS.defaultNotify), memo: str(t.memo),
} : null;

export function mergeSettings(saved) {
  const d = DEFAULT_SETTINGS;
  const s = isObj(saved) ? saved : {};
  const level = Number.isInteger(s.fontLevel) ? Math.min(FONT_LEVELS.length - 1, Math.max(0, s.fontLevel)) : d.fontLevel;
  const home = isObj(s.home) ? { address: str(s.home.address), lat: num(s.home.lat), lng: num(s.home.lng) } : clone(d.home);
  return {
    version: 1,
    fontLevel: level,
    theme: oneOf(s.theme, Object.keys(THEMES), d.theme),
    udFont: bool(s.udFont, d.udFont),
    startView: oneOf(s.startView, ['month', 'list', 'week', 'day'], d.startView),
    weekStart: oneOf(s.weekStart, [0, 1], d.weekStart),
    showRokuyo: bool(s.showRokuyo, d.showRokuyo),
    monthNames: bool(s.monthNames, d.monthNames),
    monthScroll: oneOf(s.monthScroll, ['h', 'v'], d.monthScroll),
    mapTiles: oneOf(s.mapTiles, ['gsi', 'osm'], d.mapTiles),
    visibleCalendars: Array.isArray(s.visibleCalendars) ? strList(s.visibleCalendars) : null,
    categories: list(s.categories, fixCategory, d.categories),
    itemSets: Array.isArray(s.itemSets) ? s.itemSets.map(fixItemSet).filter(Boolean) : clone(d.itemSets),
    templates: Array.isArray(s.templates) ? s.templates.map(fixTemplate).filter(Boolean) : clone(d.templates),
    bufferMinutes: Number.isInteger(s.bufferMinutes) && s.bufferMinutes >= 0 && s.bufferMinutes <= 120 ? s.bufferMinutes : d.bufferMinutes,
    departRoute: oneOf(s.departRoute, ['withoutHighways', 'withHighways'], d.departRoute),
    home,
    defaultNotify: notify(s.defaultNotify, d.defaultNotify),
  };
}

// 設定を画面に反映する（文字の大きさとテーマの色）
const THEME_VARS = {
  bg: '--bg', surface: '--surface', surface2: '--surface2', text: '--text', subtext: '--sub', border: '--line',
  accent: '--accent', accentText: '--accent-text', saturday: '--sat', sunday: '--sun', today: '--today', danger: '--danger',
  head: '--head', headText: '--head-text', band: '--band',
};
export function applySettings(doc, settings) {
  const root = doc.documentElement;
  const theme = THEMES[settings.theme] ?? THEMES.standard;
  root.style.setProperty('--font-base', `${FONT_LEVELS[settings.fontLevel] ?? FONT_LEVELS[2]}px`);
  for (const [k, v] of Object.entries(THEME_VARS)) root.style.setProperty(v, theme[k]);
  root.dataset.theme = settings.theme;
  root.dataset.udfont = String(!!settings.udFont);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.head);
}
