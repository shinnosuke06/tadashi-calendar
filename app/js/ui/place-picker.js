// 地図で場所を選ぶ画面。候補は Google のデータで探し（Apps Script 経由）、地図の絵は国土地理院（設定で OSM）。
import { h, clear, fill } from './dom.js';
import { MAP_TILES, DEFAULT_CENTER } from '../config.js';

let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletLoading ??= new Promise((resolve, reject) => {
    document.head.append(h('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' }));
    const s = h('script', { src: 'vendor/leaflet/leaflet.js' });
    s.onload = () => resolve(window.L);
    s.onerror = () => { leafletLoading = null; reject(new Error('地図を読み込めませんでした。')); };
    document.head.append(s);
  });
  return leafletLoading;
}

const round = v => Math.round(v * 1e6) / 1e6;

export function openPlacePicker(app, { query = '', near = null } = {}) {
  return new Promise(resolve => {
    const center = near ?? (app.settings.home?.lat != null ? { lat: app.settings.home.lat, lng: app.settings.home.lng } : DEFAULT_CENTER);
    let picked = null;
    let map = null, marker = null;

    const input = h('input', { type: 'search', id: 'picker-q', value: query, autocomplete: 'off', 'aria-label': '場所の名前か住所' });
    const status = h('p', { class: 'small', role: 'status' });
    const cands = h('div', { class: 'cands' });
    const mapEl = h('div', { class: 'map', 'aria-label': '地図。押すとその場所を選びます' });
    const pickedEl = h('p', { class: 'picked' }, '候補を選ぶか、地図を押してください');
    const ok = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'この場所にする');
    const root = h('div', { class: 'picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': '地図で探す' },
      h('header', { class: 'bar' }, h('button', { class: 'hbtn', type: 'button', onClick: () => done(null) }, 'やめる'), h('h1', { class: 'center' }, '地図で探す'), h('span', { class: 'hbtn-space' })),
      h('div', { class: 'screen', style: { 'padding-bottom': '0.4em' } },
        h('form', { class: 'addrow', onSubmit: e => { e.preventDefault(); search(); } }, input, h('button', { class: 'btn primary', type: 'submit' }, '探す')),
        status),
      cands, mapEl,
      h('div', { class: 'screen', style: { 'padding-top': '0.4em' } }, pickedEl, h('div', { class: 'btnrow' }, ok, h('button', { class: 'btn', type: 'button', onClick: () => done(null) }, 'やめる'))));

    function done(value) {
      map?.remove();
      root.remove();
      resolve(value);
    }
    ok.addEventListener('click', () => done(picked));

    function setPicked(p) {
      picked = p;
      root.dataset.lat = String(round(p.lat));
      root.dataset.lng = String(round(p.lng));
      fill(pickedEl, h('b', {}, p.name), p.address && p.address !== p.name ? h('span', { class: 'small' }, `　${p.address}`) : null);
      ok.disabled = false;
      if (map) {
        if (!marker) marker = window.L.marker([p.lat, p.lng]).addTo(map);
        else marker.setLatLng([p.lat, p.lng]);
        map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16));
      }
    }

    async function search() {
      const q = input.value.trim();
      if (!q) return;
      status.textContent = '探しています…';
      clear(cands);
      try {
        const { results } = await app.api.geocode({ address: q, near: center });
        status.textContent = results.length ? '' : '見つかりませんでした。住所で探すか、地図を押して選んでください';
        cands.append(...results.map(r => {
          const b = h('button', { class: 'cand', type: 'button' }, h('b', {}, r.name), h('span', {}, r.address));
          b.addEventListener('click', () => {
            cands.querySelectorAll('.cand').forEach(x => x.setAttribute('aria-pressed', 'false'));
            b.setAttribute('aria-pressed', 'true');
            setPicked(r);
          });
          return b;
        }));
      } catch (e) {
        status.textContent = e?.message || '探せませんでした。少したってから、もう一度お試しください。';
      }
    }

    app.shell.root.append(root);
    loadLeaflet().then(L => {
      if (!root.isConnected) return;
      const tiles = MAP_TILES[app.settings.mapTiles] ?? MAP_TILES.gsi;
      map = L.map(mapEl, { zoomControl: true }).setView([center.lat, center.lng], 15);
      L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(map);
      map.attributionControl.setPrefix(false);
      if (picked) setPicked(picked);
      map.on('click', async e => {
        const { lat, lng } = e.latlng;
        setPicked({ name: '地図で選んだ場所', address: '', lat, lng });
        try {
          const r = await app.api.reverseGeocode({ lat, lng });
          if (r?.address && picked?.lat === lat) setPicked({ name: r.address, address: r.address, lat, lng });
        } catch (err) {
          status.textContent = err?.message || '';
        }
      });
    }).catch(e => { status.textContent = e.message; });
    if (query) search();
    else input.focus();
  });
}
