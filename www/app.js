'use strict';
/* هسته‌ی برنامه: نقشه، مختصات (درجه + UTM)، GPS، قطب‌نما، ترسیم، ضبط مسیر */
(function () {
const FM = window.FM, { $, nf, store, toast, askText, confirmBox, fmtLen, fmtArea, haversine, geodesicArea, pathLen } = FM;
const DIO = window.DataIO;

/* ───────────── نقشه ───────────── */
const saved = store.get('view', null);
const map = L.map('map', { zoomControl: false, attributionControl: false, maxZoom: 22, zoomSnap: 0.5, preferCanvas: true,
  center: saved ? saved.c : [36.2972, 59.6057], zoom: saved ? saved.z : 14 });
FM.map = map;
if (!FM.tiles.setBase(map, store.get('base', 'gsat'))) FM.tiles.setBase(map, 'gsat');

/* ───────────── برگه‌ها ───────────── */
const SHEETS = ['layers', 'project', 'draw', 'route'];
const sheetEl = (n) => $('#sheet-' + n), tabEl = (n) => $('#b-' + n);
function closeSheets() { SHEETS.forEach((n) => { sheetEl(n).hidden = true; tabEl(n).classList.remove('on'); }); }
function openSheet(name) { closeSheets(); sheetEl(name).hidden = false; tabEl(name).classList.add('on'); }
function toggleSheet(name) { const was = !sheetEl(name).hidden; closeSheets(); if (!was) openSheet(name); }
Object.assign(FM, { openSheet, closeSheets });
SHEETS.forEach((n) => tabEl(n).addEventListener('click', () => toggleSheet(n)));
map.on('click', (e) => { if (draw.mode === 'line' || draw.mode === 'area') addVertex(e.latlng); else if (!draw.mode) closeSheets(); });

/* ───────────── نقشه‌ی زمینه ───────────── */
function renderBaseList() {
  const cur = store.get('base', 'gsat'), box = $('#layer-list'); box.textContent = '';
  FM.tiles.LAYERS.forEach((l) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'layer-item' + (l.id === cur ? ' active' : '');
    b.innerHTML = '<span class="dot"></span><span></span><small></small>'; b.children[1].textContent = l.name; b.children[2].textContent = l.note;
    b.addEventListener('click', () => { if (FM.tiles.setBase(map, l.id)) { renderBaseList(); closeSheets(); } });
    box.appendChild(b);
  });
}
$('#neshan-key').addEventListener('click', async () => {
  const r = await askText('کلید API نشان (سرویس نقشه و مسیریابی)', store.get('neshanKey', '')); if (!r) return;
  store.set('neshanKey', r.text); toast(r.text ? 'کلید ذخیره شد.' : 'کلید پاک شد.');
});
$('#clear-cache').addEventListener('click', async () => {
  const n = await FM.tiles.TileCache.count();
  if (!(await confirmBox('پاک کردن کش', `${nf(n)} تایل ذخیره‌شده پاک شود؟ بدون اینترنت دیگر این بخش‌ها نمایش داده نمی‌شوند.`))) return;
  await FM.tiles.TileCache.clear(); toast('کش پاک شد.');
});

/* ───────────── مختصات مرکز نقشه: درجه + UTM ───────────── */
let lastLL = '', lastUT = '';
function fmtUtm(lat, lng) { const u = DIO.CRS.utmOf(lat, lng); return { text: `UTM ${u.zone}${u.hemi}   E ${u.easting.toFixed(1)}   N ${u.northing.toFixed(1)}`, copy: `${u.easting.toFixed(2)}, ${u.northing.toFixed(2)} (UTM ${u.zone}${u.hemi})` }; }
function updateReadout() {
  const c = map.getCenter(); lastLL = c.lat.toFixed(6) + ', ' + c.lng.toFixed(6);
  $('#ro-latlng').textContent = lastLL;
  const u = fmtUtm(c.lat, c.lng); $('#ro-utm').textContent = u.text; lastUT = u.copy;
}
map.on('move', updateReadout);
map.on('moveend', () => store.set('view', { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }));
const copyText = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch (e) { toast('کپی انجام نشد: ' + t, 4000); } };
$('#ro-ll').addEventListener('click', () => copyText(lastLL, 'عرض و طول کپی شد.'));
$('#ro-ut').addEventListener('click', () => copyText(lastUT, 'مختصات UTM کپی شد.'));

