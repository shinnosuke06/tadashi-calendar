// 設定は「設定」シートの A1 に JSON で、B1 に保存した日時を入れる
function settingsSheet_() {
  const ss = spreadsheet_();
  return ss.getSheetByName(SETTINGS_SHEET) || ss.insertSheet(SETTINGS_SHEET);
}

function getSettings_() {
  const v = settingsSheet_().getRange('A1').getValue();
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

function saveSettings_(settings) {
  const sheet = settingsSheet_();
  sheet.getRange('A1').setValue(JSON.stringify(settings));
  sheet.getRange('B1').setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
  return null;
}
