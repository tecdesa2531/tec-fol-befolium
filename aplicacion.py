"""La aplicacion activa: carpetas de trabajo y de proceso, y creacion de documentos."""
import json
from pathlib import Path

import documentos

RAIZ = Path(__file__).resolve().parent
SUBCARPETAS = ("02_Documentacion", "03_Diagramas", "04_OperacionesManuales")
CARPETA_INFRA = "010_Infraestructura"
CAMPOS_PORTADA = ("proyecto", "aplicacion", "organizacion", "lider", "responsable",
                  "clasificacion", "repositorio")


class Aplicacion:
    def __init__(self, tracking, trabajo, proceso_raiz):
        self.tracking = tracking.upper()
        self.trabajo = Path(trabajo)
        self.proceso = Path(proceso_raiz) / self.tracking

    @property
    def actual(self):
        return self.proceso / "actual"

    def versiones(self, doc):
        return self.proceso / "versiones" / doc

    @property
    def documentacion(self):
        return self.trabajo / "02_Documentacion"

    @property
    def slug(self):
        return self.tracking.lower()


def resolver_trabajo(carpeta):
    """Si la carpeta contiene 010_Infraestructura, ese es el directorio de trabajo."""
    hija = Path(carpeta) / CARPETA_INFRA
    return hija if hija.is_dir() else Path(carpeta)


def archivo_asociacion(proceso_raiz, tracking):
    return Path(proceso_raiz) / tracking.upper() / "aplicacion.json"


def carpeta_recordada(proceso_raiz, tracking):
    """Carpeta que se uso la ultima vez con este tracking code, o None."""
    try:
        datos = json.loads(archivo_asociacion(proceso_raiz, tracking).read_text(encoding="utf-8"))
        return datos.get("carpeta")
    except (OSError, ValueError):
        return None


def previsualizar(tracking, carpeta, proceso_raiz):
    """Que pasaria al abrir, sin crear nada: directorio de trabajo y carpetas por crear."""
    if not documentos.tracking_valido(tracking):
        raise ValueError("El tracking code debe tener 6 letras o números.")
    carpeta = Path(carpeta).expanduser()
    if not carpeta.is_dir():
        raise ValueError("La carpeta no existe: %s" % carpeta)
    trabajo = resolver_trabajo(carpeta)
    return {
        "trabajo": str(trabajo),
        "detectado": trabajo != carpeta,
        "crear": [n for n in SUBCARPETAS if not (trabajo / n).exists()],
        "existentes": [n for n in SUBCARPETAS if (trabajo / n).exists()],
        "proceso": str(Path(proceso_raiz) / tracking.upper()),
    }


def abrir(tracking, carpeta, proceso_raiz):
    """Abre una aplicacion. Crea solo las carpetas que faltan (ver SUBCARPETAS)."""
    if not documentos.tracking_valido(tracking):
        raise ValueError("El tracking code debe tener 6 letras o números.")
    carpeta = Path(carpeta).expanduser()
    if not carpeta.is_dir():
        raise ValueError("La carpeta no existe: %s" % carpeta)
    app = Aplicacion(tracking, resolver_trabajo(carpeta), proceso_raiz)
    for nombre in SUBCARPETAS:
        (app.trabajo / nombre).mkdir(exist_ok=True)
    app.actual.mkdir(parents=True, exist_ok=True)
    for doc in documentos.DOCUMENTOS:
        app.versiones(doc).mkdir(parents=True, exist_ok=True)
    archivo = archivo_asociacion(proceso_raiz, tracking)
    archivo.write_text(json.dumps({"carpeta": str(carpeta)}, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8", newline="\n")
    return app


def crear_documentacion(app, datos):
    """Crea los documentos que faltan desde las plantillas. Devuelve los nombres creados."""
    faltan = [d for d in documentos.DOCUMENTOS if not (app.actual / (d + ".json")).exists()]
    if not faltan:
        raise ValueError("Los tres documentos ya existen.")
    valores = {c: (datos.get(c) or "").strip() for c in CAMPOS_PORTADA}
    if not valores["aplicacion"] or not valores["organizacion"]:
        raise ValueError("Indica al menos el nombre de la aplicación y la organización.")
    valores["tracking"] = app.tracking
    if not valores["clasificacion"]:
        valores["clasificacion"] = "USO INTERNO"
    for doc in faltan:
        texto = (RAIZ / "plantillas" / (doc + ".json")).read_text(encoding="utf-8")
        for campo, valor in valores.items():
            # el valor entra como texto JSON seguro
            texto = texto.replace("{%s}" % campo, json.dumps(valor, ensure_ascii=False)[1:-1])
        documentos.guardar_documento(app.actual / (doc + ".json"), json.loads(texto))
    return faltan
