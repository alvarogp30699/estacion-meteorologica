#!/usr/bin/env python3
"""Descarga las observaciones de una estación de AEMET OpenData y deja un resumen en observacion.json.

Necesita la clave gratuita de AEMET OpenData en el secreto AEMET_API_KEY del repositorio.
Sin clave no hace nada (la web usa entonces el modelo de Open-Meteo y el radar).
Estación: variable ESTACION (por defecto 0016A, Reus Aeropuerto).
"""
import json, os, sys, urllib.request
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

CLAVE = os.environ.get("AEMET_API_KEY", "").strip()
ESTACION = os.environ.get("ESTACION", "0016A")
NOMBRE = os.environ.get("ESTACION_NOMBRE", "Reus aeropuerto")
OUT = os.environ.get("SALIDA", "observacion.json")
TZ = ZoneInfo("Europe/Madrid")
API = "https://opendata.aemet.es/opendata/api/observacion/convencional/datos/estacion/"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "estacion-meteorologica (uso personal)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    for enc in ("utf-8", "latin-1"):
        try:
            return json.loads(raw.decode(enc))
        except Exception:
            continue
    raise ValueError("respuesta no válida")


def fecha(s):
    s = str(s).replace("+0000", "+00:00")
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def kmh(v):
    return None if v is None else round(float(v) * 3.6, 1)


def resumir(datos, ahora):
    obs = sorted((o for o in datos if o.get("fint")), key=lambda o: o["fint"])
    if not obs:
        raise ValueError("sin observaciones")
    u = obs[-1]
    hoy = ahora.astimezone(TZ).date()
    lluvia = 0.0
    for o in obs:
        # 'prec' es la lluvia de la hora que termina en 'fint'
        if fecha(o["fint"]).astimezone(TZ).date() == hoy and o.get("prec") is not None:
            lluvia += float(o["prec"])
    return {
        "station": NOMBRE, "id": ESTACION,
        "time": fecha(u["fint"]).isoformat(),
        "temp": u.get("ta"), "hum": u.get("hr"),
        "wind": kmh(u.get("vv")), "gust": kmh(u.get("vmax")), "dir": u.get("dv"),
        "pressure": u.get("pres_nmar"),
        "rain_1h": u.get("prec"), "rain_today": round(lluvia, 1),
    }


def main():
    if len(sys.argv) > 1:  # prueba local: python tools/observacion.py datos.json
        datos = json.load(open(sys.argv[1], encoding="utf-8"))
    else:
        if not CLAVE:
            print("Sin AEMET_API_KEY: no se descargan observaciones (la web usará el modelo).")
            return
        meta = get(API + ESTACION + "?api_key=" + CLAVE)
        if str(meta.get("estado")) != "200" or not meta.get("datos"):
            print("AEMET respondió:", meta.get("estado"), meta.get("descripcion"))
            return
        datos = get(meta["datos"])
    ahora = datetime.now(timezone.utc)
    r = resumir(datos, ahora)
    previo = {}
    if os.path.exists(OUT):
        try:
            previo = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            pass
    if previo.get("time") == r["time"] and previo.get("rain_today") == r["rain_today"]:
        print("Sin observaciones nuevas (", r["time"], ")")
        return
    r["updated"] = ahora.replace(microsecond=0).isoformat()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=1)
    print("Escrito", OUT, ":", r["station"], r["time"], r["temp"], "°C,", r["rain_today"], "mm hoy")


if __name__ == "__main__":
    main()
