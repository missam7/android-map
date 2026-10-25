'use strict';

/* ───────────── ابزارهای عمومی ───────────── */
const $ = (s) => document.querySelector(s);
const nf = (n, d = 0) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d }).format(n);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* حافظه پر یا غیرفعال */ } }
};
let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ───────────── لایه‌های نقشه ───────────── */
// نکته: کلید نشان داخل کد نیست؛ کاربر در برنامه وارد می‌کند و روی گوشی می‌ماند.
const LAYERS = [
  { id: 'gsat',  name: 'ماهواره گوگل',        note: 'تصویر',  max: 21, sub: '0123', url: 'https://mt{s}.google.com/vt?lyrs=s&x={x}&y={y}&z={z}' },
  { id: 'ghyb',  name: 'ماهواره با برچسب',     note: 'ترکیبی', max: 21, sub: '0123', url: 'https://mt{s}.google.com/vt?lyrs=y&x={x}&y={y}&z={z}' },
  { id: 'gmap',  name: 'نقشه خیابانی گوگل',    note: 'خیابان', max: 21, sub: '0123', url: 'https://mt{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}' },
  { id: 'osm',   name: 'OpenStreetMap',        note: 'خیابان', max: 19, sub: 'abc',  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
  { id: 'mashhad', name: 'پایه‌ی شهرداری مشهد ۱۴۰۱', note: 'مشهد', max: 19, tms: true,
    url: 'https://basemap.mashhad.ir/geoserver/gwc/service/tms/1.0.0/MashhadBaseMap1401@EPSG:900913@png/{z}/{x}/{y}.png' },
  { id: 'nsat',  name: 'ماهواره نشان',         note: 'کلید لازم', max: 18, needsKey: true,
    url: 'https://api.neshan.org/tile/raster/satellite/{z}/{x}/{y}?Api-key={key}' },
  { id: 'nmap',  name: 'نقشه نشان',            note: 'کلید لازم', max: 18, needsKey: true,
    url: 'https://api.neshan.org/tile/raster/basemap/plate/{z}/{x}/{y}?Api-key={key}' }
];

const map = L.map('map', {
  zoomControl: false, attributionControl: false, maxZoom: 22, zoomSnap: 0.5,
  center: store.get('view', { c: [36.2972, 59.6057] }).c,
  zoom: store.get('view', { z: 14 }).z || 14
});
let baseLayer = null;

function setBase(id) {
  const def = LAYERS.find((l) => l.id === id) || LAYERS[0];
  let url = def.url;
  if (def.needsKey) {
    const key = store.get('neshanKey', '');
    if (!key) { toast('برای لایه‌های نشان، اول کلید API را وارد کنید.'); return false; }
    url = url.replace('{key}', encodeURIComponent(key));
  }
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(url, {
    subdomains: def.sub || 'abc', tms: !!def.tms,
    maxNativeZoom: def.max, maxZoom: 22, keepBuffer: 4
  }).addTo(map);
  baseLayer.on('tileerror', onTileError);
  store.set('base', def.id);
  renderLayerList();
  return true;
}
let tileErrAt = 0;
function onTileError() {
  if (Date.now() - tileErrAt < 8000) return;
  tileErrAt = Date.now();
  if (!navigator.onLine) toast('اینترنت قطع است؛ فقط بخش‌های قبلاً دیده‌شده نمایش داده می‌شوند.');
}

function renderLayerList() {
  const cur = store.get('base', 'gsat');
  const box = $('#layer-list'); box.textContent = '';
  LAYERS.forEach((l) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'layer-item' + (l.id === cur ? ' active' : '');
    b.innerHTML = '<span class="dot"></span><span></span><small></small>';
    b.children[1].textContent = l.name; b.children[2].textContent = l.note;
    b.addEventListener('click', () => { if (setBase(l.id)) closeSheets(); });
    box.appendChild(b);
  });
}
$('#neshan-key').addEventListener('click', () => {
  const v = prompt('کلید API نشان (سرویس نقشه) را وارد کنید:', store.get('neshanKey', ''));
  if (v === null) return;
  store.set('neshanKey', v.trim());
  toast(v.trim() ? 'کلید ذخیره شد.' : 'کلید پاک شد.');
});

