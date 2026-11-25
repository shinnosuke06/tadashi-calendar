// 合言葉と初めの設定。家族が Apps Script の画面で setup / showKey / reissueKey を実行する。
function props_() {
  return PropertiesService.getScriptProperties();
}

function newKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function checkKey_(key) {
  const stored = props_().getProperty('API_KEY');
  return !!stored && typeof key === 'string' && key === stored;
}

// 初めに 1 回実行する（何度実行しても大丈夫）
function setup() {
  const p = props_();
  if (!p.getProperty('API_KEY')) p.setProperty('API_KEY', newKey_());
  if (!p.getProperty('SPREADSHEET_ID')) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    const ss = active || SpreadsheetApp.create('ただしカレンダー データ');
    p.setProperty('SPREADSHEET_ID', ss.getId());
  }
  const ss = spreadsheet_();
  if (!ss.getSheetByName(SETTINGS_SHEET)) ss.insertSheet(SETTINGS_SHEET);
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'nightlyBackup');
  if (!has) ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(3).create();
  Logger.log('設定が終わりました。合言葉: ' + p.getProperty('API_KEY'));
}

function showKey() {
  Logger.log('合言葉: ' + props_().getProperty('API_KEY'));
}

// スマホを失くしたときなど。古い合言葉は使えなくなる
function reissueKey() {
  props_().setProperty('API_KEY', newKey_());
  Logger.log('新しい合言葉: ' + props_().getProperty('API_KEY'));
}

function spreadsheet_() {
  return SpreadsheetApp.openById(props_().getProperty('SPREADSHEET_ID'));
}
