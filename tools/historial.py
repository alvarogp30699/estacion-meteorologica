#!/usr/bin/env python3
"""Historial propio de la estación: máxima, mínima, lluvia y racha de cada día, medidas (no del modelo).

- Cada ejecución añade las horas nuevas de observacion.json y recalcula los últimos días.
- Una vez al día pide a AEMET los valores climatológicos diarios oficiales (llegan con unos días de retraso)
  y sustituyen a los calculados. La primera vez rellena desde el 1 de enero del año pasado.
Necesita AEMET_API_KEY (la misma que observacion.py). Escribe historial.json.
"""
import json, os, time, urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

CLAVE = os.environ.get("AEMET_API_KEY", "").strip()
ESTACION = os.environ.get("ESTACION", "0016A")
NOMBRE = os.environ.get("ESTACION_NOMBRE", "Reus aeropuerto")
OBS = os.environ.get("OBS", "observacion.json")
OUT = os.environ.get("SALIDA", "historial.json")
TZ = ZoneInfo("Europe/Madrid")
API = "https://opendata.aemet.es/opendata/api/valores/climatologicos/diarios/datos/fechaini/{}T00:00:00UTC/fechafin/{}T23:59:59UTC/estacion/{}?api_key={}"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "estacion-meteorologica (uso personal)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
    for enc in ("utf-8", "latin-1"):
        try:
            return json.loads(raw.decode(enc))
        except Exception:
            continue
    raise ValueError("respuesta no válida")


def num(v):
    """AEMET da '12,5', 'Ip' (inapreciable), 'Acum' o vacío."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    v = str(v).strip().replace(",", ".")
    if v == "Ip":
        return 0.0
    try:
        return float(v)
    except ValueError:
        return None


def climatologicos(ini, fin):
    meta = get(API.format(ini.isoformat(), fin.isoformat(), ESTACION, CLAVE))
    if str(meta.get("estado")) != "200" or not meta.get("datos"):
        print("AEMET (diarios", ini, "-", fin, "):", meta.get("estado"), meta.get("descripcion"))
        return {}
    out = {}
    for d in get(meta["datos"]):
        racha = num(d.get("racha"))
        out[d["fecha"]] = {"tmax": num(d.get("tmax")), "tmin": num(d.get("tmin")), "rain": num(d.get("prec")),
                           "gust": round(racha * 3.6, 1) if racha is not None else None, "src": "aemet"}
    return out


def main():
    H = {"station": NOMBRE, "id": ESTACION, "days": {}, "hours": {}, "climaAt": None}
    if os.path.exists(OUT):
        try:
            H.update(json.load(open(OUT, encoding="utf-8")))
        except Exception:
            pass
    ahora = datetime.now(timezone.utc)

    # 1) horas nuevas de la observación (últimas 24 h)
    try:
        ob = json.load(open(OBS, encoding="utf-8"))
        for h in ob.get("hours", []):
            H["hours"][h["t"]] = {k: h.get(k) for k in ("temp", "tmax", "tmin", "rain", "gust")}
    except Exception as e:
        print("Sin observacion.json:", e)
    corte = (ahora - timedelta(days=4)).isoformat()
    H["hours"] = {t: v for t, v in H["hours"].items() if t >= corte}

    # 2) días recientes calculados con las horas (si aún no hay dato oficial)
    por_dia = {}
    for t, v in H["hours"].items():
        # la hora que termina a las HH:00 pertenece al día de la hora anterior
        dloc = (datetime.fromisoformat(t) - timedelta(minutes=1)).astimezone(TZ).date().isoformat()
        por_dia.setdefault(dloc, []).append(v)
    for dkey, hs in por_dia.items():
        if H["days"].get(dkey, {}).get("src") == "aemet":
            continue
        mx = [x for h in hs for x in (h.get("tmax"), h.get("temp")) if x is not None]
        mn = [x for h in hs for x in (h.get("tmin"), h.get("temp")) if x is not None]
        rn = [h["rain"] for h in hs if h.get("rain") is not None]
        gs = [h["gust"] for h in hs if h.get("gust") is not None]
        if not mx:
            continue
        H["days"][dkey] = {"tmax": max(mx), "tmin": min(mn), "rain": round(sum(rn), 1) if rn else None,
                           "gust": max(gs) if gs else None, "src": "horas", "n": len(hs)}

    # 3) valores oficiales una vez al día (y relleno inicial desde el 1 de enero del año pasado)
    hoy = ahora.astimezone(TZ).date()
    if CLAVE and (not H.get("climaAt") or ahora - datetime.fromisoformat(H["climaAt"]) > timedelta(hours=20)):
        oficiales = [d for d, v in H["days"].items() if v.get("src") == "aemet"]
        ini = date(hoy.year - 1, 1, 1) if not oficiales else hoy - timedelta(days=12)
        while ini <= hoy:
            fin = min(ini + timedelta(days=150), hoy)
            try:
                H["days"].update(climatologicos(ini, fin))
            except Exception as e:
                print("Fallo al pedir diarios:", e)
                break
            ini = fin + timedelta(days=1)
            time.sleep(2)
        H["climaAt"] = ahora.replace(microsecond=0).isoformat()

    H["days"] = dict(sorted(H["days"].items()))
    H["updated"] = ahora.replace(microsecond=0).isoformat()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(H, f, ensure_ascii=False, separators=(",", ":"))
    print(len(H["days"]), "días en el historial; último:", list(H["days"].items())[-1] if H["days"] else None)


if __name__ == "__main__":
    main()
