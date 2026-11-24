"""Servidor local de Folium. Solo biblioteca estandar.

Uso: python servidor.py   (puerto por defecto 8765, variable FOLIUM_PUERTO)
Escucha solo en 127.0.0.1. Trabaja con una sola aplicacion activa a la vez.
"""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aplicacion
import configuracion
import documentos
import validacion
import versiones
import visor

RAIZ = Path(__file__).resolve().parent
PUERTO = int(os.environ.get("FOLIUM_PUERTO", "8765"))
LIMITE_CUERPO = 1024 * 1024

# Solo se sirven estos archivos; nada mas de disco.
ESTATICOS = {
    "/": ("web/folium.html", "text/html; charset=utf-8"),
    "/folium.js": ("web/folium.js", "text/javascript; charset=utf-8"),
    "/folium.css": ("web/folium.css", "text/css; charset=utf-8"),
    "/ajustes_impresion.css": ("web/ajustes_impresion.css", "text/css; charset=utf-8"),
}
REFERENCIAS = {
    "/referencia/general": "plantilla_documento_1_general.html",
    "/referencia/repositorio": "plantilla_documento_2_repositorio.html",
    "/referencia/compartidos": "plantilla_documento_3_compartidos.html",
}

# Estado del servidor: la aplicacion activa (o None).
ESTADO = {"app": None}


def estado_documento(app, nombre):
    """Resumen de un documento para las pestanas."""
    info = {"existe": False, "ultima": versiones.ultima(app, nombre), "cambio": False,
            "errores": [], "advertencias": [], "error_lectura": None, "titulo": ""}
    try:
        doc = documentos.cargar_documento(app.actual / (nombre + ".json"))
    except ValueError as e:
        info["error_lectura"] = str(e)
        return info
    if doc is None:
        return info
    info["existe"] = True
    info["titulo"] = doc.get("titulo_pagina", "")
    problemas = validacion.validar(doc)
    info["errores"] = [p for p in problemas if p["nivel"] == "error"]
    info["advertencias"] = [p for p in problemas if p["nivel"] == "advertencia"]
    if not info["errores"]:
        info["cambio"] = versiones.cambio_propio(app, nombre, doc)
    return info


def estado_general():
    _, proceso = configuracion.directorios()
    trabajo_defecto, _ = configuracion.directorio("DOC_RAIZ_TRABAJO", configuracion.PRUEBAS / "trabajo")
    res = {"abierta": False, "carpeta_defecto": str(trabajo_defecto)}
    app = ESTADO["app"]
    if app is not None:
        res.update({"abierta": True, "tracking": app.tracking, "trabajo": str(app.trabajo),
                    "documentos": {d: estado_documento(app, d) for d in documentos.DOCUMENTOS}})
    return res


