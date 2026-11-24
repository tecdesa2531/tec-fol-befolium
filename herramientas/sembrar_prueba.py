"""Copia los datos inventados de pruebas/datos/ a la carpeta de proceso,
como la aplicacion DEMOAP, para ver el visor sin datos reales.
Uso: python herramientas/sembrar_prueba.py
"""
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import configuracion
import documentos


def main():
    _, proceso = configuracion.directorios()
    destino = documentos.carpeta_actual(proceso, "DEMOAP")
    destino.mkdir(parents=True, exist_ok=True)
    for nombre in documentos.DOCUMENTOS:
        shutil.copyfile(RAIZ / "pruebas" / "datos" / (nombre + ".json"), destino / (nombre + ".json"))
    print("Datos de prueba en %s" % destino)
    print("En Folium abre la aplicacion DEMOAP con una carpeta de trabajo cualquiera.")


if __name__ == "__main__":
    main()
