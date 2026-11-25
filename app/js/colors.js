// Google カレンダーの予定の色（Google カレンダーのアプリで見える色と同じ）
export const GOOGLE_EVENT_COLORS = [
  { id: '1', name: 'ラベンダー', hex: '#7986cb' },
  { id: '2', name: 'セージ', hex: '#33b679' },
  { id: '3', name: 'ブドウ', hex: '#8e24aa' },
  { id: '4', name: 'フラミンゴ', hex: '#e67c73' },
  { id: '5', name: 'バナナ', hex: '#f6bf26' },
  { id: '6', name: 'ミカン', hex: '#f4511e' },
  { id: '7', name: 'ピーコック', hex: '#039be5' },
  { id: '8', name: 'グラファイト', hex: '#616161' },
  { id: '9', name: 'ブルーベリー', hex: '#3f51b5' },
  { id: '10', name: 'バジル', hex: '#0b8043' },
  { id: '11', name: 'トマト', hex: '#d50000' },
];

export const colorHex = id => GOOGLE_EVENT_COLORS.find(c => c.id === String(id))?.hex ?? null;
