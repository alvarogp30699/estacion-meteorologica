/* Estación meteorológica — lógica (v3)
   JavaScript ES5 a propósito (sin flechas, let/const ni async) para que funcione en Android 6. */
(function () {
  'use strict';

  /* ======================= Configuración ======================= */
  var C = window.CONFIG || {};
  var Q = parseQuery();
  /* También por #: #demo, #amarillo, #naranja, #rojo, #noche (modo demo) */
  var HASH = (location.hash || '').replace('#', '');

  function parseQuery() {
    var o = {};
    var s = (location.search || '').replace(/^\?/, '');
    if (!s) { return o; }
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      try { o[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) { /* parámetro mal escrito */ }
    }
    return o;
  }
  function pick(q, c, d) {
    if (q !== undefined && q !== '') { return q; }
    if (c !== undefined) { return c; }
    return d;
  }
  function def(v, d) { return v === undefined ? d : v; }

  var cfg = {
    name: pick(Q.name, C.name, 'Salou'),
    lat: parseFloat(pick(Q.lat, C.lat, 41.0765)),
    lon: parseFloat(pick(Q.lon, C.lon, 1.1414)),
    zoom: parseInt(pick(Q.zoom, C.zoom, 8), 10),
    seaLat: parseFloat(def(C.seaLat, 41.05)),
    seaLon: parseFloat(def(C.seaLon, 1.15)),
    weatherEveryMin: C.weatherEveryMin || 10,
    radarEveryMin: C.radarEveryMin || 5,
    forecastEveryMin: C.forecastEveryMin || 60,
    seaEveryMin: C.seaEveryMin || 30,
    alertsEveryMin: C.alertsEveryMin || 10,
    alertsUrl: def(C.alertsUrl, 'avisos.json'),
    autoplay: C.autoplay !== false,
    frameMs: C.frameMs || 700,
    fcFrameMs: C.fcFrameMs || 450,
    pauseLastMs: C.pauseLastMs || 2000,
    radarOpacity: C.radarOpacity || 0.8,
    radarForecast: C.radarForecast !== false,
    fcOpacity: C.fcOpacity || 0.85,
    radarStaleMin: C.radarStaleMin || 20,
    basemapUrl: C.basemapUrl || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    basemapAttribution: C.basemapAttribution || '&copy; OpenStreetMap &copy; CARTO',
    reloadAt: def(C.reloadAt, '04:00'),
    nightFrom: def(C.nightFrom, '23:00'),
    nightTo: C.nightTo || '07:00',
    nightDim: def(C.nightDim, 0.55),
    nightFrameMs: C.nightFrameMs || 1400,
    tomorrowFrom: C.tomorrowFrom || '20:00',
    radarFade: C.radarFade !== false,
    fullRadarSec: C.fullRadarSec || 30,
    demo: Q.demo === '1' || C.demo === true || /^(demo|amarillo|naranja|rojo|noche|tarde)$/.test(HASH),
    demoAlert: Q.alert || (/^(amarillo|naranja|rojo)$/.test(HASH) ? HASH : ''),
    forceNight: Q.night === '1' || HASH === 'noche'
  };

  var RADAR_COLOR = 2;      // Universal Blue (el esquema gratuito de RainViewer)
  var CACHE_KEY = 'estacion-meteo-cache-v3';
  var LEVEL_RANK = { amarillo: 1, naranja: 2, rojo: 3 };
  var LEVEL_NAME = { amarillo: 'Aviso amarillo', naranja: 'Aviso naranja', rojo: 'Aviso rojo' };

  /* ======================= Utilidades ======================= */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var DEMO_T = new Date(2026, 10, 14, HASH === 'tarde' ? 21 : 17, HASH === 'tarde' ? 35 : 17, 0).getTime(), DEMO_T0 = Date.now();
  function setDemoTime(h, m) { DEMO_T = new Date(2026, 10, 14, h, m, 0).getTime(); DEMO_T0 = Date.now(); }
  function now() { return cfg.demo ? new Date(DEMO_T + (Date.now() - DEMO_T0)) : new Date(); }
  function fmtTime(unix) { var d = new Date(unix * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtNum(v, dec) { return Number(v).toFixed(dec).replace('.', ','); }
  function mmTxt(v) { return v < 10 ? fmtNum(v, 1) : String(Math.round(v)); }
  /* '2026-11-14T17:00' (hora local de Open-Meteo) → Date */
  function parseLocal(s) {
    s = String(s);
    return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0);
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function dayWord(d) {
    var n = now(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
    if (sameDay(d, n)) { return 'hoy'; }
    if (sameDay(d, t)) { return 'mañana'; }
    return DOW_LONG[d.getDay()];
  }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  var DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  function compass(deg) { return COMPASS[Math.round(deg / 45) % 8]; }

  function getJSON(url, ok, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 25000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        var data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { fail(e); return; }
        ok(data);
      } else { fail(new Error('HTTP ' + xhr.status)); }
    };
    xhr.onerror = function () { fail(new Error('red')); };
    xhr.ontimeout = function () { fail(new Error('timeout')); };
    xhr.send();
  }

  /* ======================= Iconos ======================= */
  var CLOUD_A = 'M8 19h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1A3 3 0 0 0 8 19z';
  var CLOUD_B = 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z';
  var CLOUD_C = 'M7 14h10a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.5 1.3A3 3 0 0 0 7 14z';
  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
  var ICONS = {
    sun: [[SUN, '#FFD27A']],
    moon: [['<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', '#C9D6F0']],
    partly: [['<circle cx="9" cy="9" r="3"/><path d="M9 3v1.5M3 9h1.5M4.8 4.8l1 1M13.2 4.8l-1 1"/>', '#FFD27A'], ['<path d="' + CLOUD_A + '"/>', '#E8EEF9']],
    partlyNight: [['<path d="M11 3.5a4 4 0 1 0 4.2 5.2A3.6 3.6 0 0 1 11 3.5z"/>', '#C9D6F0'], ['<path d="' + CLOUD_A + '"/>', '#E8EEF9']],
    cloud: [['<path d="' + CLOUD_B + '"/>', '#B8C6DC']],
    fog: [['<path d="M5 9h14M4 13h16M6 17h12"/>', '#B8C6DC']],
    rain: [['<path d="' + CLOUD_C + '"/>', '#B8C6DC'], ['<path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>', '#7FB6FF']],
    snow: [['<path d="' + CLOUD_C + '"/>', '#B8C6DC'], ['<path d="M8 17.5v.01M12 18.5v.01M16 17.5v.01M10 20.5v.01M14 20.5v.01" stroke-width="2.4"/>', '#DCE8FA']],
    storm: [['<path d="' + CLOUD_C + '"/>', '#B8C6DC'], ['<path d="M12.5 14l-2 3.5h3l-2 3.5"/>', '#FFD27A']]
  };
  function svgIcon(kind) {
    var parts = ICONS[kind] || ICONS.cloud;
    var out = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    for (var i = 0; i < parts.length; i++) { out += '<g stroke="' + parts[i][1] + '">' + parts[i][0] + '</g>'; }
    return out + '</svg>';
  }
  function lineIcon(path, color, fill) {
    return '<svg viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var I_UMB = '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/><path d="M12 3v.5"/>';
  var I_CHECK = '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/>';
  var I_BOLT = '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>';
  var I_WARN = '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.01"/>';
  var I_INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>';

  /* Códigos WMO de Open-Meteo → icono y texto */
  function wmo(code, isDay) {
    var day = isDay !== 0;
    if (code === 0) { return { kind: day ? 'sun' : 'moon', label: day ? 'Despejado' : 'Noche despejada' }; }
    if (code === 1) { return { kind: day ? 'sun' : 'moon', label: 'Mayormente despejado' }; }
    if (code === 2) { return { kind: day ? 'partly' : 'partlyNight', label: 'Parcialmente nublado' }; }
    if (code === 3) { return { kind: 'cloud', label: 'Nublado' }; }
    if (code === 45 || code === 48) { return { kind: 'fog', label: 'Niebla' }; }
    if (code >= 51 && code <= 55) { return { kind: 'rain', label: 'Llovizna' }; }
    if (code === 56 || code === 57) { return { kind: 'rain', label: 'Llovizna helada' }; }
    if (code === 61) { return { kind: 'rain', label: 'Lluvia débil' }; }
    if (code === 63) { return { kind: 'rain', label: 'Lluvia' }; }
    if (code === 65) { return { kind: 'rain', label: 'Lluvia fuerte' }; }
    if (code === 66 || code === 67) { return { kind: 'rain', label: 'Lluvia helada' }; }
    if (code >= 71 && code <= 77) { return { kind: 'snow', label: 'Nieve' }; }
    if (code >= 80 && code <= 82) { return { kind: 'rain', label: 'Chubascos' }; }
    if (code === 85 || code === 86) { return { kind: 'snow', label: 'Chubascos de nieve' }; }
    if (code === 95) { return { kind: 'storm', label: 'Tormenta' }; }
    if (code === 96 || code === 99) { return { kind: 'storm', label: 'Tormenta con granizo' }; }
    return { kind: 'cloud', label: 'Nublado' };
  }

  /* ======================= Reloj ======================= */
  function updateClock() {
    var d = now();
    $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('date-t').textContent = DOW_LONG[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }

  /* ======================= Previsión (Open-Meteo) ======================= */
  var W = null;            // últimos datos de previsión
  var lastOk = 0, lastError = false;

  function weatherUrl() {
    return 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl' +
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day,pressure_msl,cape' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_gusts_10m_max' +
      '&minutely_15=precipitation&past_minutely_15=1&forecast_minutely_15=8' +
      '&past_hours=24&forecast_hours=48' +
      '&wind_speed_unit=kmh&timezone=auto&forecast_days=5';
  }

  function hourIndex(h, cur) {
    var key = String(cur.time).slice(0, 13) + ':00';
    for (var i = 0; i < h.time.length; i++) { if (String(h.time[i]) === key) { return i; } }
    return 0;
  }

  function renderWeather(d) {
    W = d;
    var cur = d.current, h = d.hourly, dl = d.daily;
    var w = wmo(cur.weather_code, cur.is_day);
    var idx = hourIndex(h, cur);

    $('temp').textContent = Math.round(cur.temperature_2m) + '°';
    $('bigicon').innerHTML = svgIcon(w.kind);
    $('cond').textContent = w.label;
    $('range').textContent = 'Sensación ' + Math.round(cur.apparent_temperature) + '° · Máx ' +
      Math.round(dl.temperature_2m_max[0]) + '° · Mín ' + Math.round(dl.temperature_2m_min[0]) + '°';

    renderNextHour(d);

    /* Viento y rachas */
    /* la flecha apunta hacia donde sopla el viento (la dirección en texto es de donde viene) */
    $('wind').innerHTML = '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="#5EC8FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="-webkit-transform: rotate(' + ((cur.wind_direction_10m + 180) % 360) + 'deg); transform: rotate(' + ((cur.wind_direction_10m + 180) % 360) + 'deg)"><path d="M12 4v16M6 10l6-6 6 6"/></svg>' +
      Math.round(cur.wind_speed_10m) + ' <span class="u">km/h ' + compass(cur.wind_direction_10m) + '</span>';
    var gust = cur.wind_gusts_10m;
    setSub('wind-s', gust == null ? '&nbsp;' : 'Rachas ' + Math.round(gust) + ' km/h', gust >= 50 ? 'warn' : '');

    /* Humedad y rocío */
    $('hum').innerHTML = Math.round(cur.relative_humidity_2m) + ' <span class="u">%</span>';
    setSub('hum-s', cur.dew_point_2m == null ? '&nbsp;' : 'Punto de rocío ' + Math.round(cur.dew_point_2m) + '°', '');

    /* Lluvia de hoy: lo ya caído (horas pasadas, según el modelo) y lo que falta */
    var today = String(dl.time[0]), nowHour = String(cur.time).slice(0, 13) + ':00';
    var fallen = 0, expected = 0;
    for (var q = 0; q < h.time.length; q++) {
      var ht = String(h.time[q]);
      if (ht.slice(0, 10) !== today) { continue; }
      var mm = h.precipitation[q] || 0;
      if (ht < nowHour) { fallen += mm; } else { expected += mm; }
    }
    $('rain').innerHTML = fmtNum(fallen, 1) + ' <span class="u">mm</span>';
    setSub('rain-s', expected >= 0.1 ? 'Prevista +' + mmTxt(expected) + ' mm' : 'Sin más lluvia hoy', 'blue');

    /* Presión y tendencia en 3 h */
    $('press').innerHTML = Math.round(cur.pressure_msl) + ' <span class="u">hPa</span>';
    var p3 = idx >= 3 ? h.pressure_msl[idx - 3] : null;
    if (p3 == null) { setSub('press-s', '&nbsp;', ''); }
    else {
      var dp = cur.pressure_msl - p3, dpt = (dp > 0 ? '+' : '−') + fmtNum(Math.abs(dp), 0);
      if (dp <= -1) { setSub('press-s', '↓ Bajando (' + dpt + ' en 3 h)', dp <= -3 ? 'warn' : ''); }
      else if (dp >= 1) { setSub('press-s', '↑ Subiendo (' + dpt + ' en 3 h)', ''); }
      else { setSub('press-s', '→ Estable', ''); }
    }

    renderSun(dl);
    renderEvening(d);
    renderHours(d, idx);
    renderDays(dl);
    renderStorm(d, idx);
    fixMapSize();
  }

  function setSub(id, html, cls) {
    var el = $(id);
    el.innerHTML = html;
    el.className = 's' + (cls ? ' ' + cls : '');
  }

  /* Lluvia en la próxima hora (datos cada 15 min; en España se interpolan del modelo horario) */
  function renderNextHour(d) {
    var el = $('nexthour');
    var m = d.minutely_15, steps = [];
    if (m && m.time && m.precipitation) {
      var n = now(), i0 = 0;
      for (var i = 0; i < m.time.length; i++) { if (parseLocal(m.time[i]) <= n) { i0 = i; } }
      for (var k = i0; k < m.time.length && steps.length < 8; k++) { steps.push(m.precipitation[k] || 0); }
    }
    if (!steps.length) { el.className = 'nh hidden'; return; }

    var WET = 0.05; // mm en 15 min
    function run(from) { var c = 0; while (from + c < steps.length && steps[from + c] >= WET) { c++; } return c; }
    function intensity(from, len) {
      var mx = 0;
      for (var j = from; j < from + len; j++) { mx = Math.max(mx, steps[j] * 4); }
      return mx < 2 ? 'débil' : (mx < 10 ? 'moderada' : 'fuerte');
    }
    function durTxt(len) { var mins = len * 15; return mins >= 60 ? (mins % 60 ? fmtNum(mins / 60, 1) + ' h' : (mins / 60) + ' h') : mins + ' min'; }

    var icon = lineIcon(I_UMB, '#7FB6FF');
    if (steps[0] >= WET) {
      var r = run(0);
      el.className = 'nh wet';
      el.innerHTML = icon + (r >= 5 ? '<b>Lloviendo · seguirá la próxima hora</b>' : '<b>Lloviendo · para en ~' + (r * 15) + ' min</b>');
      return;
    }
    for (var s = 1; s <= 4 && s < steps.length; s++) {
      if (steps[s] >= WET) {
        var len = run(s);
        el.className = 'nh wet';
        el.innerHTML = icon + '<b>Lluvia en ~' + (s * 15) + ' min</b><span class="x">· ' + intensity(s, len) + ', ' + durTxt(len) + '</span>';
        return;
      }
    }
    el.className = 'nh';
    el.innerHTML = lineIcon(I_CHECK, '#3DDC84') + 'Sin lluvia la próxima hora';
  }

  /* Sol: el próximo evento (salida u ocaso) y el UV del día */
  function renderSun(dl) {
    if (!dl.sunrise || !dl.sunset) { return; }
    var n = now(), rise = parseLocal(dl.sunrise[0]), set = parseLocal(dl.sunset[0]);
    var uv = dl.uv_index_max ? Math.round(dl.uv_index_max[0] || 0) : null;
    if (n < rise) {
      $('sun').innerHTML = hhmm(rise) + ' <span class="u">salida</span>';
      setSub('sun-s', 'Ocaso ' + hhmm(set) + (uv != null ? ' · UV ' + uv : ''), '');
    } else if (n < set) {
      $('sun').innerHTML = hhmm(set) + ' <span class="u">ocaso</span>';
      setSub('sun-s', 'Salida ' + hhmm(rise) + (uv != null ? ' · UV ' + uv : ''), '');
    } else {
      var rise2 = dl.sunrise[1] ? parseLocal(dl.sunrise[1]) : null;
      var uv2 = dl.uv_index_max && dl.uv_index_max[1] != null ? Math.round(dl.uv_index_max[1]) : null;
      $('sun').innerHTML = (rise2 ? hhmm(rise2) : '--') + ' <span class="u">salida</span>';
      setSub('sun-s', 'Mañana' + (uv2 != null ? ' · UV ' + uv2 : ''), '');
    }
  }

  /* Por la noche: tarjeta «Mañana» en lugar de Mar y Sol, y fase lunar junto a la fecha */
  function isEvening() {
    var d = now(), m = d.getHours() * 60 + d.getMinutes();
    return m >= hm(cfg.tomorrowFrom) || m < hm(cfg.nightTo);
  }
  function renderEvening(d) {
    var app = $('app'), on = isEvening();
    app.className = app.className.replace(/\s*evening/g, '') + (on ? ' evening' : '');
    var dl = d.daily, h = d.hourly, n = now();
    /* después de medianoche, «mañana» ya es hoy */
    var j = n.getHours() < 12 ? 0 : 1;
    if (on && dl.time[j]) {
      var day = parseLocal(dl.time[j] + 'T12:00'), key = String(dl.time[j]);
      var first = -1;
      for (var i = 0; i < h.time.length; i++) {
        if (String(h.time[i]).slice(0, 10) === key && parseLocal(h.time[i]) > n && ((h.precipitation_probability[i] || 0) >= 40 || (h.precipitation[i] || 0) >= 0.2)) { first = i; break; }
      }
      var p = Math.round(dl.precipitation_probability_max[j] || 0);
      var rain = first >= 0 ? 'Lluvia ' + p + ' % desde las ' + parseLocal(h.time[first]).getHours() + ' h' : (p >= 20 ? 'Lluvia ' + p + ' %' : 'Sin lluvia prevista');
      var gust = dl.wind_gusts_10m_max ? dl.wind_gusts_10m_max[j] : null;
      var uv = dl.uv_index_max ? dl.uv_index_max[j] : null;
      $('tomorrow').innerHTML = svgIcon(wmo(dl.weather_code[j], 1).kind) + '<div class="tx"><div class="l">' + (j === 0 ? 'Hoy' : 'Mañana') + ' · ' + DOW_LONG[day.getDay()] + '</div>' +
        '<div class="r"><span class="mx">' + Math.round(dl.temperature_2m_max[j]) + '°</span><span class="mn">' + Math.round(dl.temperature_2m_min[j]) + '°</span><span class="rn">' + rain + '</span></div>' +
        '<div class="s">' + (gust != null ? 'Rachas de hasta ' + Math.round(gust) + ' km/h' : '') + (uv != null ? (gust != null ? ' · ' : '') + 'UV ' + Math.round(uv) : '') + '</div></div>';
    }
    /* fase lunar: entre el ocaso y el amanecer */
    var dark = dl.sunrise && dl.sunset && (n < parseLocal(dl.sunrise[0]) || n >= parseLocal(dl.sunset[0]));
    $('moon').innerHTML = dark ? moonHtml(n) : '';
  }

  /* Fase lunar calculada (luna nueva de referencia: 6 ene 2000 18:14 UTC; mes sinódico 29,53 días) */
  function moonHtml(d) {
    var ph = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / 29.530588853) % 1;
    if (ph < 0) { ph += 1; }
    var names = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];
    var name = names[Math.floor((ph * 8 + 0.5)) % 8];
    var rx = Math.abs(Math.cos(ph * 2 * Math.PI)) * 9, path;
    if (ph < 0.5) { path = 'M12 3A9 9 0 0 1 12 21A' + rx.toFixed(2) + ' 9 0 0 ' + (ph < 0.25 ? 0 : 1) + ' 12 3Z'; }
    else { path = 'M12 3A9 9 0 0 0 12 21A' + rx.toFixed(2) + ' 9 0 0 ' + (ph < 0.75 ? 0 : 1) + ' 12 3Z'; }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#5B6B84" stroke-width="1.2"/><path d="' + path + '" fill="#C9D6F0"/></svg>' + name;
  }

  /* Próximas 24 h: 6 horas una a una y luego 6 bloques de 3 h */
  var hourCols = [];
  function renderHours(d, idx) {
    var h = d.hourly;
    hourCols = [];
    var k, j;
    for (k = 1; k <= 6; k++) { if (idx + k < h.time.length) { hourCols.push({ i: idx + k, n: 1 }); } }
    for (k = 0; k < 6; k++) { j = idx + 7 + 3 * k; if (j + 2 < h.time.length) { hourCols.push({ i: j, n: 3 }); } }

    var mx = 0, c;
    for (k = 0; k < hourCols.length; k++) {
      c = hourCols[k];
      c.mm = 0; c.p = 0; c.code = 0;
      for (j = c.i; j < c.i + c.n; j++) {
        c.mm += h.precipitation[j] || 0;
        c.p = Math.max(c.p, h.precipitation_probability[j] || 0);
        c.code = Math.max(c.code, h.weather_code[j] || 0);
      }
      c.start = parseLocal(h.time[c.i]);
      c.end = new Date(c.start.getTime() + c.n * 3600000);
      mx = Math.max(mx, c.mm);
    }
    var html = '', prevH = -1;
    for (k = 0; k < hourCols.length; k++) {
      c = hourCols[k];
      var hr = c.start.getHours();
      var mid = c.i + (c.n === 3 ? 1 : 0);
      var hw = wmo(c.code >= 95 ? c.code : h.weather_code[mid], h.is_day[mid]);
      var bar;
      if (c.mm >= 0.05) {
        var bh = Math.max(4, Math.round(c.mm / (mx || 1) * 30));
        bar = '<div class="mm">' + mmTxt(c.mm) + '</div><div class="b' + (c.code >= 95 ? ' storm' : '') + '" style="height: ' + bh + 'px"></div>';
      } else { bar = '<div class="b0"></div>'; }
      var cls = 'hour' + (prevH >= 0 && hr < prevH ? ' newday' : '') + (c.n === 3 && (hr < 7 || hr >= 22) ? ' night' : '');
      html += '<div class="' + cls + '"><div class="t">' + pad(hr) + 'h</div>' + svgIcon(hw.kind) +
        '<div class="d">' + Math.round(h.temperature_2m[c.i]) + '°</div><div class="bw">' + bar + '</div>' +
        '<div class="p">' + Math.round(c.p) + ' %</div></div>';
      prevH = hr;
    }
    $('hours-cols').innerHTML = html;
    renderCurve(h);
    renderHoursBand();
  }

  /* Curva de temperatura sobre las columnas */
  function renderCurve(h) {
    var n = hourCols.length;
    if (n < 2) { $('hours-curve').innerHTML = ''; return; }
    var t = [], lo = 1e9, hi = -1e9, k;
    for (k = 0; k < n; k++) { var v = h.temperature_2m[hourCols[k].i]; t.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    var pts = [];
    for (k = 0; k < n; k++) { pts.push(((k + 0.5) / n * 1000).toFixed(1) + ',' + (25 - (t[k] - lo) / Math.max(1, hi - lo) * 20).toFixed(1)); }
    var y0 = pts[0].split(',')[1], y1 = pts[n - 1].split(',')[1];
    $('hours-curve').innerHTML = '<svg viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB86B" stop-opacity="0.35"/><stop offset="1" stop-color="#FFB86B" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M0,' + y0 + ' L' + pts.join(' L') + ' L1000,' + y1 + ' L1000,30 L0,30 Z" fill="url(#tg)"/>' +
      '<polyline points="0,' + y0 + ' ' + pts.join(' ') + ' 1000,' + y1 + '" fill="none" stroke="#FFB86B" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }

  /* Franja del aviso más alto por encima de las horas que cubre */
  function renderHoursBand() {
    var wrap = $('hours-wrap'), band = $('hours-band');
    var a = activeAlerts()[0];
    if (!a || !hourCols.length) { wrap.className = ''; return; }
    var on = new Date(a.onset), ex = new Date(a.expires), first = -1, last = -1;
    for (var k = 0; k < hourCols.length; k++) {
      if (hourCols[k].start < ex && hourCols[k].end > on) { if (first < 0) { first = k; } last = k; }
    }
    if (first < 0) { wrap.className = ''; return; }
    var n = hourCols.length;
    band.style.left = (first / n * 100) + '%';
    band.style.width = ((last - first + 1) / n * 100) + '%';
    band.className = a.level;
    band.textContent = LEVEL_NAME[a.level] + ' · ' + (on > now() ? pad(on.getHours()) + 'h – ' : 'hasta ') + pad(ex.getHours()) + 'h';
    wrap.className = 'band';
  }

  function renderDays(dl) {
    var html = '';
    for (var j = 0; j < 5 && j < dl.time.length; j++) {
      var date = parseLocal(dl.time[j] + 'T12:00');
      var dw = wmo(dl.weather_code[j], 1);
      var dp = dl.precipitation_probability_max[j];
      html += '<div class="day">' + svgIcon(dw.kind) + '<div class="tx"><div class="n">' + (j === 0 ? 'Hoy' : DOW[date.getDay()]) +
        '<span>' + (dp == null ? '--' : Math.round(dp)) + ' %</span></div>' +
        '<div class="d">' + Math.round(dl.temperature_2m_max[j]) + '° <span class="mn">' + Math.round(dl.temperature_2m_min[j]) + '°</span></div></div></div>';
    }
    $('days').innerHTML = html;
  }

  /* Riesgo de tormenta en las próximas 12 h (previsión, no rayos reales) */
  function renderStorm(d, idx) {
    var h = d.hourly, el = $('chip-storm');
    var level = 0, first = -1, last = -1;
    for (var k = 0; k <= 12 && idx + k < h.time.length; k++) {
      var i = idx + k, code = h.weather_code[i] || 0, cape = h.cape ? (h.cape[i] || 0) : 0, p = h.precipitation_probability[i] || 0;
      var lv = 0;
      if (code >= 95 || (cape >= 2000 && p >= 50)) { lv = 2; }
      else if (cape >= 800 && p >= 30) { lv = 1; }
      if (lv) { level = Math.max(level, lv); if (first < 0) { first = i; } last = i; }
    }
    if (!level) { el.className = 'chip storm'; return; }
    var a = parseLocal(h.time[first]), b = new Date(parseLocal(h.time[last]).getTime() + 3600000);
    var when = (first === idx ? 'ahora' : a.getHours()) + '–' + b.getHours() + ' h';
    el.innerHTML = lineIcon(I_BOLT, '#FFD23F', 'rgba(255,210,63,0.25)') + '<b>Riesgo de tormenta ' + (level === 2 ? 'alto' : 'moderado') + '</b><span>· ' + when + ' · previsión</span>';
    el.className = 'chip storm on';
  }

  /* ======================= Mar (Open-Meteo Marine) ======================= */
  function loadSea() {
    if (cfg.demo) { renderSea({ current: { sea_surface_temperature: 19.2, wave_height: 0.6, wave_direction: 95 } }); return; }
    var url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + cfg.seaLat + '&longitude=' + cfg.seaLon +
      '&current=wave_height,wave_direction,sea_surface_temperature&timezone=auto';
    getJSON(url, renderSea, function () { /* se mantiene el último dato */ });
  }
  function renderSea(d) {
    var c = d && d.current;
    if (!c) { return; }
    $('sea').innerHTML = (c.sea_surface_temperature == null ? '--' : Math.round(c.sea_surface_temperature)) + '° <span class="u">agua</span>';
    setSub('sea-s', c.wave_height == null ? '&nbsp;' : 'Olas ' + fmtNum(c.wave_height, 1) + ' m' + (c.wave_direction == null ? '' : ' · ' + compass(c.wave_direction)), c.wave_height >= 2 ? 'warn' : '');
  }

  /* ======================= Avisos de AEMET ======================= */
  /* avisos.json lo genera la tarea de GitHub (carpeta avisos-github/). Formato:
     { "updated": "ISO", "zone": "Litoral sur de Tarragona",
       "alerts": [ { "level": "naranja", "event": "Lluvias", "detail": "...", "onset": "ISO", "expires": "ISO" } ] } */
  var AL = null, alertsFailed = false;

  function loadAlerts() {
    if (cfg.demo) { AL = demoAlerts(); renderAlerts(); return; }
    if (!cfg.alertsUrl) { renderAlerts(); return; }
    var sep = cfg.alertsUrl.indexOf('?') < 0 ? '?' : '&';
    getJSON(cfg.alertsUrl + sep + 't=' + Date.now(), function (d) { AL = d; alertsFailed = false; renderAlerts(); },
      function () { alertsFailed = true; renderAlerts(); });
  }

  function activeAlerts() {
    var out = [], n = now();
    if (!AL || !AL.alerts) { return out; }
    for (var i = 0; i < AL.alerts.length; i++) {
      var a = AL.alerts[i];
      if (LEVEL_RANK[a.level] && new Date(a.expires) > n) { out.push(a); }
    }
    out.sort(function (x, y) { return (LEVEL_RANK[y.level] - LEVEL_RANK[x.level]) || (new Date(x.onset) - new Date(y.onset)); });
    return out;
  }

  function whenTxt(a) {
    var on = new Date(a.onset), ex = new Date(a.expires), n = now();
    var exT = dayWord(ex) + ' ' + hhmm(ex);
    if (on <= n) { return 'hasta ' + exT; }
    return dayWord(on) + ' ' + hhmm(on) + ' → ' + (sameDay(on, ex) ? hhmm(ex) : exT);
  }

  function renderAlerts() {
    var app = $('app'), col = $('col-alert'), wide = $('wide-alert');
    var zone = (AL && AL.zone) || 'tu zona';
    var list = activeAlerts();
    var wasWide = app.className.indexOf('wide') >= 0;
    app.className = isEvening() ? 'evening' : '';
    wide.className = 'alert-banner wide';
    col.className = 'alert-banner';

    if (!cfg.demo && !cfg.alertsUrl) { afterAlertLayout(wasWide); return; }

    var stale = AL && AL.updated && (Date.now() - new Date(AL.updated).getTime() > 3 * 3600000);
    if (!list.length) {
      if (!AL || stale) {
        col.className = 'alert-banner on calm gray';
        var upd = AL && AL.updated ? new Date(AL.updated) : null;
        var veryOld = !upd || Date.now() - upd.getTime() > 48 * 3600000;
        col.innerHTML = lineIcon(I_INFO, '#8494AF') + '<span class="calm-t">' + (AL ? (veryOld ? 'Avisos de AEMET aún sin datos · revisa la tarea de GitHub' : 'Avisos de AEMET sin actualizar desde ' + dayWord(upd) + ' ' + hhmm(upd)) : (alertsFailed ? 'Avisos de AEMET no disponibles' : 'Cargando avisos de AEMET…')) + '</span>';
      } else {
        col.className = 'alert-banner on calm';
        col.innerHTML = lineIcon(I_CHECK, '#3DDC84') + '<span class="calm-t">Sin avisos de AEMET · ' + zone + '</span>';
      }
      afterAlertLayout(wasWide);
      return;
    }

    var a = list[0], rest = list.length - 1, more = '';
    if (rest === 1) { more = '+1 aviso ' + list[1].level; }
    else if (rest > 1) { more = '+' + rest + ' avisos'; }
    var color = a.level === 'amarillo' ? '#FFD23F' : (a.level === 'naranja' ? '#FF9A3D' : '#FFFFFF');
    var html = lineIcon(I_WARN, color) +
      '<div class="pill">' + LEVEL_NAME[a.level] + '</div>' +
      '<div class="txt"><div class="m">' + esc(a.event) + ' · ' + whenTxt(a) + '</div>' +
      '<div class="sub">' + (a.detail ? esc(a.detail) + ' · ' : '') + esc(zone) + ' · AEMET</div></div>' +
      (more ? '<div class="more">' + more + '</div>' : '');

    if (a.level === 'naranja' || a.level === 'rojo') {
      app.className += ' wide ' + a.level;
      wide.className = 'alert-banner wide on ' + a.level;
      wide.innerHTML = html;
    } else {
      col.className = 'alert-banner on ' + a.level;
      col.innerHTML = html;
    }
    afterAlertLayout(wasWide);
  }
  function afterAlertLayout() { renderHoursBand(); fixMapSize(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ======================= Radar: observado + previsión ======================= */
  var map = null, userMoved = false, programmatic = false;
  var obsFrames = [], fcFrames = [], frames = [], cur = 0, playing = cfg.autoplay, animTimer = null;
  var radarHost = '', lastObsKey = '', OBS = 100, displayed = null;
  var layerCache = {}, fcLayers = [];

  function fixMapSize() {
    if (!map) { return; }
    map.invalidateSize();
    if (!userMoved) {
      programmatic = true;
      map.setView([cfg.lat, cfg.lon], cfg.zoom, { animate: false });
      programmatic = false;
    }
  }

  function initMap() {
    map = L.map('map', { zoomControl: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, minZoom: 5, maxZoom: 10 })
      .setView([cfg.lat, cfg.lon], cfg.zoom);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Previsión <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) · Avisos AEMET');
    map.on('dragstart zoomstart', function () { if (!programmatic) { userMoved = true; } touchFull(); });
    map.on('click', function () { if (!full) { enterFull(); } else { touchFull(); } });
    if (cfg.radarFade) { $('radar').className += ' fade'; }
    if (!cfg.demo) {
      L.tileLayer(cfg.basemapUrl, { subdomains: 'abcd', maxZoom: 19, detectRetina: true, attribution: cfg.basemapAttribution + ' · Radar &copy; RainViewer' }).addTo(map);
    }
    var m = L.marker([cfg.lat, cfg.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pin"><div class="ring"></div><div class="core"></div><div class="name"></div></div>' }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    m.getElement().querySelector('.name').textContent = cfg.name;
  }

  /* ---- Radar ampliado: tocar el mapa lo pone a pantalla completa; vuelve solo tras unos segundos sin tocarlo ---- */
  var full = false, fullTimer = null, zoomCtl = null;
  function enterFull() {
    full = true;
    $('radar').className += ' full';
    updateFullInfo();
    zoomCtl = L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.invalidateSize();
    touchFull();
  }
  function exitFull() {
    if (!full) { return; }
    full = false;
    clearTimeout(fullTimer);
    $('radar').className = $('radar').className.replace(/\s*full/g, '');
    if (zoomCtl) { map.removeControl(zoomCtl); zoomCtl = null; }
    userMoved = false;
    fixMapSize();
  }
  function touchFull() {
    if (!full) { return; }
    clearTimeout(fullTimer);
    fullTimer = setTimeout(exitFull, cfg.fullRadarSec * 1000);
  }
  function updateFullInfo() {
    if (!W) { $('fullinfo').innerHTML = '<span class="c">' + $('clock').textContent + '</span>'; return; }
    var w = wmo(W.current.weather_code, W.current.is_day);
    var nh = $('nexthour').textContent || '';
    $('fullinfo').innerHTML = '<span class="c">' + $('clock').textContent + '</span><i></i>' + svgIcon(w.kind) +
      '<span class="t">' + Math.round(W.current.temperature_2m) + '°</span>' + (nh ? '<span class="n">' + esc(nh) + '</span>' : '');
  }

  function setPlayIcon() {
    var b = $('play');
    b.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    b.setAttribute('aria-label', playing ? 'Pausar animación del radar' : 'Reproducir animación del radar');
  }

  /* ---- Capas observadas (RainViewer). Solo el fotograma visible y el siguiente en memoria. ---- */
  function getObsLayer(f) {
    if (cfg.demo) { return null; }
    if (!layerCache[f.path]) {
      var layer = L.tileLayer(radarHost + f.path + '/256/{z}/{x}/{y}/' + RADAR_COLOR + '/1_0.png', {
        tileSize: 256, maxNativeZoom: 7, maxZoom: 10, opacity: 0, zIndex: 10, updateWhenIdle: true, keepBuffer: 0
      });
      layer._ready = false;
      layer.on('loading', function () { layer._ready = false; });
      layer.on('load', function () { layer._ready = true; });
      layer.addTo(map);
      layerCache[f.path] = layer;
    }
    return layerCache[f.path];
  }
  function trimObs(keep) {
    for (var id in layerCache) {
      if (layerCache.hasOwnProperty(id) && !keep[id]) { map.removeLayer(layerCache[id]); delete layerCache[id]; }
    }
  }
  function layerFor(i) {
    var f = frames[i];
    if (!f) { return null; }
    return f.kind === 'obs' ? getObsLayer(f) : getFcLayer(f.j);
  }

  function framePos(i) {
    var f = frames[i], nObs = obsFrames.length;
    if (f.kind === 'obs') { return nObs > 1 ? OBS * f.j / (nObs - 1) : 0; }
    var t0 = nObs ? obsFrames[nObs - 1].time : Math.floor(now().getTime() / 1000);
    return Math.min(100, OBS + (100 - OBS) * (f.time - t0) / 86400);
  }

  function radarAgeMin() {
    if (!obsFrames.length) { return -1; }
    return Math.round((now().getTime() / 1000 - obsFrames[obsFrames.length - 1].time) / 60);
  }

  function showFrame(i) {
    if (!frames.length) { return; }
    cur = Math.max(0, Math.min(i, frames.length - 1));
    var f = frames[cur];
    var lc = layerFor(cur);
    if (displayed && displayed !== lc) { displayed.setOpacity(0); }
    if (lc) { lc.setOpacity(f.kind === 'obs' ? cfg.radarOpacity : cfg.fcOpacity); if (lc.setZIndex) { lc.setZIndex(20); } }
    displayed = lc;

    /* precarga del siguiente fotograma observado y limpieza del resto */
    var keep = {};
    if (f.kind === 'obs') { keep[f.path] = true; }
    var nf = frames[(cur + 1) % frames.length];
    if (nf.kind === 'obs') { keep[nf.path] = true; var ln = getObsLayer(nf); if (ln && ln !== lc) { ln.setZIndex(10); } }
    trimObs(keep);

    /* línea de tiempo */
    var pos = framePos(cur);
    $('t-fill').style.width = Math.min(pos, OBS) + '%';
    $('t-fill-fc').style.left = OBS + '%';
    $('t-fill-fc').style.width = Math.max(0, pos - OBS) + '%';
    $('t-thumb').style.left = pos + '%';
    $('t-thumb').className = f.kind === 'fc' ? 'fc' : '';

    /* pastilla de modo */
    var chip = $('chip-r'), age = radarAgeMin();
    var stale = !cfg.demo && f.kind === 'obs' && cur === obsFrames.length - 1 && age > cfg.radarStaleMin;
    if (f.kind === 'obs') {
      chip.className = 'chip mode' + (stale ? ' warn' : '');
      chip.querySelector('.k').textContent = 'Observado';
      chip.querySelector('.w').textContent = fmtTime(f.time) + (stale ? ' · hace ' + age + ' min' : '');
    } else {
      var d = new Date(f.time * 1000);
      chip.className = 'chip mode fc';
      chip.querySelector('.k').textContent = 'Previsión';
      chip.querySelector('.w').textContent = dayWord(d) + ' ' + hhmm(d);
    }
  }

  function layoutTimeline() {
    OBS = fcFrames.length ? 19 : 100;
    $('t-obs').style.width = OBS + '%';
    $('t-fc').style.left = OBS + '%';
    $('t-fc').style.display = fcFrames.length ? 'block' : 'none';
    $('t-now').style.left = 'calc(' + OBS + '% - 1px)';
    $('t-now').style.display = fcFrames.length ? 'block' : 'none';
    $('tlh-obs').style.width = OBS + '%';
    $('tlh-fc').style.display = fcFrames.length ? 'block' : 'none';
    var t = '';
    function tick(left, txt, cls, shift) {
      return '<span class="' + (cls || '') + '" style="left: ' + left + '%; -webkit-transform: translateX(' + shift + '); transform: translateX(' + shift + ')">' + txt + '</span>';
    }
    if (fcFrames.length) {
      t += tick(0, '−2 h', '', '0');
      t += tick(OBS, 'Ahora', 'now', '-50%');
      for (var hh = 6; hh <= 18; hh += 6) { t += tick(OBS + (100 - OBS) * hh / 24, '+' + hh + ' h', '', '-50%'); }
      t += tick(100, '+24 h', '', '-100%');
    } else if (obsFrames.length) {
      t += tick(0, fmtTime(obsFrames[0].time), '', '0');
      t += tick(100, 'ahora', 'now', '-100%');
    }
    $('ticks').innerHTML = t;
  }

  function rebuildFrames() {
    frames = [];
    var k;
    for (k = 0; k < obsFrames.length; k++) { frames.push({ kind: 'obs', j: k, time: obsFrames[k].time, path: obsFrames[k].path }); }
    var t0 = obsFrames.length ? obsFrames[obsFrames.length - 1].time : 0;
    for (k = 0; k < fcFrames.length; k++) { if (fcFrames[k].time > t0) { frames.push({ kind: 'fc', j: k, time: fcFrames[k].time }); } }
    layoutTimeline();
    showFrame(obsFrames.length ? obsFrames.length - 1 : 0);
    schedule();
  }

  /* ---- Animación ---- */
  function isNight() {
    if (cfg.forceNight) { return true; }
    if (!cfg.nightFrom) { return false; }
    var d = now(), m = d.getHours() * 60 + d.getMinutes();
    var a = hm(cfg.nightFrom), b = hm(cfg.nightTo);
    return a > b ? (m >= a || m < b) : (m >= a && m < b);
  }
  function hm(t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10); }

  var waited = 0;
  function schedule() {
    clearTimeout(animTimer);
    if (!playing || frames.length < 2) { return; }
    var f = frames[cur];
    var step = isNight() ? cfg.nightFrameMs : (f.kind === 'fc' ? cfg.fcFrameMs : cfg.frameMs);
    var delay = (cur === obsFrames.length - 1 || cur === frames.length - 1) ? cfg.pauseLastMs : step;
    animTimer = setTimeout(advance, delay);
  }
  function advance() {
    var nxt = (cur + 1) % frames.length;
    var nf = frames[nxt];
    var ln = nf && nf.kind === 'obs' ? getObsLayer(nf) : null;
    /* si el siguiente fotograma aún no ha cargado, espera hasta 3 s para no enseñar el mapa vacío */
    if (ln && !ln._ready && waited < 3000) { waited += 250; animTimer = setTimeout(advance, 250); return; }
    waited = 0;
    showFrame(nxt);
    schedule();
  }
  function setPlaying(v) {
    playing = v;
    setPlayIcon();
    if (playing) { schedule(); } else { clearTimeout(animTimer); }
  }

  /* ---- Observado (RainViewer, últimas 2 h) ---- */
  function loadRadar() {
    if (cfg.demo) { applyObs('', demoObs()); return; }
    getJSON('https://api.rainviewer.com/public/weather-maps.json', function (data) {
      var r = data.radar || {};
      var list = (r.past || []).concat(r.nowcast || []);
      if (list.length) { applyObs(data.host || 'https://tilecache.rainviewer.com', list); }
      radarFails = 0; updateStatus(); scheduleRadar();
    }, function () { radarFails++; updateStatus(); scheduleRadar(); });
  }
  function applyObs(host, list) {
    var key = list.length ? String(list[list.length - 1].time) + ':' + list.length : '';
    if (key === lastObsKey) { return; }
    lastObsKey = key;
    radarHost = host;
    obsFrames = list;
    rebuildFrames();
  }

  /* ---- Previsión +24 h: rejilla de puntos de Open-Meteo pintada en el navegador ---- */
  /* 17×13 = 221 puntos cada hora ≈ 5.300 llamadas/día: por debajo del límite gratuito (10.000) */
  var GRID = { cols: 17, rows: 13, dLat: 0.24, dLon: 0.375, up: 10 };
  var gridBounds = null;

  function gridPoints() {
    var lats = [], lons = [];
    var la0 = cfg.lat + (GRID.rows - 1) / 2 * GRID.dLat, lo0 = cfg.lon - (GRID.cols - 1) / 2 * GRID.dLon;
    for (var r = 0; r < GRID.rows; r++) {
      for (var c = 0; c < GRID.cols; c++) { lats.push((la0 - r * GRID.dLat).toFixed(3)); lons.push((lo0 + c * GRID.dLon).toFixed(3)); }
    }
    gridBounds = L.latLngBounds(
      [la0 - (GRID.rows - 1) * GRID.dLat - GRID.dLat / 2, lo0 - GRID.dLon / 2],
      [la0 + GRID.dLat / 2, lo0 + (GRID.cols - 1) * GRID.dLon + GRID.dLon / 2]);
    return { lats: lats, lons: lons };
  }

  function loadForecastGrid() {
    if (!cfg.radarForecast) { return; }
    var pts = gridPoints();
    if (cfg.demo) { applyGrid(demoGrid()); return; }
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.lats.join(',') + '&longitude=' + pts.lons.join(',') +
      '&hourly=precipitation&forecast_hours=26&timeformat=unixtime&timezone=GMT';
    getJSON(url, function (d) {
      if (!d || !d.length) { return; }
      var times = d[0].hourly.time, out = [];
      for (var k = 0; k < times.length; k++) {
        var vals = [];
        for (var p = 0; p < d.length; p++) { vals.push((d[p].hourly.precipitation[k]) || 0); }
        out.push({ time: times[k], vals: vals });
      }
      applyGrid(out);
    }, function () { /* se reintenta en el siguiente ciclo */ });
  }

  function applyGrid(list) {
    var t0 = Math.floor(now().getTime() / 1000), out = [];
    for (var k = 0; k < list.length; k++) {
      if (list[k].time > t0 && list[k].time <= t0 + 24 * 3600 + 1800) { out.push(list[k]); }
    }
    for (var i = 0; i < fcLayers.length; i++) { if (fcLayers[i]) { map.removeLayer(fcLayers[i]); } }
    fcLayers = [];
    if (displayed && frames[cur] && frames[cur].kind === 'fc') { displayed = null; }
    fcFrames = out;
    rebuildFrames();
  }

  /* mm/h → color (misma escala que la leyenda) */
  var STOPS = [[0.03, 136, 221, 238, 0], [0.2, 136, 221, 238, 0.35], [0.5, 136, 221, 238, 0.60], [2, 0, 163, 224, 0.75], [5, 255, 238, 0, 0.80], [10, 255, 129, 0, 0.85], [25, 193, 0, 0, 0.90], [50, 255, 170, 255, 0.90]];
  function colorFor(v) {
    if (v < STOPS[0][0]) { return [0, 0, 0, 0]; }
    for (var i = 1; i < STOPS.length; i++) {
      if (v < STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], t = (v - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t];
      }
    }
    var l = STOPS[STOPS.length - 1];
    return [l[1], l[2], l[3], l[4]];
  }

  /* Cada fotograma: se interpolan los valores de la rejilla (curva suave) y luego se colorean */
  function smooth(t) { return t * t * (3 - 2 * t); }
  function getFcLayer(j) {
    if (fcLayers[j]) { return fcLayers[j]; }
    var f = fcFrames[j];
    if (!f || !gridBounds) { return null; }
    var S = GRID.up, W2 = GRID.cols * S, H2 = GRID.rows * S, v = f.vals;
    var cv = document.createElement('canvas');
    cv.width = W2; cv.height = H2;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(W2, H2), d = img.data;
    for (var y = 0; y < H2; y++) {
      var gy = Math.max(0, Math.min(GRID.rows - 1, (y + 0.5) / S - 0.5)), r0 = Math.floor(gy), r1 = Math.min(r0 + 1, GRID.rows - 1), ty = smooth(gy - r0);
      for (var x = 0; x < W2; x++) {
        var gx = Math.max(0, Math.min(GRID.cols - 1, (x + 0.5) / S - 0.5)), c0 = Math.floor(gx), c1 = Math.min(c0 + 1, GRID.cols - 1), tx = smooth(gx - c0);
        var a = v[r0 * GRID.cols + c0], b = v[r0 * GRID.cols + c1], c = v[r1 * GRID.cols + c0], e = v[r1 * GRID.cols + c1];
        var val = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
        var col = colorFor(val), o = (y * W2 + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(col[3] * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    var layer = L.imageOverlay(cv.toDataURL('image/png'), gridBounds, { opacity: 0, interactive: false, className: 'fc-img', zIndex: 5 });
    layer.addTo(map);
    fcLayers[j] = layer;
    return layer;
  }

  /* ======================= Estado, reintentos y ciclos ======================= */
  function updateStatus() {
    var el = $('status');
    var age = radarAgeMin();
    var radarOld = !cfg.demo && obsFrames.length && age > cfg.radarStaleMin;
    var radarTxt = radarOld ? ' · Radar sin actualizar (' + age + ' min)' : '';
    if (!lastOk) {
      el.className = lastError ? 'warn' : '';
      el.textContent = (lastError ? 'Sin conexión · reintentando' : 'Cargando datos…') + radarTxt;
    } else {
      var min = Math.max(0, Math.round((Date.now() - lastOk) / 60000));
      var txt = min < 1 ? 'ahora' : 'hace ' + min + ' min';
      if (lastError) { el.className = 'warn'; el.textContent = 'Sin conexión · datos de ' + txt + ' · reintentando' + radarTxt; }
      else { el.className = radarOld ? 'warn' : ''; el.textContent = 'Actualizado ' + txt + radarTxt; }
    }
    if (frames.length) { showFrame(cur); }
  }

  /* Si falla, vuelve a probar a los 30 s, 1, 2 y 5 min; si va bien, a la frecuencia normal */
  var BACKOFF = [30, 60, 120, 300];
  function nextDelay(fails, normalMin) {
    if (!fails) { return normalMin * 60000; }
    return Math.min(BACKOFF[Math.min(fails, BACKOFF.length) - 1] * 1000, normalMin * 60000);
  }
  var weatherTimer = null, weatherFails = 0, radarTimer = null, radarFails = 0;
  function scheduleWeather() { clearTimeout(weatherTimer); weatherTimer = setTimeout(loadWeather, nextDelay(weatherFails, cfg.weatherEveryMin)); }
  function scheduleRadar() { clearTimeout(radarTimer); radarTimer = setTimeout(loadRadar, nextDelay(radarFails, cfg.radarEveryMin)); }

  function loadWeather() {
    if (cfg.demo) { renderWeather(demoWeather()); lastOk = Date.now() - 3 * 60000; updateStatus(); return; }
    getJSON(weatherUrl(), function (data) {
      try { renderWeather(data); } catch (e) { lastError = true; weatherFails++; updateStatus(); scheduleWeather(); return; }
      lastOk = Date.now(); lastError = false; weatherFails = 0;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: lastOk, data: data })); } catch (e2) { /* sin almacenamiento */ }
      updateStatus(); scheduleWeather();
    }, function () { lastError = true; weatherFails++; updateStatus(); scheduleWeather(); });
  }
  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) { return; }
      var c = JSON.parse(raw);
      if (c && c.data && Date.now() - c.t < 6 * 3600 * 1000) { renderWeather(c.data); lastOk = c.t; updateStatus(); }
    } catch (e) { /* caché inválida */ }
  }

  /* ======================= Modo noche y recarga diaria ======================= */
  var awakeUntil = 0, startedAt = Date.now(), wasNight = null;
  function applyNight() {
    var night = isNight() && Date.now() > awakeUntil;
    var dim = $('dim');
    dim.style.opacity = night ? cfg.nightDim : 0;
    dim.style.display = night ? 'block' : 'none';
    if (night !== wasNight) { wasNight = night; if (playing) { schedule(); } }
  }
  function wakeFromNight(e) { if (e && e.target && e.target.parentNode && e.target.parentNode.id === 'demobar') { return; } if (isNight()) { awakeUntil = Date.now() + 60000; applyNight(); } }
  function minuteTick() {
    applyNight();
    if (W) { renderSun(W.daily); renderNextHour(W); renderEvening(W); }
    renderAlerts();
    if (!cfg.reloadAt || cfg.demo) { return; }
    var d = new Date();
    if (pad(d.getHours()) + ':' + pad(d.getMinutes()) === cfg.reloadAt && Date.now() - startedAt > 3600000 && navigator.onLine !== false) {
      location.reload();
    }
  }

  /* ======================= Datos de muestra (?demo=1, &alert=amarillo|naranja|rojo, &night=1) ======================= */
  function demoObs() {
    var out = [], base = Math.floor(now().getTime() / 1000) - 12 * 600 - 420;
    for (var i = 0; i < 13; i++) { out.push({ time: base + i * 600, path: '' }); }
    return out;
  }
  function demoWeather() {
    var storm = cfg.demoAlert === 'naranja' || cfg.demoAlert === 'rojo';
    var H = now().getHours();
    var time = [], temp = [], prob = [], prec = [], code = [], isDay = [], pres = [], cape = [];
    for (var hh = -24; hh < 48; hh++) {
      var d = new Date(2026, 10, 14, hh);
      time.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':00');
      var hr = d.getHours();
      temp.push(Math.round(14 + 4 * Math.sin((hr - 9) / 24 * 2 * Math.PI)));
      isDay.push(hr >= 8 && hr < 18 ? 1 : 0);
      var rel = hh - H, p = 0, mm = 0, c = hr >= 8 && hr < 16 ? 1 : 3;
      if (hh >= 9 && hh <= 10) { mm = 0.2; c = 61; p = 40; }
      if (H >= 20 && hh >= 39 && hh <= 41) { mm = [1.6, 3.2, 1.1][hh - 39]; p = [70, 75, 60][hh - 39]; c = 61; }
      if (H < 20 && rel >= 1 && rel <= 6) { var bump = [0.6, 1.8, 2.4, 1.2, 0.2, 0][rel - 1]; mm = storm ? bump * 4 : bump; p = [45, 60, 70, 45, 20, 10][rel - 1]; c = mm >= 0.5 ? (storm && rel <= 4 ? 95 : 61) : 3; }
      prob.push(p); prec.push(mm); code.push(c);
      pres.push(1016 - (hh > 10 ? (hh - 10) * 0.4 : 0));
      cape.push(storm && rel >= 0 && rel <= 5 ? 1800 : 150);
    }
    var mt = [], mp = [];
    for (var k = -1; k < 8; k++) {
      var md = new Date(2026, 10, 14, H, 15 + k * 15);
      mt.push('2026-11-14T' + pad(md.getHours()) + ':' + pad(md.getMinutes()));
      mp.push(storm ? 0.6 : (H < 20 && k >= 2 && k <= 5 ? 0.15 : 0));
    }
    return {
      current: { time: '2026-11-14T' + pad(H) + ':15', temperature_2m: H >= 20 ? 14.1 : (storm ? 15.2 : 18.2), apparent_temperature: storm ? 13 : 17.1, relative_humidity_2m: storm ? 94 : 68, dew_point_2m: storm ? 14.6 : 12.1,
        is_day: H >= 18 ? 0 : 1, weather_code: H >= 20 ? 0 : (storm ? 95 : 2), wind_speed_10m: storm ? 38 : 14, wind_direction_10m: storm ? 95 : 45, wind_gusts_10m: storm ? 71 : 32, pressure_msl: storm ? 1004.2 : 1013.1 },
      minutely_15: { time: mt, precipitation: mp },
      hourly: { time: time, temperature_2m: temp, precipitation_probability: prob, precipitation: prec, weather_code: code, is_day: isDay, pressure_msl: pres, cape: cape },
      daily: {
        time: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'],
        weather_code: [storm ? 95 : 2, 61, 3, 0, 0],
        temperature_2m_max: [20, 19, 18, 19, 21], temperature_2m_min: [12, 13, 11, 10, 11],
        precipitation_probability_max: [storm ? 90 : 40, 70, 20, 0, 0], precipitation_sum: [storm ? 36 : 4, 6.2, 0, 0, 0],
        sunrise: ['2026-11-14T07:51', '2026-11-15T07:52', '2026-11-16T07:53', '2026-11-17T07:54', '2026-11-18T07:55'],
        sunset: ['2026-11-14T17:38', '2026-11-15T17:37', '2026-11-16T17:36', '2026-11-17T17:36', '2026-11-18T17:35'],
        uv_index_max: [2.1, 1.8, 2.4, 2.6, 2.5], wind_gusts_10m_max: [storm ? 75 : 35, 45, 30, 25, 28]
      }
    };
  }
  function demoGrid() {
    var out = [], t0 = Math.floor(now().getTime() / 3600000) * 3600;
    for (var k = 1; k <= 25; k++) {
      var vals = [];
      /* una banda de lluvia que entra por el SO y sale por el NE */
      var cx = -5 + k * 0.6, cy = 10 - k * 0.45;
      for (var r = 0; r < GRID.rows; r++) {
        for (var c = 0; c < GRID.cols; c++) {
          var dx = (c - 8) - cx, dy = r - cy;
          var v = 6 * Math.exp(-(dx * dx / 3 + dy * dy / 1.6)) + 2.5 * Math.exp(-((dx + 3) * (dx + 3) / 2 + (dy - 2) * (dy - 2) / 1.2)) * (k < 9 ? 1 : Math.max(0, 1 - (k - 9) / 6));
          vals.push(v);
        }
      }
      out.push({ time: t0 + k * 3600, vals: vals });
    }
    return out;
  }
  function demoAlerts() {
    var lv = cfg.demoAlert;
    var base = { updated: new Date().toISOString(), zone: 'Litoral sur de Tarragona', alerts: [] };
    if (!LEVEL_RANK[lv]) { return base; }
    var d = now();
    function at(h) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h); return x.toISOString(); }
    base.alerts.push({ level: lv, event: 'Lluvias', detail: 'Acumulados de 60 mm en 12 h', onset: at(lv === 'amarillo' ? 21 : 17), expires: at(27) });
    if (lv !== 'amarillo') { base.alerts.push({ level: 'amarillo', event: 'Tormentas', detail: '', onset: at(18), expires: at(23) }); }
    return base;
  }

  /* Barra para cambiar de estado en el modo demo */
  function demoBar() {
    var bar = document.createElement('div');
    bar.id = 'demobar';
    var opts = [['', 'Tarde 17:17'], ['amarillo', 'Aviso amarillo'], ['naranja', 'Aviso naranja'], ['rojo', 'Aviso rojo'], ['tarde', 'Noche 21:35'], ['noche', 'Atenuado']];
    var mode = HASH === 'tarde' ? 'tarde' : '';
    var html = '<span>Demo · datos inventados</span>';
    for (var i = 0; i < opts.length; i++) { html += '<button type="button" data-v="' + opts[i][0] + '">' + opts[i][1] + '</button>'; }
    bar.innerHTML = html;
    document.body.appendChild(bar);
    function mark() {
      var bs = bar.getElementsByTagName('button');
      for (var k = 0; k < bs.length; k++) {
        var v = bs[k].getAttribute('data-v');
        bs[k].className = (v === 'noche' ? cfg.forceNight : (v === 'tarde' ? (!cfg.forceNight && mode === 'tarde') : (!cfg.forceNight && mode !== 'tarde' && v === cfg.demoAlert))) ? 'on' : '';
      }
    }
    bar.onclick = function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-v');
      if (v === null || v === undefined) { return; }
      cfg.forceNight = v === 'noche';
      mode = v === 'tarde' ? 'tarde' : (v === 'noche' ? mode : '');
      cfg.demoAlert = (v === 'noche' || v === 'tarde') ? '' : v;
      if (mode === 'tarde') { setDemoTime(21, 35); } else { setDemoTime(17, 17); }
      updateClock();
      awakeUntil = 0;
      renderWeather(demoWeather());
      AL = demoAlerts(); renderAlerts();
      lastObsKey = ''; applyObs('', demoObs()); applyGrid(demoGrid());
      applyNight();
      mark();
      if (e.stopPropagation) { e.stopPropagation(); }
    };
    mark();
  }

  /* ======================= Pantalla completa y pantalla encendida ======================= */
  function toggleFullscreen() {
    var el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { req.call(el); }
    }
  }
  function keepAwake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) { navigator.wakeLock.request('screen').then(function () {}, function () {}); }
    } catch (e) { /* no disponible en navegadores antiguos */ }
  }

  /* ======================= Arranque ======================= */
  function start() {
    $('place').textContent = cfg.name;
    document.title = cfg.name + ' · Estación meteorológica';
    updateClock();
    setPlayIcon();

    initMap();
    loadCache();
    loadWeather();
    loadRadar();
    loadForecastGrid();
    loadSea();
    loadAlerts();

    $('play').onclick = function () { setPlaying(!playing); touchFull(); };
    $('fullclose').onclick = exitFull;
    $('track').onclick = function (e) {
      if (!frames.length) { return; }
      var r = this.getBoundingClientRect(), pct = (e.clientX - r.left) / r.width * 100, best = 0, bd = 1e9;
      for (var i = 0; i < frames.length; i++) { var dd = Math.abs(framePos(i) - pct); if (dd < bd) { bd = dd; best = i; } }
      setPlaying(false);
      showFrame(best);
      touchFull();
    };
    $('clock').ondblclick = toggleFullscreen;
    $('temp').ondblclick = toggleFullscreen;

    setTimeout(fixMapSize, 600);
    setTimeout(fixMapSize, 2500);

    setInterval(function () { updateClock(); if (full) { updateFullInfo(); } }, 5000);
    setInterval(updateStatus, 30000);
    setInterval(minuteTick, 60000);
    setInterval(loadForecastGrid, cfg.forecastEveryMin * 60000);
    setInterval(loadSea, cfg.seaEveryMin * 60000);
    setInterval(loadAlerts, cfg.alertsEveryMin * 60000);
    minuteTick();
    if (cfg.demo) { demoBar(); }
    document.addEventListener('touchstart', wakeFromNight, false);
    document.addEventListener('mousedown', wakeFromNight, false);

    keepAwake();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { keepAwake(); clearTimeout(weatherTimer); clearTimeout(radarTimer); loadWeather(); loadRadar(); }
    });
    window.addEventListener('resize', function () { if (map) { map.invalidateSize(); } });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
