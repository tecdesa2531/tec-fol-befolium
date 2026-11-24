"""Cargador de los tres documentos de una aplicacion (JSON en actual/)."""
import json
import os
import re
from pathlib import Path

from migracion import migrar

DOCUMENTOS = ("general", "repositorio", "compartidos")


def tracking_valido(tracking):
    return bool(re.fullmatch(r"[A-Za-z0-9]{6}", tracking or ""))


def carpeta_actual(raiz_proceso, tracking):
    return Path(raiz_proceso) / tracking.upper() / "actual"


def cargar_documento(ruta):
    """Lee un JSON. Si no existe devuelve None; si esta mal formado, ValueError."""
    ruta = Path(ruta)
    if not ruta.is_file():
        return None
    try:
        return migrar(json.loads(ruta.read_text(encoding="utf-8")))
    except json.JSONDecodeError as e:
        raise ValueError("%s: JSON mal formado (línea %d, columna %d): %s"
                         % (ruta.name, e.lineno, e.colno, e.msg))


def cargar_aplicacion(raiz_proceso, tracking):
    """Devuelve {nombre: documento o None} para los tres documentos."""
    if not tracking_valido(tracking):
        raise ValueError("El tracking code debe tener 6 letras o números")
    actual = carpeta_actual(raiz_proceso, tracking)
    return {n: cargar_documento(actual / (n + ".json")) for n in DOCUMENTOS}


def guardar_documento(ruta, doc):
    """Escribe el JSON con formato legible (se puede corregir a mano)."""
    texto = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    ruta = Path(ruta)
    temporal = ruta.with_name(ruta.name + ".tmp")
    temporal.write_text(texto, encoding="utf-8", newline="\n")
    os.replace(temporal, ruta)         # reemplazo atomico: nunca queda un archivo a medias
