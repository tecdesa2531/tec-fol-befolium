"""Servidor local de Folium (Fase 0). Solo biblioteca estandar.

Uso: python servidor.py   (puerto por defecto 8765, variable FOLIUM_PUERTO)
Escucha solo en 127.0.0.1.
"""
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PUERTO = int(os.environ.get("FOLIUM_PUERTO", "8765"))

# Solo se sirven estos archivos; nada mas de disco.
RUTAS = {
    "/": RAIZ / "web" / "inicio.html",
    "/referencia/general": RAIZ / "referencia" / "plantilla_documento_1_general.html",
    "/referencia/repositorio": RAIZ / "referencia" / "plantilla_documento_2_repositorio.html",
    "/referencia/compartidos": RAIZ / "referencia" / "plantilla_documento_3_compartidos.html",
}


class Manejador(BaseHTTPRequestHandler):
    def do_GET(self):
        ruta = self.path.split("?")[0].split("#")[0]
        if ruta == "/index.html":
            ruta = "/"
        archivo = RUTAS.get(ruta)
        if archivo is None or not archivo.is_file():
            self.responder(404, b"No encontrado", "text/plain; charset=utf-8")
            return
        self.responder(200, archivo.read_bytes(), "text/html; charset=utf-8")

    def responder(self, codigo, cuerpo, tipo):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, formato, *args):
        print("%s %s" % (self.command, self.path))


def main():
    servidor = HTTPServer(("127.0.0.1", PUERTO), Manejador)
    print("Folium en http://localhost:%d  (Ctrl+C para salir)" % PUERTO)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("Servidor detenido")


if __name__ == "__main__":
    main()