/* ───────────── قطب‌نما ───────────── */
const DIRS = ['شمال', 'شمال‌شرق', 'شرق', 'جنوب‌شرق', 'جنوب', 'جنوب‌غرب', 'غرب', 'شمال‌غرب'];
(function ticks() {
  let html = '';
  for (let a = 0; a < 360; a += 30) { const big = a % 90 === 0, r1 = big ? 32 : 38, r2 = 44, rad = (a - 90) * Math.PI / 180;
    html += `<line class="${big ? 'big' : ''}" x1="${(Math.cos(rad) * r1).toFixed(1)}" y1="${(Math.sin(rad) * r1).toFixed(1)}" x2="${(Math.cos(rad) * r2).toFixed(1)}" y2="${(Math.sin(rad) * r2).toFixed(1)}"/>`; }
  $('#c-ticks').innerHTML = html;
})();
let compassHeading = null, smoothed = null, lastOrientAt = 0, gpsHeading = null;
function headingFromEuler(alpha, beta, gamma) {
  const r = Math.PI / 180, a = alpha * r, b = beta * r, g = gamma * r;
  const cA = Math.cos(a), sA = Math.sin(a), sB = Math.sin(b), cB = Math.cos(b), cG = Math.cos(g), sG = Math.sin(g);
  const backX = -cA * sG - sA * sB * cG, backY = -sA * sG + cA * sB * cG, topX = -sA * cB, topY = cA * cB;
  const useTop = Math.hypot(topX, topY) >= Math.hypot(backX, backY);
  return (Math.atan2(useTop ? topX : backX, useTop ? topY : backY) / r + 360) % 360;
}
function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.alpha !== null && e.alpha !== undefined && (e.absolute || e.type === 'deviceorientationabsolute')) h = (e.beta === null || e.gamma === null) ? (360 - e.alpha) % 360 : headingFromEuler(e.alpha, e.beta, e.gamma);
  if (h === null || Number.isNaN(h)) return;
  if (smoothed === null) smoothed = h; else { const d = ((h - smoothed + 540) % 360) - 180; smoothed = (smoothed + d * 0.25 + 360) % 360; }
  compassHeading = smoothed; lastOrientAt = Date.now(); renderHeading();
}
window.addEventListener('deviceorientationabsolute', onOrient, true);
window.addEventListener('deviceorientation', onOrient, true);
const currentHeading = () => (gpsHeading !== null ? gpsHeading : compassHeading);
FM.heading = currentHeading;
function renderHeading() {
  const h = currentHeading();
  if (h === null) { $('#c-deg').textContent = '—'; $('#c-dir').textContent = ''; return; }
  $('#c-needle').setAttribute('transform', `rotate(${(-h).toFixed(1)})`);
  $('#c-deg').textContent = nf(Math.round(h)) + '°'; $('#c-dir').textContent = DIRS[Math.round(h / 45) % 8];
  const arrow = document.querySelector('.me .arrow'); if (arrow) arrow.style.transform = `rotate(${h.toFixed(1)}deg)`;
}
setTimeout(() => { if (!lastOrientAt) toast('حسگر قطب‌نمای این گوشی داده نمی‌دهد.'); }, 4500);

/* ───────────── GPS ───────────── */
const gps = { watchId: null, last: null, follow: false, marker: null, circle: null, cbs: [] };
const meIcon = L.divIcon({ className: 'me', iconSize: [44, 44], iconAnchor: [22, 22],
  html: '<div class="arrow"><svg viewBox="-22 -22 44 44"><path class="cone" d="M0,0 L-12,-22 A26,26 0 0 1 12,-22 Z"/><circle class="body" r="8"/></svg></div>' });
