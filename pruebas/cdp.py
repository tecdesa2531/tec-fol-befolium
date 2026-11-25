"""Control minimo de Edge o Chrome sin pantalla (protocolo DevTools), solo con la biblioteca
estandar. Sirve para las pruebas de impresion. Si no hay navegador, las pruebas se omiten.
Variable FOLIUM_NAVEGADOR: ruta del ejecutable, si no esta en un lugar habitual."""
import base64
import json
import os
import re
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

CANDIDATOS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]


def buscar_navegador():
    for ruta in [os.environ.get("FOLIUM_NAVEGADOR", "")] + CANDIDATOS:
        if ruta and Path(ruta).is_file():
            return ruta
    return None


class Ws:
    """Cliente WebSocket minimo (texto)."""

    def __init__(self, url):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", url)
        host, puerto, ruta = m.group(1), int(m.group(2)), m.group(3)
        self.s = socket.create_connection((host, puerto), timeout=120)
        clave = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
                        % (ruta, host, puerto, clave)).encode())
        self.buf = b""
        while b"\r\n\r\n" not in self.buf:
            self.buf += self.s.recv(4096)
        cabecera, self.buf = self.buf.split(b"\r\n\r\n", 1)
        if b" 101 " not in cabecera.split(b"\r\n")[0]:
            raise RuntimeError("El navegador rechazo la conexion de control")

    def _leer(self, n):
        while len(self.buf) < n:
            trozo = self.s.recv(65536)
            if not trozo:
                raise RuntimeError("El navegador cerro la conexion")
            self.buf += trozo
        datos, self.buf = self.buf[:n], self.buf[n:]
        return datos

    def enviar(self, texto, opcode=1):
        datos = texto.encode("utf-8") if isinstance(texto, str) else texto
        n = len(datos)
        cab = bytes([0x80 | opcode])
        if n < 126:
            cab += bytes([0x80 | n])
        elif n < 65536:
            cab += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            cab += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mascara = os.urandom(4)
        cuerpo = bytes(b ^ mascara[i % 4] for i, b in enumerate(datos))
        self.s.sendall(cab + mascara + cuerpo)

    def recibir(self):
        mensaje = b""
        while True:
            b0, b1 = self._leer(2)
            opcode, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._leer(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._leer(8))[0]
            datos = self._leer(n)
            if opcode == 8:
                raise RuntimeError("El navegador cerro la conexion")
            if opcode == 9:
                self.enviar(datos, 10)
                continue
            mensaje += datos
            if b0 & 0x80:
                return mensaje.decode("utf-8")

    def cerrar(self):
        try:
            self.s.close()
        except OSError:
            pass


