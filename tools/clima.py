"""Precalcula el clima de tu ubicación para que la tablet no tenga que descargar 80 años de datos.

Normales 1991–2020 (máx., mín. y lluvia por día del año) y récords de calor y frío desde 1940,
a partir del histórico ERA5 de Open-Meteo. Se rehace solo si clima.json tiene más de 30 días.
"""
import json, os, urllib.request
from datetime import date, datetime, timezone, timedelta

LAT, LON = os.environ.get("LAT", "41.0765"), os.environ.get("LON", "1.1414")
OUT = os.environ.get("SALIDA", "clima.json")

def doy(d):
    k = d.timetuple().tm_yday - 1
    if d.year % 4 == 0 and (d.year % 100 != 0 or d.year % 400 == 0) and k >= 59:
        k -= 1
    return max(0, min(364, k))

def main():
    try:
        old = json.load(open(OUT, encoding="utf-8"))
        if datetime.now(timezone.utc) - datetime.fromisoformat(old["updated"]) < timedelta(days=30) and old.get("lat") == float(LAT):
            print("clima.json al día")
            return
    except Exception:
        pass
    y1 = date.today().year - 1
    url = (f"https://archive-api.open-meteo.com/v1/archive?latitude={LAT}&longitude={LON}&start_date=1940-01-01"
           f"&end_date={y1}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FMadrid")
    with urllib.request.urlopen(url, timeout=180) as r:
        D = json.load(r)["daily"]
    smx, smn, srn, cnt = [0.0] * 365, [0.0] * 365, [0.0] * 365, [0] * 365
    rmx, rmxY, rmn, rmnY = [-99.0] * 365, [0] * 365, [99.0] * 365, [0] * 365
    for t, a, b, p in zip(D["time"], D["temperature_2m_max"], D["temperature_2m_min"], D["precipitation_sum"]):
        if a is None or b is None:
            continue
        d = date.fromisoformat(t)
        k = doy(d)
        if a > rmx[k]:
            rmx[k], rmxY[k] = a, d.year
        if b < rmn[k]:
            rmn[k], rmnY[k] = b, d.year
        if 1991 <= d.year <= 2020:
            smx[k] += a; smn[k] += b; srn[k] += p or 0; cnt[k] += 1
    mx, mn, rn = [], [], []
    for q in range(365):
        tx = tn = tc = 0
        for w in range(-7, 8):
            j = (q + w) % 365
            tx += smx[j]; tn += smn[j]; tc += cnt[j]
        mx.append(round(tx / tc, 1) if tc else None)
        mn.append(round(tn / tc, 1) if tc else None)
        rn.append(round(srn[q] / cnt[q], 2) if cnt[q] else 0)
    data = {"updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "lat": float(LAT), "lon": float(LON),
            "mx": mx, "mn": mn, "rn": rn, "rmx": [round(v, 1) for v in rmx], "rmxY": rmxY, "rmn": [round(v, 1) for v in rmn], "rmnY": rmnY}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print("clima.json creado")

if __name__ == "__main__":
    main()