function startGps() {
  if (!navigator.geolocation) { toast('GPS روی این دستگاه در دسترس نیست.'); return; }
  if (gps.watchId !== null) return;
  gps.watchId = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function onGpsError(err) {
  if (err.code === 1) { toast('دسترسی به موقعیت داده نشد. از تنظیمات گوشی مجوز Location را روشن کنید.', 5000); if (gps.watchId !== null) navigator.geolocation.clearWatch(gps.watchId); gps.watchId = null; setFollow(false); }
  else if (err.code === 3) toast('سیگنال GPS ضعیف است؛ به فضای بازتری بروید.');
}
function onFix(pos) {
  const { latitude, longitude, accuracy, heading, speed, altitude } = pos.coords, ll = L.latLng(latitude, longitude), first = !gps.last;
  gps.last = { ll, accuracy, alt: altitude, t: pos.timestamp };
  gpsHeading = (speed !== null && speed > 1.2 && heading !== null && !Number.isNaN(heading)) ? heading : null;
  if (!gps.marker) {
    gps.circle = L.circle(ll, { radius: accuracy, weight: 1, color: '#e8641b', fillColor: '#e8641b', fillOpacity: 0.12, interactive: false }).addTo(map);
    gps.marker = L.marker(ll, { icon: meIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  } else { gps.marker.setLatLng(ll); gps.circle.setLatLng(ll).setRadius(accuracy); }
  const chip = $('#gps-chip'); chip.hidden = false;
  $('#gps-acc').textContent = 'دقت ±' + nf(Math.round(accuracy)) + ' متر'; chip.classList.toggle('weak', accuracy > 20);
  $('#gps-utm').textContent = fmtUtm(latitude, longitude).text.replace('UTM ', '');
  renderHeading();
  if (first) { map.setView(ll, Math.max(map.getZoom(), 17)); setFollow(true); } else if (gps.follow) map.panTo(ll, { animate: true, duration: 0.4 });
  gps.cbs.forEach((cb) => { try { cb(gps.last); } catch (e) { /* ignore */ } });
}
function setFollow(on) { gps.follow = on; $('#b-locate').classList.toggle('following', on); }
map.on('dragstart', () => setFollow(false));
FM.gps = { start: startGps, last: () => gps.last, follow: setFollow, onFix: (cb) => gps.cbs.push(cb) };
$('#b-locate').addEventListener('click', () => {
  closeSheets();
  if (gps.watchId === null) { startGps(); toast('در حال یافتن موقعیت…'); return; }
  if (gps.last) { map.setView(gps.last.ll, Math.max(map.getZoom(), 17)); setFollow(true); } else toast('هنوز موقعیتی دریافت نشده است.');
});

/* ───────────── ثبت و ترسیم ───────────── */
const draw = { mode: null, pts: [], group: L.layerGroup().addTo(map) };
function setDrawMode(m) {
  draw.mode = m; draw.pts = [];
  ['point', 'line', 'area'].forEach((k) => $('#m-' + k).classList.toggle('on', m === k));
  $('#d-shape-btns').style.display = (m === 'line' || m === 'area') ? 'flex' : 'none';
  $('#d-add').textContent = m === 'point' ? 'ثبت نقطه در مرکز نقشه' : 'افزودن رأس در مرکز نقشه';
  $('#d-add-gps').textContent = m === 'point' ? 'ثبت نقطه از موقعیت GPS من' : 'افزودن رأس از موقعیت GPS';
  $('#d-add').disabled = $('#d-add-gps').disabled = !m;
  redraw();
}
function redraw() {
  draw.group.clearLayers();
  const pts = draw.pts, res = $('#m-result'), m = draw.mode;
  if (!m) { res.textContent = 'نوع ترسیم را انتخاب کنید و نقشه را طوری حرکت دهید که علامت وسط روی محل مورد نظر باشد.'; return; }
  if (m === 'point') { res.innerHTML = 'نقشه را روی محل مورد نظر ببرید و «ثبت نقطه» را بزنید. نقطه با نام و مختصات در لایه‌ی «نقاط و ترسیمات» ذخیره می‌شود.'; return; }
  const st = { color: '#e8641b', weight: 3, interactive: false };
  if (m === 'area' && pts.length >= 3) L.polygon(pts, { ...st, fillOpacity: 0.18 }).addTo(draw.group); else if (pts.length >= 2) L.polyline(pts, st).addTo(draw.group);
  pts.forEach((p) => L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#14303a', fillOpacity: 1, interactive: false }).addTo(draw.group));
  const segs = pts.length - 1 + (m === 'area' && pts.length >= 3 ? 1 : 0);
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false, icon: L.divIcon({ className: 'seg-label', html: '<span>' + fmtLen(haversine(a, b)) + '</span>', iconSize: [0, 0] }) }).addTo(draw.group);
  }
  if (m === 'line') res.innerHTML = pts.length < 2 ? 'رأس اول را بگذارید (' + nf(pts.length) + ' رأس).' : 'طول کل: <b>' + fmtLen(pathLen(pts)) + '</b> (' + nf(pts.length) + ' رأس)';
  else res.innerHTML = pts.length < 3 ? 'برای چندضلعی دست‌کم سه رأس لازم است (' + nf(pts.length) + ' رأس).' : 'مساحت: <b>' + fmtArea(geodesicArea(pts)) + '</b><br>محیط: ' + fmtLen(pathLen(pts, true));
}
async function savePointAt(ll, extra) {
  let name = FM.project.nextName('P'), description;
  if (!$('#d-quick').checked) { const r = await askText('ثبت نقطه', name, { description: '' }); if (!r) return; name = r.text || name; description = r.description; }
  const props = Object.assign({ name, saved: new Date().toISOString() }, extra || {}); if (description) props.description = description;
  const c = [+ll.lng.toFixed(8), +ll.lat.toFixed(8)]; if (extra && isFinite(extra.z)) c.push(extra.z);
  FM.project.addFeature({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } });
  const u = DIO.CRS.utmOf(ll.lat, ll.lng); toast(`نقطه‌ی ${name} ثبت شد — E ${u.easting.toFixed(1)}  N ${u.northing.toFixed(1)}`, 3500);
}
function addVertex(ll) { if (draw.mode === 'line' || draw.mode === 'area') { draw.pts.push(L.latLng(ll.lat, ll.lng)); redraw(); } }
$('#d-add').addEventListener('click', () => { if (draw.mode === 'point') savePointAt(map.getCenter()); else addVertex(map.getCenter()); });
$('#d-add-gps').addEventListener('click', () => {
  const fix = gps.last; if (!fix) { startGps(); toast('موقعیت GPS هنوز مشخص نیست؛ چند ثانیه صبر کنید.'); return; }
  if (draw.mode === 'point') savePointAt(fix.ll, { accuracy: Math.round(fix.accuracy), ...(fix.alt != null ? { z: +fix.alt.toFixed(1) } : {}) }); else addVertex(fix.ll);
});
$('#d-undo').addEventListener('click', () => { draw.pts.pop(); redraw(); });
$('#d-clear').addEventListener('click', () => { draw.pts = []; redraw(); });
$('#d-end').addEventListener('click', () => { setDrawMode(null); closeSheets(); });
$('#d-save').addEventListener('click', async () => {
  const pts = draw.pts, line = draw.mode === 'line';
  if (pts.length < (line ? 2 : 3)) { toast(line ? 'دست‌کم دو رأس لازم است.' : 'دست‌کم سه رأس لازم است.'); return; }
  const def = FM.project.nextName(line ? 'L' : 'A'); const r = await askText(line ? 'ذخیره‌ی خط' : 'ذخیره‌ی چندضلعی', def, { description: '' }); if (!r) return;
  const c = pts.map((p) => [+p.lng.toFixed(8), +p.lat.toFixed(8)]);
  const props = { name: r.text || def }; if (r.description) props.description = r.description;
  FM.project.addFeature({ type: 'Feature', properties: props, geometry: line ? { type: 'LineString', coordinates: c } : { type: 'Polygon', coordinates: [c.concat([c[0]])] } });
  toast('ذخیره شد.'); draw.pts = []; redraw();
});
$('#m-point').addEventListener('click', () => setDrawMode('point'));
$('#m-line').addEventListener('click', () => setDrawMode('line'));
$('#m-area').addEventListener('click', () => setDrawMode('area'));

