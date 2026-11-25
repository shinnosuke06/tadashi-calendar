// キーボードが出ても入力中の欄が見えるようにする。入力中は下のボタンを隠す。
const FIELDS = 'input, textarea, select';

function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

// 欄の下の端が、キーボードの上（見えている所）に収まるように動かす
export function ensureFieldVisible(el, win = window) {
  const vv = win.visualViewport;
  const visibleBottom = vv ? vv.offsetTop + vv.height : win.innerHeight;
  const margin = 16;
  const r = el.getBoundingClientRect();
  const sp = scrollParent(el);
  if (!sp) { el.scrollIntoView({ block: 'nearest' }); return; }
  const top = sp.getBoundingClientRect().top;
  if (r.bottom > visibleBottom - margin) sp.scrollTop += r.bottom - (visibleBottom - margin);
  else if (r.top < top + margin) sp.scrollTop -= top + margin - r.top;
}

export function installKeyboardHelper(doc) {
  const body = doc.body, win = doc.defaultView;
  let blurTimer = null;
  const isField = t => t?.matches?.(FIELDS) && t.type !== 'checkbox' && t.type !== 'radio';
  doc.addEventListener('focusin', e => {
    if (!isField(e.target)) return;
    clearTimeout(blurTimer);
    body.classList.add('editing');
    setTimeout(() => { if (doc.activeElement === e.target) ensureFieldVisible(e.target, win); }, 300);
  });
  doc.addEventListener('focusout', () => {
    blurTimer = setTimeout(() => { if (!isField(doc.activeElement)) body.classList.remove('editing'); }, 200);
  });
  const vv = win.visualViewport;
  if (vv) {
    const update = () => {
      const inset = Math.max(0, win.innerHeight - vv.height - vv.offsetTop);
      doc.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
      if (isField(doc.activeElement)) ensureFieldVisible(doc.activeElement, win);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
}
