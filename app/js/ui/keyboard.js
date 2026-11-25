// キーボードが出ても入力中の欄が見えるようにする。入力中は下のボタンを隠す。
const FIELDS = 'input, textarea, select';

export function installKeyboardHelper(doc) {
  const body = doc.body;
  let blurTimer = null;
  doc.addEventListener('focusin', e => {
    if (!e.target.matches?.(FIELDS) || e.target.type === 'checkbox' || e.target.type === 'radio') return;
    clearTimeout(blurTimer);
    body.classList.add('editing');
    setTimeout(() => { if (doc.activeElement === e.target) e.target.scrollIntoView({ block: 'center' }); }, 300);
  });
  doc.addEventListener('focusout', () => {
    blurTimer = setTimeout(() => { if (!doc.activeElement?.matches?.(FIELDS)) body.classList.remove('editing'); }, 200);
  });
  const vv = doc.defaultView.visualViewport;
  if (vv) {
    const update = () => {
      const inset = Math.max(0, doc.defaultView.innerHeight - vv.height - vv.offsetTop);
      doc.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
}
