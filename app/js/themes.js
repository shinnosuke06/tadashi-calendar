// 文字サイズと色のテーマ
export const FONT_LEVELS = [16, 18, 22, 26, 32];
export const FONT_LEVEL_LABELS = ['小さめ', 'ふつう', '大きめ', 'とても大きい', 'いちばん大きい'];

// border = マスの区切り線、head/headText = 上下の帯、band = 曜日の行や見出しの帯
export const THEMES = {
  standard: { label: '白', bg: '#ffffff', surface: '#f2f4f7', surface2: '#e3e7ed', text: '#111418', subtext: '#4a5260', border: '#d5d9df', accent: '#0b57d0', accentText: '#ffffff', saturday: '#0b57d0', sunday: '#c5221f', today: '#fff1c2', danger: '#b3261e', head: '#ffffff', headText: '#111418', band: '#eef0f3' },
  sakura: { label: 'さくら', bg: '#fffafb', surface: '#fdeef2', surface2: '#f8d9e1', text: '#2a1a1f', subtext: '#6b4a53', border: '#f0cfd8', accent: '#c2185b', accentText: '#ffffff', saturday: '#1d4fa8', sunday: '#b3261e', today: '#ffe0e8', danger: '#a4231b', head: '#f8d3dc', headText: '#3a1d26', band: '#fbe6ec' },
  wakaba: { label: 'わかば', bg: '#fbfdf9', surface: '#edf5e8', surface2: '#d9ead0', text: '#17231a', subtext: '#44574a', border: '#cfe0c6', accent: '#2e7d32', accentText: '#ffffff', saturday: '#1d4fa8', sunday: '#b3261e', today: '#e2f3d6', danger: '#a4231b', head: '#cfe8c4', headText: '#17331c', band: '#e6f2df' },
  cream: { label: 'クリーム', bg: '#faf5e8', surface: '#f0e8d2', surface2: '#e5dabd', text: '#1d1a14', subtext: '#474134', border: '#d9ceb2', accent: '#6b4a12', accentText: '#ffffff', saturday: '#1a4fa0', sunday: '#b3261e', today: '#ffe39a', danger: '#a4231b', head: '#f3ead3', headText: '#1d1a14', band: '#efe5c9' },
  dark: { label: '黒地に白', bg: '#121417', surface: '#1f242a', surface2: '#2b3139', text: '#f1f3f5', subtext: '#c3c9d1', border: '#343b45', accent: '#8ab4f8', accentText: '#0b1a33', saturday: '#8ab4f8', sunday: '#f28b82', today: '#3a3417', danger: '#f2b8b5', head: '#181b1f', headText: '#f1f3f5', band: '#1c2025' },
  contrast: { label: 'くっきり', bg: '#000000', surface: '#141414', surface2: '#262626', text: '#ffffff', subtext: '#ececec', border: '#8a8a8a', accent: '#ffd60a', accentText: '#000000', saturday: '#7cc4ff', sunday: '#ff8a80', today: '#403500', danger: '#ff8a80', head: '#000000', headText: '#ffffff', band: '#1a1a1a' },
};

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// WCAG のコントラスト比（1〜21）
export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
