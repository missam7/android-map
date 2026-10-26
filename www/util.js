/* توابع مشترک: متن فارسی، ذخیره‌ی تنظیمات، پیام، پنجره‌ی گفتگو، هندسه */
(function (root) {
'use strict';
const FM = root.FM = root.FM || {};
const $ = (s, el) => (el || document).querySelector(s);
const nf = (n, d = 0) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d }).format(n);
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};
let toastTimer = null;
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2800);
}

/* پنجره‌ی گفتگو: dialog({title, body:Node|string, buttons:[{label, primary, value}] }) → Promise(value | null) */
function dialog(opts) {
  return new Promise((resolve) => {
    const ov = document.createElement('div'); ov.className = 'overlay';
    const box = document.createElement('div'); box.className = 'modal'; box.setAttribute('role', 'dialog');
    const h = document.createElement('h2'); h.textContent = opts.title || ''; box.appendChild(h);
    const body = document.createElement('div'); body.className = 'modal-body';
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    box.appendChild(body);
    const row = document.createElement('div'); row.className = 'row modal-btns';
    const close = (v) => { ov.remove(); resolve(v); };
    (opts.buttons || [{ label: 'باشه', primary: true, value: true }]).forEach((b) => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = b.label; if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', async () => {
        if (b.validate) { const ok = await b.validate(); if (ok === false) return; }
        close(typeof b.value === 'function' ? b.value() : b.value);
      });
      row.appendChild(btn);
    });
    box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov);
    const first = box.querySelector('input,select'); if (first && opts.focus !== false) setTimeout(() => first.focus(), 50);
  });
}
async function askText(title, value, extra) {
  const wrap = document.createElement('div');
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = value || ''; inp.className = 'field'; wrap.appendChild(inp);
  let ta = null;
  if (extra && extra.description !== undefined) { ta = document.createElement('textarea'); ta.className = 'field'; ta.rows = 3; ta.placeholder = 'توضیحات (اختیاری)'; ta.value = extra.description || ''; wrap.appendChild(ta); }
  const r = await dialog({ title, body: wrap, buttons: [{ label: 'انصراف', value: null }, { label: 'تأیید', primary: true, value: () => ({ text: inp.value.trim(), description: ta ? ta.value.trim() : undefined }) }] });
  return r;
}
async function confirmBox(title, text) {
  return dialog({ title, body: '<p>' + esc(text) + '</p>', buttons: [{ label: 'انصراف', value: false }, { label: 'تأیید', primary: true, value: true }] });
}
function el(tag, attrs, children) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); });
  (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}

/* هندسه */
const R_EARTH = 6371008.8, RAD = Math.PI / 180;
function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
function geodesicArea(pts) {
  const n = pts.length; let area = 0; if (n < 3) return 0;
  for (let i = 0; i < n; i++) { const p1 = pts[i], p2 = pts[(i + 1) % n]; area += ((p2.lng - p1.lng) * RAD) * (2 + Math.sin(p1.lat * RAD) + Math.sin(p2.lat * RAD)); }
  return Math.abs(area * 6378137 * 6378137 / 2);
}
const pathLen = (pts, closed) => { let t = 0; for (let i = 1; i < pts.length; i++) t += haversine(pts[i - 1], pts[i]); if (closed && pts.length > 2) t += haversine(pts[pts.length - 1], pts[0]); return t; };
const fmtLen = (m) => (m < 1000 ? nf(m, m < 100 ? 2 : 1) + ' متر' : nf(m / 1000, 3) + ' کیلومتر');
const fmtArea = (a) => nf(a, a < 100 ? 2 : 1) + ' متر مربع' + (a >= 10000 ? ' (' + nf(a / 10000, 3) + ' هکتار)' : '');
const fmtDur = (s) => { s = Math.round(s / 60); if (s < 60) return nf(Math.max(1, s)) + ' دقیقه'; return nf(Math.floor(s / 60)) + ' ساعت و ' + nf(s % 60) + ' دقیقه'; };
const ll2 = (c) => ({ lat: c[1], lng: c[0] });
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

Object.assign(FM, { $, nf, esc, store, toast, dialog, askText, confirmBox, el, haversine, bearing, geodesicArea, pathLen, fmtLen, fmtArea, fmtDur, ll2, uid });
})(window);