/* ───────────── برگه‌ها و نوار پایین ───────────── */
const sheets = { layers: $('#sheet-layers'), measure: $('#sheet-measure') };
const tabs = { layers: $('#b-layers'), measure: $('#b-measure') };
function closeSheets() {
  Object.values(sheets).forEach((s) => { s.hidden = true; });
  Object.values(tabs).forEach((b) => b.classList.remove('on'));
}
function toggleSheet(name) {
  const wasOpen = !sheets[name].hidden;
  closeSheets();
  if (!wasOpen) { sheets[name].hidden = false; tabs[name].classList.add('on'); }
  return !wasOpen;
}
$('#b-layers').addEventListener('click', () => toggleSheet('layers'));
$('#b-measure').addEventListener('click', () => toggleSheet('measure'));
map.on('click', (e) => { if (meas.mode) addMeasurePoint(e.latlng); else closeSheets(); });

/* ───────────── مختصات مرکز نقشه ───────────── */
function updateReadout() {
  const c = map.getCenter();
  $('#ro-latlng').textContent = c.lat.toFixed(6) + ' , ' + c.lng.toFixed(6);
}
map.on('move', updateReadout);
map.on('moveend', () => store.set('view', { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }));
$('#readout').addEventListener('click', async () => {
  const text = $('#ro-latlng').textContent;
  try { await navigator.clipboard.writeText(text); toast('مختصات کپی شد.'); }
  catch (e) { toast('کپی انجام نشد؛ مختصات: ' + text); }
});

/* ───────────── قطب‌نما ───────────── */
const DIRS = ['شمال', 'شمال‌شرق', 'شرق', 'جنوب‌شرق', 'جنوب', 'جنوب‌غرب', 'غرب', 'شمال‌غرب'];
(function buildTicks() {
  const g = $('#c-ticks'); let html = '';
  for (let a = 0; a < 360; a += 30) {
    const big = a % 90 === 0, r1 = big ? 32 : 38, r2 = 44, rad = (a - 90) * Math.PI / 180;
    html += `<line class="${big ? 'big' : ''}" x1="${(Math.cos(rad) * r1).toFixed(1)}" y1="${(Math.sin(rad) * r1).toFixed(1)}" x2="${(Math.cos(rad) * r2).toFixed(1)}" y2="${(Math.sin(rad) * r2).toFixed(1)}"/>`;
  }
  g.innerHTML = html;
})();

let compassHeading = null, smoothed = null, lastOrientAt = 0, gpsHeading = null;
// جهت گوشی از زوایای آلفا/بتا/گاما. گوشی صاف در دست → جهت لبه‌ی بالای گوشی؛
// گوشی تقریباً عمودی (مثل نشانه‌روی با دوربین) → جهت پشت گوشی. هر کدام که روی افق بزرگ‌تر باشد انتخاب می‌شود.
function headingFromEuler(alpha, beta, gamma) {
  const r = Math.PI / 180, a = alpha * r, b = beta * r, g = gamma * r;
  const cA = Math.cos(a), sA = Math.sin(a), sB = Math.sin(b), cB = Math.cos(b), cG = Math.cos(g), sG = Math.sin(g);
  const backX = -cA * sG - sA * sB * cG, backY = -sA * sG + cA * sB * cG;   // محور -Z
  const topX = -sA * cB, topY = cA * cB;                                      // محور +Y
  const useTop = Math.hypot(topX, topY) >= Math.hypot(backX, backY);
  const x = useTop ? topX : backX, y = useTop ? topY : backY;
  return (Math.atan2(x, y) / r + 360) % 360;
}
function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.alpha !== null && e.alpha !== undefined && (e.absolute || e.type === 'deviceorientationabsolute')) {
    h = (e.beta === null || e.gamma === null) ? (360 - e.alpha) % 360 : headingFromEuler(e.alpha, e.beta, e.gamma);
  }
  if (h === null || Number.isNaN(h)) return;
  if (smoothed === null) smoothed = h;
  else { const d = ((h - smoothed + 540) % 360) - 180; smoothed = (smoothed + d * 0.25 + 360) % 360; }
  compassHeading = smoothed; lastOrientAt = Date.now();
  renderHeading();
}
window.addEventListener('deviceorientationabsolute', onOrient, true);
window.addEventListener('deviceorientation', onOrient, true);

