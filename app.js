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
    meteocatUrl: def(C.meteocatUrl, 'meteocat.json'),
    climaUrl: def(C.climaUrl, 'clima.json'),
    histUrl: def(C.histUrl, 'historial.json'),
    extUrl: def(C.extUrl, 'extremos.json'),
    alertsUrl: def(C.alertsUrl, 'avisos.json'),
    autoplay: C.autoplay === true,
    playLoops: C.playLoops || 3,
    obsUrl: def(C.obsUrl, 'observacion.json'),
    obsMaxAgeMin: C.obsMaxAgeMin || 180,
    sound: C.sound !== false,
    soundVolume: def(C.soundVolume, 0.25),
    days: C.days || 8,
    frameMs: C.frameMs || 700,
    fcFrameMs: C.fcFrameMs || 450,
    pauseLastMs: C.pauseLastMs || 2000,
    radarOpacity: C.radarOpacity || 0.8,
    radarForecast: C.radarForecast !== false,
    fcOpacity: C.fcOpacity || 0.85,
    radarStaleMin: C.radarStaleMin || 20,
    basemapUrl: C.basemapUrl || 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelsUrl: def(C.labelsUrl, 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'),
    basemapAttribution: C.basemapAttribution || 'Mapa &copy; Esri, HERE, Garmin, &copy; OpenStreetMap',
    reloadAt: def(C.reloadAt, '04:00'),
    nightFrom: def(C.nightFrom, '23:00'),
    nightTo: C.nightTo || '07:00',
    nightDim: def(C.nightDim, 0.55),
    nightBrightness: def(C.nightBrightness, 1),
    dayBrightness: def(C.dayBrightness, 160),
    nightMode: C.nightMode || 'reloj',
    autoUpdate: C.autoUpdate !== false,
    batteryWarn: def(C.batteryWarn, 30),
    lightningUrl: def(C.lightningUrl, 'rayos.json'),
    lightningNearKm: C.lightningNearKm || 30,
    nightFrameMs: C.nightFrameMs || 1400,
    tomorrowFrom: C.tomorrowFrom || '20:00',
    radarFade: C.radarFade !== false,
    fullRadarSec: C.fullRadarSec || 30,
    radarReturnSec: C.radarReturnSec || 30,
    locReturnMin: def(C.locReturnMin, 5),
    favorites: C.favorites || [],
    demo: Q.demo === '1' || C.demo === true || /^(demo|amarillo|naranja|rojo|noche|tarde)$/.test(HASH),
    demoAlert: Q.alert || (/^(amarillo|naranja|rojo)$/.test(HASH) ? HASH : ''),
    forceNight: Q.night === '1' || HASH === 'noche'
  };

  var TZ = 'auto';
  try { TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'; } catch (e) { TZ = 'auto'; }
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

  function getJSON(url, ok, fail, tmo) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = tmo || 25000;
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
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day,pressure_msl,cape,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,dew_point_2m,visibility,uv_index' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_gusts_10m_max,wind_speed_10m_max,wind_direction_10m_dominant,daylight_duration' +
      '&minutely_15=precipitation&past_minutely_15=1&forecast_minutely_15=8' +
      '&past_hours=24&forecast_hours=120' +
      '&wind_speed_unit=kmh&timezone=' + encodeURIComponent(TZ) + '&forecast_days=' + cfg.days;
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

    $('temp').innerHTML = tempHtml(cur.temperature_2m);
    $('bigicon').innerHTML = svgIcon(w.kind);
    $('cond').textContent = w.label;
    $('range').textContent = 'Sensación ' + Math.round(cur.apparent_temperature) + '° · Máx ' +
      Math.round(dl.temperature_2m_max[0]) + '° · Mín ' + Math.round(dl.temperature_2m_min[0]) + '°';

    renderNextHour(d);
    checkSound();

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
    rainSource = 'modelo';
    var est = radarRainToday();
    if (est !== null) { $('rain').innerHTML = (est > 0 && est < 0.1 ? '<0,1' : fmtNum(est, 1)) + ' <span class="u">mm</span>'; rainSource = 'radar'; }
    var yrr = yearRain();
    setSub('rain-s', expected >= 0.1 ? 'Prevista +' + mmTxt(expected) + ' mm' : (yrr && yrr.pct != null ? 'Año ' + Math.round(yrr.tot) + ' mm (' + (yrr.pct > 0 ? '+' : '') + yrr.pct + ' %)' : 'Sin más lluvia hoy'), 'blue');

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

    var measured = applyObsStation();
    if (AIR && ((AIR.aqi != null && AIR.aqi >= 60) || (AIR.pollen && AIR.pollen.level === 2))) {
      $('range').textContent += (AIR.aqi >= 60 ? ' · Aire ' + aqiTxt(AIR.aqi).toLowerCase() : '') + (AIR.pollen && AIR.pollen.level === 2 ? ' · Polen alto' : '');
    }
    $('rain-l').textContent = rainSource === 'estación' ? 'Llovido hoy' : (rainSource === 'radar' ? 'Llovido hoy · radar' : 'Llovido hoy · modelo');
    /* el viento del modelo en la costa a veces sale casi a cero: que se vea de dónde sale el dato */
    if ($('wind-l')) { $('wind-l').textContent = obsFresh() && STN && STN.wind != null ? 'Viento · ' + String(STN.station || 'estación').replace(' aeropuerto', '') : 'Viento · modelo'; }
    renderSun(dl);
    renderEvening(d);
    renderHours(d, idx);
    renderDays(dl);
    renderStorm(d, idx);
    renderSummary();
    fixMapSize();
  }

  var rainSource = 'modelo';
  function setSub(id, html, cls) {
    var el = $(id);
    el.innerHTML = html;
    el.className = 's' + (cls ? ' ' + cls : '');
  }

  /* Lluvia en la próxima hora (datos cada 15 min; en España se interpolan del modelo horario) */
  var dryNow = false;
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
    dryNow = steps[0] < WET && steps.length > 1 && steps[1] < WET && !(radarHere && radarHere.wet);
    function run(from) { var c = 0; while (from + c < steps.length && steps[from + c] >= WET) { c++; } return c; }
    function intensity(from, len) {
      var mx = 0;
      for (var j = from; j < from + len; j++) { mx = Math.max(mx, steps[j] * 4); }
      return mx < 2 ? 'débil' : (mx < 10 ? 'moderada' : 'fuerte');
    }
    function durTxt(len) { var mins = len * 15; return mins >= 60 ? (mins % 60 ? fmtNum(mins / 60, 1) + ' h' : (mins / 60) + ' h') : mins + ' min'; }

    var icon = lineIcon(I_UMB, '#7FB6FF');
    /* el radar manda sobre el modelo si ve lluvia encima ahora mismo */
    if (radarHere && radarHere.wet && now().getTime() / 1000 - radarHere.time < 30 * 60 && steps[0] < WET) {
      el.className = 'nh wet';
      el.innerHTML = icon + '<b>Lloviendo ahora</b><span class="x">· ' + ['', 'débil', 'moderada', 'fuerte'][radarHere.level] + ' (~' + (radarHere.mmh < 10 ? fmtNum(radarHere.mmh, 1) : Math.round(radarHere.mmh)) + ' mm/h) · radar</span>';
      return;
    }
    if (radarEta && Date.now() / 1000 - radarEta.time < 20 * 60 && steps[0] < WET) {
      el.className = 'nh wet';
      el.innerHTML = icon + '<b>Lluvia en ~' + radarEta.minutes + ' min</b><span class="x">· ' + ['', 'débil', 'moderada', 'fuerte'][radarEta.level] + ' · radar</span>';
      return;
    }
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
        '<div class="s">' + (gust != null ? 'Rachas de hasta ' + Math.round(gust) + ' km/h' : '') + (uv != null ? (gust != null ? ' · ' : '') + 'UV ' + Math.round(uv) : '') + '</div>' + partsHtml(h, key) + '</div>';
    }
    /* fase lunar: entre el ocaso y el amanecer */
    var dark = dl.sunrise && dl.sunset && (n < parseLocal(dl.sunrise[0]) || n >= parseLocal(dl.sunset[0]));
    $('moon').innerHTML = dark ? moonHtml(n) : '';
  }

  /* Lluvia de un día por franjas: mañana (7–13), tarde (14–20) y noche (21–24) */
  function dayParts(h, key) {
    var P = [['Mañana', 7, 13], ['Tarde', 14, 20], ['Noche', 21, 23]], out = [];
    for (var q = 0; q < P.length; q++) {
      var pmax = 0, mm = 0;
      for (var i = 0; i < h.time.length; i++) {
        var t = String(h.time[i]);
        if (t.slice(0, 10) !== key) { continue; }
        var hr = parseInt(t.slice(11, 13), 10);
        if (hr >= P[q][1] && hr <= P[q][2]) { pmax = Math.max(pmax, h.precipitation_probability[i] || 0); mm += h.precipitation[i] || 0; }
      }
      out.push({ name: P[q][0], p: Math.round(pmax), mm: mm });
    }
    return out;
  }
  function partsHtml(h, key) {
    var parts = dayParts(h, key), html = '<div class="fr">', umb = false;
    for (var q = 0; q < parts.length; q++) {
      var wet = parts[q].p >= 50 || parts[q].mm >= 0.5;
      if (wet) { umb = true; }
      html += '<span class="' + (wet ? 'wet' : '') + '">' + parts[q].name + ' <b>' + parts[q].p + ' %</b></span>';
    }
    return html + (umb ? '<span class="umb" title="Lleva paraguas">☂</span>' : '') + '</div>';
  }

  /* ======================= Historial propio de la estación ======================= */
  var HIST = null;
  var EXT = null;
  function loadHist() {
    if (cfg.demo) { HIST = demoHist(); EXT = demoExt(); renderRecord(); return; }
    if (cfg.extUrl) { getJSON(cfg.extUrl + '?t=' + Math.floor(Date.now() / 3600000), function (d) { if (d && d.rec) { EXT = d; renderRecord(); } }, function () { /* sin récords */ }); }
    if (!cfg.histUrl) { return; }
    getJSON(cfg.histUrl + '?t=' + Math.floor(Date.now() / 600000), function (d) {
      if (!d || !d.days) { return; }
      /* fuera los días calculados con pocas horas (salvo hoy): darían máximas y mínimas engañosas */
      var today = dkey(now()), clean = {};
      for (var k in d.days) { if (d.days.hasOwnProperty(k)) { var v = d.days[k]; if (v.src !== 'horas' || (v.n || 0) >= 18 || k === today) { clean[k] = v; } } }
      d.days = clean; HIST = d; renderRecord();
    }, function () { /* sin historial */ });
  }
  function demoHist() {
    var d = {}, b = now();
    for (var k = 420; k >= 0; k--) {
      var x = new Date(b.getFullYear(), b.getMonth(), b.getDate() - k), q = doy(x), sn = Math.sin((q - 105) / 365 * 2 * Math.PI);
      d[x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate())] = { tmax: Math.round((19 + 8 * sn + 3 * Math.sin(k)) * 10) / 10, tmin: Math.round((10 + 7 * sn + 2 * Math.cos(k)) * 10) / 10, rain: k % 11 === 0 ? 12.4 : (k % 7 === 0 ? 2.1 : 0), gust: 30 + (k % 9) * 4, src: 'aemet' };
    }
    return { station: 'Reus aeropuerto', days: d };
  }
  function dkey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /* resumen de un periodo [desde, hasta] (claves AAAA-MM-DD) */
  function histStats(from, to) {
    var o = { n: 0, rain: 0, mx: null, mxD: null, mn: null, mnD: null, gust: null, gD: null, wet: 0 };
    if (!HIST) { return o; }
    for (var k in HIST.days) {
      if (!HIST.days.hasOwnProperty(k) || k < from || k > to) { continue; }
      var v = HIST.days[k]; o.n++;
      if (v.rain != null) { o.rain += v.rain; if (v.rain >= 1) { o.wet++; } }
      if (v.tmax != null && (o.mx === null || v.tmax > o.mx)) { o.mx = v.tmax; o.mxD = k; }
      if (v.tmin != null && (o.mn === null || v.tmin < o.mn)) { o.mn = v.tmin; o.mnD = k; }
      if (v.gust != null && (o.gust === null || v.gust > o.gust)) { o.gust = v.gust; o.gD = k; }
    }
    return o;
  }
  function dayTxt(k) { if (!k) { return ''; } var d = parseLocal(k + 'T12:00'); return 'el ' + d.getDate() + ' de ' + MONTHS[d.getMonth()] + (d.getFullYear() !== now().getFullYear() ? ' de ' + d.getFullYear() : ''); }
  /* sección para el panel de temperatura: este mes, este año y récords de la estación */
  function histHtml() {
    if (!HIST || !HIST.days) { return ''; }
    var n = now(), y = n.getFullYear(), m = n.getMonth(), pts = [], i;
    var from = y + '-' + pad(m + 1) + '-01', to = dkey(n);
    for (i = 1; i <= n.getDate(); i++) {
      var k = y + '-' + pad(m + 1) + '-' + pad(i), v = HIST.days[k];
      pts.push({ d: new Date(y, m, i, 12), lab: (i === 1 || i % 5 === 0) ? String(i) : '', a: v ? v.tmax : null, b: v ? v.tmin : null, r: v && v.rain ? v.rain : 0, rc: '#5BA8FF' });
    }
    var sm = histStats(from, to), sy = histStats(y + '-01-01', to), keys = Object.keys(HIST.days), all = histStats('0000', '9999');
    if (!sm.n && !sy.n) { return ''; }
    var first = keys.length ? keys[0] : null, html = '<div class="al-k">Medido en ' + esc(HIST.station || 'la estación') + ' · ' + MONTHS[m] + '</div>';
    html += factsHtml([
      ['Máxima del mes', sm.mx != null ? fmtNum(sm.mx, 1) + '°' : '--', dayTxt(sm.mxD)],
      ['Mínima del mes', sm.mn != null ? fmtNum(sm.mn, 1) + '°' : '--', dayTxt(sm.mnD)],
      ['Lluvia del mes', mmTxt(sm.rain) + ' mm', sm.wet + ' día' + (sm.wet === 1 ? '' : 's') + ' de lluvia']]);
    if (pts.length > 1) {
      html += buildChart(pts, { h: 170, aColor: '#FF8A65', bColor: '#7FB6FF', every: 1, rLabels: false, rMin: 5, fmt: function (v) { return Math.round(v) + '°'; } }) +
        legend([['#FF8A65', 'máxima'], ['#7FB6FF', 'mínima'], ['#5BA8FF', 'lluvia del día', true]]);
    }
    html += '<div class="al-k">' + y + ' en la estación</div>' + factsHtml([
      ['Lluvia del año', mmTxt(sy.rain) + ' mm', sy.wet + ' días de lluvia'],
      ['Máxima del año', sy.mx != null ? fmtNum(sy.mx, 1) + '°' : '--', dayTxt(sy.mxD)],
      ['Mínima del año', sy.mn != null ? fmtNum(sy.mn, 1) + '°' : '--', dayTxt(sy.mnD)]]);
    if (first && first < y + '-01-01') {
      html += '<div class="al-k">Récords de tu historial (desde ' + dayTxt(first).replace(/^el /, '') + ')</div>' + factsHtml([
        ['Más calor', fmtNum(all.mx, 1) + '°', dayTxt(all.mxD)],
        ['Más frío', fmtNum(all.mn, 1) + '°', dayTxt(all.mnD)],
        ['Racha más fuerte', all.gust != null ? Math.round(all.gust) + ' km/h' : '--', dayTxt(all.gD)]]);
    }
    return html + '<div class="ch-sub">Datos oficiales diarios de AEMET y, para los últimos días, calculados con las observaciones horarias.</div>';
  }
  /* lluvia del año medida en la estación (si el historial cubre desde el 1 de enero) */
  function yearRainStation() {
    if (!HIST || !HIST.days) { return null; }
    var y = now().getFullYear(), keys = Object.keys(HIST.days);
    if (!keys.length || keys[0] > y + '-01-03') { return null; }
    var s = histStats(y + '-01-01', dkey(now()));
    return s.n >= doy(now()) - 6 ? s.rain : null;
  }

  /* ======================= Datos curiosos del día ======================= */
  /* Frases que solo salen cuando toca: rachas, primeras veces, episodios de lluvia, rareza del día,
     fechas del sol, hace un año y contadores. Cada una lleva una prioridad; el resumen enseña las dos mejores. */
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }
  function hday(d) { return HIST && HIST.days ? HIST.days[dkey(d)] : null; }
  function shortDate(k) { var d = parseLocal(k + 'T12:00'); return d.getDate() + ' de ' + MONTHS[d.getMonth()] + (d.getFullYear() !== now().getFullYear() ? ' de ' + d.getFullYear() : ''); }
  function monthYear(k) { var d = parseLocal(k + 'T12:00'); return MONTHS[d.getMonth()] + (d.getFullYear() !== now().getFullYear() ? ' de ' + d.getFullYear() : ''); }
  /* hoy: lo medido si lo hay (máx/mín hasta ahora) y si no, lo previsto */
  function todayVals() {
    if (!W) { return null; }
    var me = measuredToday(), d0 = W.daily, hr = now().getHours();
    var fmx = d0.temperature_2m_max[0], fmn = d0.temperature_2m_min[0];
    return {
      tmax: me && me.tmax != null && hr >= 16 ? me.tmax : (me && me.tmax != null ? Math.max(me.tmax, fmx) : fmx),
      tmin: me && me.tmin != null && hr >= 9 ? me.tmin : fmn,
      rain: me && me.rain != null ? me.rain : null,
      measured: !!me
    };
  }
  /* hora de salida y puesta del sol (fórmula de la NOAA, precisión de ~1 min) en minutos desde medianoche UTC */
  function sunCalc(d) {
    var rad = Math.PI / 180, n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2000, 0, 1, 12)) / 86400000) + 1;
    var Js = n - cfg.lon / 360, M = (357.5291 + 0.98560028 * Js) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    var lam = (M + C + 180 + 102.9372) % 360, Jt = 2451545 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
    var dec = Math.asin(Math.sin(lam * rad) * Math.sin(23.44 * rad)), cosw = (Math.sin(-0.833 * rad) - Math.sin(cfg.lat * rad) * Math.sin(dec)) / (Math.cos(cfg.lat * rad) * Math.cos(dec));
    var w = Math.acos(Math.max(-1, Math.min(1, cosw))) / rad, rise = (Jt - w / 360 - 2440587.5) * 86400000, set = (Jt + w / 360 - 2440587.5) * 86400000;
    /* en hora UTC: así el cambio de hora de octubre y marzo no crea «extremos» falsos */
    function loc(ms) { var t = new Date(ms); return t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60; }
    return { rise: loc(rise), set: loc(set), len: (set - rise) / 60000 };
  }
  function buildFacts() {
    var F = [], n = now(), today = dkey(n), tv = todayVals(), i, d, v;
    if (!tv) { return F; }
    var hist = HIST && HIST.days ? HIST : null, hr = n.getHours();
    /* --- 7. Fechas del sol (no dependen del historial) --- */
    var sy = sunCalc(addDays(n, -1)), st = sunCalc(n), sm = sunCalc(addDays(n, 1));
    if (st.set <= sy.set && st.set <= sm.set) { F.push({ p: 70, t: 'Hoy el sol se pone más pronto que ningún otro día del año; desde mañana, cada día un poco más tarde' }); }
    if (st.rise >= sy.rise && st.rise >= sm.rise) { F.push({ p: 70, t: 'Hoy amanece más tarde que ningún otro día del año; desde mañana, cada día un poco antes' }); }
    if (st.len <= sy.len && st.len <= sm.len) { F.push({ p: 80, t: 'Hoy es el día más corto del año: desde mañana los días se alargan' }); }
    if (st.len >= sy.len && st.len >= sm.len) { F.push({ p: 80, t: 'Hoy es el día más largo del año: desde mañana los días se acortan' }); }
    if (sy.len < 720 && st.len >= 720) { F.push({ p: 75, t: 'Desde hoy hay más de 12 horas de luz' }); }
    if (sy.len >= 720 && st.len < 720) { F.push({ p: 75, t: 'Desde hoy hay menos de 12 horas de luz' }); }
    /* --- 4. Cambios bruscos de mañana --- */
    if (W.daily.temperature_2m_max[1] != null) {
      var dd = W.daily.temperature_2m_max[1] - W.daily.temperature_2m_max[0];
      if (Math.abs(dd) >= 6) { F.push({ p: 60, t: 'Cambio brusco: mañana la máxima ' + (dd < 0 ? 'bajará' : 'subirá') + ' unos ' + Math.round(Math.abs(dd)) + '° (' + Math.round(W.daily.temperature_2m_max[1]) + '°)' }); }
    }
    /* --- 6. Rareza del día (percentiles 1991–2020 para esta época) --- */
    if (NORM && NORM.pmx) {
      var q = doy(n), P = NORM.pmx, Q = NORM.pmn;
      if (P['95'][q] != null && tv.tmax >= P['95'][q]) { F.push({ p: 65, t: 'Día excepcionalmente cálido: está entre el 5 % de días más calurosos para esta época (desde 1991)' }); }
      else if (P['90'][q] != null && tv.tmax >= P['90'][q]) { F.push({ p: 45, t: 'Día muy cálido para la época: entre el 10 % más calurosos desde 1991' }); }
      if (P['05'][q] != null && tv.tmax <= P['05'][q]) { F.push({ p: 65, t: 'Día excepcionalmente frío: entre el 5 % de días más fríos para esta época (desde 1991)' }); }
      else if (P['10'][q] != null && tv.tmax <= P['10'][q]) { F.push({ p: 45, t: 'Día muy frío para la época: entre el 10 % más fríos desde 1991' }); }
      if (Q['95'][q] != null && tv.tmin >= Q['95'][q]) { F.push({ p: 40, t: 'Noche excepcionalmente templada para la época (entre el 5 % más cálidas desde 1991)' }); }
    }
    if (!hist) { return F; }
    /* días anteriores (de ayer hacia atrás) */
    function back(fn, max) { var c = 0, x; for (var k = 1; k <= (max || 400); k++) { x = hday(addDays(n, -k)); if (!x || !fn(x)) { break; } c++; } return c; }
    function lastSince(fn) { for (var k = 1; k <= 700; k++) { var dk = dkey(addDays(n, -k)), x = hist.days[dk]; if (x && fn(x)) { return { k: k, d: dk }; } } return null; }
    var wetToday = tv.rain != null && tv.rain >= 1;
    /* --- 1. Rachas --- */
    var dry = back(function (x) { return x.rain != null && x.rain < 1; });
    if (wetToday && dry >= 10) { F.push({ p: 85, t: 'Primer día de lluvia en ' + dry + ' días' }); }
    else if (!wetToday && dry >= 7 && (hr >= 18 || (tv.rain != null && tv.rain < 1 && hr >= 12))) { F.push({ p: dry >= 20 ? 70 : 50, t: (dry + 1) + ' días seguidos sin llover (contando hoy)' }); }
    var hot = (n.getMonth() >= 5 && n.getMonth() <= 8) ? 30 : 25;
    if (tv.tmax >= hot) { var hs = back(function (x) { return x.tmax != null && x.tmax >= hot; }); if (hs >= 2) { F.push({ p: 55, t: (hs + 1) + '.º día seguido por encima de ' + hot + '°' }); } }
    if (tv.tmin <= 5) { var cs = back(function (x) { return x.tmin != null && x.tmin <= 5; }); if (cs >= 2) { F.push({ p: 55, t: (cs + 1) + '.ª noche seguida por debajo de 5°' }); } }
    /* --- 2. Primeras veces de la temporada (si hacía más de 2 meses) --- */
    var firsts = [
      { ok: tv.tmin < 0, fn: function (x) { return x.tmin != null && x.tmin < 0; }, t: 'Primera helada' },
      { ok: tv.tmin < 5 && tv.tmin >= 0, fn: function (x) { return x.tmin != null && x.tmin < 5; }, t: 'Primera mínima por debajo de 5°' },
      { ok: tv.tmin < 10 && tv.tmin >= 5, fn: function (x) { return x.tmin != null && x.tmin < 10; }, t: 'Primera mínima por debajo de 10°' },
      { ok: tv.tmax >= 35, fn: function (x) { return x.tmax != null && x.tmax >= 35; }, t: 'Primer día de 35°' },
      { ok: tv.tmax >= 30 && tv.tmax < 35, fn: function (x) { return x.tmax != null && x.tmax >= 30; }, t: 'Primer día de 30°' },
      { ok: tv.tmax < 15, fn: function (x) { return x.tmax != null && x.tmax < 15; }, t: 'Primer día que no llega a 15°' },
      { ok: tv.tmin >= 20, fn: function (x) { return x.tmin != null && x.tmin >= 20; }, t: 'Primera noche tropical (mínima de 20° o más)' }];
    for (i = 0; i < firsts.length; i++) {
      if (!firsts[i].ok) { continue; }
      var ls = lastSince(firsts[i].fn);
      if (!ls) { F.push({ p: 60, t: firsts[i].t + ' de tu historial' + (tv.measured ? '' : ' (previsto)') }); }
      else if (ls.k > 60) { F.push({ p: 75, t: firsts[i].t + ' desde ' + monthYear(ls.d) + (tv.measured ? '' : ' (previsto)') }); }
    }
    /* --- 5. Episodio de lluvia (días seguidos con lluvia, incluido hoy) --- */
    if (wetToday) {
      var tot = tv.rain, start = today, k2;
      for (k2 = 1; k2 <= 30; k2++) { var x2 = hday(addDays(n, -k2)); if (!x2 || x2.rain == null || x2.rain < 1) { break; } tot += x2.rain; start = dkey(addDays(n, -k2)); }
      if (start !== today && tot >= 10) { F.push({ p: 72, t: 'Este episodio de lluvia lleva ' + mmTxt(tot) + ' mm desde el ' + shortDate(start) }); }
    }
    /* --- 8. Contadores del año --- */
    var y = n.getFullYear(), trop = 0, trop1 = 0, rainy = 0, hot30 = 0;
    for (var key in hist.days) {
      if (!hist.days.hasOwnProperty(key)) { continue; }
      v = hist.days[key];
      if (key.slice(0, 4) === String(y)) { if (v.tmin != null && v.tmin >= 20) { trop++; } if (v.rain != null && v.rain >= 1) { rainy++; } if (v.tmax != null && v.tmax >= 30) { hot30++; } }
      if (key.slice(0, 4) === String(y - 1) && v.tmin != null && v.tmin >= 20) { trop1++; }
    }
    if (tv.measured && tv.tmin >= 20 && hr >= 9) { F.push({ p: 50, t: 'Noche tropical n.º ' + trop + ' del año' + (trop > trop1 && trop1 ? ' (más que en todo ' + (y - 1) + ')' : '') }); }
    function pl(nn, a, b) { return nn + ' ' + (nn === 1 ? a : b); }
    F.push({ p: 5, t: 'En ' + y + ': ' + pl(rainy, 'día de lluvia', 'días de lluvia') + ', ' + pl(trop, 'noche tropical', 'noches tropicales') + ' y ' + pl(hot30, 'día de 30° o más', 'días de 30° o más'), panel: true });
    /* --- 3. Hace un año --- */
    var ly = hist.days[(y - 1) + today.slice(4)];
    if (ly && ly.tmax != null) {
      F.push({ p: 10, t: 'Hace un año (' + shortDate((y - 1) + today.slice(4)) + '): ' + fmtNum(ly.tmax, 1) + '° / ' + fmtNum(ly.tmin, 1) + '°' + (ly.rain >= 0.1 ? ' y ' + mmTxt(ly.rain) + ' mm' : ', sin lluvia'), panel: true });
      if (Math.abs(tv.tmax - ly.tmax) >= 6) { F.push({ p: 35, t: 'Hoy ' + Math.round(Math.abs(tv.tmax - ly.tmax)) + '° ' + (tv.tmax > ly.tmax ? 'más' : 'menos') + ' de máxima que hace justo un año' }); }
    }
    return F;
  }
  function topFacts(nmax) {
    var F = []; try { F = buildFacts(); } catch (e) { F = []; }
    F = F.filter(function (f) { return !f.panel; }).sort(function (a, b) { return b.p - a.p; });
    var out = []; for (var i = 0; i < F.length && i < nmax; i++) { out.push(F[i].t); }
    return out;
  }
  function factsPanelHtml() {
    var F = []; try { F = buildFacts(); } catch (e) { F = []; }
    if (!F.length) { return ''; }
    F.sort(function (a, b) { return b.p - a.p; });
    var h = '<div class="al-k">Datos curiosos de hoy</div><ul class="cur-l">';
    for (var i = 0; i < F.length; i++) { h += '<li>' + esc(F[i].t) + '</li>'; }
    return h + '</ul>';
  }

  /* ======================= Récords oficiales de la estación ======================= */
  /* Compara lo medido hoy en la estación con los valores extremos oficiales de AEMET (por mes y absolutos) */
  function demoExt() {
    var m = now().getMonth(), t = [], tn = [], r = [], g = [], Y = [], D = [];
    for (var i = 0; i < 13; i++) { t.push(i === m ? 17.5 : 30); tn.push(-3); r.push(90); g.push(120); Y.push('1985'); D.push('10'); }
    return { rec: { tmax: t, tmaxD: D, tmaxY: Y, tmin: tn, tminD: D, tminY: Y, rain: r, rainD: D, rainY: Y, gust: g, gustD: D, gustY: Y } };
  }
  function measuredToday() {
    if (!isHome || !STN || !obsFresh()) { return null; }
    var k = dkey(now()), h = HIST && HIST.days ? HIST.days[k] : null, o = { tmax: null, tmin: null, rain: null, gust: null };
    function mx(a, b) { return a == null ? b : (b == null ? a : Math.max(a, b)); }
    function mn(a, b) { return a == null ? b : (b == null ? a : Math.min(a, b)); }
    if (h) { o.tmax = h.tmax; o.tmin = h.tmin; o.gust = h.gust; }
    o.tmax = mx(o.tmax, STN.temp); o.tmin = mn(o.tmin, STN.temp); o.gust = mx(o.gust, STN.gust); o.rain = STN.rain_today;
    return o;
  }
  function recordState() {
    var st = { broken: [], near: [] };
    if (!EXT || !EXT.rec) { return st; }
    var R = EXT.rec, me = measuredToday(); if (!me) { return st; }
    var m = now().getMonth(), mes = MONTHS[m], name = (STN && STN.station) || 'la estación', y = String(now().getFullYear()), d = String(now().getDate());
    var defs = [
      { key: 'tmax', v: me.tmax, hi: true, what: 'calor', unit: '°', dec: 1, nearBy: function (v, r) { return v >= r - 0.5; } },
      { key: 'tmin', v: me.tmin, hi: false, what: 'frío', unit: '°', dec: 1, nearBy: function (v, r) { return v <= r + 0.5; } },
      { key: 'rain', v: me.rain, hi: true, what: 'lluvia en un día', unit: ' mm', dec: 1, nearBy: function (v, r) { return v >= r * 0.85; } },
      { key: 'gust', v: me.gust, hi: true, what: 'racha de viento', unit: ' km/h', dec: 0, nearBy: function (v, r) { return v >= r * 0.92; } }];
    for (var i = 0; i < defs.length; i++) {
      var x = defs[i], arr = R[x.key];
      if (x.v == null || !arr || arr[m] == null) { continue; }
      function beats(idx) {
        var r = arr[idx], ry = (R[x.key + 'Y'] || [])[idx], rd = (R[x.key + 'D'] || [])[idx];
        if (r == null) { return false; }
        if (String(ry) === y && String(rd) === d && (idx === m || String(R[x.key + 'M'] || '') === String(m + 1))) { return x.hi ? x.v >= r : x.v <= r; } // ya es el de hoy
        return x.hi ? x.v > r : x.v < r;
      }
      function prev(idx) { var Y2 = (R[x.key + 'Y'] || [])[idx], D2 = (R[x.key + 'D'] || [])[idx]; return fmtNum(arr[idx], x.dec) + x.unit + (Y2 ? (idx < 12 && D2 ? ' el ' + D2 + ' de ' + mes + ' de ' + Y2 : ' en ' + Y2) : ''); }
      var val = fmtNum(x.v, x.dec) + x.unit;
      if (arr[12] != null && beats(12)) { st.broken.push({ abs: true, txt: 'Récord absoluto de ' + x.what + ' en ' + name + ': ' + val + ' hoy', prev: 'el anterior: ' + prev(12) }); }
      else if (beats(m)) { st.broken.push({ abs: false, txt: 'Récord de ' + x.what + ' para un mes de ' + mes + ' en ' + name + ': ' + val + ' hoy', prev: 'el anterior: ' + prev(m) }); }
      else if (x.nearBy(x.v, arr[m])) { st.near.push('Cerca del récord de ' + x.what + ' de ' + mes + ' en ' + name + ' (' + prev(m) + '; hoy ' + val + ')'); }
    }
    return st;
  }
  function renderRecord() {
    var el = $('recbanner'); if (!el) { return; }
    var st = recordState();
    if (!st.broken.length) { el.className = ''; el.innerHTML = ''; return; }
    var h = '';
    for (var i = 0; i < st.broken.length; i++) { h += '<div class="rb-l"><b>' + esc(st.broken[i].txt) + '</b> <span>· ' + esc(st.broken[i].prev) + '</span></div>'; }
    el.innerHTML = '<span class="rb-ic">🏆</span><div class="rb-t">' + h + '<div class="rb-s">Medido en la estación de AEMET · dato provisional hasta que AEMET lo valide</div></div>';
    el.className = 'on' + (st.broken[0].abs ? ' abs' : '');
  }

  /* ======================= Fiabilidad: comparación de modelos ======================= */
  var MODELS = [['ecmwf_ifs025', 'ECMWF (europeo)'], ['gfs_seamless', 'GFS (americano)'], ['icon_seamless', 'ICON (alemán)'], ['meteofrance_seamless', 'Météo-France (AROME/ARPEGE)']];
  var CONF = null;
  function loadModels() {
    if (cfg.demo) { CONF = demoConf(); if (W) { renderDays(W.daily); renderSummary(); } return; }
    var key = 'estacion-modelos-' + (+cfg.lat).toFixed(2) + ',' + (+cfg.lon).toFixed(2), c = null;
    try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { c = null; }
    if (c && c.d && Date.now() - c.at < 3 * 3600000) { applyModels(c.d); return; }
    var ids = []; for (var i = 0; i < MODELS.length; i++) { ids.push(MODELS[i][0]); }
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lon + '&daily=temperature_2m_max,precipitation_sum&models=' + ids.join(',') +
      '&forecast_days=' + cfg.days + '&timezone=' + encodeURIComponent(TZ), function (r) {
      if (!r || !r.daily) { return; }
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), d: r.daily })); } catch (e) { /* sin espacio */ }
      applyModels(r.daily);
    }, function () { /* sin comparación de modelos */ });
  }
  function applyModels(D) {
    var out = [];
    for (var j = 0; j < D.time.length; j++) {
      var ms = [], tmin = 99, tmax = -99, wet = 0, dry = 0, pmax = 0;
      for (var m = 0; m < MODELS.length; m++) {
        var t = (D['temperature_2m_max_' + MODELS[m][0]] || [])[j], p = (D['precipitation_sum_' + MODELS[m][0]] || [])[j];
        if (t == null) { continue; }
        ms.push({ name: MODELS[m][1], t: t, p: p || 0 });
        tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); pmax = Math.max(pmax, p || 0);
        if ((p || 0) >= 1) { wet++; } else if ((p || 0) < 0.3) { dry++; }
      }
      if (ms.length < 2) { out.push(null); continue; }
      var spread = tmax - tmin, agree = wet === ms.length || dry === ms.length || (wet === 0 && pmax < 1);
      var lvl = spread <= 2 && agree ? 'alta' : ((spread > 4 || (!agree && pmax >= 5)) ? 'baja' : 'media');
      var why = lvl === 'alta' ? 'Los ' + ms.length + ' modelos coinciden' : (!agree ? 'No coinciden en si lloverá' : 'Hasta ' + Math.round(spread) + '° de diferencia en la máxima');
      out.push({ date: String(D.time[j]), lvl: lvl, why: why, spread: spread, models: ms });
    }
    CONF = out;
    if (W) { renderDays(W.daily); renderSummary(); }
  }
  function confFor(key) { if (!CONF) { return null; } for (var i = 0; i < CONF.length; i++) { if (CONF[i] && CONF[i].date === key) { return CONF[i]; } } return null; }
  function demoConf() {
    var lv = ['alta', 'alta', 'media', 'alta', 'baja', 'media', 'baja', 'baja'], out = [], b = now();
    for (var j = 0; j < 8; j++) {
      var d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + j);
      out.push({ date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), lvl: lv[j], why: lv[j] === 'alta' ? 'Los 4 modelos coinciden' : (lv[j] === 'media' ? 'Hasta 3° de diferencia en la máxima' : 'No coinciden en si lloverá'),
        models: [{ name: 'ECMWF (europeo)', t: 19, p: lv[j] === 'baja' ? 6 : 0 }, { name: 'GFS (americano)', t: lv[j] === 'media' ? 22 : 19.5, p: 0 }, { name: 'ICON (alemán)', t: 19, p: lv[j] === 'baja' ? 3 : 0 }, { name: 'Météo-France (AROME/ARPEGE)', t: 18.6, p: 0 }] });
    }
    return out;
  }
  function confHtml(c) {
    if (!c) { return ''; }
    var rows = '';
    for (var i = 0; i < c.models.length; i++) { rows += '<tr><td>' + esc(c.models[i].name) + '</td><td>' + Math.round(c.models[i].t) + '°</td><td>' + (c.models[i].p >= 0.1 ? mmTxt(c.models[i].p) + ' mm' : 'nada') + '</td></tr>'; }
    return '<div class="al-k">Fiabilidad: <span class="cf ' + c.lvl + '">' + c.lvl + '</span> · ' + esc(c.why) + '</div>' +
      '<table class="sun-t mdl"><tr><th>Modelo</th><th>Máx.</th><th>Lluvia</th></tr>' + rows + '</table>';
  }

  /* ======================= Clima: normales (1991–2020), récords (desde 1940) y lluvia normal ======================= */
  /* Una sola petición grande a la API histórica de Open-Meteo (ERA5), guardada 60 días en la tablet */
  var NORM = null, YEAR = null, normTriedFile = false;
  function normKey() { return 'estacion-clima-v3-' + (+cfg.lat).toFixed(1) + ',' + (+cfg.lon).toFixed(1); }
  function doy(d) { var s0 = new Date(d.getFullYear(), 0, 1); var k = Math.floor((d - s0) / 86400000); var leap = new Date(d.getFullYear(), 1, 29).getMonth() === 1; if (leap && k >= 59) { k--; } return Math.max(0, Math.min(364, k)); }
  function loadNormals() {
    if (cfg.demo) {
      NORM = { mx: [], mn: [], rn: [], rmx: [], rmxY: [], rmn: [], rmnY: [] };
      for (var q = 0; q < 365; q++) {
        var sn = Math.sin((q - 105) / 365 * 2 * Math.PI);
        NORM.mx.push(17 + 9 * sn); NORM.mn.push(9 + 8 * sn); NORM.rn.push(q > 240 && q < 320 ? 2.6 : 1.2);
        NORM.rmx.push(27 + 9 * sn); NORM.rmxY.push(1940 + q % 80); NORM.rmn.push(-1 + 8 * sn); NORM.rmnY.push(1956 + q % 60);
      }
      YEAR = { at: Date.now(), year: now().getFullYear(), days: [] };
      for (q = 0; q <= doy(now()); q++) { YEAR.days.push(q % 9 === 0 ? 6 : (q % 13 === 0 ? 3 : 0)); }
      renderSummary(); return;
    }
    var c = null;
    try { c = JSON.parse(localStorage.getItem(normKey()) || 'null'); } catch (e) { c = null; }
    if (c && c.mx && c.rmx && Date.now() - c.at < (c.pmx || !isHome ? 60 * 86400000 : 86400000)) { NORM = c; renderSummary(); }
    else if (isHome && cfg.climaUrl && !normTriedFile) {
      /* en casa: archivo ya calculado por GitHub (pocos KB) en vez de 80 años de datos */
      normTriedFile = true;
      getJSON(cfg.climaUrl + '?t=' + Math.floor(Date.now() / 86400000), function (d) {
        if (!d || !d.mx || !d.rmx) { loadNormals(); return; }
        NORM = { at: Date.now(), mx: d.mx, mn: d.mn, rn: d.rn, rmx: d.rmx, rmxY: d.rmxY, rmn: d.rmn, rmnY: d.rmnY, pmx: d.pmx || null, pmn: d.pmn || null };
        try { localStorage.setItem(normKey(), JSON.stringify(NORM)); } catch (e) { /* sin espacio */ }
        renderSummary();
      }, function () { loadNormals(); });
      loadYearRain();
      return;
    }
    else {
      NORM = null;
      var y1 = now().getFullYear() - 1;
      getJSON('https://archive-api.open-meteo.com/v1/archive?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
        '&start_date=1940-01-01&end_date=' + y1 + '-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=' + encodeURIComponent(TZ), function (r) {
        if (!r || !r.daily) { return; }
        var D = r.daily, smx = [], smn = [], srn = [], cnt = [], rmx = [], rmxY = [], rmn = [], rmnY = [], q, i;
        for (q = 0; q < 365; q++) { smx.push(0); smn.push(0); srn.push(0); cnt.push(0); rmx.push(-99); rmxY.push(0); rmn.push(99); rmnY.push(0); }
        for (i = 0; i < D.time.length; i++) {
          var a = D.temperature_2m_max[i], b = D.temperature_2m_min[i], p = D.precipitation_sum[i];
          if (a == null || b == null) { continue; }
          var t = String(D.time[i]), yr = +t.slice(0, 4), k = doy(parseLocal(t + 'T12:00'));
          if (a > rmx[k]) { rmx[k] = a; rmxY[k] = yr; }
          if (b < rmn[k]) { rmn[k] = b; rmnY[k] = yr; }
          if (yr >= 1991 && yr <= 2020) { smx[k] += a; smn[k] += b; srn[k] += p || 0; cnt[k]++; }
        }
        /* media móvil de ±7 días para las temperaturas normales; la lluvia normal, día a día (se usa acumulada) */
        var mx = [], mn = [], rn = [];
        for (q = 0; q < 365; q++) {
          var tx = 0, tn = 0, tc = 0;
          for (var w = -7; w <= 7; w++) { var j = (q + w + 365) % 365; tx += smx[j]; tn += smn[j]; tc += cnt[j]; }
          mx.push(tc ? Math.round(tx / tc * 10) / 10 : null); mn.push(tc ? Math.round(tn / tc * 10) / 10 : null);
          rn.push(cnt[q] ? Math.round(srn[q] / cnt[q] * 100) / 100 : 0);
        }
        NORM = { at: Date.now(), mx: mx, mn: mn, rn: rn, rmx: rmx, rmxY: rmxY, rmn: rmn, rmnY: rmnY };
        try { localStorage.setItem(normKey(), JSON.stringify(NORM)); } catch (e) { /* sin espacio */ }
        renderSummary();
      }, function () { /* se vuelve a intentar al recargar */ }, 90000);
    }
    loadYearRain();
  }
  /* lluvia de este año, día a día (archivo de las previsiones de Open-Meteo, llega hasta hoy); 6 h en la tablet */
  function loadYearRain() {
    if (cfg.demo) { return; }
    var key = 'estacion-anyo-' + (+cfg.lat).toFixed(1) + ',' + (+cfg.lon).toFixed(1), c = null, y = now().getFullYear();
    try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { c = null; }
    if (c && c.year === y && Date.now() - c.at < 6 * 3600000) { YEAR = c; return; }
    var d = now(), end = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    getJSON('https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
      '&start_date=' + y + '-01-01&end_date=' + end + '&daily=precipitation_sum&timezone=' + encodeURIComponent(TZ), function (r) {
      if (!r || !r.daily) { return; }
      var days = [];
      for (var i = 0; i < r.daily.time.length; i++) { var k = doy(parseLocal(r.daily.time[i] + 'T12:00')); days[k] = (days[k] || 0) + (r.daily.precipitation_sum[i] || 0); }
      for (i = 0; i < days.length; i++) { if (days[i] == null) { days[i] = 0; } }
      YEAR = { at: Date.now(), year: y, days: days };
      try { localStorage.setItem(key, JSON.stringify(YEAR)); } catch (e) { /* sin espacio */ }
    }, function () { /* sin datos del año */ }, 45000);
  }
  /* lluvia del año hasta hoy y lo normal hasta hoy */
  function yearRain() {
    var st = yearRainStation();
    if ((!YEAR || !YEAR.days.length) && st == null) { return null; }
    var k = doy(now()), tot = 0, nrm = 0, i;
    if (st != null) { tot = st; } else { for (i = 0; i <= k && i < YEAR.days.length; i++) { tot += YEAR.days[i]; } }
    if (NORM && NORM.rn) { for (i = 0; i <= k; i++) { nrm += NORM.rn[i] || 0; } }
    return { tot: tot, nrm: nrm, pct: nrm > 0 ? Math.round((tot / nrm - 1) * 100) : null, measured: st != null };
  }
  /* récords del día de hoy */
  function todayRecord(j) {
    if (!NORM || !NORM.rmx || !W || !W.daily.time[j]) { return null; }
    var k = doy(parseLocal(W.daily.time[j] + 'T12:00'));
    return { mx: NORM.rmx[k], mxY: NORM.rmxY[k], mn: NORM.rmn[k], mnY: NORM.rmnY[k], nmx: NORM.mx[k], nmn: NORM.mn[k] };
  }
  /* diferencia de la máxima prevista de un día con lo normal (null si no hay datos) */
  function vsNormal(j) {
    if (!NORM || !W || !W.daily.time[j]) { return null; }
    var n = NORM.mx[doy(parseLocal(W.daily.time[j] + 'T12:00'))];
    return n == null ? null : W.daily.temperature_2m_max[j] - n;
  }

  /* ======================= Resumen en una frase ======================= */
  var SUMMARY = '', SUMEXTRA = [], sumIdx = 0, sumTimer = null;
  function skyOf(code) {
    if (code >= 95) { return 'storm'; }
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { return 'rain'; }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) { return 'snow'; }
    if (code === 45 || code === 48) { return 'fog'; }
    if (code <= 1) { return 'clear'; }
    return code === 2 ? 'mixed' : 'cloudy';
  }
  function skyWord(cat, night) {
    return { clear: night ? 'despejado' : 'soleado', mixed: 'nubes y claros', cloudy: 'nublado', fog: 'niebla', rain: 'lluvia', snow: 'nieve', storm: 'tormentas' }[cat];
  }
  function intensityWord(mmh) { return mmh >= 4 ? 'fuerte' : (mmh >= 1 ? 'moderada' : 'débil'); }
  /* describe un tramo de horas [a, b] del modelo */
  function describeSpan(a, b, night) {
    var h = W.hourly, cnt = {}, best = 'clear', bn = 0, first = -1, last = -1, mx = 0, storm = false, tmax = -99, tmin = 99, wetN = 0, tot = 0, i;
    for (i = a; i <= b && i < h.time.length; i++) {
      tot++;
      var wet = (h.precipitation[i] || 0) >= 0.2 || ((h.precipitation_probability[i] || 0) >= 60 && (h.precipitation[i] || 0) >= 0.1);
      if (wet) { wetN++; if (first < 0) { first = i; } last = i; mx = Math.max(mx, h.precipitation[i] || 0); if (h.weather_code[i] >= 95) { storm = true; } }
      var c = skyOf(h.weather_code[i]);
      if (c !== 'rain' && c !== 'storm') { cnt[c] = (cnt[c] || 0) + 1; if (cnt[c] > bn) { bn = cnt[c]; best = c; } }
      tmax = Math.max(tmax, h.temperature_2m[i]); tmin = Math.min(tmin, h.temperature_2m[i]);
    }
    return { first: first, last: last, mx: mx, storm: storm, sky: skyWord(best, night), mostlyWet: wetN * 2 >= tot, tmax: tmax, tmin: tmin };
  }
  function hNum(i) { return parseLocal(W.hourly.time[i]).getHours(); }
  /* «lluvia moderada de 18 a 23 h», «lloviendo hasta las 20 h», «lluvia débil desde las 21 h» */
  function rainPhrase(sp, a, b) {
    var what = sp.storm ? 'tormentas' : 'lluvia ' + intensityWord(sp.mx);
    if (sp.first <= a) { return (sp.storm ? 'tormentas' : 'lloviendo') + (sp.last >= b ? '' : ' hasta las ' + hNum(sp.last + 1) + ' h'); }
    if (sp.last >= b) { return what + ' desde las ' + hNum(sp.first) + ' h'; }
    return what + ' de ' + hNum(sp.first) + ' a ' + hNum(sp.last + 1) + ' h';
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function lastIdxOfDay(key) { var h = W.hourly, k = -1; for (var i = 0; i < h.time.length; i++) { if (String(h.time[i]).slice(0, 10) === key) { k = i; } } return k; }
  function spanText(sp, a, b) {
    if (sp.first < 0) { return sp.sky; }
    if (sp.mostlyWet || sp.first <= a) { return rainPhrase(sp, a, b); }
    return sp.sky + '; ' + rainPhrase(sp, a, b);
  }
  function normalTxt(j, label) {
    var d = vsNormal(j);
    if (d == null || Math.abs(d) < 2) { return ''; }
    return label + ' ' + Math.round(Math.abs(d)) + '° ' + (d > 0 ? 'por encima' : 'por debajo') + ' de lo normal para la época';
  }
  function buildSummary() {
    if (!W) { return ''; }
    var h = W.hourly, dl = W.daily, idx = hourIndex(h, W.current), n = now(), hr = n.getHours(), out = [], sp, nt = '';
    if (!isEvening()) {
      var end = lastIdxOfDay(String(dl.time[0]));
      sp = describeSpan(dryNow ? Math.min(idx + 1, end) : idx, end, false);
      var head = hr < 13 ? 'Hoy' : 'Esta tarde';
      out.push(head + ': ' + spanText(sp, dryNow ? Math.min(idx + 1, end) : idx, end) + (hr < 15 ? ', máxima de ' + Math.round(dl.temperature_2m_max[0]) + '°' : ''));
      nt = normalTxt(0, 'Máxima de hoy');
      if (hr >= 14) { out.push(tomorrowPhrase(1)); }
    } else {
      var j = hr < 12 ? 0 : 1, tonightEnd = Math.min(h.time.length - 1, idx + (hr < 12 ? Math.max(0, 7 - hr) : 31 - hr));
      if (hr >= 12) { sp = describeSpan(idx, tonightEnd, true); out.push('Esta noche: ' + spanText(sp, idx, tonightEnd) + ', mínima de ' + Math.round(sp.tmin) + '°'); }
      out.push(tomorrowPhrase(j));
      nt = normalTxt(j, j === 0 ? 'Máxima de hoy' : 'Máxima de mañana');
    }
    var gmax = 0, gi = -1;
    if (h.wind_gusts_10m) { for (var q = idx; q <= idx + 12 && q < h.time.length; q++) { if ((h.wind_gusts_10m[q] || 0) > gmax) { gmax = h.wind_gusts_10m[q]; gi = q; } } }
    if (gmax >= 50) { out.push('Rachas de hasta ' + Math.round(gmax) + ' km/h' + (gi > idx ? ' hacia las ' + hNum(gi) + ' h' : ' ahora')); }
    /* lo esencial va en la frase; lo demás (curiosidades, comparaciones) va aparte, de uno en uno */
    var ctm = W.daily.time[1] ? confFor(String(W.daily.time[1])) : null;
    if (ctm && ctm.lvl === 'baja' && (isEvening() || hr >= 14)) { out.push('Previsión de mañana poco fiable'); }
    var ex = [], nr = recordState().near, tf = topFacts(3), q2;
    for (q2 = 0; q2 < nr.length; q2++) { ex.push(nr[q2]); }
    for (q2 = 0; q2 < tf.length; q2++) { ex.push(tf[q2]); }
    var rare = false; for (q2 = 0; q2 < tf.length; q2++) { if (/excepcionalmente|muy cálido|muy frío/.test(tf[q2])) { rare = true; } }
    if (nt && !rare) { ex.push(nt); }
    if (idx >= 24) {
      var dy = W.current.temperature_2m - h.temperature_2m[idx - 24];
      if (Math.abs(dy) >= 4) { ex.push(Math.round(Math.abs(dy)) + '° ' + (dy > 0 ? 'más' : 'menos') + ' que ayer a esta hora'); }
    }
    SUMEXTRA = ex;
    return out.join('. ') + '.';
  }
  function tomorrowPhrase(j) {
    var dl = W.daily, h = W.hourly, key = String(dl.time[j]);
    if (!dl.time[j]) { return ''; }
    var word = sameDay(parseLocal(key + 'T12:00'), now()) ? 'Hoy' : 'Mañana';
    var a = -1, b = -1;
    for (var i = 0; i < h.time.length; i++) { if (String(h.time[i]).slice(0, 10) === key) { var hh = parseInt(String(h.time[i]).slice(11, 13), 10); if (hh === 7) { a = i; } if (hh === 23) { b = i; } } }
    var sp = a >= 0 && b >= 0 ? describeSpan(a, b, false) : null, temps = Math.round(dl.temperature_2m_max[j]) + '° / ' + Math.round(dl.temperature_2m_min[j]) + '°';
    if (sp && sp.first >= 0) {
      var parts = dayParts(h, key), wetP = [];
      for (var q = 0; q < parts.length; q++) { if (parts[q].p >= 50 || parts[q].mm >= 0.5) { wetP.push(parts[q].name === 'Mañana' ? 'por la mañana' : parts[q].name === 'Tarde' ? 'por la tarde' : 'por la noche'); } }
      var rw = (sp.storm ? 'tormentas' : 'lluvia ' + intensityWord(sp.mx)) + (wetP.length && wetP.length < 3 ? ' ' + wetP.join(' y ') : '');
      return word + ': ' + (sp.mostlyWet ? rw : sp.sky + ', ' + rw) + ', ' + temps;
    }
    return word + ': ' + (sp ? sp.sky : skyWord(skyOf(dl.weather_code[j]), false)) + ', ' + temps + ', sin lluvia';
  }
  function renderSummary() {
    try { SUMMARY = buildSummary(); } catch (e) { SUMMARY = ''; }
    placeSummary();
  }
  /* sin avisos: la frase va dentro de la franja verde; con aviso, en una línea propia debajo */
  function extraHtml() {
    if (!SUMEXTRA.length) { return ''; }
    var t = SUMEXTRA[sumIdx % SUMEXTRA.length];
    return '<span class="sx" id="sumx">✨ ' + esc(t) + (SUMEXTRA.length > 1 ? ' <i>' + (sumIdx % SUMEXTRA.length + 1) + '/' + SUMEXTRA.length + '</i>' : '') + '</span>';
  }
  /* sin avisos: la frase va dentro de la franja verde; con aviso, en una línea propia debajo.
     Debajo, en pequeño, un dato curioso que va cambiando cada 12 s (al tocarlo se abre la lista) */
  function placeSummary() {
    var col = $('col-alert'), el = $('summary');
    if (!el) { return; }
    var calm = col.className.indexOf(' calm') >= 0 && col.className.indexOf('gray') < 0;
    if (calm && SUMMARY) {
      col.className += ' sum';
      col.innerHTML = lineIcon(I_CHECK, '#3DDC84') + '<span class="calm-t"><span class="sm">' + esc(SUMMARY) + extraHtml() + '</span><span class="sz">Sin avisos AEMET</span></span>';
      el.className = ''; el.textContent = '';
    } else {
      el.innerHTML = esc(SUMMARY) + extraHtml();
      el.className = SUMMARY ? 'on' : '';
    }
    var sx = $('sumx'); if (sx) { sx.onclick = function (ev) { if (ev.stopPropagation) { ev.stopPropagation(); } openHistory(); }; }
    clearTimeout(sumTimer);
    if (SUMEXTRA.length > 1) { sumTimer = setTimeout(function () { sumIdx++; var x = $('sumx'); if (x) { x.outerHTML = extraHtml(); var y = $('sumx'); if (y) { y.onclick = function (ev) { if (ev.stopPropagation) { ev.stopPropagation(); } openHistory(); }; } } placeSummaryTick(); }, 12000); }
  }
  function placeSummaryTick() {
    clearTimeout(sumTimer);
    if (SUMEXTRA.length > 1) { sumTimer = setTimeout(function () { sumIdx++; var x = $('sumx'); if (x) { x.outerHTML = extraHtml(); var y = $('sumx'); if (y) { y.onclick = function (ev) { if (ev.stopPropagation) { ev.stopPropagation(); } openHistory(); }; } } placeSummaryTick(); }, 12000); }
  }

  /* ======================= Satélite (nubes) ======================= */
  /* Imagen Geo Colour de Meteosat (MTG) de EUMETView: color real de día, infrarrojo de noche; pública y gratuita */
  var satLayer = null, satOn = false;
  function initSatellite() {
    var btn = $('sat-btn');
    if (!btn) { return; }
    try { satOn = localStorage.getItem('estacion-satelite') === '1'; } catch (e) { satOn = false; }
    btn.onclick = function (ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } satOn = !satOn; try { localStorage.setItem('estacion-satelite', satOn ? '1' : '0'); } catch (e) { /* nada */ } applySatellite(); };
    applySatellite();
    (function satTick() { setTimeout(function () { refreshSatellite(); satTick(); }, Math.max(1000, nextSlot() + 60000 - Date.now())); })();
    /* la imagen se carga siempre en segundo plano (invisible si las nubes están apagadas): al pulsar el botón sale al momento */
    if (!satOn) { setTimeout(refreshSatellite, 8000); }
    if (map) { map.on('moveend', function () { clearTimeout(satTimer); satTimer = setTimeout(refreshSatellite, 1500); }); }
  }
  /* Una sola imagen para todo el mapa (no decenas de teselas): mucho más ligera para la tablet */
  var satTimer = null;
  /* --- Nubes animadas: imágenes cada 20 min de las últimas 2 h, sincronizadas con el radar observado --- */
  var satSet = null, satShown = '';
  function satLatest() { var t = Math.floor(Date.now() / 1000); return Math.floor((t - 1800) / 1200) * 1200; } // MTG llega con ~30 min de retraso
  function satTimeFor(t) { return Math.min(Math.floor(t / 1200) * 1200, satLatest()); }
  function isoZ(t) { var d = new Date(t * 1000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':00Z'; }
  function preloadSatFrames() {
    if (!satOn || !satLayer || cfg.demo || !obsFrames.length || LOWMEM) { return; } // en la tablet, solo la última imagen
    var u = satUrl(), base = u.url.replace(/&_t=\d+/, '');
    if (!satSet || satSet.base !== base) { satSet = { base: base, bounds: u.bounds, ready: {}, loading: {} }; }
    for (var k = 0; k < obsFrames.length; k++) {
      var st = satTimeFor(obsFrames[k].time);
      if (satSet.ready[st] || satSet.loading[st]) { continue; }
      satSet.loading[st] = true;
      (function (st2) {
        var im = new Image();
        im.onload = function () { if (satSet) { satSet.ready[st2] = satSet.base + '&time=' + isoZ(st2); } };
        im.src = satSet.base + '&time=' + isoZ(st2);
      })(st);
    }
  }
  /* al mostrar cada fotograma: imagen de satélite de esa hora (si ya está cargada); fuera de lo observado, la última */
  function syncSatellite(f) {
    if (!satOn || !satLayer || !f) { return; }
    var url = null;
    if (playing && f.kind === 'obs' && satSet) { url = satSet.ready[satTimeFor(f.time)] || null; }
    if (!url) { url = satLayer._latestUrl; }
    if (url && url !== satShown) { satShown = url; satLayer.setUrl(url); }
  }
  function satUrl() {
    var bnd = map.getBounds().pad(0.25), sz = map.getSize();
    var sw = L.CRS.EPSG3857.project(bnd.getSouthWest()), ne = L.CRS.EPSG3857.project(bnd.getNorthEast());
    var sc = LOWMEM ? 0.5 : 0.75, w = Math.min(1024, Math.round(sz.x * 1.5 * sc)), h = Math.min(1024, Math.round(sz.y * 1.5 * sc));
    return { bounds: bnd, url: 'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=' + (cfg.satLayer || 'mtg_fd:rgb_geocolour') +
      '&styles=&crs=EPSG:3857&bbox=' + [sw.x, sw.y, ne.x, ne.y].map(function (v) { return Math.round(v); }).join(',') +
      '&width=' + w + '&height=' + h + '&format=image/jpeg&_t=' + Math.floor(Date.now() / 600000) };
  }
  function refreshSatellite() {
    if (cfg.demo || !map) { return; }
    var u = satUrl(), img = new Image();
    if (satOn) { $('sat-btn').className = 'on loading'; }
    img.onload = function () {
      /* la imagen ya está descargada entera: se coloca esa misma imagen (sin volver a pedirla ni verla cargar a medias) */
      satSet = null; satShown = u.url;
      var nl = L.imageOverlay(img, u.bounds, { pane: 'tilePane', opacity: satOn ? 0.8 : 0, interactive: false, attribution: 'Satélite &copy; EUMETSAT' }).addTo(map);
      nl.getElement().style.zIndex = 5;
      if (satLayer) { map.removeLayer(satLayer); }
      satLayer = nl;
      satLayer._latestUrl = u.url; satLayer._latestImg = img;
      if (satOn) { $('sat-btn').className = 'on'; if (playing) { preloadSatFrames(); } }
    };
    img.onerror = function () { if (satOn) { $('sat-btn').className = 'on err'; } };
    img.src = u.url;
  }
  function applySatellite() {
    var btn = $('sat-btn');
    btn.className = satOn ? 'on' : '';
    if (cfg.demo || !map) { return; }
    if (satLayer) { satLayer.setOpacity(satOn ? 0.8 : 0); if (satOn && satShown !== satLayer._latestUrl) { satLayer.setUrl(satLayer._latestUrl); satShown = satLayer._latestUrl; } }
    else if (satOn) { refreshSatellite(); }
  }

  /* ======================= Viento animado en el mapa ======================= */
  /* Partículas que siguen el viento del modelo (rejilla de Open-Meteo de la hora actual). Pocas en la tablet. */
  var LOWMEM = (navigator.deviceMemory && navigator.deviceMemory <= 1) || /Android [4-7]/.test(navigator.userAgent);
  var windGen = 0, windOn = false, windCv = null, windCtx = null, windParts = [], windField = null, windFieldDirty = true, windRun = false, windLast = 0, windMoving = false;
  function initWind() {
    var btn = $('wind-btn');
    if (!btn) { return; }
    try { windOn = localStorage.getItem('estacion-viento') === '1'; } catch (e) { windOn = false; }
    btn.onclick = function (ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } windOn = !windOn; try { localStorage.setItem('estacion-viento', windOn ? '1' : '0'); } catch (e) { /* nada */ } applyWind(); };
    map.on('movestart zoomstart', function () { windMoving = true; if (windCtx) { windCtx.clearRect(0, 0, windCv.width, windCv.height); } });
    map.on('moveend zoomend resize', function () { windMoving = false; windFieldDirty = true; placeWindCanvas(); });
    applyWind();
  }
  function applyWind() {
    $('wind-btn').className = windOn ? 'on' : '';
    if (windOn) {
      if (!windCv) {
        map.createPane('wind'); map.getPane('wind').style.zIndex = 440; map.getPane('wind').style.pointerEvents = 'none';
        windCv = document.createElement('canvas'); windCv.className = 'wind-cv';
        map.getPane('wind').appendChild(windCv); windCtx = windCv.getContext('2d');
      }
      windCv.style.display = 'block'; placeWindCanvas(); loadWideWind();
      if (!windRun) { windRun = true; windGen++; windLoop(windGen); }
    } else {
      windRun = false;
      if (windCv) { windCv.style.display = 'none'; windCtx.clearRect(0, 0, windCv.width, windCv.height); }
    }
  }
  function placeWindCanvas() {
    if (!windCv || !windOn) { return; }
    var sz = map.getSize(), R = LOWMEM ? 0.5 : 1;
    windCv.width = Math.round(sz.x * R); windCv.height = Math.round(sz.y * R);
    windCv.style.width = sz.x + 'px'; windCv.style.height = sz.y + 'px';
    L.DomUtil.setPosition(windCv, map.containerPointToLayerPoint([0, 0]));
    windParts = [];
  }
  /* Rejilla gruesa para toda la península y Baleares (cada 1,5°), solo para el viento animado:
     así se ven líneas aunque muevas el mapa lejos de casa. Se pide al encender el viento y se guarda 3 h. */
  var WIDE = { lat0: 45.5, lon0: -9.5, rows: 8, cols: 12, d: 1.5 }, WIDELIST = null, wideBusy = false;
  function loadWideWind() {
    if (wideBusy || cfg.demo) { return; }
    var key = 'estacion-viento-amplio', c = null;
    try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { c = null; }
    if (c && c.list && Date.now() - c.at < 3 * 3600000) { WIDELIST = c.list; windFieldDirty = true; return; }
    var la = [], lo = [], r, k;
    for (r = 0; r < WIDE.rows; r++) { for (k = 0; k < WIDE.cols; k++) { la.push((WIDE.lat0 - r * WIDE.d).toFixed(2)); lo.push((WIDE.lon0 + k * WIDE.d).toFixed(2)); } }
    wideBusy = true;
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + la.join(',') + '&longitude=' + lo.join(',') + '&hourly=wind_speed_10m,wind_direction_10m&forecast_hours=6&timeformat=unixtime&timezone=GMT', function (d) {
      wideBusy = false;
      if (!d || !d.length || !d[0].hourly) { return; }
      var out = [];
      for (var t = 0; t < d[0].hourly.time.length; t++) {
        var ws = [], wd = [];
        for (var p2 = 0; p2 < d.length; p2++) { ws.push(Math.round(d[p2].hourly.wind_speed_10m[t] || 0)); wd.push(Math.round(d[p2].hourly.wind_direction_10m[t] || 0)); }
        out.push({ time: d[0].hourly.time[t], ws: ws, wd: wd });
      }
      WIDELIST = out; windFieldDirty = true;
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list: out })); } catch (e) { /* sin espacio */ }
    }, function () { wideBusy = false; });
  }
  function wideAt(lat, lon) {
    if (!WIDELIST || !WIDELIST.length) { return null; }
    var t = Date.now() / 1000, entry = WIDELIST[0];
    for (var k = 0; k < WIDELIST.length; k++) { if (WIDELIST[k].time <= t + 1800) { entry = WIDELIST[k]; } }
    var gy = (WIDE.lat0 - lat) / WIDE.d, gx = (lon - WIDE.lon0) / WIDE.d;
    if (gx < 0 || gy < 0 || gx > WIDE.cols - 1 || gy > WIDE.rows - 1) { return null; }
    var c0 = Math.floor(gx), r0 = Math.floor(gy), c1 = Math.min(c0 + 1, WIDE.cols - 1), r1 = Math.min(r0 + 1, WIDE.rows - 1), tx = gx - c0, ty = gy - r0;
    function uv(r, c) { var i = r * WIDE.cols + c, sp = entry.ws[i], dd = entry.wd[i] * Math.PI / 180; return [-sp * Math.sin(dd), -sp * Math.cos(dd)]; }
    var a = uv(r0, c0), b = uv(r0, c1), c = uv(r1, c0), e = uv(r1, c1);
    return [(a[0] * (1 - tx) + b[0] * tx) * (1 - ty) + (c[0] * (1 - tx) + e[0] * tx) * ty, (a[1] * (1 - tx) + b[1] * tx) * (1 - ty) + (c[1] * (1 - tx) + e[1] * tx) * ty];
  }
  /* viento (u, v en km/h) en un punto, interpolado en la rejilla */
  function windAt(entry, lat, lon) {
    var la0 = cfg.lat + (GRID.rows - 1) / 2 * GRID.dLat, lo0 = cfg.lon - (GRID.cols - 1) / 2 * GRID.dLon;
    var gy = (la0 - lat) / GRID.dLat, gx = (lon - lo0) / GRID.dLon;
    if (gx < 0 || gy < 0 || gx > GRID.cols - 1 || gy > GRID.rows - 1) { return null; }
    var c0 = Math.floor(gx), r0 = Math.floor(gy), c1 = Math.min(c0 + 1, GRID.cols - 1), r1 = Math.min(r0 + 1, GRID.rows - 1), tx = gx - c0, ty = gy - r0;
    function uv(r, c) { var i = r * GRID.cols + c, sp = entry.ws[i], dd = entry.wd[i] * Math.PI / 180; return [-sp * Math.sin(dd), -sp * Math.cos(dd)]; }
    var a = uv(r0, c0), b = uv(r0, c1), c = uv(r1, c0), e = uv(r1, c1);
    var u = (a[0] * (1 - tx) + b[0] * tx) * (1 - ty) + (c[0] * (1 - tx) + e[0] * tx) * ty;
    var v = (a[1] * (1 - tx) + b[1] * tx) * (1 - ty) + (c[1] * (1 - tx) + e[1] * tx) * ty;
    return [u, v];
  }
  /* campo en pantalla cada 20 px (se recalcula al mover el mapa o al cambiar de hora) */
  function buildWindField() {
    windFieldDirty = false; windField = null;
    var t = Date.now() / 1000, entry = null;
    if (GRIDLIST && GRIDLIST.length && GRIDLIST[0].ws) { entry = GRIDLIST[0]; for (var k = 0; k < GRIDLIST.length; k++) { if (GRIDLIST[k].time <= t + 1800) { entry = GRIDLIST[k]; } } }
    if (!entry && !WIDELIST) { return; }
    var sz = map.getSize(), S = 20, cols = Math.ceil(sz.x / S) + 1, rows = Math.ceil(sz.y / S) + 1, f = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var ll = map.containerPointToLatLng([c * S, r * S]), w = entry ? windAt(entry, ll.lat, ll.lng) : null;
        if (!w) { w = wideAt(ll.lat, ll.lng); }
        f.push(w ? [w[0], -w[1], Math.sqrt(w[0] * w[0] + w[1] * w[1])] : null);
      }
    }
    windField = { S: S, cols: cols, rows: rows, f: f, hour: Math.floor(t / 3600) };
  }
  function fieldAt(x, y) {
    var F = windField, R = LOWMEM ? 0.5 : 1, c = Math.round(x / R / F.S), r = Math.round(y / R / F.S);
    if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) { return null; }
    return F.f[r * F.cols + c];
  }
  function newPart(w, h) { return { x: Math.random() * w, y: Math.random() * h, age: Math.floor(Math.random() * 80) }; }
  function windLoop(gen) {
    if (!windRun || gen !== windGen) { return; }
    var lowMem = LOWMEM, tnow = Date.now();
    if (!document.hidden && !windMoving && tnow - windLast >= (lowMem ? 45 : 33)) {
      windLast = tnow;
      if (windField && windField.hour !== Math.floor(tnow / 3600000)) { loadWideWind(); }
      if (windFieldDirty || !windField || windField.hour !== Math.floor(tnow / 3600000)) { buildWindField(); }
      if (windField) {
        var W2 = windCv.width, H2 = windCv.height, N = Math.round(W2 * H2 / (lowMem ? 900 : 1600)), ctx = windCtx, k, p, R = lowMem ? 0.5 : 1;
        while (windParts.length < N) { windParts.push(newPart(W2, H2)); }
        ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, W2, H2);
        ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = lowMem ? 1 : 1.3; ctx.lineCap = 'round';
        var paths = [[], [], []];
        for (k = 0; k < windParts.length; k++) {
          p = windParts[k];
          var v = fieldAt(p.x, p.y);
          if (!v || p.age++ > 90) { windParts[k] = newPart(W2, H2); windParts[k].age = 0; continue; }
          var nx = p.x + v[0] * 0.09 * R, ny = p.y + v[1] * 0.09 * R;
          paths[v[2] >= 50 ? 2 : (v[2] >= 25 ? 1 : 0)].push(p.x, p.y, nx, ny);
          p.x = nx; p.y = ny;
        }
        var cols = ['rgba(220,232,250,0.55)', 'rgba(255,214,140,0.75)', 'rgba(255,120,90,0.85)'];
        for (var q = 0; q < 3; q++) {
          if (!paths[q].length) { continue; }
          ctx.strokeStyle = cols[q]; ctx.beginPath();
          for (k = 0; k < paths[q].length; k += 4) { ctx.moveTo(paths[q][k], paths[q][k + 1]); ctx.lineTo(paths[q][k + 2], paths[q][k + 3]); }
          ctx.stroke();
        }
      }
    }
    (window.requestAnimationFrame || function (fn) { return setTimeout(fn, 40); })(function () { windLoop(gen); });
  }

  /* ======================= Vigilancia: la tablet se recupera sola ======================= */
  /* - Si los timers se congelan (tablet dormida, WebView en pausa), al volver se refresca todo al momento.
     - Si los datos llevan más de 35 min sin actualizarse habiendo conexión, se recarga la página
       (como mucho una vez cada 20 min, para no entrar en bucle). */
  function watchdog() {
    var last = Date.now();
    setInterval(function () {
      var t = Date.now(), gap = t - last; last = t;
      if (gap > 90000) { refreshAll(); return; }
      var stale = lastOk && t - lastOk > 35 * 60000;
      if (stale && navigator.onLine !== false && !cfg.demo) {
        var prev = 0; try { prev = +sessionStorage.getItem('estacion-recarga') || 0; } catch (e) { prev = 0; }
        if (t - prev > 20 * 60000) {
          try { sessionStorage.setItem('estacion-recarga', String(t)); } catch (e) { /* nada */ }
          location.reload();
        } else { refreshAll(); }
      }
    }, 15000);
    window.addEventListener('online', refreshAll);
  }
  function refreshAll() {
    if (cfg.demo) { return; }
    weatherFails = 0; radarFails = 0;
    clearTimeout(weatherTimer); clearTimeout(radarTimer);
    loadWeather(); loadRadar(); loadAlerts(); loadObs(); loadHist();
  }

  /* ======================= Protector de pantalla ======================= */
  /* cada 3 min desplaza todo unos pocos píxeles en círculo para que la pantalla no quede marcada */
  function antiBurn() {
    var pos = [[0, 0], [2, 1], [3, -1], [1, -3], [-2, -2], [-3, 1], [-1, 3], [2, 3]], k = 0;
    setInterval(function () {
      if (isCompact() || full) { return; } // solo en la tablet fija y con el mapa normal
      k = (k + 1) % pos.length;
      var t = 'translate(' + pos[k][0] + 'px, ' + pos[k][1] + 'px)';
      var a = $('app'); a.style.webkitTransform = t; a.style.transform = t;
    }, 180000);
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
      c.mm = 0; c.p = 0; c.code = 0; c.ws = 0; c.wg = 0;
      for (j = c.i; j < c.i + c.n; j++) {
        if (h.wind_speed_10m) { c.ws = Math.max(c.ws, h.wind_speed_10m[j] || 0); }
        if (h.wind_gusts_10m) { c.wg = Math.max(c.wg, h.wind_gusts_10m[j] || 0); }
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
        '<div class="p">' + Math.round(c.p) + ' %</div>' + windCell(c, h, mid) + '</div>';
      prevH = hr;
    }
    $('hours-cols').innerHTML = html;
    renderCurve(h);
    renderHoursBand();
  }

  /* Viento de una columna: flecha hacia donde sopla, velocidad y rachas (km/h) */
  function windCell(c, h, mid) {
    if (!h.wind_speed_10m) { return ''; }
    var dir = h.wind_direction_10m ? h.wind_direction_10m[mid] : null;
    var lvl = c.wg >= 70 ? ' w70' : (c.wg >= 50 ? ' w50' : (c.ws < 6 ? ' calm' : ''));
    var arr = dir == null || c.ws < 2 ? '<span class="wa0"></span>' : '<svg class="wa" viewBox="0 0 16 16" aria-hidden="true"><g transform="rotate(' + ((dir + 180) % 360) + ' 8 8)"><path d="M8 2.5 L8 13.5 M4.5 6 L8 2.5 L11.5 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
    return '<div class="wind' + lvl + '">' + arr + '<div class="ws">' + Math.round(c.ws) + (h.wind_gusts_10m ? '<span>' + Math.round(c.wg) + '</span>' : '') + '</div></div>';
  }

  /* Curva de temperatura: cada grado sube o baja según la temperatura y una línea fina los une */
  var CURVE_H = 16;
  function renderCurve(h) {
    var n = hourCols.length, k;
    if (n < 2) { $('hours-curve').innerHTML = ''; return; }
    var lo = 1e9, hi = -1e9;
    for (k = 0; k < n; k++) { var v = h.temperature_2m[hourCols[k].i]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    var ds = $('hours-cols').querySelectorAll('.hour .d');
    for (k = 0; k < ds.length && k < n; k++) {
      var off = Math.round((hi - h.temperature_2m[hourCols[k].i]) / Math.max(1, hi - lo) * CURVE_H);
      ds[k].style.marginTop = (1 + off) + 'px';
      ds[k].style.marginBottom = (CURVE_H - off) + 'px';
    }
    drawCurveLine();
  }
  function drawCurveLine() {
    var wrap = $('hours-wrap'), ds = $('hours-cols').querySelectorAll('.hour .d');
    if (ds.length < 2) { return; }
    var wr = wrap.getBoundingClientRect(), pts = [];
    for (var k = 0; k < ds.length; k++) {
      var r = ds[k].getBoundingClientRect();
      pts.push((r.left + r.width / 2 - wr.left).toFixed(1) + ',' + (r.bottom - wr.top + 2).toFixed(1));
    }
    $('hours-curve').innerHTML = '<svg width="' + Math.round(wr.width) + '" height="' + Math.round(wr.height) + '" aria-hidden="true">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="rgba(232,238,249,0.35)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  /* Franja del aviso más alto por encima de las horas que cubre */
  function renderHoursBand() {
    var wrap = $('hours-wrap'), band = $('hours-band');
    var a = activeAlerts()[0];
    $('hours-alert').className = 'ha';
    if (!a || !hourCols.length) { wrap.className = ''; return; }
    var on = new Date(a.onset), ex = roundEnd(new Date(a.expires)), first = -1, last = -1;
    for (var k = 0; k < hourCols.length; k++) {
      if (hourCols[k].start < ex && hourCols[k].end > on) { if (first < 0) { first = k; } last = k; }
    }
    if (first < 0) { wrap.className = ''; return; }
    var n = hourCols.length;
    band.style.left = (first / n * 100) + '%';
    band.style.width = ((last - first + 1) / n * 100) + '%';
    band.className = a.level;
    band.textContent = '';
    wrap.className = 'band';
    var hb = $('hours-alert');
    hb.className = 'ha ' + a.level;
    hb.textContent = LEVEL_NAME[a.level] + ' ' + (on > now() ? 'de ' + pad(on.getHours()) + ' a ' + pad(ex.getHours()) + ' h' : 'hasta las ' + pad(ex.getHours()) + ' h');
  }

  function renderDays(dl) {
    var html = '';
    for (var j = 0; j < cfg.days && j < dl.time.length; j++) {
      var date = parseLocal(dl.time[j] + 'T12:00');
      var dw = wmo(dl.weather_code[j], 1);
      var dp = dl.precipitation_probability_max[j];
      var cf = confFor(String(dl.time[j]));
      html += '<div class="day" data-j="' + j + '">' + svgIcon(dw.kind) + '<div class="tx"><div class="n">' + (j === 0 ? 'Hoy' : DOW[date.getDay()]) + (cf && cf.lvl !== 'alta' ? '<i class="cfd ' + cf.lvl + '" title="Fiabilidad ' + cf.lvl + '"></i>' : '') +
        '<span>' + (dp == null ? '--' : Math.round(dp)) + ' %</span></div>' +
        '<div class="d">' + Math.round(dl.temperature_2m_max[j]) + '° <span class="mn">' + Math.round(dl.temperature_2m_min[j]) + '°</span></div></div></div>';
    }
    $('days').innerHTML = html;
  }

  /* ---- Detalle de un día (al pulsar en la fila de 5 días) ---- */
  var dayTimer = null;
  function openDay(j) {
    if (!W || !W.daily.time[j]) { return; }
    var d = W.daily, h = W.hourly, key = String(d.time[j]), n = now();
    var date = parseLocal(key + 'T12:00'), dw = wmo(d.weather_code[j], 1);
    var idx = [], k;
    for (k = 0; k < h.time.length; k++) { if (String(h.time[k]).slice(0, 10) === key) { idx.push(k); } }

    /* resumen por tramos del día */
    var parts = [['Madrugada', 0, 6], ['Mañana', 6, 12], ['Tarde', 12, 18], ['Noche', 18, 24]], resumen = [];
    for (var p = 0; p < parts.length; p++) {
      var mm = 0, codes = {}, best = -1, bestN = 0, pmax = 0, any = false;
      for (k = 0; k < idx.length; k++) {
        var hr = +String(h.time[idx[k]]).slice(11, 13);
        if (hr < parts[p][1] || hr >= parts[p][2]) { continue; }
        any = true;
        mm += h.precipitation[idx[k]] || 0;
        pmax = Math.max(pmax, h.precipitation_probability[idx[k]] || 0);
        var c = h.weather_code[idx[k]]; codes[c] = (codes[c] || 0) + 1;
        if (codes[c] > bestN || (codes[c] === bestN && c > best)) { best = c; bestN = codes[c]; }
      }
      if (!any) { continue; }
      var txt = wmo(best, 1).label;
      if (mm >= 0.2) { txt += ' · ' + mmTxt(mm) + ' mm'; } else if (pmax >= 30) { txt += ' · ' + Math.round(pmax) + ' % lluvia'; }
      resumen.push('<div class="pt"><b>' + parts[p][0] + '</b><span>' + txt + '</span></div>');
    }

    /* horas cada 2 h */
    var cols = '', mx = 0;
    for (k = 0; k < idx.length; k += 2) { mx = Math.max(mx, (h.precipitation[idx[k]] || 0) + (h.precipitation[idx[k] + 1] || 0)); }
    for (k = 0; k < idx.length; k += 2) {
      var i = idx[k], m2 = (h.precipitation[i] || 0) + (idx[k + 1] ? (h.precipitation[i + 1] || 0) : 0);
      var pr = Math.max(h.precipitation_probability[i] || 0, idx[k + 1] ? (h.precipitation_probability[i + 1] || 0) : 0);
      var past = parseLocal(h.time[i]).getTime() + 7200000 <= n.getTime();
      var bar = m2 >= 0.05 ? '<div class="mm">' + mmTxt(m2) + '</div><div class="b' + (h.weather_code[i] >= 95 ? ' storm' : '') + '" style="height: ' + Math.max(4, Math.round(m2 / (mx || 1) * 30)) + 'px"></div>' : '<div class="b0"></div>';
      var ws = h.wind_speed_10m ? Math.round(h.wind_speed_10m[i]) : null;
      cols += '<div class="hour' + (past ? ' past' : '') + '"><div class="t">' + String(h.time[i]).slice(11, 13) + 'h</div>' + svgIcon(wmo(h.weather_code[i], h.is_day[i]).kind) +
        '<div class="d">' + Math.round(h.temperature_2m[i]) + '°</div><div class="bw">' + bar + '</div><div class="p">' + Math.round(pr) + ' %</div>' +
        (ws != null ? '<div class="w">' + ws + ' km/h</div>' : '') + '</div>';
    }

    var facts = [
      ['Lluvia', d.precipitation_sum[j] >= 0.1 ? mmTxt(d.precipitation_sum[j]) + ' mm' : 'Nada', 'Prob. máx. ' + Math.round(d.precipitation_probability_max[j] || 0) + ' %'],
      ['Viento', d.wind_speed_10m_max ? Math.round(d.wind_speed_10m_max[j]) + ' km/h' + (d.wind_direction_10m_dominant ? ' ' + compass(d.wind_direction_10m_dominant[j]) : '') : '--', d.wind_gusts_10m_max ? 'Rachas ' + Math.round(d.wind_gusts_10m_max[j]) + ' km/h' : ''],
      ['Sol', d.sunrise ? hhmm(parseLocal(d.sunrise[j])) + ' – ' + hhmm(parseLocal(d.sunset[j])) : '--', d.uv_index_max ? 'UV máx. ' + Math.round(d.uv_index_max[j] || 0) : '']
    ];
    if (j === 0 && AIR) { facts.push(['Aire', AIR.aqi != null ? aqiTxt(AIR.aqi) : '--', 'Polen ' + pollenTxt(AIR.pollen)]); }
    var fh = '';
    for (k = 0; k < facts.length; k++) { fh += '<div class="f"><div class="l">' + facts[k][0] + '</div><div class="v">' + facts[k][1] + '</div><div class="s">' + facts[k][2] + '</div></div>'; }

    var title = j === 0 ? 'Hoy' : (j === 1 ? 'Mañana' : DOW_LONG[date.getDay()].charAt(0).toUpperCase() + DOW_LONG[date.getDay()].slice(1));
    $('daypanel').innerHTML = '<div class="dp-box">' +
      '<div class="dp-head">' + svgIcon(dw.kind) + '<div class="dp-t"><div class="dp-n">' + (j < 2 ? title + ' · ' + DOW_LONG[date.getDay()] : title) + ' ' + date.getDate() + ' de ' + MONTHS[date.getMonth()] + '</div>' +
      '<div class="dp-c">' + dw.label + ' · <b>' + Math.round(d.temperature_2m_max[j]) + '°</b> <span>' + Math.round(d.temperature_2m_min[j]) + '°</span></div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div>' +
      '<div class="dp-facts">' + fh + '</div>' +
      '<div class="dp-parts">' + resumen.join('') + '</div>' +
      '<div class="dp-hours">' + cols + '</div>' + confHtml(confFor(key)) +
      '<div class="dp-foot">Previsión del modelo (Open-Meteo) · toca fuera para cerrar · se cierra sola en 30 s</div></div>';
    $('daypanel').className = 'on';
    var ds = $('days').children;
    for (k = 0; k < ds.length; k++) { ds[k].className = 'day' + (k === j ? ' sel' : ''); }
    clearTimeout(dayTimer);
    dayTimer = setTimeout(closeDay, 30000);
  }
  function closeDay() {
    clearTimeout(dayTimer);
    $('daypanel').className = '';
    var ds = $('days').children;
    for (var k = 0; k < ds.length; k++) { ds[k].className = 'day'; }
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
    var sla = isHome ? cfg.seaLat : cfg.lat, slo = isHome ? cfg.seaLon : cfg.lon;
    $('sea').innerHTML = '--'; setSub('sea-s', '&nbsp;', '');
    var url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + sla + '&longitude=' + slo +
      '&current=wave_height,wave_direction,sea_surface_temperature&timezone=' + encodeURIComponent(TZ);
    getJSON(url, renderSea, function () { /* se mantiene el último dato */ });
  }
  function renderSea(d) {
    var c = d && d.current;
    if (!c) { return; }
    $('sea').innerHTML = (c.sea_surface_temperature == null ? '--' : Math.round(c.sea_surface_temperature)) + '° <span class="u">agua</span>';
    setSub('sea-s', c.wave_height == null ? '&nbsp;' : 'Olas ' + fmtNum(c.wave_height, 1) + ' m' + (c.wave_direction == null ? '' : ' · ' + compass(c.wave_direction)), c.wave_height >= 2 ? 'warn' : '');
  }

  /* ======================= Calidad del aire y polen (Open-Meteo, CAMS) ======================= */
  var AIR = null;
  var AQI_TXT = [[20, 'Buena'], [40, 'Razonable'], [60, 'Regular'], [80, 'Mala'], [100, 'Muy mala'], [1e9, 'Extremadamente mala']];
  var POLLEN = { alder_pollen: ['Aliso', 10, 100], birch_pollen: ['Abedul', 10, 100], grass_pollen: ['Gramíneas', 10, 50], mugwort_pollen: ['Artemisa', 10, 50], olive_pollen: ['Olivo', 50, 200], ragweed_pollen: ['Ambrosía', 10, 50] };
  function loadAir() {
    if (cfg.demo) { AIR = { aqi: 18, pollen: { name: 'Gramíneas', level: 0 } }; return; }
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
      '&current=european_aqi,pm2_5,pm10&hourly=' + Object.keys(POLLEN).join(',') + '&forecast_days=1&timezone=' + encodeURIComponent(TZ);
    getJSON(url, function (d) {
      var a = { aqi: d.current ? d.current.european_aqi : null, pm25: d.current ? d.current.pm2_5 : null, pollen: null };
      if (d.hourly) {
        var best = null;
        for (var k in POLLEN) {
          if (!POLLEN.hasOwnProperty(k) || !d.hourly[k]) { continue; }
          var mx = 0;
          for (var i = 0; i < d.hourly[k].length; i++) { mx = Math.max(mx, d.hourly[k][i] || 0); }
          var lv = mx >= POLLEN[k][2] ? 2 : (mx >= POLLEN[k][1] ? 1 : 0);
          if (!best || lv > best.level || (lv === best.level && mx > best.v)) { best = { name: POLLEN[k][0], level: lv, v: mx }; }
        }
        a.pollen = best;
      }
      AIR = a;
      if (W) { renderWeather(W); }
    }, function () { /* se mantiene el último dato */ });
  }
  function aqiTxt(v) { for (var i = 0; i < AQI_TXT.length; i++) { if (v < AQI_TXT[i][0]) { return AQI_TXT[i][1]; } } return ''; }
  function pollenTxt(p) { return p ? ['bajo', 'moderado', 'alto'][p.level] + (p.level ? ' (' + p.name.toLowerCase() + ')' : '') : '--'; }

  /* ======================= Estación de AEMET (datos medidos) ======================= */
  /* observacion.json lo genera la tarea de GitHub si el repositorio tiene la clave AEMET_API_KEY */
  var STN = null;
  function loadObs() {
    if (cfg.demo || !cfg.obsUrl) { return; }
    var sep = cfg.obsUrl.indexOf('?') < 0 ? '?' : '&';
    getJSON(cfg.obsUrl + sep + 't=' + Date.now(), function (d) { STN = d; if (W) { renderWeather(W); } updateStatus(); renderRecord(); }, function () { STN = null; });
  }
  function obsFresh() {
    if (!isHome || !STN || !STN.time) { return false; }
    var t = new Date(STN.time);
    return Date.now() - t.getTime() < cfg.obsMaxAgeMin * 60000 && sameDay(t, now());
  }
  /* Sustituye lo que da el modelo por lo medido en la estación */
  function applyObsStation() {
    if (!obsFresh()) { return false; }
    var o = STN;
    if (o.temp != null) {
      $('temp').innerHTML = tempHtml(o.temp);
      /* sensación: la del modelo corregida con la diferencia entre lo medido y lo previsto */
      var wc = W && W.current, dl = W && W.daily;
      if (wc && dl) {
        $('range').textContent = 'Sensación ' + Math.round(wc.apparent_temperature + (o.temp - wc.temperature_2m)) + '° · Máx ' +
          Math.round(Math.max(dl.temperature_2m_max[0], o.temp)) + '° · Mín ' + Math.round(Math.min(dl.temperature_2m_min[0], o.temp)) + '°';
      }
    }
    if (o.wind != null) {
      var dir = o.dir != null && o.dir <= 360 ? o.dir : null;
      $('wind').innerHTML = (dir != null ? '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="#5EC8FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="-webkit-transform: rotate(' + ((dir + 180) % 360) + 'deg); transform: rotate(' + ((dir + 180) % 360) + 'deg)"><path d="M12 4v16M6 10l6-6 6 6"/></svg>' : '') +
        Math.round(o.wind) + ' <span class="u">km/h' + (dir != null ? ' ' + compass(dir) : '') + '</span>';
      if (o.gust != null) { setSub('wind-s', 'Rachas ' + Math.round(o.gust) + ' km/h', o.gust >= 50 ? 'warn' : ''); }
    }
    if (o.hum != null) { $('hum').innerHTML = Math.round(o.hum) + ' <span class="u">%</span>'; }
    if (o.pressure != null) { $('press').innerHTML = Math.round(o.pressure) + ' <span class="u">hPa</span>'; }
    if (o.rain_today != null) { $('rain').innerHTML = fmtNum(o.rain_today, 1) + ' <span class="u">mm</span>'; rainSource = 'estación'; }
    return true;
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
    /* avisos de Meteocat (si hay clave en GitHub); si el archivo no existe, se ignora */
    if (cfg.meteocatUrl) {
      getJSON(cfg.meteocatUrl + (cfg.meteocatUrl.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), function (d) { MC = d; renderAlerts(); }, function () { MC = null; });
    }
  }
  var MC = null;

  function activeAlerts() {
    var out = [], n = now();
    if (!isHome) { return out; }
    var all = (AL && AL.alerts ? AL.alerts : []).concat(MC && MC.alerts && Date.now() - new Date(MC.updated).getTime() < 6 * 3600000 ? MC.alerts : []);
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      if (LEVEL_RANK[a.level] && new Date(a.expires) > n) { out.push(a); }
    }
    out.sort(function (x, y) { return (LEVEL_RANK[y.level] - LEVEL_RANK[x.level]) || (new Date(x.onset) - new Date(y.onset)); });
    return out;
  }

  /* AEMET pone los finales a las HH:59:59: se redondean a la hora siguiente */
  function roundEnd(d) { return d.getMinutes() >= 59 ? new Date(Math.ceil(d.getTime() / 60000) * 60000) : d; }
  function when1(d) { return sameDay(d, now()) ? 'las ' + hhmm(d) : dayWord(d) + ' a las ' + hhmm(d); }
  function whenTxt(a) {
    var on = new Date(a.onset), ex = roundEnd(new Date(a.expires)), n = now();
    if (on <= n) { return 'hasta ' + when1(ex); }
    if (sameDay(on, ex)) { return (sameDay(on, n) ? 'hoy' : dayWord(on)) + ' de ' + hhmm(on) + ' a ' + hhmm(ex); }
    return 'desde ' + when1(on) + ' hasta ' + when1(ex);
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
    if (!isHome) {
      col.className = 'alert-banner on calm gray';
      col.innerHTML = lineIcon(I_INFO, '#8494AF') + '<span class="calm-t">Viendo ' + esc(cfg.name) + ' · los avisos de AEMET, la estación y los rayos son de ' + esc(BASE.name) + '</span>';
      placeSummary();
      afterAlertLayout(wasWide);
      return;
    }

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
      placeSummary();
      afterAlertLayout(wasWide);
      return;
    }

    checkAlertSound(list);
    var a = list[0], rest = list.length - 1, more = '';
    if (rest === 1) { more = '+1 aviso ' + list[1].level; }
    else if (rest > 1) { more = '+' + rest + ' avisos'; }
    var color = a.level === 'amarillo' ? '#FFD23F' : (a.level === 'naranja' ? '#FF9A3D' : '#FFFFFF');
    var html = lineIcon(I_WARN, color) +
      '<div class="pill">' + LEVEL_NAME[a.level] + '</div>' +
      '<div class="txt"><div class="m">' + esc(a.event) + ' · ' + whenTxt(a) + '</div>' +
      '<div class="sub">' + (a.detail ? esc(a.detail) + ' · ' : '') + (a.source === 'Meteocat' ? esc((MC && MC.zone) || '') + ' · Meteocat' : esc(zone) + ' · AEMET') + '</div></div>' +
      (more ? '<div class="more">' + more + '</div>' : '');

    if (a.level === 'naranja' || a.level === 'rojo') {
      app.className += ' wide ' + a.level;
      wide.className = 'alert-banner wide on ' + a.level;
      wide.innerHTML = html;
    } else {
      col.className = 'alert-banner on ' + a.level;
      col.innerHTML = html;
    }
    placeSummary();
    afterAlertLayout(wasWide);
  }
  /* Gráfico de las últimas 24 h: lo medido en la estación si lo hay; si no, el modelo */
  function openHistory() {
    if (!W) { return; }
    var pts = [], src;
    if (obsFresh() && STN.hours && STN.hours.length > 3) {
      /* lo medido en la estación (AEMET solo da unas 12 h) y, para completar las 24 h, el modelo en las horas más antiguas */
      src = 'Medido en ' + STN.station;
      var hm2 = W.hourly, ix = hourIndex(hm2, W.current), first = new Date(STN.hours[0].t).getTime(), filled = 0;
      for (var k0 = Math.max(0, ix - 24); k0 <= ix; k0++) {
        var md = parseLocal(hm2.time[k0]);
        if (md.getTime() < first - 1800000) { pts.push({ d: md, t: hm2.temperature_2m[k0], r: hm2.precipitation[k0] || 0, m: true }); filled++; }
      }
      for (var i = 0; i < STN.hours.length; i++) { var o = STN.hours[i]; pts.push({ d: new Date(o.t), t: o.temp, r: o.rain || 0 }); }
      if (filled) { src += ' · las primeras ' + filled + ' h, del modelo'; }
    } else {
      src = 'Modelo de Open-Meteo (no hay datos medidos)';
      var h = W.hourly, idx = hourIndex(h, W.current);
      for (var k = Math.max(0, idx - 24); k <= idx; k++) { pts.push({ d: parseLocal(h.time[k]), t: h.temperature_2m[k], r: h.precipitation[k] || 0 }); }
    }
    if (pts.length < 2) { return; }
    var Wd = 1000, Hd = 230, L = 40, R = 40, T = 22, B = 34, lo = 1e9, hi = -1e9, rmax = 0, rsum = 0, n = pts.length;
    for (i = 0; i < n; i++) { if (pts[i].t != null) { lo = Math.min(lo, pts[i].t); hi = Math.max(hi, pts[i].t); } rmax = Math.max(rmax, pts[i].r); rsum += pts[i].r; }
    lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
    function X(i) { return L + (Wd - L - R) * i / (n - 1); }
    function Y(t) { return T + (Hd - T - B) * (hi - t) / (hi - lo); }
    var bw = (Wd - L - R) / n * 0.6, svg = '', line = [], imx = 0, imn = 0;
    for (i = 0; i < n; i++) {
      if (pts[i].r > 0) {
        var bh = Math.max(3, pts[i].r / Math.max(rmax, 2) * (Hd - T - B) * 0.6);
        svg += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (Hd - B - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="#5BA8FF" opacity="0.85"/>';
        svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Hd - B - bh - 4).toFixed(1) + '" fill="#DCE8FA" font-size="12" text-anchor="middle">' + mmTxt(pts[i].r) + '</text>';
      }
      if (pts[i].t != null) { line.push(X(i).toFixed(1) + ',' + Y(pts[i].t).toFixed(1)); if (pts[i].t > pts[imx].t) { imx = i; } if (pts[i].t < pts[imn].t) { imn = i; } }
      /* todas las horas; las de cada 3 h, más marcadas */
      var hr3 = pts[i].d.getHours() % 3 === 0;
      svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Hd - 12) + '" fill="' + (hr3 ? '#C5D1E6' : '#7F8DA6') + '" font-size="' + (n > 26 ? 10 : 12) + '" text-anchor="middle">' + pad(pts[i].d.getHours()) + '</text>';
      svg += '<line x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + (Hd - B) + '" y2="' + (Hd - B + 4) + '" stroke="#3A4C6B"/>';
    }
    for (var g = lo; g <= hi; g += Math.max(1, Math.round((hi - lo) / 4))) {
      svg = '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(g).toFixed(1) + '" y2="' + Y(g).toFixed(1) + '" stroke="#22304A"/><text x="' + (L - 8) + '" y="' + (Y(g) + 4).toFixed(1) + '" fill="#9AA9C2" font-size="12" text-anchor="end">' + g + '°</text>' + svg;
    }
    svg += '<polyline points="' + line.join(' ') + '" fill="none" stroke="#FFB86B" stroke-width="2.5" stroke-linejoin="round"/>';
    for (i = 0; i < line.length; i++) { var c = line[i].split(','); svg += pts[i] && pts[i].m ? '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6" fill="#0F1728" stroke="#FFB86B" stroke-width="1.3"/>' : '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6" fill="#FFB86B"/>'; }
    function anchor(i) { return i < n * 0.08 ? 'start' : (i > n * 0.92 ? 'end' : 'middle'); }
    svg += '<text x="' + X(imx).toFixed(1) + '" y="' + (Y(pts[imx].t) - 8).toFixed(1) + '" fill="#FFB86B" font-size="13" font-weight="600" text-anchor="' + anchor(imx) + '">máx ' + fmtNum(pts[imx].t, 1) + '°</text>';
    svg += '<text x="' + X(imn).toFixed(1) + '" y="' + (Y(pts[imn].t) + 18).toFixed(1) + '" fill="#8EC1FF" font-size="13" font-weight="600" text-anchor="' + anchor(imn) + '">mín ' + fmtNum(pts[imn].t, 1) + '°</text>';
    var html = '<div class="dp-box"><div class="dp-head">' + svgIcon(wmo(W.current.weather_code, W.current.is_day).kind) +
      '<div class="dp-t"><div class="dp-n">Últimas 24 horas · ' + esc(src) + '</div><div class="dp-c">Temperatura <b>' + fmtNum(pts[imn].t, 1) + '° – ' + fmtNum(pts[imx].t, 1) + '°</b> · Lluvia <b>' + mmTxt(rsum) + ' mm</b></div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div>' +
      '<svg class="hist" viewBox="0 0 ' + Wd + ' ' + Hd + '" preserveAspectRatio="none" aria-label="Gráfico de temperatura y lluvia de las últimas 24 horas">' + svg + '</svg>' +
      factsPanelHtml() + histHtml() + recordsHtml() +
      '<div class="dp-foot"><span class="k1"></span>temperatura · <span class="k2"></span>lluvia por hora (mm) · toca fuera para cerrar</div></div>';
    $('daypanel').innerHTML = html;
    $('daypanel').className = 'on';
    clearTimeout(dayTimer);
    dayTimer = setTimeout(closeDay, 30000);
  }

  /* lluvia acumulada del año frente a lo normal */
  function yearHtml() {
    var yr = yearRain();
    if (!yr) { return '<div class="al-k">Este año</div><div class="loc-empty">Sin datos del año todavía.</div>'; }
    var k = doy(now()), pts = [], cum = 0, cn = 0, i;
    for (i = 0; i < 365; i++) {
      if (i <= k && YEAR.days[i] != null) { cum += YEAR.days[i]; }
      if (NORM && NORM.rn) { cn += NORM.rn[i] || 0; }
      if (i % 7 === 0 || i === k) {
        var d = new Date(now().getFullYear(), 0, 1 + i), first = d.getDate() <= 7 && i % 7 === 0;
        pts.push({ d: d, a: i <= k ? cum : null, b: NORM && NORM.rn ? cn : null, lab: first ? MONTHS[d.getMonth()].slice(0, 3) : '' });
      }
    }
    var ni = 0, top = 1; for (i = 0; i < pts.length; i++) { if (pts[i].a != null) { ni = i; top = Math.max(top, pts[i].a); } if (pts[i].b != null) { top = Math.max(top, pts[i].b); } }
    var txt = yr.pct == null ? '' : (Math.abs(yr.pct) < 10 ? 'Más o menos lo normal' : (yr.pct < 0 ? Math.abs(yr.pct) + ' % menos de lo normal' : yr.pct + ' % más de lo normal'));
    return '<div class="al-k">Este año</div>' + factsHtml([
        ['Llovido en ' + now().getFullYear(), Math.round(yr.tot) + ' mm', yr.measured ? 'medido en ' + esc(HIST.station || 'la estación') : 'del 1 de enero a hoy (modelo)'],
        ['Lo normal a estas alturas', yr.nrm ? Math.round(yr.nrm) + ' mm' : '--', 'media 1991–2020'],
        ['Diferencia', txt || '--', '']]) +
      buildChart(pts, { h: 170, nowIdx: ni, aColor: '#5BA8FF', bColor: '#9AA9C2', bDash: true, yMin: 0, yMax: Math.ceil(top * 1.1 / 50) * 50, fixed: true, every: 1, fmt: function (v) { return Math.round(v); } }) +
      legend([['#5BA8FF', 'este año (mm acumulados)'], ['#9AA9C2', 'año normal']]) +
      '<div class="ch-sub">' + (yr.measured ? 'El total es lo medido en la estación; la curva es la del modelo para este punto.' : 'Lluvia del modelo para este punto (no medida en una estación).') + '</div>';
  }
  function recordsHtml() {
    var r = todayRecord(0);
    if (!r || r.mx < -90) { return ''; }
    var dt = parseLocal(W.daily.time[0] + 'T12:00'), title = dt.getDate() + ' de ' + MONTHS[dt.getMonth()];
    return '<div class="al-k">Un ' + title + ' cualquiera · desde 1940</div>' + factsHtml([
      ['Normal', Math.round(r.nmx) + '° / ' + Math.round(r.nmn) + '°', 'máx. / mín. media 1991–2020'],
      ['Récord de calor', fmtNum(r.mx, 1) + '°', 'en ' + r.mxY],
      ['Récord de frío', fmtNum(r.mn, 1) + '°', 'en ' + r.mnY]]) +
      '<div class="ch-sub">Datos del reanálisis ERA5 (calculados, no de una estación), por eso pueden diferir de los récords oficiales.</div>';
  }

  /* ======================= Paneles de las tarjetas ======================= */
  /* Gráfico genérico: línea A (y opcional B), barras opcionales, marca de «ahora», horas abajo y flechas de dirección */
  function buildChart(pts, o) {
    var Wd = Math.max(340, Math.min(1000, (window.innerWidth || 1000) - 70)), Hd = o.h || 210, L = 46, R = 16, T = o.arrows ? 34 : 22, B = 30, n = pts.length, i;
    if (n < 2) { return ''; }
    var lo = 1e9, hi = -1e9, rmax = 0;
    for (i = 0; i < n; i++) {
      if (pts[i].a != null) { lo = Math.min(lo, pts[i].a); hi = Math.max(hi, pts[i].a); }
      if (pts[i].b != null) { lo = Math.min(lo, pts[i].b); hi = Math.max(hi, pts[i].b); }
      if (pts[i].r) { rmax = Math.max(rmax, pts[i].r); }
    }
    if (o.yMin != null) { lo = Math.min(lo, o.yMin); } if (o.yMax != null) { hi = Math.max(hi, o.yMax); }
    if (o.fixed) { lo = o.yMin; hi = o.yMax; }
    if (hi - lo < (o.minSpan || 2)) { var mid = (hi + lo) / 2; lo = mid - (o.minSpan || 2) / 2; hi = mid + (o.minSpan || 2) / 2; }
    if (!o.fixed) { var pd = (hi - lo) * 0.08; lo -= pd; hi += pd; }
    function X(k) { return L + (Wd - L - R) * k / (n - 1); }
    function Y(v) { return T + (Hd - T - B) * (hi - v) / (hi - lo); }
    var svg = '', fmt = o.fmt || function (v) { return Math.round(v); };
    var hasLine = false;
    for (i = 0; i < n; i++) { if (pts[i].a != null) { hasLine = true; break; } }
    for (var g = 0; hasLine && g <= 4; g++) {
      var gv = lo + (hi - lo) * g / 4;
      svg += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(gv).toFixed(1) + '" y2="' + Y(gv).toFixed(1) + '" stroke="#22304A"/>' +
        '<text x="' + (L - 8) + '" y="' + (Y(gv) + 4).toFixed(1) + '" fill="#9AA9C2" font-size="12" text-anchor="end">' + fmt(gv) + '</text>';
    }
    if (o.nowIdx != null && o.nowIdx >= 0 && o.nowIdx < n) {
      svg += '<rect x="' + X(o.nowIdx).toFixed(1) + '" y="' + T + '" width="' + (Wd - R - X(o.nowIdx)).toFixed(1) + '" height="' + (Hd - T - B) + '" fill="rgba(183,156,255,0.05)"/>' +
        '<line x1="' + X(o.nowIdx).toFixed(1) + '" x2="' + X(o.nowIdx).toFixed(1) + '" y1="' + (T - 4) + '" y2="' + (Hd - B) + '" stroke="#FFFFFF" stroke-dasharray="3 3" opacity="0.6"/>' +
        '<text x="' + (X(o.nowIdx) + 4).toFixed(1) + '" y="' + (Hd - B - 6) + '" fill="#FFFFFF" font-size="11" opacity="0.8">ahora</text>';
    }
    var bw = Math.min(16, (Wd - L - R) / n * 0.62);
    for (i = 0; i < n; i++) {
      if (pts[i].r) {
        var bh = Math.max(3, pts[i].r / Math.max(rmax, o.rMin || 2) * (Hd - T - B) * 0.55);
        svg += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (Hd - B - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (pts[i].rc || o.rColor || '#5BA8FF') + '" opacity="0.85"/>';
        if (o.rLabels !== false && n <= 30 && (Wd >= 600 || n <= 12 || pts[i].r >= rmax * 0.25)) { svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Hd - B - bh - 4).toFixed(1) + '" fill="#DCE8FA" font-size="11" text-anchor="middle">' + (o.rFmt ? o.rFmt(pts[i].r) : mmTxt(pts[i].r)) + '</text>'; }
      }
      var every = (o.every || (n > 30 ? 3 : 1)) * (Wd < 600 && n > 12 ? 2 : 1);
      if (i % every === 0 && pts[i].lab !== '') {
        var lab = pts[i].lab != null ? pts[i].lab : pad(pts[i].d.getHours());
        var strong = pts[i].d && pts[i].d.getHours() === 0;
        svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Hd - 10) + '" fill="' + (strong ? '#FFFFFF' : '#9AA9C2') + '" font-size="12" text-anchor="middle">' + lab + '</text>';
      }
      if (o.arrows && pts[i].dir != null && i % ((o.arrowEvery || 3) * (Wd < 600 ? 2 : 1)) === 0) {
        svg += '<g transform="translate(' + X(i).toFixed(1) + ',14) rotate(' + ((pts[i].dir + 180) % 360) + ')"><path d="M0 -8 L0 8 M-4 -3 L0 -8 L4 -3" stroke="#5EC8FF" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>';
      }
    }
    function line(key, color, dash) {
      var p = [], k;
      for (k = 0; k < n; k++) { if (pts[k][key] != null) { p.push(X(k).toFixed(1) + ',' + Y(pts[k][key]).toFixed(1)); } }
      return p.length > 1 ? '<polyline points="' + p.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="6 4"' : '') + '/>' : '';
    }
    if (o.bKey !== false) { svg += line('b', o.bColor || '#FFB86B', o.bDash); }
    svg += line('a', o.aColor || '#5EC8FF', false);
    if (o.marks) { for (i = 0; i < n; i++) { if (pts[i].a != null && o.marks(pts[i])) { svg += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(pts[i].a).toFixed(1) + '" r="4" fill="#FF9A3D"/>'; } } }
    return '<svg class="hist" viewBox="0 0 ' + Wd + ' ' + Hd + '" preserveAspectRatio="none" style="height: ' + Hd + 'px" aria-hidden="true">' + svg + '</svg>';
  }
  function legend(items) {
    var h = '<div class="ch-leg">';
    for (var i = 0; i < items.length; i++) { h += '<span><i style="background: ' + items[i][0] + (items[i][2] ? '; height: 10px' : '') + '"></i>' + items[i][1] + '</span>'; }
    return h + '</div>';
  }
  function factsHtml(facts) {
    var fh = '<div class="dp-facts">';
    for (var k = 0; k < facts.length; k++) { fh += '<div class="f"><div class="l">' + facts[k][0] + '</div><div class="v">' + facts[k][1] + '</div><div class="s">' + (facts[k][2] || '') + '</div></div>'; }
    return fh + '</div>';
  }
  function showPanel(iconHtml, kicker, title, body) {
    $('daypanel').innerHTML = '<div class="dp-box"><div class="dp-head">' + iconHtml + '<div class="dp-t"><div class="dp-n">' + kicker + '</div><div class="dp-c">' + title + '</div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div>' + body + '<div class="dp-foot">Toca fuera para cerrar · se cierra sola en 1 min</div></div>';
    $('daypanel').className = 'on';
    clearTimeout(dayTimer);
    dayTimer = setTimeout(closeDay, 60000);
  }
  /* horas de las últimas 24 h a las próximas 24 h, del modelo */
  function hourWindow(back, fwd) {
    var h = W.hourly, idx = hourIndex(h, W.current), out = [];
    for (var k = Math.max(0, idx - back); k <= Math.min(h.time.length - 1, idx + fwd); k++) { out.push(k); }
    return { list: out, nowIdx: idx - Math.max(0, idx - back) };
  }
  function iconSvg(path, color) { return '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'; }
  var IC_WIND = '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h8"/>';
  var IC_DROP = '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>';
  var IC_GAUGE = '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M8 17h8"/>';
  var IC_WAVE = '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 19.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M7 9c1.5-3 4-5 8-5"/>';
  var IC_SUN = SUN;

  function openStat(k) {
    if (!W) { return; }
    var h = W.hourly, d = W.daily, wnd, pts = [], i, j, f;
    if (k === 'wind') {
      wnd = hourWindow(24, 24);
      var gmax = { v: -1 }, gpast = { v: -1 };
      for (i = 0; i < wnd.list.length; i++) {
        j = wnd.list[i];
        pts.push({ d: parseLocal(h.time[j]), a: h.wind_speed_10m ? h.wind_speed_10m[j] : null, b: h.wind_gusts_10m ? h.wind_gusts_10m[j] : null, dir: h.wind_direction_10m ? h.wind_direction_10m[j] : null });
        var gv = h.wind_gusts_10m ? h.wind_gusts_10m[j] : null;
        if (gv != null && i > wnd.nowIdx && gv > gmax.v) { gmax = { v: gv, d: parseLocal(h.time[j]) }; }
        if (gv != null && i <= wnd.nowIdx && gv > gpast.v) { gpast = { v: gv, d: parseLocal(h.time[j]) }; }
      }
      var cw = W.current;
      f = [['Ahora', Math.round(cw.wind_speed_10m) + ' km/h ' + compass(cw.wind_direction_10m), 'Rachas ' + Math.round(cw.wind_gusts_10m || 0) + ' km/h'],
           ['Racha máx. próximas 24 h', gmax.v >= 0 ? Math.round(gmax.v) + ' km/h' : '--', gmax.d ? dayWord(gmax.d) + ' a las ' + pad(gmax.d.getHours()) + ' h' : ''],
           ['Racha máx. últimas 24 h', gpast.v >= 0 ? Math.round(gpast.v) + ' km/h' : '--', gpast.d ? dayWord(gpast.d) + ' a las ' + pad(gpast.d.getHours()) + ' h' : '']];
      var windTxt = gmax.v >= 70 ? 'Rachas muy fuertes en las próximas horas: cuidado con objetos sueltos y al circular.' : (gmax.v >= 50 ? 'Habrá rachas fuertes en algún momento de las próximas 24 h.' : 'Sin rachas fuertes previstas en las próximas 24 h.');
      showPanel(iconSvg(IC_WIND, '#5EC8FF'), 'Viento · ' + esc(cfg.name), Math.round(cw.wind_speed_10m) + ' km/h del ' + compass(cw.wind_direction_10m),
        factsHtml(f) + '<div class="ch-note">' + windTxt + '</div>' +
        buildChart(pts, { nowIdx: wnd.nowIdx, aColor: '#5EC8FF', bColor: '#FFB86B', bDash: true, yMin: 0, arrows: true, marks: function (p) { return p.b >= 50; } }) +
        legend([['#5EC8FF', 'viento medio (km/h)'], ['#FFB86B', 'rachas'], ['#FF9A3D', 'racha ≥ 50 km/h']]) + '<div class="ch-sub">Las flechas indican hacia dónde sopla · últimas 24 h y próximas 24 h</div>');
    } else if (k === 'hum') {
      wnd = hourWindow(24, 24);
      var fog = [];
      for (i = 0; i < wnd.list.length; i++) {
        j = wnd.list[i];
        var hum = h.relative_humidity_2m ? h.relative_humidity_2m[j] : null, dp = h.dew_point_2m ? h.dew_point_2m[j] : null;
        pts.push({ d: parseLocal(h.time[j]), a: hum, b: null });
        if (i > wnd.nowIdx && ((h.weather_code[j] === 45 || h.weather_code[j] === 48) || (hum >= 97 && dp != null && h.temperature_2m[j] - dp <= 1))) { fog.push(parseLocal(h.time[j])); }
      }
      var c = W.current, spread = c.temperature_2m - c.dew_point_2m;
      var feel = c.dew_point_2m >= 20 ? 'Ambiente bochornoso' : (c.dew_point_2m >= 16 ? 'Algo húmedo' : (c.dew_point_2m >= 8 ? 'Agradable' : 'Aire seco'));
      var minVis = null;
      if (h.visibility) { for (i = wnd.nowIdx; i < wnd.list.length; i++) { var vv = h.visibility[wnd.list[i]]; if (vv != null && (minVis === null || vv < minVis)) { minVis = vv; } } }
      f = [['Ahora', Math.round(c.relative_humidity_2m) + ' %', feel],
           ['Punto de rocío', Math.round(c.dew_point_2m) + '°', 'Temp. − rocío: ' + fmtNum(spread, 1) + '°'],
           ['Visibilidad mín. 24 h', minVis != null ? (minVis >= 10000 ? '+10 km' : (minVis >= 1000 ? fmtNum(minVis / 1000, 1) + ' km' : Math.round(minVis) + ' m')) : '--', minVis != null && minVis < 1000 ? 'Niebla' : '']];
      var note = fog.length ? 'Posible niebla ' + dayWord(fog[0]) + ' hacia las ' + pad(fog[0].getHours()) + ' h.' : (spread <= 2 ? 'Temperatura muy cerca del punto de rocío: puede formarse niebla o rocío.' : 'Sin niebla prevista en las próximas 24 h.');
      showPanel(iconSvg(IC_DROP, '#7FB6FF'), 'Humedad · ' + esc(cfg.name), Math.round(c.relative_humidity_2m) + ' % · ' + feel.toLowerCase(),
        factsHtml(f) + '<div class="ch-note">' + note + '</div>' +
        buildChart(pts, { nowIdx: wnd.nowIdx, aColor: '#7FB6FF', yMin: 0, yMax: 100, fixed: true, fmt: function (v) { return Math.round(v) + '%'; } }) +
        legend([['#7FB6FF', 'humedad relativa (%)']]) + '<div class="ch-sub">Punto de rocío: la temperatura a la que el aire se satura. Si la temperatura baja hasta él, se forma rocío o niebla.</div>');
    } else if (k === 'rain') {
      /* hoy, hora a hora: medido en la estación si lo hay; si no, el modelo */
      var today = String(d.time[0]), src;
      if (obsFresh() && STN.hours && STN.hours.length) {
        src = 'medido en ' + STN.station;
        for (i = 0; i < STN.hours.length; i++) { var o = STN.hours[i], od = new Date(o.t); if (sameDay(od, now())) { pts.push({ d: od, r: o.rain || 0, rc: '#5BA8FF' }); } }
      }
      if (!pts.length) {
        src = 'modelo';
        for (j = 0; j < h.time.length; j++) { if (String(h.time[j]).slice(0, 10) === today) { var hd = parseLocal(h.time[j]); pts.push({ d: hd, r: h.precipitation[j] || 0, rc: hd > now() ? 'rgba(183,156,255,0.75)' : '#5BA8FF' }); } }
      }
      var tot = 0; for (i = 0; i < pts.length; i++) { tot += pts[i].r; }
      var body = '<div class="al-k">Hoy, hora a hora · ' + esc(src) + (src === 'modelo' ? ' (violeta = previsto)' : '') + '</div>' +
        buildChart(pts, { h: 170, yMin: 0, yMax: 1, every: 2, bKey: false, rMin: 1 }) +
        '<div class="al-k">Últimos 7 días y próximos 7 (modelo)</div><div id="rain-days" class="loc-empty">Cargando…</div>' + yearHtml();
      showPanel(iconSvg(IC_DROP, '#5BA8FF'), 'Lluvia · ' + esc(cfg.name), 'Hoy ' + mmTxt(tot) + ' mm', body);
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lon + '&daily=precipitation_sum,precipitation_probability_max&past_days=7&forecast_days=7&timezone=' + encodeURIComponent(TZ);
      getJSON(url, function (r) {
        var el = $('rain-days'); if (!el || !r.daily) { return; }
        var dp2 = [], ni = 0, sumP = 0;
        for (var q = 0; q < r.daily.time.length; q++) {
          var dd = parseLocal(r.daily.time[q] + 'T12:00'), fut = dd > now() && !sameDay(dd, now());
          if (sameDay(dd, now())) { ni = q; }
          if (!fut && !sameDay(dd, now())) { sumP += r.daily.precipitation_sum[q] || 0; }
          dp2.push({ d: dd, lab: sameDay(dd, now()) ? 'hoy' : DOW[dd.getDay()].toLowerCase() + ' ' + dd.getDate(), r: r.daily.precipitation_sum[q] || 0, rc: fut ? 'rgba(183,156,255,0.75)' : '#5BA8FF' });
        }
        el.className = '';
        el.innerHTML = buildChart(dp2, { h: 170, yMin: 0, yMax: 1, every: 1, bKey: false, nowIdx: ni, rMin: 2 }) +
          '<div class="ch-sub">Últimos 7 días: ' + mmTxt(sumP) + ' mm (modelo) · azul = pasado, violeta = previsto</div>';
      }, function () { var el = $('rain-days'); if (el) { el.textContent = 'Sin conexión.'; } });
    } else if (k === 'press') {
      wnd = hourWindow(24, 24);
      for (i = 0; i < wnd.list.length; i++) { j = wnd.list[i]; pts.push({ d: parseLocal(h.time[j]), a: h.pressure_msl[j] }); }
      var pnow = W.current.pressure_msl, idx = hourIndex(h, W.current);
      var d3 = idx >= 3 ? pnow - h.pressure_msl[idx - 3] : 0, f12 = idx + 12 < h.time.length ? h.pressure_msl[idx + 12] - pnow : 0;
      var trend = d3 <= -3 ? 'Bajando rápido: probable empeoramiento (lluvia o viento).' : (d3 <= -1 ? 'Bajando: puede empeorar.' : (d3 >= 3 ? 'Subiendo rápido: mejora, aunque puede venir viento.' : (d3 >= 1 ? 'Subiendo: tiende a mejorar.' : 'Estable: sin cambios importantes.')));
      f = [['Ahora', Math.round(pnow) + ' hPa', pnow >= 1020 ? 'Alta (anticiclón)' : (pnow <= 1005 ? 'Baja (borrasca)' : 'Normal')],
           ['Últimas 3 h', (d3 > 0 ? '+' : '') + fmtNum(d3, 1) + ' hPa', ''],
           ['Próximas 12 h', (f12 > 0 ? '+' : '') + fmtNum(f12, 1) + ' hPa', 'previsión']];
      showPanel(iconSvg(IC_GAUGE, '#B4C1D6'), 'Presión · ' + esc(cfg.name), Math.round(pnow) + ' hPa',
        factsHtml(f) + '<div class="ch-note">' + trend + '</div>' +
        buildChart(pts, { nowIdx: wnd.nowIdx, aColor: '#C5D1E6', minSpan: 6, fmt: function (v) { return Math.round(v); } }) +
        legend([['#C5D1E6', 'presión a nivel del mar (hPa)']]));
    } else if (k === 'sea') {
      showPanel(iconSvg(IC_WAVE, '#5EC8FF'), 'Mar · ' + esc(cfg.name), $('sea').textContent, '<div id="sea-body" class="loc-empty">Cargando…</div>');
      var sla = isHome ? cfg.seaLat : cfg.lat, slo = isHome ? cfg.seaLon : cfg.lon;
      getJSON('https://marine-api.open-meteo.com/v1/marine?latitude=' + sla + '&longitude=' + slo + '&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature&daily=wave_height_max&forecast_days=4&timezone=' + encodeURIComponent(TZ), function (m) {
        var el = $('sea-body'); if (!el || !m.hourly) { return; }
        var mp = [], mh = m.hourly, ni = 0, nowD = now();
        for (var q = 0; q < mh.time.length && q < 72; q++) {
          var md = parseLocal(mh.time[q]);
          if (md <= nowD) { ni = q; }
          mp.push({ d: md, a: mh.wave_height[q], dir: mh.wave_direction ? mh.wave_direction[q] : null, lab: md.getHours() === 0 ? DOW[md.getDay()] : (md.getHours() % 6 === 0 ? pad(md.getHours()) : '') });
        }
        function douglas(v) { return v == null ? '--' : v < 0.1 ? 'Calma' : v < 0.5 ? 'Marejadilla' : v < 1.25 ? 'Marejada' : v < 2.5 ? 'Fuerte marejada' : v < 4 ? 'Mar gruesa' : 'Mar muy gruesa'; }
        var cwv = mh.wave_height[ni], days = '';
        if (m.daily) { for (var q2 = 0; q2 < m.daily.time.length; q2++) { var dd2 = parseLocal(m.daily.time[q2] + 'T12:00'); days += '<div class="pt"><b>' + (q2 === 0 ? 'Hoy' : DOW[dd2.getDay()]) + '</b><span>' + fmtNum(m.daily.wave_height_max[q2] || 0, 1) + ' m · ' + douglas(m.daily.wave_height_max[q2]).toLowerCase() + '</span></div>'; } }
        el.className = '';
        el.innerHTML = factsHtml([['Olas ahora', cwv != null ? fmtNum(cwv, 1) + ' m' : '--', douglas(cwv)],
            ['Periodo', mh.wave_period && mh.wave_period[ni] != null ? Math.round(mh.wave_period[ni]) + ' s' : '--', mh.wave_direction && mh.wave_direction[ni] != null ? 'Vienen del ' + compass(mh.wave_direction[ni]) : ''],
            ['Agua', mh.sea_surface_temperature && mh.sea_surface_temperature[ni] != null ? fmtNum(mh.sea_surface_temperature[ni], 1) + '°' : '--', 'temperatura del mar']]) +
          '<div class="dp-parts">' + days + '</div>' +
          buildChart(mp, { nowIdx: ni, aColor: '#5EC8FF', yMin: 0, minSpan: 1, every: 1, arrows: true, arrowEvery: 6, fmt: function (v) { return fmtNum(v, 1) + ' m'; } }) +
          legend([['#5EC8FF', 'altura de ola (m), próximos 3 días']]) + '<div class="ch-sub">Las flechas indican hacia dónde van las olas · datos de modelo, no aptos para navegación</div>';
      }, function () { var el = $('sea-body'); if (el) { el.textContent = 'Sin conexión.'; } });
    } else if (k === 'sun') {
      var rows = '';
      for (i = 0; i < d.time.length; i++) {
        var sr = parseLocal(d.sunrise[i]), ss = parseLocal(d.sunset[i]), dl = d.daylight_duration ? d.daylight_duration[i] : (ss - sr) / 1000;
        var dd3 = parseLocal(d.time[i] + 'T12:00');
        rows += '<tr><td>' + (i === 0 ? 'Hoy' : DOW[dd3.getDay()] + ' ' + dd3.getDate()) + '</td><td>' + hhmm(sr) + '</td><td>' + hhmm(ss) + '</td><td>' + Math.floor(dl / 3600) + ' h ' + pad(Math.round(dl % 3600 / 60)) + ' min</td><td>' + (d.uv_index_max ? Math.round(d.uv_index_max[i] || 0) : '--') + '</td></tr>';
      }
      wnd = hourWindow(0, 23);
      for (i = 0; i < wnd.list.length; i++) { j = wnd.list[i]; pts.push({ d: parseLocal(h.time[j]), a: h.uv_index ? h.uv_index[j] : null }); }
      var dlt = d.daylight_duration && d.daylight_duration[1] != null ? Math.round((d.daylight_duration[1] - d.daylight_duration[0]) / 60) : null;
      var mn = moonNext(now());
      showPanel(iconSvg(IC_SUN, '#FFD27A'), 'Sol y luna · ' + esc(cfg.name), 'Salida ' + hhmm(parseLocal(d.sunrise[0])) + ' · puesta ' + hhmm(parseLocal(d.sunset[0])),
        factsHtml([['Duración del día', d.daylight_duration ? Math.floor(d.daylight_duration[0] / 3600) + ' h ' + pad(Math.round(d.daylight_duration[0] % 3600 / 60)) + ' min' : '--', dlt != null ? (dlt < 0 ? 'Mañana ' + (-dlt) + ' min menos' : 'Mañana ' + dlt + ' min más') : ''],
                   ['Luna', moonHtml(now()), ''],
                   ['Próxima luna llena', dayWord(mn.full) === 'hoy' ? 'hoy' : mn.full.getDate() + ' de ' + MONTHS[mn.full.getMonth()], 'luna nueva: ' + mn.newm.getDate() + ' de ' + MONTHS[mn.newm.getMonth()]]]) +
        '<table class="sun-t"><tr><th></th><th>Salida</th><th>Puesta</th><th>Luz</th><th>UV</th></tr>' + rows + '</table>' +
        '<div class="al-k">Índice UV de las próximas horas</div>' + buildChart(pts, { h: 150, aColor: '#FFD27A', yMin: 0, yMax: 4, minSpan: 4, fmt: function (v) { return Math.round(v); } }));
    }
  }
  /* próximas lunas llena y nueva */
  function moonNext(dt) {
    var syn = 29.530588853 * 86400000, base = Date.UTC(2000, 0, 6, 18, 14), t = dt.getTime();
    var k = Math.floor((t - base) / syn), newm = new Date(base + (k + 1) * syn), full = new Date(base + (k + 0.5) * syn);
    if (full < dt) { full = new Date(full.getTime() + syn); }
    return { full: full, newm: newm };
  }

  /* Panel con todos los avisos (al pulsar la franja o «+N avisos») */
  function openAlerts() {
    var list = activeAlerts();
    if (!list.length) { return; }
    var html = '<div class="dp-box"><div class="dp-head">' + lineIcon(I_WARN, '#FF9A3D') + '<div class="dp-t"><div class="dp-n">Avisos de AEMET · ' + esc((AL && AL.zone) || '') + '</div>' +
      '<div class="dp-c">' + list.length + (list.length === 1 ? ' aviso activo o previsto' : ' avisos activos o previstos') + '</div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div><div class="al-list">';
    for (var i = 0; i < list.length; i++) {
      var a = list[i], on = new Date(a.onset), ex = roundEnd(new Date(a.expires));
      var more = '<div class="al-more"><div class="al-k">Horario</div><div>Desde ' + when1(on) + (sameDay(on, now()) ? ' de hoy' : '') + ' hasta ' + when1(ex) + (sameDay(ex, now()) ? ' de hoy' : '') + '</div>';
      var src = a.source || 'AEMET';
      if (a.description) { more += '<div class="al-k">Qué dice ' + src + '</div><div>' + esc(a.description) + '</div>'; }
      if (a.instruction) { more += '<div class="al-k">Recomendaciones</div><div>' + esc(a.instruction) + '</div>'; }
      if (!a.description && !a.instruction) { more += '<div class="al-k">Detalle</div><div>' + (a.detail ? esc(a.detail) : src + ' no da más detalle para este aviso.') + '</div>'; }
      more += '</div>';
      html += '<div class="al-row ' + a.level + '" data-i="' + i + '"><span class="al-pill">' + LEVEL_NAME[a.level] + '</span><div class="al-tx"><div class="al-m">' + esc(a.event) + ' · ' + whenTxt(a) + '<span class="al-chev">▾</span></div>' +
        (a.detail ? '<div class="al-d">' + esc(a.detail) + '</div>' : '') + more + '</div></div>';
    }
    html += '</div><div class="dp-foot">Toca un aviso para ver todo el detalle · Fuentes: AEMET (vía MeteoAlarm)' + (MC ? ' y Meteocat (' + esc(MC.zone || '') + ')' : '') + (AL && AL.updated ? ' · comprobado a las ' + hhmm(new Date(AL.updated)) : '') + ' · toca fuera para cerrar</div></div>';
    $('daypanel').innerHTML = html;
    $('daypanel').className = 'on';
    clearTimeout(dayTimer);
    dayTimer = setTimeout(closeDay, 30000);
  }

  function afterAlertLayout() { renderHoursBand(); fixMapSize(); drawCurveLine(); }
  /* temperatura grande con un decimal: «24,3°» (el decimal algo más pequeño) */
  function tempHtml(v) {
    var r = Math.round(v * 10) / 10, neg = r < 0, a = Math.abs(r), ent = Math.floor(a), dec = Math.round((a - ent) * 10);
    if (dec === 10) { ent++; dec = 0; }
    return (neg ? '−' : '') + ent + '<span class="dec">,' + dec + '</span>°';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ======================= Radar: observado + previsión ======================= */
  var map = null, userMoved = false, programmatic = false, pinMarker = null;
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
    map.attributionControl.addAttribution('Previsión <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) · Avisos AEMET · Rayos &copy; EUMETSAT');
    map.on('dragstart zoomstart', function () { if (!programmatic) { userMoved = true; } touchFull(); });
    map.on('click', function () { if (!full) { enterFull(); } else { touchFull(); } });
    if (cfg.radarFade) { $('radar').className += ' fade'; }
    if (!cfg.demo) {
      L.tileLayer(cfg.basemapUrl, { subdomains: 'abcd', maxZoom: 16, attribution: cfg.basemapAttribution + ' · Radar &copy; RainViewer' }).addTo(map);
      /* nombres de lugares por encima del radar */
      if (cfg.labelsUrl) {
        map.createPane('labels');
        map.getPane('labels').style.zIndex = 450;
        map.getPane('labels').style.pointerEvents = 'none';
        L.tileLayer(cfg.labelsUrl, { pane: 'labels', subdomains: 'abcd', maxZoom: 16 }).addTo(map);
      }
    }
    var m = pinMarker = L.marker([cfg.lat, cfg.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pin"><div class="ring"></div><div class="core"></div><div class="name"></div></div>' }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    m.getElement().querySelector('.name').textContent = cfg.name;
  }

  /* ---- Pantalla pequeña o en vertical: diseño de una columna (lo decide el CSS; aquí se ajusta el mapa) ---- */
  var MQ = window.matchMedia ? window.matchMedia('(max-width: 900px), (max-height: 560px)') : null;
  function isCompact() { return !!(MQ && MQ.matches); }
  /* en móvil, el mapa no se arrastra con el dedo (para poder desplazar la página); al tocarlo se amplía */
  function applyCompactMap() {
    if (!map) { return; }
    var lock = isCompact() && !full;
    if (lock) { map.dragging.disable(); if (map.touchZoom) { map.touchZoom.disable(); } }
    else { map.dragging.enable(); if (map.touchZoom) { map.touchZoom.enable(); } }
  }
  function onLayoutChange() {
    applyCompactMap();
    if (map) { map.invalidateSize(); }
    fixMapSize();
    drawCurveLine();
    applyNight();
  }

  /* ---- Radar ampliado: tocar el mapa lo pone a pantalla completa; vuelve solo tras unos segundos sin tocarlo ---- */
  var full = false, fullTimer = null, zoomCtl = null, fullEnd = 0, fullTick = null;
  function enterFull() {
    full = true;
    $('radar').className += ' full';
    /* el desplazamiento antiquemado (transform) rompería el «position: fixed» del mapa ampliado */
    var ap = $('app'); ap.style.webkitTransform = 'none'; ap.style.transform = 'none';
    document.documentElement.className += ' mapfull';
    updateFullInfo();
    zoomCtl = L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    applyCompactMap();
    map.invalidateSize();
    touchFull();
  }
  function exitFull() {
    if (!full) { return; }
    full = false;
    clearTimeout(fullTimer); clearInterval(fullTick);
    $('radar').className = $('radar').className.replace(/\s*full/g, '');
    document.documentElement.className = document.documentElement.className.replace(/\s*mapfull/g, '');
    if (zoomCtl) { map.removeControl(zoomCtl); zoomCtl = null; }
    applyCompactMap();
    userMoved = false;
    fixMapSize();
  }
  /* cada toque reinicia la cuenta atrás; el botón enseña los segundos que quedan */
  function touchFull() {
    if (!full) { return; }
    clearTimeout(fullTimer);
    fullEnd = Date.now() + cfg.fullRadarSec * 1000;
    fullTimer = setTimeout(exitFull, cfg.fullRadarSec * 1000);
    fullLabel();
    clearInterval(fullTick); fullTick = setInterval(fullLabel, 1000);
  }
  function fullLabel() {
    var left = Math.max(0, Math.ceil((fullEnd - Date.now()) / 1000)), el = $('fullclose');
    if (!el) { return; }
    el.innerHTML = (isCompact() ? '✕ Volver' : 'Toca aquí para volver') + ' <span class="fc-n">' + left + ' s</span>';
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
    if (f.kind === 'nc') { return ncLayers[f.j] || null; }
    return f.kind === 'obs' ? getObsLayer(f) : getFcLayer(f.j);
  }

  function framePos(i) {
    var f = frames[i], nObs = obsFrames.length;
    if (f.kind === 'obs') { return nObs > 1 ? OBS * f.j / (nObs - 1) : 0; }
    var t0 = nObs ? obsFrames[nObs - 1].time : Math.floor(now().getTime() / 1000);
    return Math.min(100, OBS + (100 - OBS) * fcFrac((f.time - t0) / 3600));
  }
  /* escala de la previsión: las 2 primeras horas, ampliadas (30 % del tramo); el resto hasta +24 h */
  function fcFrac(h) { return h <= 2 ? 0.3 * h / 2 : 0.3 + 0.7 * Math.min(1, (h - 2) / 22); }

  function radarAgeMin() {
    if (!obsFrames.length) { return -1; }
    return Math.round((now().getTime() / 1000 - obsFrames[obsFrames.length - 1].time) / 60);
  }

  function showFrame(i) {
    try { syncSatellite(frames[Math.max(0, Math.min(i, frames.length - 1))]); } catch (e) { /* sin satélite */ }
    if (!frames.length) { return; }
    cur = Math.max(0, Math.min(i, frames.length - 1));
    var f = frames[cur];
    var lc = layerFor(cur);
    if (displayed && displayed !== lc) { displayed.setOpacity(0); }
    if (lc) { lc.setOpacity(f.kind === 'obs' ? cfg.radarOpacity : (f.kind === 'nc' ? cfg.radarOpacity * ncFrames[f.j].fade : cfg.fcOpacity)); if (lc.setZIndex) { lc.setZIndex(20); } }
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
    $('t-thumb').className = f.kind === 'obs' ? '' : f.kind;

    /* pastilla de modo */
    var chip = $('chip-r'), age = radarAgeMin();
    var stale = !cfg.demo && f.kind === 'obs' && cur === obsFrames.length - 1 && age > cfg.radarStaleMin;
    if (f.kind === 'obs') {
      chip.className = 'chip mode' + (stale ? ' warn' : '');
      chip.querySelector('.k').textContent = 'Observado';
      chip.querySelector('.w').textContent = fmtTime(f.time) + (stale ? ' · hace ' + age + ' min' : '');
    } else {
      var d = new Date(f.time * 1000);
      chip.className = 'chip mode ' + f.kind;
      chip.querySelector('.k').textContent = f.kind === 'nc' ? 'Radar previsto' : 'Modelo';
      chip.querySelector('.w').textContent = dayWord(d) + ' ' + hhmm(d);
    }
  }

  function layoutTimeline() {
    OBS = (fcFrames.length || ncFrames.length) ? 19 : 100;
    $('t-obs').style.width = OBS + '%';
    $('t-fc').style.left = OBS + '%';
    $('t-fc').style.display = (fcFrames.length || ncFrames.length) ? 'block' : 'none';
    /* tramo de la previsión del radar (primera hora) marcado aparte */
    var ncW = ncFrames.length ? (100 - OBS) * fcFrac((ncFrames[ncFrames.length - 1].time - (obsFrames.length ? obsFrames[obsFrames.length - 1].time : 0)) / 3600) : 0;
    $('t-nc').style.left = OBS + '%'; $('t-nc').style.width = ncW + '%'; $('t-nc').style.display = ncW ? 'block' : 'none';
    $('t-now').style.left = 'calc(' + OBS + '% - 1px)';
    $('t-now').style.display = (fcFrames.length || ncFrames.length) ? 'block' : 'none';
    $('tlh-obs').style.width = OBS + '%';
    $('tlh-fc').style.display = (fcFrames.length || ncFrames.length) ? 'block' : 'none';
    $('tlh-fc').innerHTML = (ncFrames.length ? '<span class="nc">Radar previsto</span> → modelo' : 'Previsión del modelo') +
      (!fcFrames.length && gridErr ? ' <span class="fc-err">no disponible (' + esc(gridErr) + ')</span>' : '');
    var t = '';
    function tick(left, txt, cls, shift) {
      return '<span class="' + (cls || '') + '" style="left: ' + left + '%; -webkit-transform: translateX(' + shift + '); transform: translateX(' + shift + ')">' + txt + '</span>';
    }
    if (fcFrames.length || ncFrames.length) {
      t += tick(0, '−2 h', '', '0');
      t += tick(OBS, 'Ahora', 'now', '-50%');
      var marks = [1, 6, 12];
      for (var mi = 0; mi < marks.length; mi++) { t += tick(OBS + (100 - OBS) * fcFrac(marks[mi]), '+' + marks[mi] + ' h', '', '-50%'); }
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
    for (k = 0; k < ncFrames.length; k++) { frames.push({ kind: 'nc', j: k, time: ncFrames[k].time }); }
    /* el modelo empieza donde acaba la previsión del radar */
    var tm = ncFrames.length ? ncFrames[ncFrames.length - 1].time + 1800 : t0;
    for (k = 0; k < fcFrames.length; k++) { if (fcFrames[k].time > tm) { frames.push({ kind: 'fc', j: k, time: fcFrames[k].time }); } }
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

  var waited = 0, loops = 0;
  function schedule() {
    clearTimeout(animTimer);
    if (!playing || frames.length < 2) { return; }
    var f = frames[cur];
    var step = isNight() ? cfg.nightFrameMs : (f.kind === 'fc' ? cfg.fcFrameMs : cfg.frameMs);
    if (cur === frames.length - 1 || (f.kind === 'nc' && frames[cur + 1] && frames[cur + 1].kind === 'fc')) { step = Math.max(step, 1000); }
    var delay = (cur === obsFrames.length - 1 || cur === frames.length - 1) ? cfg.pauseLastMs : step;
    animTimer = setTimeout(advance, delay);
  }
  function advance() {
    var nxt = (cur + 1) % frames.length;
    /* tras unas vueltas se para solo en la hora actual */
    if (nxt === 0) {
      loops++;
      if (loops >= cfg.playLoops) { loops = 0; setPlaying(false); showFrame(obsFrames.length ? obsFrames.length - 1 : 0); return; }
    }
    var nf = frames[nxt];
    var ln = nf && nf.kind === 'obs' ? getObsLayer(nf) : null;
    /* si el siguiente fotograma aún no ha cargado, espera hasta 3 s para no enseñar el mapa vacío */
    if (ln && !ln._ready && waited < 3000) { waited += 250; animTimer = setTimeout(advance, 250); return; }
    waited = 0;
    showFrame(nxt);
    schedule();
  }
  /* si se elige otro momento en la línea de tiempo, a los 30 s sin tocar vuelve a la imagen de ahora */
  var returnTimer = null;
  function scheduleReturn() {
    clearTimeout(returnTimer);
    returnTimer = setTimeout(function () {
      if (!playing && obsFrames.length && cur !== obsFrames.length - 1) { showFrame(obsFrames.length - 1); }
    }, cfg.radarReturnSec * 1000);
  }
  function setPlaying(v) {
    playing = v;
    if (v) { loops = 0; clearTimeout(returnTimer); preloadSatFrames(); }
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
      radarFails = 0; updateStatus();
      /* si la imagen de esta franja (:00, :10…) aún no está publicada, vuelve a mirar cada minuto (hasta 6 veces) */
      var past = r.past || [], last = past.length ? past[past.length - 1].time * 1000 : 0, slot = Date.now() - Date.now() % SLOT_MS;
      if (last < slot && radarWait < 6) { radarWait++; clearTimeout(radarTimer); radarTimer = setTimeout(loadRadar, 60000); return; }
      radarWait = 0; scheduleRadar();
    }, function () { radarFails++; updateStatus(); scheduleRadar(); });
  }
  /* ---- Análisis del radar alrededor de la ubicación (zoom 7, 3×3 teselas = 768 px, ~0,9 km por píxel) ----
     · si llueve ahora encima, · si una zona de lluvia se acerca y en cuántos minutos llegaría,
     · y un acumulado aproximado del día.  Si el navegador no puede leer las imágenes, se ignora. */
  var radarHere = null, radarEta = null, radarOk = false;
  var CELL = 6, GN = 128; // celdas de 6 px → rejilla 128×128 (~5,5 km por celda)
  function tilePos() {
    var z = 7, n = Math.pow(2, z), latR = cfg.lat * Math.PI / 180;
    var fx = (cfg.lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
    var tx = Math.floor(fx), ty = Math.floor(fy);
    return { z: z, tx: tx, ty: ty, cx: 256 + Math.floor((fx - tx) * 256), cy: 256 + Math.floor((fy - ty) * 256) };
  }
  function loadMosaic(f, tp, done) {
    var cv = document.createElement('canvas'); cv.width = 768; cv.height = 768;
    var ctx = cv.getContext('2d'), left = 9, failed = false;
    function one(dx, dy) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { ctx.drawImage(img, (dx + 1) * 256, (dy + 1) * 256); if (--left === 0 && !failed) { finish(); } };
      img.onerror = function () { if (!failed) { failed = true; done(null); } };
      img.src = radarHost + f.path + '/256/' + tp.z + '/' + (tp.tx + dx) + '/' + (tp.ty + dy) + '/' + RADAR_COLOR + '/1_0.png';
    }
    function finish() {
      try { done(ctx.getImageData(0, 0, 768, 768).data); } catch (e) { done(null); }
    }
    for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { one(dx, dy); } }
  }
  /* Tabla oficial «Universal Blue» de RainViewer (color → dBZ, desde 15 dBZ) y Marshall-Palmer (Z = 200·R^1,6) */
  var UB = [[136,221,238,15],[108,209,235,16],[81,197,232,17],[54,186,229,18],[27,174,226,19],[0,163,224,20],[0,154,213,21],[0,145,202,22],[0,136,191,23],[0,127,180,24],[0,119,170,25],[0,112,163,26],[0,105,156,27],[0,98,149,28],[0,91,142,29],[0,85,136,30],[0,81,128,31],[0,78,120,32],[0,74,112,33],[0,71,104,34],[255,238,0,35],[255,224,0,36],[255,210,0,37],[255,197,0,38],[255,183,0,39],[255,170,0,40],[255,159,0,41],[255,149,0,42],[255,139,0,43],[255,129,0,44],[255,68,0,45],[242,54,0,46],[230,40,0,47],[217,27,0,48],[205,13,0,49],[193,0,0,50],[168,0,0,51],[143,0,0,52],[118,0,0,53],[93,0,0,54],[255,170,255,55],[255,159,255,56],[255,149,255,57],[255,139,255,58],[255,129,255,59],[255,119,255,60],[255,108,255,61],[255,98,255,62],[255,88,255,63],[255,78,255,64],[255,255,255,65]];
  var colorCache = {};
  function pixDbz(d, o) {
    if (d[o + 3] < 200) { return 0; }                 // por debajo de 15 dBZ los colores son semitransparentes: se ignoran
    var key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
    if (colorCache[key] !== undefined) { return colorCache[key]; }
    var best = 0, bd = 1e9;
    for (var i = 0; i < UB.length; i++) {
      var dr = d[o] - UB[i][0], dg = d[o + 1] - UB[i][1], db = d[o + 2] - UB[i][2], dd = dr * dr + dg * dg + db * db;
      if (dd < bd) { bd = dd; best = UB[i][3]; }
    }
    colorCache[key] = bd < 6000 ? best : 0;
    return colorCache[key];
  }
  function dbzToMmh(z) { return z ? Math.pow(Math.pow(10, z / 10) / 200, 1 / 1.6) : 0; }
  function mmhLevel(r) { return r <= 0 ? 0 : (r < 2 ? 1 : (r < 10 ? 2 : 3)); }
  function pixLevel(d, o) { return mmhLevel(dbzToMmh(pixDbz(d, o))); }

  /* rejilla de celdas: nivel máximo si al menos un tercio de la celda tiene eco */
  function toGrid(d) {
    var g = new Uint8Array(GN * GN);
    for (var gy = 0; gy < GN; gy++) {
      for (var gx = 0; gx < GN; gx++) {
        var wet = 0, mx = 0;
        for (var y = gy * CELL; y < gy * CELL + CELL; y += 2) {
          for (var x = gx * CELL; x < gx * CELL + CELL; x += 2) {
            var l = pixLevel(d, (y * 768 + x) * 4); if (l) { wet++; if (l > mx) { mx = l; } }
          }
        }
        g[gy * GN + gx] = wet >= 3 ? mx : 0;
      }
    }
    return g;
  }
  function analyzeRadar() {
    if (cfg.demo || obsFrames.length < 4 || !radarHost) { return; }
    /* se compara con el fotograma de hace ~60 min (o el más antiguo) para medir mejor la velocidad */
    var tp = tilePos(), fNew = obsFrames[obsFrames.length - 1], fOld = obsFrames[Math.max(0, obsFrames.length - 7)];
    loadMosaic(fNew, tp, function (dNew) {
      if (!dNew) { radarOk = false; return; }
      /* lluvia encima ahora (5×5 px alrededor) */
      var wet = 0, lv = 0, sum = 0;
      for (var y = tp.cy - 2; y <= tp.cy + 2; y++) { for (var x = tp.cx - 2; x <= tp.cx + 2; x++) { var r = dbzToMmh(pixDbz(dNew, (y * 768 + x) * 4)); if (r > 0) { wet++; sum += r; lv = Math.max(lv, mmhLevel(r)); } } }
      radarHere = { time: fNew.time, wet: wet >= 3, level: mmhLevel(wet ? sum / wet : 0), mmh: wet ? sum / wet : 0 };
      radarOk = true;
      accumulate(radarHere);
      loadMosaic(fOld, tp, function (dOld) {
        var mins = (fNew.time - fOld.time) / 60, gN = toGrid(dNew), mv = dOld ? motion(toGrid(dOld), gN, mins) : null;
        radarEta = mv ? eta(null, gN, tp, mins, mv) : null;
        buildNowcast(dNew, tp, mv, fNew.time);
        if (W) { renderWeather(W); }
        checkSound();
      });
      if (W) { renderWeather(W); }
    });
  }
  /* desplazamiento que mejor encaja el fotograma viejo con el nuevo → velocidad → ¿llega aquí y cuándo? */
  /* movimiento de la lluvia entre dos fotogramas, en celdas por minuto (o null si no se puede medir) */
  function motion(gOld, gNew, minutes) {
    var nOld = 0, nNew = 0, k;
    for (k = 0; k < gOld.length; k++) { if (gOld[k]) { nOld++; } if (gNew[k]) { nNew++; } }
    if (nOld < 8 || nNew < 8) { return null; }
    var R = 12;
    function score(sx, sy) {
      var sc = 0;
      for (var y = Math.max(0, -sy); y < GN - Math.max(0, sy); y++) {
        var ro = y * GN, rn = (y + sy) * GN + sx;
        for (var x = Math.max(0, -sx); x < GN - Math.max(0, sx); x++) { if (gOld[ro + x] && gNew[rn + x]) { sc++; } }
      }
      return sc;
    }
    var best = -1, bx = 0, by = 0;
    for (var sy = -R; sy <= R; sy += 2) {           // búsqueda gruesa cada 2 celdas…
      for (var sx = -R; sx <= R; sx += 2) {
        var sc = score(sx, sy);
        if (sc > best || (sc === best && sx * sx + sy * sy < bx * bx + by * by)) { best = sc; bx = sx; by = sy; }
      }
    }
    var cx0 = bx, cy0 = by;                           // …y fina alrededor del mejor
    for (sy = cy0 - 1; sy <= cy0 + 1; sy++) {
      for (sx = cx0 - 1; sx <= cx0 + 1; sx++) {
        sc = score(sx, sy);
        if (sc > best) { best = sc; bx = sx; by = sy; }
      }
    }
    if (best < Math.min(nOld, nNew) * 0.3) { return null; }
    /* ajuste por debajo de una celda (parábola sobre los vecinos) */
    function sub(a, b0, c) { var den = a - 2 * b0 + c; return den < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0; }
    var fxs = bx + sub(score(bx - 1, by), best, score(bx + 1, by));
    var fys = by + sub(score(bx, by - 1), best, score(bx, by + 1));
    bx = fxs; by = fys;
    return { vx: bx / minutes, vy: by / minutes };
  }
  function eta(gOld, gNew, tp, minutes, mv) {
    var k;
    if (!mv) { return null; }
    var vx = mv.vx, vy = mv.vy;           // celdas por minuto
    if (vx * vx + vy * vy < 0.0004) { return null; }    // casi quieta
    var cx = tp.cx / CELL, cy = tp.cy / CELL;
    for (var t = 5; t <= 60; t += 5) {
      var lvl = 0;
      for (k = 0; k < gNew.length; k++) {
        if (!gNew[k]) { continue; }
        var px = (k % GN) + 0.5 + vx * t, py = Math.floor(k / GN) + 0.5 + vy * t;
        if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= 1.2) { lvl = Math.max(lvl, gNew[k]); }
      }
      if (lvl) { return { minutes: t, level: lvl, time: Math.floor(Date.now() / 1000), speed: Math.round(Math.sqrt(vx * vx + vy * vy) * CELL * 0.92 * 60) }; }
    }
    return null;
  }
  /* ---- Previsión con el radar real: la última imagen desplazada según el movimiento medido ---- */
  var ncFrames = [], ncLayers = [], NC_STEPS = [10, 20, 30, 40, 50, 60];
  function tileLatLng(x, y, z) {
    var n = Math.pow(2, z), lon = x / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return [lat, lon];
  }
  function buildNowcast(d, tp, mv, t0) {
    for (var i = 0; i < ncLayers.length; i++) { map.removeLayer(ncLayers[i]); }
    ncLayers = []; ncFrames = [];
    if (displayed && frames[cur] && frames[cur].kind === 'nc') { displayed = null; }
    if (!d) { rebuildFrames(); return; }
    var src = document.createElement('canvas'); src.width = 768; src.height = 768;
    var sctx = src.getContext('2d'), img = sctx.createImageData(768, 768);
    img.data.set(d);
    sctx.putImageData(img, 0, 0);
    var nw = tileLatLng(tp.tx - 1, tp.ty - 1, tp.z), se = tileLatLng(tp.tx + 2, tp.ty + 2, tp.z);
    var bounds = L.latLngBounds([se[0], nw[1]], [nw[0], se[1]]);
    var vxp = mv ? mv.vx * CELL : 0, vyp = mv ? mv.vy * CELL : 0;   // píxeles por minuto
    for (var k = 0; k < NC_STEPS.length; k++) {
      var m = NC_STEPS[k], cv = document.createElement('canvas'); cv.width = 768; cv.height = 768;
      cv.getContext('2d').drawImage(src, Math.round(vxp * m), Math.round(vyp * m));
      var layer = L.imageOverlay(cv.toDataURL('image/png'), bounds, { opacity: 0, interactive: false, zIndex: 6 });
      layer.addTo(map);
      ncLayers.push(layer);
      ncFrames.push({ time: t0 + m * 60, fade: 1 - k * 0.06 });
    }
    rebuildFrames();
  }

  /* acumulado del día con el radar (solo mientras la app está abierta) */
  var ACC_KEY = 'estacion-radar-acum';
  function accumulate(h) {
    if (!isHome) { return; }
    var d = now(), key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), a;
    try { a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) { a = null; }
    if (!a || a.day !== key) { a = { day: key, mm: 0, last: 0, since: d.getTime() }; }
    if (a.last && h.time > a.last) {
      var mins = Math.min(15, (h.time - a.last) / 60);
      a.mm += (h.wet ? Math.min(h.mmh || 0, 150) : 0) * mins / 60;
    }
    if (!a.last || h.time > a.last) { a.last = h.time; }
    try { localStorage.setItem(ACC_KEY, JSON.stringify(a)); } catch (e2) { /* sin almacenamiento */ }
  }
  /* devuelve el acumulado del radar si ha cubierto casi todo el día (desde antes de las 01:00), si no null */
  function radarRainToday() {
    if (!radarOk || !isHome) { return null; }
    var a, d = now();
    try { a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) { return null; }
    if (!a || a.day !== d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()) { return null; }
    var since = new Date(a.since);
    return since.getHours() < 1 ? a.mm : null;
  }

  function applyObs(host, list) {
    var key = list.length ? String(list[list.length - 1].time) + ':' + list.length : '';
    if (key === lastObsKey) { return; }
    lastObsKey = key;
    radarHost = host;
    obsFrames = list;
    rebuildFrames();
    analyzeRadar();
  }

  /* ---- Previsión +24 h: rejilla de puntos de Open-Meteo pintada en el navegador ---- */
  /* 17×13 = 221 puntos cada hora ≈ 5.300 llamadas/día: por debajo del límite gratuito (10.000) */
  var GRID = { cols: 13, rows: 10, dLat: 0.31, dLon: 0.5, up: 12 };
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
      '&hourly=precipitation,wind_speed_10m,wind_direction_10m&forecast_hours=28&timeformat=unixtime&timezone=GMT';
    /* La rejilla cuenta como muchas consultas en Open-Meteo: se guarda 50 min para no repetirla
       en cada recarga (si no, se alcanza el límite gratuito y el mapa se queda sin la parte del modelo) */
    var key = 'estacion-grid2-' + cfg.lat + ',' + cfg.lon + '-' + GRID.cols + 'x' + GRID.rows, cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { cached = null; }
    if (cached && cached.list && Date.now() - cached.at < 2 * 3600000) { applyGrid(cached.list); return; }
    clearTimeout(gridRetry);
    getJSON(url, function (d) {
      if (!d || !d.length || !d[0].hourly) { gridFail(cached, 'respuesta vacía'); return; }
      gridErr = '';
      var times = d[0].hourly.time, out = [];
      for (var k = 0; k < times.length; k++) {
        var vals = [], ws = [], wd = [];
        for (var p = 0; p < d.length; p++) {
          var hp = d[p].hourly;
          vals.push(hp.precipitation[k] || 0);
          ws.push(hp.wind_speed_10m ? Math.round(hp.wind_speed_10m[k] || 0) : 0);
          wd.push(hp.wind_direction_10m ? Math.round(hp.wind_direction_10m[k] || 0) : 0);
        }
        out.push({ time: times[k], vals: vals, ws: ws, wd: wd });
      }
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list: out })); } catch (e) { /* sin espacio */ }
      applyGrid(out);
    }, function (e) { gridFail(cached, e && e.message ? e.message.replace('HTTP 429', 'límite de Open-Meteo') : 'error'); });
  }
  /* si falla: usa la última rejilla guardada (aunque sea vieja) y reintenta a los 5 min */
  var gridRetry = null, gridErr = '';
  function gridFail(cached, why) {
    gridErr = why || 'error';
    layoutTimeline();
    if (cached && cached.list && Date.now() - cached.at < 6 * 3600000 && !fcFrames.length) { applyGrid(cached.list); }
    clearTimeout(gridRetry);
    gridRetry = setTimeout(loadForecastGrid, 5 * 60000);
  }

  var GRIDLIST = null;
  function applyGrid(list) {
    GRIDLIST = list; windFieldDirty = true;
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
      var txt = min < 1 ? 'ahora' : (min < 90 ? 'hace ' + min + ' min' : 'hace ' + Math.round(min / 60) + ' h');
      if (lastError) { el.className = 'warn'; el.textContent = 'Sin conexión · datos de ' + txt + ' · reintentando' + radarTxt; }
      else { el.className = radarOld ? 'warn' : ''; el.textContent = 'Actualizado ' + txt + (obsFresh() ? ' · ' + STN.station.replace(' aeropuerto', '') + ' ' + hhmm(new Date(STN.time)) : ' · modelo') + radarTxt; }
    }
    var bt = batteryTxt();
    if (bt) { el.textContent = bt.replace(/^ · /, '') + ' · ' + el.textContent.replace(/^Actualizado /, ''); el.className = 'warn'; }
    if (gpsNote) { el.textContent = '➤ ' + gpsNote; el.className = 'warn'; }
    if (frames.length) { showFrame(cur); }
  }

  /* Si falla, vuelve a probar a los 30 s, 1, 2 y 5 min; si va bien, a la frecuencia normal */
  var BACKOFF = [30, 60, 120, 300];
  /* Actualización a horas fijas: :00, :10, :20… (+15 s para que el servidor tenga el dato nuevo) */
  var SLOT_MS = 10 * 60000, SLOT_LAG = 15000;
  function nextSlot() { var n = Date.now(), t = n - n % SLOT_MS + SLOT_LAG; if (t <= n) { t += SLOT_MS; } return t; }
  function nextDelay(fails, normalMin) {
    if (!fails) { return Math.max(1000, nextSlot() - Date.now()); }
    return Math.min(BACKOFF[Math.min(fails, BACKOFF.length) - 1] * 1000, normalMin * 60000);
  }
  var weatherTimer = null, weatherFails = 0, radarTimer = null, radarFails = 0, radarWait = 0;
  /* mini cuenta atrás hasta la próxima actualización */
  function updateCountdown() {
    var el = $('cd'); if (!el) { return; }
    var left = Math.max(0, Math.round((nextSlot() - SLOT_LAG - Date.now()) / 1000));
    var deg = Math.round(360 * (1 - left / (SLOT_MS / 1000)));
    el.innerHTML = '<i style="background: conic-gradient(#5EC8FF ' + deg + 'deg, #22304A 0)"></i>' + (left ? Math.floor(left / 60) + ':' + pad(left % 60) : 'ahora');
  }
  function scheduleWeather() { clearTimeout(weatherTimer); weatherTimer = setTimeout(loadWeather, nextDelay(weatherFails, cfg.weatherEveryMin)); }
  function scheduleRadar() { clearTimeout(radarTimer); radarTimer = setTimeout(loadRadar, nextDelay(radarFails, cfg.radarEveryMin)); }

  function loadWeather() {
    if (cfg.demo) { renderWeather(demoWeather()); lastOk = Date.now() - 3 * 60000; updateStatus(); return; }
    getJSON(weatherUrl(), function (data) {
      try { renderWeather(data); } catch (e) { lastError = true; weatherFails++; updateStatus(); scheduleWeather(); return; }
      lastOk = Date.now(); lastError = false; weatherFails = 0;
      if (isHome) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: lastOk, data: data })); } catch (e2) { /* sin almacenamiento */ } }
      updateStatus(); scheduleWeather();
    }, function () { lastError = true; weatherFails++; updateStatus(); scheduleWeather(); });
  }
  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) { return; }
      var c = JSON.parse(raw);
      if (c && c.data && Date.now() - c.t < 24 * 3600 * 1000) { renderWeather(c.data); lastOk = c.t; updateStatus(); }
    } catch (e) { /* caché inválida */ }
  }

  /* ======================= Sonido ======================= */
  /* Los navegadores solo dejan sonar después de un primer toque en la pantalla */
  var actx = null, lastRainState = null;
  function unlockAudio() {
    if (!cfg.sound) { return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!actx && AC) { actx = new AC(); }
      if (actx && actx.state === 'suspended') { actx.resume(); }
    } catch (e) { actx = null; }
  }
  function chime(kind) {
    if (!cfg.sound || !actx || isNight()) { return; }
    try {
      var notes = kind === 'alert' ? [880, 660, 880] : [660, 880];
      var t0 = actx.currentTime + 0.05;
      for (var i = 0; i < notes.length; i++) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = notes[i];
        g.gain.setValueAtTime(0, t0 + i * 0.28);
        g.gain.linearRampToValueAtTime(cfg.soundVolume, t0 + i * 0.28 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.28 + 0.6);
        o.connect(g); g.connect(actx.destination);
        o.start(t0 + i * 0.28); o.stop(t0 + i * 0.28 + 0.65);
      }
    } catch (e) { /* sin sonido */ }
  }
  /* suena cuando empieza a llover (o va a llover en ≤30 min) y cuando entra un aviso nuevo */
  function checkSound() {
    var nh = $('nexthour'), wetSoon = nh.className.indexOf('wet') >= 0 && (/Lloviendo/.test(nh.textContent) || (/Lluvia en ~(\d+)/.test(nh.textContent) && +RegExp.$1 <= 30));
    if (lastRainState === false && wetSoon) { chime('rain'); }
    lastRainState = wetSoon;
  }
  var SEEN_KEY = 'estacion-avisos-vistos';
  function checkAlertSound(list) {
    var seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { seen = {}; }
    var isNew = false, keep = {};
    for (var i = 0; i < list.length; i++) {
      var id = list[i].level + '|' + list[i].event + '|' + list[i].onset;
      keep[id] = 1;
      if (!seen[id]) { isNew = true; }
    }
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(keep)); } catch (e2) { /* sin almacenamiento */ }
    if (isNew && AL && !cfg.demo) { chime('alert'); }
  }

  /* ======================= Modo noche y recarga diaria ======================= */
  var awakeUntil = 0, startedAt = Date.now(), wasNight = null;
  function applyNight() {
    var night = isNight() && Date.now() > awakeUntil && !isCompact();
    var clockMode = cfg.nightMode === 'reloj';
    var dim = $('dim');
    dim.style.opacity = night && !clockMode ? cfg.nightDim : 0;
    dim.style.display = night && !clockMode ? 'block' : 'none';
    $('nightclock').className = night && clockMode ? 'on' : '';
    if (night && clockMode) { updateNightClock(true); }
    if (night !== wasNight) { wasNight = night; if (playing) { schedule(); } setBrightness(night); }
  }
  /* Brillo de la pantalla con Fully Kiosk (necesita «Enable JavaScript Interface» en Fully):
     al mínimo de noche y el de siempre de día o al tocar la pantalla */
  var dayBright = null;
  function setBrightness(night) {
    var f = window.fully;
    if (!f || !f.setScreenBrightness) { return; }
    try {
      if (night) {
        if (dayBright === null && f.getScreenBrightness) { var b = +f.getScreenBrightness(); if (b > cfg.nightBrightness) { dayBright = b; } }
        f.setScreenBrightness(cfg.nightBrightness);
      } else {
        f.setScreenBrightness(dayBright !== null ? dayBright : cfg.dayBrightness);
      }
    } catch (e) { /* Fully sin interfaz JavaScript */ }
  }
  /* Pantalla de noche: solo hora, temperatura, lluvia y avisos. Se desplaza un poco cada minuto. */
  var ncShift = 0;
  function updateNightClock(move) {
    if ($('nightclock').className !== 'on') { return; }
    var d = now(), box = $('nightclock');
    box.querySelector('.nc-clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    box.querySelector('.nc-date').textContent = DOW_LONG[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
    if (W) {
      var w = wmo(W.current.weather_code, W.current.is_day);
      box.querySelector('.nc-now').innerHTML = svgIcon(w.kind) + '<span>' + $('temp').textContent + '</span>';
    }
    var nh = $('nexthour');
    box.querySelector('.nc-nh').textContent = nh.className.indexOf('hidden') >= 0 ? '' : nh.textContent.replace(/\s*·\s*/g, ' · ');
    box.querySelector('.nc-nh').className = 'nc-nh' + (nh.className.indexOf('wet') >= 0 ? ' wet' : '');
    var a = activeAlerts()[0];
    box.querySelector('.nc-al').innerHTML = a ? '<span class="' + a.level + '">' + LEVEL_NAME[a.level] + ' · ' + esc(a.event) + ' ' + whenTxt(a) + '</span>' : '';
    if (move) {
      ncShift = (ncShift + 1) % 6;
      var dx = [0, 24, -18, 12, -24, 6][ncShift], dy = [0, -14, 10, 18, -8, -18][ncShift];
      box.querySelector('.nc-in').style.webkitTransform = box.querySelector('.nc-in').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
  }
  /* el primer toque de noche solo despierta la pantalla: ese toque no llega a lo que hay detrás */
  var swallowUntil = 0;
  function wakeFromNight(e) {
    if (e && e.target && e.target.parentNode && e.target.parentNode.id === 'demobar') { return; }
    if (!isNight()) { return; }
    var asleep = Date.now() > awakeUntil && !isCompact();
    awakeUntil = Date.now() + 60000;
    if (asleep) {
      swallowUntil = Date.now() + 800;
      if (e && e.cancelable && e.preventDefault) { e.preventDefault(); }
      if (e && e.stopPropagation) { e.stopPropagation(); }
    }
    applyNight();
  }
  function swallowClick(e) {
    if (Date.now() < swallowUntil) { if (e.preventDefault) { e.preventDefault(); } if (e.stopPropagation) { e.stopPropagation(); } }
  }
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
    var time = [], temp = [], prob = [], prec = [], code = [], isDay = [], pres = [], cape = [], wsp = [], gst = [], wdir = [], rh = [], dew = [], vis = [], uvi = [];
    for (var hh = -24; hh < 192; hh++) {
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
      if (hh >= 36 && hh <= 41) { mm = [0.4, 1.6, 2.4, 3.2, 1.1, 0.3][hh - 36]; prec[prec.length - 1] = mm; prob[prob.length - 1] = 70; code[code.length - 1] = 61; }
      wsp.push(Math.round(10 + 8 * Math.sin(hh / 5)));
      gst.push(Math.round(22 + 16 * Math.sin(hh / 5) + (storm && rel >= 0 && rel < 6 ? 30 : 0)));
      wdir.push((40 + hh * 9) % 360);
      rh.push(Math.round(70 + 20 * Math.cos((hr - 5) / 24 * 2 * Math.PI)));
      dew.push(11 + Math.sin(hh / 9));
      vis.push(hr >= 4 && hr <= 7 ? 900 : 24000);
      uvi.push(hr >= 9 && hr <= 16 ? Math.max(0, 2.6 * Math.sin((hr - 8) / 9 * Math.PI)) : 0);
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
      hourly: { time: time, temperature_2m: temp, precipitation_probability: prob, precipitation: prec, weather_code: code, is_day: isDay, pressure_msl: pres, cape: cape, wind_speed_10m: wsp, wind_gusts_10m: gst, wind_direction_10m: wdir, relative_humidity_2m: rh, dew_point_2m: dew, visibility: vis, uv_index: uvi },
      daily: {
        time: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'],
        weather_code: [storm ? 95 : 2, 61, 3, 0, 0, 2, 61, 3],
        temperature_2m_max: [20, 19, 18, 19, 21, 20, 17, 16], temperature_2m_min: [12, 13, 11, 10, 11, 12, 11, 9],
        precipitation_probability_max: [storm ? 90 : 40, 70, 20, 0, 0, 10, 60, 30], precipitation_sum: [storm ? 36 : 4, 6.2, 0, 0, 0, 0, 3.1, 0.4],
        sunrise: ['2026-11-14T07:51', '2026-11-15T07:52', '2026-11-16T07:53', '2026-11-17T07:54', '2026-11-18T07:55', '2026-11-19T07:56', '2026-11-20T07:57', '2026-11-21T07:58'],
        sunset: ['2026-11-14T17:38', '2026-11-15T17:37', '2026-11-16T17:36', '2026-11-17T17:36', '2026-11-18T17:35', '2026-11-19T17:34', '2026-11-20T17:34', '2026-11-21T17:33'],
        uv_index_max: [2.1, 1.8, 2.4, 2.6, 2.5, 2.3, 1.5, 2], wind_gusts_10m_max: [storm ? 75 : 35, 45, 30, 25, 28, 30, 50, 40], wind_speed_10m_max: [storm ? 40 : 18, 24, 15, 12, 14, 15, 28, 20], wind_direction_10m_dominant: [45, 90, 315, 300, 330, 300, 90, 0], daylight_duration: [35220, 35100, 34980, 34860, 34740, 34620, 34500, 34400]
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
      var ws = [], wd = [];
      for (r = 0; r < GRID.rows; r++) { for (c = 0; c < GRID.cols; c++) { ws.push(Math.round(14 + 12 * Math.sin((c + r) / 3))); wd.push((300 + r * 6 - c * 4 + 360) % 360); } }
      out.push({ time: t0 + k * 3600, vals: vals, ws: ws, wd: wd });
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
    var opts = [['', 'Tarde 17:17'], ['amarillo', 'Aviso amarillo'], ['naranja', 'Aviso naranja'], ['rojo', 'Aviso rojo'], ['tarde', 'Noche 21:35'], ['noche', 'Reloj noche']];
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
      lastObsKey = ''; applyObs('', demoObs()); applyGrid(demoGrid()); loadLightning();
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

  /* ======================= Rayos (satélite MTG de EUMETSAT, vía la tarea de GitHub) ======================= */
  var LT = null, ltLayer = null, lastNearStrike = 0;
  function loadLightning() {
    if (!map) { return; }
    if (cfg.demo) { LT = demoLightning(); renderLightning(); return; }
    if (!cfg.lightningUrl) { return; }
    getJSON(cfg.lightningUrl + '?t=' + Date.now(), function (d) { LT = d; renderLightning(); }, function () { /* sin datos de rayos */ });
  }
  function distKm(la1, lo1, la2, lo2) {
    var r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
    var a = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
    return 12742 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function renderLightning() {
    if (ltLayer) { map.removeLayer(ltLayer); ltLayer = null; }
    var chip = $('chip-lt');
    var list = (isHome && LT && LT.strikes) || [], n = now().getTime(), shown = 0, near = null;
    if (!map.getPane('rayos')) { map.createPane('rayos'); map.getPane('rayos').style.zIndex = 460; map.getPane('rayos').style.pointerEvents = 'none'; }
    ltLayer = L.layerGroup();
    for (var i = 0; i < list.length; i++) {
      var s0 = list[i], age = (n - new Date(s0.t).getTime()) / 60000;
      if (age > 60 || age < -5) { continue; }
      shown++;
      var col = age < 10 ? '#FFFFFF' : (age < 30 ? '#FFE14D' : '#FF9A3D');
      L.marker([s0.lat, s0.lon], { pane: 'rayos', interactive: false, keyboard: false, icon: L.divIcon({ className: 'bolt', iconSize: [16, 16], iconAnchor: [8, 8],
        html: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" fill="' + col + '" stroke="#0B1220" stroke-width="1.5" stroke-linejoin="round"/></svg>' }) }).addTo(ltLayer);
      var dk = distKm(cfg.lat, cfg.lon, s0.lat, s0.lon);
      if (!near || dk < near.km) { near = { km: dk, age: age }; }
    }
    ltLayer.addTo(map);
    if (!shown) { chip.className = 'chip lt'; return; }
    var txt = shown + (shown === 1 ? ' rayo' : ' rayos') + ' en 1 h · el más cercano a ' + Math.round(near.km) + ' km';
    chip.innerHTML = lineIcon(I_BOLT, '#FFE14D', 'rgba(255,225,77,0.35)') + '<span>' + txt + '</span>';
    chip.className = 'chip lt on' + (near.km <= cfg.lightningNearKm ? ' near' : '');
    /* sonido si cae un rayo cerca (como mucho uno cada 15 min) */
    if (near.km <= cfg.lightningNearKm && near.age < 15 && Date.now() - lastNearStrike > 15 * 60000) { lastNearStrike = Date.now(); chime('alert'); }
  }
  function demoLightning() {
    var out = [], t = now().getTime();
    for (var i = 0; i < 40; i++) {
      out.push({ t: new Date(t - (i * 90000)).toISOString(), lat: cfg.lat - 0.35 + Math.sin(i) * 0.15 + i * 0.004, lon: cfg.lon - 0.45 + Math.cos(i * 1.7) * 0.18 + i * 0.006 });
    }
    return { updated: new Date().toISOString(), strikes: (cfg.demoAlert === 'naranja' || cfg.demoAlert === 'rojo') ? out : [] };
  }

  /* ======================= Ubicaciones: buscador y favoritos ======================= */
  /* BASE: el sitio de la configuración (avisos de AEMET, estación y rayos son de aquí).
     HOME: la «casa» de este dispositivo; por defecto la BASE, pero cada uno puede poner la suya (p. ej. Cambrils). */
  var BASE = { name: cfg.name, lat: cfg.lat, lon: cfg.lon, sub: 'Casa' }, isHome = true, awayTimer = null;
  var HOME = (function () { try { var h = JSON.parse(localStorage.getItem('estacion-casa') || 'null'); if (h && !isNaN(+h.lat) && !isNaN(+h.lon)) { h.sub = 'Casa'; return h; } } catch (e) { /* nada */ } return BASE; })();
  function setHome(l) {
    HOME = { name: l.name, lat: +l.lat, lon: +l.lon, sub: 'Casa' };
    try { if (kmBetween(HOME, BASE) < 0.5) { localStorage.removeItem('estacion-casa'); HOME = BASE; } else { localStorage.setItem('estacion-casa', JSON.stringify(HOME)); } } catch (e) { /* nada */ }
  }
  function rememberLoc(l) { if (isFixedTablet()) { return; } try { localStorage.setItem('estacion-ultimo', JSON.stringify({ name: l.name, lat: +l.lat, lon: +l.lon, sub: l.sub || '', gps: !!l.gps })); } catch (e) { /* nada */ } }

  /* ======================= Mi ubicación (GPS) ======================= */
  /* En el móvil o el PC se usa por defecto la ubicación del dispositivo; la tablet fija sigue en casa */
  var GPSLOC = null, curIsGps = false, gpsBusy = false, gpsNote = '';
  /* ¿pantalla fija en la pared? Se puede marcar a mano en el panel de ubicaciones; si no, se deduce (Fully Kiosk o Android antiguo) */
  function isFixedTablet() {
    var v = null; try { v = localStorage.getItem('estacion-fija'); } catch (e) { v = null; }
    if (v === '1') { return true; } if (v === '0') { return false; }
    return !!window.fully || /Android [4-7]/.test(navigator.userAgent);
  }
  function gpsAuto() {
    var v = null; try { v = localStorage.getItem('estacion-gps'); } catch (e) { v = null; }
    if (v === '1') { return true; } if (v === '0') { return false; }
    return !isFixedTablet() && !cfg.demo;
  }
  function setGpsAuto(on) { try { localStorage.setItem('estacion-gps', on ? '1' : '0'); } catch (e) { /* nada */ } }
  function locateMe(apply, done) {
    if (!navigator.geolocation || gpsBusy) { if (done) { done(false, 'Este navegador no permite saber la ubicación'); } return; }
    gpsBusy = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      gpsBusy = false;
      var la = Math.round(pos.coords.latitude * 1000) / 1000, lo = Math.round(pos.coords.longitude * 1000) / 1000;
      var l = { name: 'Mi ubicación', lat: la, lon: lo, sub: 'Ubicación del dispositivo', gps: true };
      GPSLOC = l;
      try { var old = JSON.parse(localStorage.getItem('estacion-gps-last') || 'null'); if (old && Math.abs(old.lat - la) < 0.02 && Math.abs(old.lon - lo) < 0.02) { l.name = old.name; } } catch (e) { /* nada */ }
      if (apply) { setLocation(l); }
      if (done) { done(true); }
      /* nombre del sitio (servicio gratuito sin clave) */
      getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + la + '&longitude=' + lo + '&localityLanguage=es', function (r) {
        var nm = r && (r.city || r.locality || r.principalSubdivision);
        if (!nm) { return; }
        l.name = nm; l.sub = 'Ubicación del dispositivo' + (r.principalSubdivision && r.principalSubdivision !== nm ? ' · ' + r.principalSubdivision : '');
        try { localStorage.setItem('estacion-gps-last', JSON.stringify({ name: nm, lat: la, lon: lo })); } catch (e) { /* nada */ }
        if (curIsGps && Math.abs(cfg.lat - la) < 0.001 && Math.abs(cfg.lon - lo) < 0.001) {
          cfg.name = nm; $('place').innerHTML = '<span class="gps-ic">➤</span>' + esc(nm); document.title = nm + ' · Estación meteorológica';
          if (pinMarker) { var el = pinMarker.getElement() && pinMarker.getElement().querySelector('.name'); if (el) { el.textContent = nm; } }
        }
        if ($('loc-gps')) { renderGpsRow(); }
      }, function () { /* sin nombre: se queda «Mi ubicación» */ });
    }, function (err) {
      gpsBusy = false;
      var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua), how;
      if (ios && /CriOS/.test(ua)) { how = 'Ajustes del iPhone → Chrome → Ubicación → «Al usar la app», y recarga la página'; }
      else if (ios) { how = 'Ajustes → Privacidad y seguridad → Localización → Sitios web de Safari → «Al usar la app», y recarga'; }
      else if (/Android/.test(ua)) { how = 'activa la Ubicación del móvil y, en Chrome, toca el candado de la barra → Permisos → Ubicación → Permitir, y recarga'; }
      else { how = 'permite la ubicación en el candado de la barra de direcciones y recarga'; }
      var why = !err ? 'No se pudo obtener la ubicación' : (err.code === 1 ? 'Sin permiso de ubicación: ' + how : (err.code === 3 ? 'La ubicación tardó demasiado; prueba otra vez' : 'Ubicación no disponible (¿está activada la ubicación del móvil?)'));
      if (done) { done(false, why); }
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
  }
  function renderGpsRow(msg) {
    var box = $('loc-gps'); if (!box) { return; }
    var on = gpsAuto();
    box.innerHTML = '<div class="loc-row' + (curIsGps ? ' cur' : '') + '" id="gps-row"><span class="loc-ic">➤</span><div class="loc-tx"><div class="loc-n">' + (GPSLOC ? esc(GPSLOC.name) : 'Mi ubicación') + '</div><div class="loc-s">' +
      (msg ? esc(msg) : (gpsBusy ? 'Buscando…' : 'Ubicación del dispositivo' + (curIsGps ? ' · viendo ahora' : ''))) + '</div></div>' +
      (GPSLOC ? '<button type="button" class="loc-star' + (findFav(getFavs(), GPSLOC) ? ' on' : '') + '" data-gpsfav="1" aria-label="Guardar en favoritos">' + (findFav(getFavs(), GPSLOC) ? '★' : '☆') + '</button>' : '') + '</div>' +
      '<label class="gps-auto"><input type="checkbox" id="gps-auto"' + (on ? ' checked' : '') + '> Abrir siempre con mi ubicación en este dispositivo</label>';
    $('gps-row').onclick = function (ev) {
      if (ev.stopPropagation) { ev.stopPropagation(); }
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-gpsfav')) { if (GPSLOC) { toggleFav({ name: GPSLOC.name, lat: GPSLOC.lat, lon: GPSLOC.lon, sub: GPSLOC.sub }); renderGpsRow(); renderFavList(); } return; }
      renderGpsRow('Buscando…');
      locateMe(true, function (ok, why) { if (ok) { closeDay(); } else { renderGpsRow(why); } });
    };
    $('gps-auto').onchange = function () { setGpsAuto(this.checked); if (this.checked && !curIsGps) { locateMe(true); } };
  }
  var FAV_KEY = 'estacion-favoritos';
  function getFavs() {
    var f = [];
    try { f = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { f = []; }
    /* los favoritos de config.js también aparecen */
    for (var i = 0; i < cfg.favorites.length; i++) { if (!findFav(f, cfg.favorites[i])) { f.push(cfg.favorites[i]); } }
    return f;
  }
  function findFav(list, l) {
    for (var i = 0; i < list.length; i++) { if (Math.abs(list[i].lat - l.lat) < 0.01 && Math.abs(list[i].lon - l.lon) < 0.01) { return list[i]; } }
    return null;
  }
  function saveFavs(f) { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) { /* sin almacenamiento */ } }
  function toggleFav(l) {
    var f = getFavs(), out = [], had = false;
    for (var i = 0; i < f.length; i++) { if (Math.abs(f[i].lat - l.lat) < 0.01 && Math.abs(f[i].lon - l.lon) < 0.01) { had = true; } else { out.push(f[i]); } }
    if (!had) { out.push({ name: l.name, lat: l.lat, lon: l.lon, sub: l.sub || '' }); }
    saveFavs(out);
    return !had;
  }

  function kmBetween(a, b) {
    var R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function setLocation(l) {
    if (!l || isNaN(+l.lat) || isNaN(+l.lon) || (+l.lat === 0 && +l.lon === 0)) { return; }
    /* a menos de 15 km de casa cuenta como casa (avisos de AEMET y estación de Reus siguen valiendo) */
    isHome = kmBetween(l, BASE) < 15;
    rememberLoc(l);
    /* el nombre es siempre el del sitio elegido (antes, un favorito cercano salía como «Salou») */
    var atHome = !l.gps && kmBetween(l, HOME) < 0.5;
    cfg.name = atHome ? HOME.name : (l.name || HOME.name); cfg.lat = +l.lat; cfg.lon = +l.lon;
    curIsGps = !!l.gps;
    $('place').innerHTML = (curIsGps ? '<span class="gps-ic">➤</span>' : '') + esc(cfg.name);
    $('place-home').className = atHome ? '' : 'on';
    document.title = cfg.name + ' · Estación meteorológica';
    if (pinMarker) { pinMarker.setLatLng([cfg.lat, cfg.lon]); var nm = pinMarker.getElement() && pinMarker.getElement().querySelector('.name'); if (nm) { nm.textContent = cfg.name; } }
    userMoved = false; fixMapSize();
    radarHere = null; radarEta = null; lastOk = 0; buildNowcast(null);
    clearTimeout(weatherTimer);
    loadWeather(); loadForecastGrid(); loadSea(); loadAir(); loadNormals(); loadModels();
    analyzeRadar(); renderAlerts(); renderLightning(); updateStatus();
    clearTimeout(awayTimer);
    if (!atHome && !curIsGps && cfg.locReturnMin && isFixedTablet()) { armAway(); }
  }
  /* fuera de casa: vuelve sola a la ubicación principal tras unos minutos sin tocar */
  function armAway() {
    clearTimeout(awayTimer);
    if (kmBetween({ lat: cfg.lat, lon: cfg.lon }, HOME) < 0.5 || curIsGps || !cfg.locReturnMin || !isFixedTablet()) { return; } // solo la tablet fija vuelve sola
    /* vuelve a casa; en el móvil con «mi ubicación» activada, vuelve a donde estás */
    awayTimer = setTimeout(function () { closeDay(); if (gpsAuto() && GPSLOC) { setLocation(GPSLOC); } else { setLocation(HOME); } }, cfg.locReturnMin * 60000);
  }

  function locRow(l, kind) {
    var fav = !!findFav(getFavs(), l), cur = Math.abs(l.lat - cfg.lat) < 0.01 && Math.abs(l.lon - cfg.lon) < 0.01;
    return '<div class="loc-row' + (cur ? ' cur' : '') + '" data-lat="' + l.lat + '" data-lon="' + l.lon + '" data-name="' + esc(l.name) + '" data-sub="' + esc(l.sub || '') + '">' +
      '<span class="loc-ic">' + (kind === 'home' ? '⌂' : '•') + '</span><div class="loc-tx"><div class="loc-n">' + esc(l.name) + '</div><div class="loc-s">' + esc(l.sub || '') + (cur ? ' · viendo ahora' : '') + '</div></div>' +
      (kind === 'home' ? '' : '<button type="button" class="loc-home" title="Poner como casa" aria-label="Poner como casa">⌂</button><button type="button" class="loc-star' + (fav ? ' on' : '') + '" aria-label="' + (fav ? 'Quitar de favoritos' : 'Añadir a favoritos') + '">' + (fav ? '★' : '☆') + '</button>') + '</div>';
  }
  function renderFavList() {
    var f = getFavs(), h = locRow(HOME, 'home');
    for (var i = 0; i < f.length; i++) { h += locRow(f[i], 'fav'); }
    if (!f.length) { h += '<div class="loc-empty">Busca un sitio y pulsa ☆ para guardarlo aquí.</div>'; }
    $('loc-favs').innerHTML = h;
  }
  var searchT = null, searchN = 0;
  function searchPlaces(q) {
    var box = $('loc-res');
    if (q.length < 2) { box.innerHTML = ''; return; }
    var my = ++searchN;
    box.innerHTML = '<div class="loc-empty">Buscando…</div>';
    getJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=8&language=es&format=json', function (d) {
      if (my !== searchN) { return; }
      var r = (d && d.results) || [], h = '';
      for (var i = 0; i < r.length; i++) {
        var sub = [r[i].admin2 && r[i].admin2 !== r[i].name ? r[i].admin2 : '', r[i].admin1, r[i].country].filter(function (x) { return !!x; }).join(', ');
        h += locRow({ name: r[i].name, lat: +r[i].latitude.toFixed(4), lon: +r[i].longitude.toFixed(4), sub: sub }, 'res');
      }
      box.innerHTML = h || '<div class="loc-empty">No encuentro «' + esc(q) + '».</div>';
    }, function () { if (my === searchN) { box.innerHTML = '<div class="loc-empty">Sin conexión con el buscador.</div>'; } });
  }
  function openLocations() {
    $('daypanel').innerHTML = '<div class="dp-box loc"><div class="dp-head"><div class="dp-t"><div class="dp-n">Ubicaciones</div><div class="dp-c">¿Qué sitio quieres ver?</div></div>' +
      '<button type="button" class="dp-x" aria-label="Cerrar">×</button></div>' +
      '<div id="loc-gps"></div>' +
      '<input id="loc-q" type="search" autocomplete="off" placeholder="Buscar ciudad o pueblo… (p. ej. Tarragona, Madrid)">' +
      '<div id="loc-res"></div><div class="al-k">Favoritos</div><div id="loc-favs"></div>' +
      '<label class="gps-auto"><input type="checkbox" id="fixed-dev"' + (isFixedTablet() ? ' checked' : '') + '> Pantalla fija (como la tablet de la pared): vuelve sola a casa a los ' + cfg.locReturnMin + ' min</label>' +
      '<div class="dp-foot">Pulsa ⌂ en un sitio para ponerlo como casa · ' + (cfg.locReturnMin && isFixedTablet() ? 'Si ves otro sitio, vuelve sola a ' + esc(HOME.name) + ' a los ' + cfg.locReturnMin + ' min sin tocar · ' : 'Se queda el último sitio que elijas · ') + 'Todo se guarda en este dispositivo</div></div>';
    renderFavList();
    renderGpsRow();
    $('fixed-dev').onchange = function () { try { localStorage.setItem('estacion-fija', this.checked ? '1' : '0'); } catch (e) { /* nada */ } clearTimeout(awayTimer); if (this.checked) { armAway(); } };
    $('daypanel').className = 'on';
    clearTimeout(dayTimer);
    var q = $('loc-q');
    q.oninput = function () { clearTimeout(searchT); var v = this.value.replace(/^\s+|\s+$/g, ''); searchT = setTimeout(function () { searchPlaces(v); }, 400); };
  }
  function onLocClick(t) {
    var g = t; while (g && g.id !== 'daypanel') { if (g.id === 'loc-gps') { return true; } g = g.parentNode; }
    /* estrella: guardar o quitar de favoritos */
    if (t.className && String(t.className).indexOf('loc-home') >= 0) {
      var rh = t.parentNode;
      setHome({ name: rh.getAttribute('data-name'), lat: +rh.getAttribute('data-lat'), lon: +rh.getAttribute('data-lon') });
      setLocation(HOME); closeDay();
      return true;
    }
    if (t.className && String(t.className).indexOf('loc-star') >= 0) {
      var r0 = t.parentNode, l0 = { name: r0.getAttribute('data-name'), lat: +r0.getAttribute('data-lat'), lon: +r0.getAttribute('data-lon'), sub: r0.getAttribute('data-sub') };
      var on = toggleFav(l0);
      t.className = 'loc-star' + (on ? ' on' : ''); t.textContent = on ? '★' : '☆';
      renderFavList();
      return true;
    }
    var row = t;
    while (row && row.id !== 'daypanel' && !(row.className && String(row.className).indexOf('loc-row') >= 0)) { row = row.parentNode; }
    if (row && row.id !== 'daypanel') {
      /* solo filas con coordenadas válidas (nunca 0,0 por un toque en «Mi ubicación») */
      if (!row.getAttribute('data-lat') || isNaN(+row.getAttribute('data-lat'))) { return true; }
      setLocation({ name: row.getAttribute('data-name'), lat: +row.getAttribute('data-lat'), lon: +row.getAttribute('data-lon') });
      closeDay();
      return true;
    }
    return false;
  }

  /* ======================= Batería de la tablet ======================= */
  /* Avisa si la tablet deja de cargar (cargador suelto o enchufe apagado) o si la batería baja */
  var BAT = null;
  function watchBattery() {
    try {
      if (!navigator.getBattery) { return; }
      navigator.getBattery().then(function (b) {
        function upd() { BAT = { level: Math.round(b.level * 100), charging: b.charging }; updateStatus(); }
        upd();
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
      }, function () {});
    } catch (e) { /* no disponible */ }
  }
  function batteryTxt() {
    if (!BAT || cfg.demo) { return ''; }
    if (!BAT.charging) { return ' · ⚠ ' + BAT.level + ' % sin cargar'; }
    if (BAT.level <= cfg.batteryWarn) { return ' · Batería ' + BAT.level + ' %'; }
    return '';
  }

  /* ======================= Actualización automática y uso sin conexión ======================= */
  var APP_V = (document.querySelector('meta[name="app-version"]') || {}).content || '';
  function checkVersion() {
    if (cfg.demo || !cfg.autoUpdate || !APP_V || APP_V.indexOf('__') === 0) { return; }
    getJSON('version.json?t=' + Date.now(), function (d) {
      if (d && d.v && d.v !== APP_V) {
        /* no recarga si estás mirando algo; lo intenta en el siguiente ciclo */
        if (full || $('daypanel').className === 'on') { return; }
        location.reload();
      }
    }, function () { /* sin conexión: ya se comprobará */ });
  }
  function registerSW() {
    if (cfg.demo || !('serviceWorker' in navigator) || location.protocol !== 'https:') { return; }
    try { navigator.serviceWorker.register('sw.js').then(function () {}, function () {}); } catch (e) { /* no disponible */ }
  }

  /* Para diagnosticar desde la consola del navegador: estacionDebug() */
  window.estacionDebug = function () { return { home: isHome, place: cfg.name, obs: STN, obsFresh: obsFresh(), alerts: AL, radarHere: radarHere, radarEta: radarEta, battery: BAT, version: APP_V }; };

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
    loadObs();
    loadAir();
    loadNormals();
    loadModels();
    setInterval(loadModels, 60 * 60000);
    initSatellite();
    initWind();
    /* móvil/PC: empieza en la ubicación del dispositivo (si das permiso); si no, en casa */
    /* Configurar por la dirección web (útil para dejarla puesta en Fully o en favoritos del navegador):
       ?casa=Cambrils (busca el pueblo) · ?name=Cambrils&lat=41.07&lon=1.06 (sitio exacto) · ?fija=1 o ?fija=0 */
    if (Q.fija === '1' || Q.fija === '0') { try { localStorage.setItem('estacion-fija', Q.fija); } catch (e) { /* nada */ } }
    if (Q.casa) {
      getJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(Q.casa) + '&count=1&language=es&format=json', function (d) {
        var r = d && d.results && d.results[0];
        if (r) { setHome({ name: r.name, lat: +r.latitude.toFixed(4), lon: +r.longitude.toFixed(4) }); setLocation(HOME); }
      }, function () { /* sin buscador */ });
    }
    var last = null; try { last = JSON.parse(localStorage.getItem('estacion-ultimo') || 'null'); } catch (e) { last = null; }
    if (isFixedTablet() && HOME !== BASE) { setLocation(HOME); }
    else if (!isFixedTablet() && !gpsAuto() && last && !last.gps) { setLocation(last); }
    else if (!isFixedTablet() && HOME !== BASE && !gpsAuto()) { setLocation(HOME); }
    if (gpsAuto()) {
      if (last && !last.gps) { setLocation(last); }
      else if (HOME !== BASE) { setLocation(HOME); }
      locateMe(!(last && !last.gps), function (ok, why) { if (!ok) { gpsNote = why + ' · se muestra ' + cfg.name; updateStatus(); setTimeout(function () { gpsNote = ''; updateStatus(); }, 20000); } });
      var lastLoc = Date.now();
      document.addEventListener('visibilitychange', function () { if (!document.hidden && gpsAuto() && (curIsGps || isHome) && Date.now() - lastLoc > 30 * 60000) { lastLoc = Date.now(); locateMe(true); } });
    }
    antiBurn();
    registerSW();
    watchBattery();
    loadLightning();

    $('play').onclick = function () {
      var wasPlaying = playing;
      setPlaying(!playing);
      /* al pausar, vuelve a la imagen de ahora */
      if (wasPlaying) { clearTimeout(returnTimer); showFrame(obsFrames.length ? obsFrames.length - 1 : 0); }
      touchFull();
    };
    $('fullclose').onclick = exitFull;
    $('wide-alert').onclick = openAlerts;
    $('now').onclick = openHistory;
    /* tarjeta «Mañana»: abre el detalle de ese día */
    $('tomorrow').onclick = function () { openDay(now().getHours() < 12 ? 0 : 1); };
    var cards = { 'wind': 'wind', 'hum': 'hum', 'rain': 'rain', 'press': 'press', 'sea': 'sea', 'sun': 'sun' };
    for (var ck in cards) {
      if (cards.hasOwnProperty(ck)) {
        (function (key) { var el = $(key); if (el && el.parentNode) { el.parentNode.className += ' tap'; el.parentNode.onclick = function () { openStat(key); }; } })(ck);
      }
    }
    $('place-btn').onclick = openLocations;
    $('place-home').onclick = function (e) { if (e.stopPropagation) { e.stopPropagation(); } setLocation(HOME); };
    document.addEventListener('touchstart', armAway, false);
    document.addEventListener('mousedown', armAway, false);
    $('col-alert').onclick = function () { if (this.className.indexOf('calm') < 0) { openAlerts(); } };
    $('days').onclick = function (e) {
      var t = e.target;
      while (t && t !== this && !(t.getAttribute && t.getAttribute('data-j') !== null)) { t = t.parentNode; }
      if (t && t !== this) { openDay(parseInt(t.getAttribute('data-j'), 10)); }
    };
    $('daypanel').onclick = function (e) {
      var t = e.target;
      if (t === this || (t.className && String(t.className).indexOf('dp-x') >= 0)) { closeDay(); return; }
      if (onLocClick(t)) { return; }
      /* en el panel de avisos: abrir o cerrar el detalle del aviso pulsado */
      var row = t;
      while (row && row !== this && !(row.className && String(row.className).indexOf('al-row') >= 0)) { row = row.parentNode; }
      if (row && row !== this) { row.className = row.className.indexOf(' open') >= 0 ? row.className.replace(' open', '') : row.className + ' open'; }
      else if (!$('loc-q')) { clearTimeout(dayTimer); dayTimer = setTimeout(closeDay, 30000); }
    };
    $('track').onclick = function (e) {
      if (!frames.length) { return; }
      var r = this.getBoundingClientRect(), pct = (e.clientX - r.left) / r.width * 100, best = 0, bd = 1e9;
      for (var i = 0; i < frames.length; i++) { var dd = Math.abs(framePos(i) - pct); if (dd < bd) { bd = dd; best = i; } }
      setPlaying(false);
      showFrame(best);
      touchFull();
      scheduleReturn();
    };
    $('clock').ondblclick = toggleFullscreen;
    $('temp').ondblclick = toggleFullscreen;

    setTimeout(fixMapSize, 600);
    setTimeout(fixMapSize, 2500);

    setInterval(function () { updateClock(); if (full) { updateFullInfo(); } updateNightClock(false); }, 5000);
    setInterval(updateStatus, 30000);
    updateCountdown(); setInterval(updateCountdown, 1000);
    setInterval(minuteTick, 60000);
    setInterval(loadForecastGrid, cfg.forecastEveryMin * 60000);
    setInterval(loadSea, cfg.seaEveryMin * 60000);
    /* avisos y estación también a horas fijas (:00, :10, :20…) */
    (function slotTick() { setTimeout(function () { loadAlerts(); loadObs(); loadHist(); slotTick(); }, Math.max(1000, nextSlot() - Date.now())); })();
    loadHist();
    watchdog();
    setInterval(loadAir, 60 * 60000);
    setInterval(checkVersion, 10 * 60000);
    setInterval(loadLightning, 5 * 60000);
    minuteTick();
    if (cfg.demo) { demoBar(); }
    var cap = { capture: true, passive: false };
    try { document.addEventListener('touchstart', wakeFromNight, cap); } catch (e) { document.addEventListener('touchstart', wakeFromNight, true); }
    document.addEventListener('mousedown', wakeFromNight, true);
    ['click', 'touchend', 'mouseup', 'pointerup', 'pointerdown'].forEach(function (ev) { document.addEventListener(ev, swallowClick, true); });
    document.addEventListener('touchstart', unlockAudio, false);
    document.addEventListener('mousedown', unlockAudio, false);

    keepAwake();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { keepAwake(); clearTimeout(weatherTimer); clearTimeout(radarTimer); loadWeather(); loadRadar(); }
    });
    var rsT = null;
    window.addEventListener('resize', function () { clearTimeout(rsT); rsT = setTimeout(onLayoutChange, 200); });
    window.addEventListener('orientationchange', function () { setTimeout(onLayoutChange, 400); });
    if (MQ && MQ.addListener) { MQ.addListener(onLayoutChange); }
    applyCompactMap();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
