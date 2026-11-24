"""Directorios de trabajo y de proceso de Folium.

Cada uno viene de una variable de entorno con la ruta completa:
  DOC_RAIZ_TRABAJO  y  DOC_RAIZ_PROCESO
Si la variable no existe o esta vacia, se usa una carpeta dentro del
repositorio (temp_pruebas/trabajo y temp_pruebas/proceso), que esta en .gitignore.
"""
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PRUEBAS = RAIZ / "temp_pruebas"


def directorio(variable, por_defecto):
    valor = os.environ.get(variable, "").strip()
    ruta = Path(valor) if valor else por_defecto
    ruta.mkdir(parents=True, exist_ok=True)
    return ruta, bool(valor)


def directorios():
    trabajo, _ = directorio("DOC_RAIZ_TRABAJO", PRUEBAS / "trabajo")
    proceso, _ = directorio("DOC_RAIZ_PROCESO", PRUEBAS / "proceso")
    return trabajo, proceso