function currentHeading() {
  // وقتی در حال حرکت هستید جهت GPS دقیق‌تر از قطب‌نمای گوشی است
  if (gpsHeading !== null) return gpsHeading;
  return compassHeading;
}
function renderHeading() {
  const h = currentHeading();
  if (h === null) { $('#c-deg').textContent = '—'; $('#c-dir').textContent = ''; return; }
  $('#c-needle').setAttribute('transform', `rotate(${(-h).toFixed(1)})`);
  $('#c-deg').textContent = nf(Math.round(h)) + '°';
  $('#c-dir').textContent = DIRS[Math.round(h / 45) % 8];
  const arrow = document.querySelector('.me .arrow');
  if (arrow) arrow.style.transform = `rotate(${h.toFixed(1)}deg)`;
}
setTimeout(() => { if (!lastOrientAt) toast('حسگر قطب‌نمای این گوشی داده نمی‌دهد.'); }, 4000);

/* ───────────── GPS ───────────── */
const gps = { watchId: null, last: null, follow: false, marker: null, circle: null };
const meIcon = L.divIcon({
  className: 'me', iconSize: [44, 44], iconAnchor: [22, 22],
  html: '<div class="arrow"><svg viewBox="-22 -22 44 44"><path class="cone" d="M0,0 L-12,-22 A26,26 0 0 1 12,-22 Z"/><circle class="body" r="8"/></svg></div>'
});

