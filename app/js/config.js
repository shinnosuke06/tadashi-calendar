// アプリ全体の決まり
export const APP_VERSION = '1.0.0';

// 地図の絵（どちらも無料。出典を地図の右下に出す決まり）
export const MAP_TILES = {
  gsi: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    maxZoom: 18,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

// 自宅が未設定のときに地図を開く場所（東京駅のあたり）
export const DEFAULT_CENTER = { lat: 35.681, lng: 139.767 };