class Manejador(BaseHTTPRequestHandler):
    # ---------- GET ----------
    def do_GET(self):
        url = urlparse(self.path)
        ruta = url.path
        if ruta in ESTATICOS:
            archivo, tipo = ESTATICOS[ruta]
            self.servir_archivo(RAIZ / archivo, tipo)
        elif ruta in REFERENCIAS:
            self.servir_referencia(REFERENCIAS[ruta])
        elif ruta == "/api/estado":
            self.json(200, estado_general())
        elif ruta == "/api/recordada":
            tracking = parse_qs(url.query).get("tracking", [""])[0]
            _, proceso = configuracion.directorios()
            carpeta = aplicacion.carpeta_recordada(proceso, tracking) if documentos.tracking_valido(tracking) else None
            self.json(200, {"carpeta": carpeta})
        elif ruta == "/api/guardar/propuesta":
            self.con_aplicacion(lambda app: self.json(200, versiones.propuesta(app)))
        elif re.fullmatch(r"/hoja/(general|repositorio|compartidos)", ruta):
            self.con_aplicacion(lambda app: self.servir_hoja(app, ruta.split("/")[2]))
        elif re.fullmatch(r"/imprimir/(general|repositorio|compartidos)/[0-9.\-v]+", ruta):
            _, _, doc, version = ruta.split("/")
            self.con_aplicacion(lambda app: self.servir_impresion(app, doc, version))
        else:
            self.texto(404, "No encontrado")

    # ---------- POST ----------
    def do_POST(self):
        ruta = urlparse(self.path).path
        try:
            largo = int(self.headers.get("Content-Length", "0"))
            if largo > LIMITE_CUERPO:
                raise ValueError("La petición es demasiado grande.")
            datos = json.loads(self.rfile.read(largo) or b"{}")
            if ruta == "/api/abrir":
                self.abrir(datos)
            elif ruta == "/api/cerrar":
                ESTADO["app"] = None
                self.json(200, estado_general())
            elif ruta == "/api/crear":
                self.con_aplicacion(lambda app: self.crear(app, datos))
            elif ruta == "/api/guardar":
                self.con_aplicacion(lambda app: self.json(200, versiones.guardar_version(app, datos)))
            else:
                self.texto(404, "No encontrado")
        except ValueError as e:
            self.json(400, {"error": str(e)})

    def abrir(self, datos):
        _, proceso = configuracion.directorios()
        tracking = str(datos.get("tracking", "")).strip()
        carpeta = str(datos.get("carpeta", "")).strip()
        ESTADO["app"] = aplicacion.abrir(tracking, carpeta, proceso)
        self.json(200, estado_general())

    def crear(self, app, datos):
        creados = aplicacion.crear_documentacion(app, datos)
        resultado = estado_general()
        resultado["creados"] = creados
        self.json(200, resultado)

    # ---------- utilidades ----------
    def con_aplicacion(self, accion):
        if ESTADO["app"] is None:
            self.json(409, {"error": "Primero abre una aplicación."})
            return
        try:
            accion(ESTADO["app"])
        except ValueError as e:
            self.json(400, {"error": str(e)})

    def servir_hoja(self, app, doc):
        """Borrador A4 de un documento, desde actual/."""
        actual = documentos.cargar_documento(app.actual / (doc + ".json"))
        if actual is None:
            self.texto(404, "Todavía no existe %s.json" % doc)
            return
        if any(p["nivel"] == "error" for p in validacion.validar(actual)):
            self.texto(422, "El documento tiene errores de validación.")
            return
        vigentes = {d: versiones.ultima(app, d) for d in ("repositorio", "compartidos")}
        pagina = visor.generar_html(actual, carpeta_actual=app.actual, vista=True,
                                    tokens=versiones.tokens_de(app, vigentes))
        self.responder(200, pagina.encode("utf-8"), "text/html; charset=utf-8")

    def servir_impresion(self, app, doc, version):
        """Version guardada, con el titulo igual al nombre del PDF, que abre la impresion."""
        if not versiones.version_valida(doc, version):
            self.texto(404, "No encontrado")
            return
        base = versiones.nombre_base(app, doc, version)
        archivo = app.versiones(doc) / (base + ".html")
        if not archivo.is_file():
            self.texto(404, "No existe esa versión guardada.")
            return
        pagina = archivo.read_text(encoding="utf-8")
        pagina = re.sub(r"<title>.*?</title>", "<title>%s</title>" % base, pagina, count=1, flags=re.S)
        arranque = ("<script>(function e(){ if(window.__done){ setTimeout(function(){window.print();},400); }"
                    " else { setTimeout(e,200); } })();</script>\n</body>")
        pagina = pagina.replace("</body>", arranque, 1)
        self.responder(200, pagina.encode("utf-8"), "text/html; charset=utf-8")

    def servir_referencia(self, nombre):
        """HTML de referencia (solo desarrollo) con el ajuste de impresion."""
        archivo = RAIZ / "referencia" / nombre
        if not archivo.is_file():
            self.texto(404, "Falta el archivo %s. Cópialo ahí a mano: referencia/ no se sube a git." % nombre)
            return
        enlace = b'<link rel="stylesheet" href="/ajustes_impresion.css">\n</head>'
        self.responder(200, archivo.read_bytes().replace(b"</head>", enlace, 1), "text/html; charset=utf-8")

    def servir_archivo(self, archivo, tipo):
        self.responder(200, archivo.read_bytes(), tipo)

    def json(self, codigo, datos):
        self.responder(codigo, json.dumps(datos, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")

    def texto(self, codigo, mensaje):
        self.responder(codigo, mensaje.encode("utf-8"), "text/plain; charset=utf-8")

    def responder(self, codigo, cuerpo, tipo):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, formato, *args):
        print("%s %s" % (self.command, self.path))


def crear_servidor(puerto):
    """Servidor que escucha solo en el equipo local (127.0.0.1)."""
    return HTTPServer(("127.0.0.1", puerto), Manejador)


def main():
    trabajo, proceso = configuracion.directorios()
    print("Directorio de trabajo: %s" % trabajo)
    print("Directorio de proceso: %s" % proceso)
    servidor = crear_servidor(PUERTO)
    print("Folium en http://localhost:%d  (Ctrl+C para salir)" % PUERTO)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("Servidor detenido")


if __name__ == "__main__":
    main()
