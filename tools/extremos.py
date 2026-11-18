#!/usr/bin/env python3
"""Récords oficiales de la estación (valores extremos de AEMET OpenData), por mes y absolutos.

Se descargan una vez a la semana (cambian muy poco) y se guardan en extremos.json.
Necesita AEMET_API_KEY.
"""
import json, os, time, urllib.request
from datetime import datetime, timedelta, timezone

CLAVE = os.environ.get("AEMET_API_KEY", "").strip()
ESTACION = os.environ.get("ESTACION", "0016A")
OUT = os.environ.get("SALIDA", "extremos.json")
API = "https://opendata.aemet.es/opendata/api/valores/climatologicos/valoresextremos/parametro/{}/estacion/{}?api_key={}"


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


def main():
    if not CLAVE:
        print("Sin AEMET_API_KEY")
        return
    try:
        old = json.load(open(OUT, encoding="utf-8"))
        if datetime.now(timezone.utc) - datetime.fromisoformat(old["updated"]) < timedelta(days=7) and old.get("raw"):
            print("extremos.json al día")
            return
    except Exception:
        pass
    raw = {}
    for p in ("T", "P", "V"):
        try:
            meta = get(API.format(p, ESTACION, CLAVE))
            if str(meta.get("estado")) == "200" and meta.get("datos"):
                d = get(meta["datos"])
                raw[p] = d[0] if isinstance(d, list) and d else d
            else:
                print(p, meta.get("estado"), meta.get("descripcion"))
        except Exception as e:
            print("Fallo", p, e)
        time.sleep(2)
    if not raw:
        return
    data = {"updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "id": ESTACION, "raw": raw}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("extremos.json:", {k: list(v.keys()) if isinstance(v, dict) else type(v).__name__ for k, v in raw.items()})


if __name__ == "__main__":
    main()