/* ضبط مسیر حرکت (فقط وقتی برنامه باز و صفحه روشن است) */
const rec = { on: false, pts: [], line: null };
function recTick(fix) {
  if (!rec.on || fix.accuracy > 40) return;
  const last = rec.pts[rec.pts.length - 1];
  if (last && haversine(last, fix.ll) < 3) return;
  rec.pts.push(fix.ll); if (!rec.line) rec.line = L.polyline([], { color: '#d62728', weight: 4, interactive: false }).addTo(map); rec.line.setLatLngs(rec.pts);
  $('#d-rec-info').textContent = `${nf(rec.pts.length)} نقطه · ${fmtLen(pathLen(rec.pts))}`;
}
FM.gps.onFix(recTick);
$('#d-rec').addEventListener('click', async () => {
  if (!rec.on) { startGps(); rec.on = true; rec.pts = []; $('#d-rec').textContent = '■ پایان و ذخیره‌ی مسیر'; $('#d-rec').classList.add('rec'); $('#d-rec-info').textContent = 'در حال ضبط… (صفحه را روشن نگه دارید)'; return; }
  rec.on = false; $('#d-rec').textContent = '● شروع ضبط مسیر حرکت'; $('#d-rec').classList.remove('rec');
  if (rec.line) { map.removeLayer(rec.line); rec.line = null; }
  if (rec.pts.length < 2) { $('#d-rec-info').textContent = ''; toast('مسیر خیلی کوتاه بود و ذخیره نشد.'); return; }
  const stamp = new Date(), def = 'مسیر ' + stamp.toLocaleDateString('fa-IR') + ' ' + stamp.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const r = await askText('ذخیره‌ی مسیر ضبط‌شده', def, { description: '' });
  if (r) { const props = { name: r.text || def, length_m: Math.round(pathLen(rec.pts)) }; if (r.description) props.description = r.description;
    FM.project.addFeature({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: rec.pts.map((p) => [+p.lng.toFixed(8), +p.lat.toFixed(8)]) } }); toast('مسیر ذخیره شد.'); }
  $('#d-rec-info').textContent = ''; rec.pts = [];
});

/* ───────────── شروع ───────────── */
renderBaseList();
updateReadout();
renderHeading();
setDrawMode(null);
FM.route.init(map);
FM.project.init(map);
})();
