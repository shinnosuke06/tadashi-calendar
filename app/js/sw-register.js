// sw を登録する。新しい版が届いていたら、次に開いたとき（アプリに戻ってきたとき）に切り替えて読み直す。
// 予定を入力している途中では切り替えない。
export function registerServiceWorker({ isBusy = () => false } = {}) {
  if (!('serviceWorker' in navigator)) return;
  let controlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; } // はじめて入れたときは読み直さない
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const switchIfReady = () => { if (reg.waiting && !isBusy()) reg.waiting.postMessage('skipWaiting'); };
    switchIfReady();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      switchIfReady();
      reg.update().catch(() => {});
    });
  }).catch(() => { /* sw が使えなくてもアプリは動く */ });
}