function startGps() {
  if (!navigator.geolocation) { toast('GPS روی این دستگاه در دسترس نیست.'); return; }
  if (gps.watchId !== null) return;
  gps.watchId = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function onGpsError(err) {
  if (err.code === 1) { toast('دسترسی به موقعیت داده نشد. از تنظیمات گوشی مجوز Location را روشن کنید.', 5000); stopGps(); }
  else if (err.code === 3) toast('سیگنال GPS ضعیف است؛ به فضای بازتری بروید.');
}
function stopGps() {
  if (gps.watchId !== null) navigator.geolocation.clearWatch(gps.watchId);
  gps.watchId = null; setFollow(false);
}
function onFix(pos) {
  const { latitude, longitude, accuracy, heading, speed } = pos.coords;
  const ll = L.latLng(latitude, longitude);
  const first = !gps.last;
  gps.last = { ll, accuracy, t: pos.timestamp };
  gpsHeading = (speed !== null && speed > 1.2 && heading !== null && !Number.isNaN(heading)) ? heading : null;

  if (!gps.marker) {
    gps.circle = L.circle(ll, { radius: accuracy, weight: 1, color: '#e8641b', fillColor: '#e8641b', fillOpacity: 0.12, interactive: false }).addTo(map);
    gps.marker = L.marker(ll, { icon: meIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  } else { gps.marker.setLatLng(ll); gps.circle.setLatLng(ll).setRadius(accuracy); }

  const chip = $('#gps-chip'); chip.hidden = false;
  $('#gps-acc').textContent = 'دقت ±' + nf(Math.round(accuracy)) + ' متر';
  chip.classList.toggle('weak', accuracy > 20);
  renderHeading();

  if (first) { map.setView(ll, Math.max(map.getZoom(), 17)); setFollow(true); }
  else if (gps.follow) map.panTo(ll, { animate: true, duration: 0.4 });
}
function setFollow(on) { gps.follow = on; $('#b-locate').classList.toggle('following', on); }
map.on('dragstart', () => setFollow(false));

$('#b-locate').addEventListener('click', () => {
  closeSheets();
  if (gps.watchId === null) { startGps(); toast('در حال یافتن موقعیت…'); return; }
  if (gps.last) { map.setView(gps.last.ll, Math.max(map.getZoom(), 17)); setFollow(true); }
  else toast('هنوز موقعیتی دریافت نشده است.');
});

/* ───────────── اندازه‌گیری فاصله و مساحت ───────────── */
const meas = { mode: null, pts: [], group: L.layerGroup().addTo(map) };

function haversine(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// مساحت ژئودزیک روی کره (همان فرمول Leaflet.draw)
function geodesicArea(pts) {
  const n = pts.length, r = Math.PI / 180; let area = 0;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n];
    area += ((p2.lng - p1.lng) * r) * (2 + Math.sin(p1.lat * r) + Math.sin(p2.lat * r));
  }
  return Math.abs(area * 6378137 * 6378137 / 2);
}
const fmtLen = (m) => (m < 1000 ? nf(m, m < 100 ? 2 : 1) + ' متر' : nf(m / 1000, 3) + ' کیلومتر');
const fmtArea = (a) => nf(a, a < 100 ? 2 : 1) + ' متر مربع' + (a >= 10000 ? ' (' + nf(a / 10000, 3) + ' هکتار)' : '');

function setMeasureMode(mode) {
  meas.mode = mode;
  $('#m-dist').classList.toggle('on', mode === 'dist');
  $('#m-area').classList.toggle('on', mode === 'area');
  if (!mode) { meas.pts = []; meas.group.clearLayers(); }
  redrawMeasure();
}
function addMeasurePoint(ll) { if (!meas.mode) return; meas.pts.push(ll); redrawMeasure(); }
function redrawMeasure() {
  meas.group.clearLayers();
  const pts = meas.pts, res = $('#m-result');
  if (!meas.mode) { res.textContent = 'یک حالت را انتخاب کنید و نقشه را طوری حرکت دهید که علامت وسط روی نقطه‌ی مورد نظر باشد.'; return; }
  const style = { color: '#e8641b', weight: 3, interactive: false };
  if (meas.mode === 'area' && pts.length >= 3) L.polygon(pts, { ...style, fillOpacity: 0.18 }).addTo(meas.group);
  else if (pts.length >= 2) L.polyline(pts, style).addTo(meas.group);
  pts.forEach((p) => L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#14303a', fillOpacity: 1, interactive: false }).addTo(meas.group));

  const segs = pts.length - 1 + (meas.mode === 'area' && pts.length >= 3 ? 1 : 0);
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], d = haversine(a, b);
    L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
      interactive: false,
      icon: L.divIcon({ className: 'seg-label', html: '<span>' + fmtLen(d) + '</span>', iconSize: [0, 0] })
    }).addTo(meas.group);
  }

  if (meas.mode === 'dist') {
    let total = 0; for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
    res.innerHTML = pts.length < 2 ? 'نقطه‌ی اول را بگذارید.' : 'طول کل: <b>' + fmtLen(total) + '</b>';
  } else {
    if (pts.length < 3) { res.textContent = 'برای مساحت دست‌کم سه نقطه لازم است.'; return; }
    let per = 0; for (let i = 0; i < pts.length; i++) per += haversine(pts[i], pts[(i + 1) % pts.length]);
    res.innerHTML = 'مساحت: <b>' + fmtArea(geodesicArea(pts)) + '</b><br>محیط: ' + fmtLen(per);
  }
}
$('#m-dist').addEventListener('click', () => { meas.pts = []; setMeasureMode('dist'); });
$('#m-area').addEventListener('click', () => { meas.pts = []; setMeasureMode('area'); });
$('#m-add').addEventListener('click', () => {
  if (!meas.mode) { toast('اول «فاصله» یا «مساحت» را انتخاب کنید.'); return; }
  addMeasurePoint(map.getCenter());
});
$('#m-undo').addEventListener('click', () => { meas.pts.pop(); redrawMeasure(); });
$('#m-clear').addEventListener('click', () => { meas.pts = []; redrawMeasure(); });
$('#m-end').addEventListener('click', () => { setMeasureMode(null); closeSheets(); });

/* ───────────── شروع ───────────── */
renderLayerList();
setBase(store.get('base', 'gsat')) || setBase('gsat');
updateReadout();
renderHeading();