class Navegador:
    def __init__(self, ancho=1200, alto=900):
        self.ejecutable = buscar_navegador()
        self.ancho, self.alto = ancho, alto
        self.contador = 0
        self.eventos = []            # eventos del navegador recibidos mientras se esperaba una respuesta

    def __enter__(self):
        self.perfil = tempfile.TemporaryDirectory()
        self.proceso = subprocess.Popen(
            [self.ejecutable, "--headless=new", "--disable-gpu", "--no-first-run",
             "--remote-debugging-port=0", "--user-data-dir=" + self.perfil.name,
             "--window-size=%d,%d" % (self.ancho, self.alto), "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        archivo = Path(self.perfil.name) / "DevToolsActivePort"
        limite = time.time() + 30
        while not archivo.exists() or not archivo.read_text().strip():
            if time.time() > limite:
                raise RuntimeError("El navegador no arranco")
            time.sleep(0.2)
        puerto = int(archivo.read_text().split()[0])
        while True:
            paginas = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % puerto).read())
            paginas = [p for p in paginas if p["type"] == "page"]
            if paginas:
                break
            time.sleep(0.2)
        self.ws = Ws(paginas[0]["webSocketDebuggerUrl"])
        self.llamar("Page.enable")
        return self

    def __exit__(self, *args):
        self.ws.cerrar()
        self.proceso.kill()
        self.proceso.wait()
        time.sleep(0.3)
        self.perfil.cleanup()

    def llamar(self, metodo, **parametros):
        self.contador += 1
        numero = self.contador
        self.ws.enviar(json.dumps({"id": numero, "method": metodo, "params": parametros}))
        while True:
            r = json.loads(self.ws.recibir())
            if "method" in r:
                self.eventos.append(r)
            if r.get("id") == numero:
                if "error" in r:
                    raise RuntimeError("%s: %s" % (metodo, r["error"]))
                return r.get("result", {})

    def evaluar(self, expresion):
        r = self.llamar("Runtime.evaluate", expression=expresion, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError("Error en la pagina: %s" % json.dumps(r["exceptionDetails"])[:300])
        return r["result"].get("value")

    def raton(self, tipo, x, y, **extra):
        parametros = {"type": tipo, "x": x, "y": y, "button": "left" if tipo != "mouseMoved" or extra.get("buttons") else "none",
                      "clickCount": 1}
        parametros.update(extra)
        return self.llamar("Input.dispatchMouseEvent", **parametros)

    def arrastrar(self, x0, y0, x1, y1, archivos=None):
        """Arrastre real con el raton: el navegador inicia el arrastre (dragstart y su dataTransfer
        son los suyos) y se suelta en el destino. Devuelve False si el navegador no inicio ninguno.
        `archivos`: rutas que se agregan al arrastre, como hace el navegador al arrastrar una imagen."""
        self.llamar("Input.setInterceptDrags", enabled=True)
        self.eventos = [e for e in self.eventos if e["method"] != "Input.dragIntercepted"]
        self.raton("mouseMoved", x0, y0)
        self.raton("mousePressed", x0, y0)
        interceptado = None
        for i in range(1, 13):
            self.raton("mouseMoved", x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20, buttons=1)
            time.sleep(0.06)
            for e in self.eventos:
                if e["method"] == "Input.dragIntercepted":
                    interceptado = e["params"]["data"]
            if interceptado:
                break
        if not interceptado:
            self.raton("mouseReleased", x0, y0)
            return False
        if archivos:
            interceptado["files"] = [str(a) for a in archivos]
        self.llamar("Input.dispatchDragEvent", type="dragEnter", x=x1, y=y1, data=interceptado)
        for i in range(4):
            self.llamar("Input.dispatchDragEvent", type="dragOver", x=x1, y=y1 + i % 2, data=interceptado)
            time.sleep(0.06)
        self.llamar("Input.dispatchDragEvent", type="drop", x=x1, y=y1, data=interceptado)
        self.raton("mouseReleased", x1, y1)
        return True

    def navegar(self, url):
        self.llamar("Page.navigate", url=url)
        self.esperar("document.readyState==='complete'")

    def esperar(self, condicion, segundos=40):
        limite = time.time() + segundos
        while time.time() < limite:
            if self.evaluar("!!(%s)" % condicion):
                return
            time.sleep(0.15)
        raise RuntimeError("Tiempo agotado esperando: " + condicion)

    def esperar_hojas(self):
        self.esperar("window.__done")
        return self.evaluar("window.__done.pages")

    def pdf(self):
        r = self.llamar("Page.printToPDF", preferCSSPageSize=True, printBackground=True,
                        displayHeaderFooter=False, marginTop=0, marginBottom=0, marginLeft=0, marginRight=0)
        return base64.b64decode(r["data"])


def paginas_pdf(datos):
    """Lista de tamanos (ancho, alto) en puntos de cada pagina de un PDF."""
    n = len(re.findall(rb"/Type\s*/Page(?![s\w])", datos))
    tamanos = [(float(a), float(b)) for _, _, a, b in
               re.findall(rb"/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]", datos)]
    return n, tamanos
