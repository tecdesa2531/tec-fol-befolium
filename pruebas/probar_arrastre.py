"""Pruebas de arrastre con Edge o Chrome sin pantalla (se omiten si no hay navegador).

Arrastran con el raton de verdad (el navegador inicia el arrastre) bloques de imagen, parrafo y
tabla a otra seccion, por el asa sobre la hoja y por la estructura, y comprueban que el bloque
se mueve (no se duplica), que sigue un solo paso en deshacer y que un archivo de fuera sigue
entrando como imagen nueva. Todos los datos son inventados.
Uso: python pruebas/probar_arrastre.py
"""
import base64
import shutil
import struct
import sys
import tempfile
import threading
import time
import unittest
import zlib
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import aplicacion
import cdp
import documentos
import servidor

IF = "document.getElementById('hoja').contentDocument"


def png(ancho, alto, rgb):
    def trozo(tipo, datos):
        c = struct.pack(">I", len(datos)) + tipo + datos
        return c + struct.pack(">I", zlib.crc32(tipo + datos))
    fila = b"\x00" + bytes(rgb) * ancho
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
            + trozo(b"IDAT", zlib.compress(fila * alto)) + trozo(b"IEND", b""))


def archivo_js(contenido, nombre, tipo):
    b64 = base64.b64encode(contenido).decode("ascii")
    return ("(()=>{const b=atob('%s');const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);"
            "return new File([u],'%s',{type:'%s'});})()" % (b64, nombre, tipo))


@unittest.skipUnless(cdp.buscar_navegador(), "No hay Edge ni Chrome (usa FOLIUM_NAVEGADOR)")
class PruebasArrastre(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = Path(cls.tmp.name)
        (t / "trabajo" / "010_Demo").mkdir(parents=True)
        (t / "proceso").mkdir()
        cls.app = aplicacion.abrir("DEMOAP", t / "trabajo" / "010_Demo", t / "proceso")
        for doc in documentos.DOCUMENTOS:
            shutil.copyfile(RAIZ / "pruebas" / "datos" / (doc + ".json"), cls.app.actual / (doc + ".json"))
        servidor.ESTADO["app"] = cls.app
        cls.http = servidor.crear_servidor(0)
        cls.base = "http://127.0.0.1:%d" % cls.http.server_address[1]
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.png = png(300, 100, (200, 60, 60))
        cls.archivo_png = t / "imagen_arrastrada.png"
        cls.archivo_png.write_bytes(cls.png)
        cls.nav = cdp.Navegador(1500, 900).__enter__()
        cls.nav.navegar(cls.base + "/")
        cls.nav.esperar("window.Folium && Folium.Editor.modelo() && %s.querySelector('[data-ref^=\"b:\"]')" % IF)

    @classmethod
    def tearDownClass(cls):
        cls.nav.__exit__(None, None, None)
        cls.http.shutdown()
        cls.http.server_close()
        servidor.ESTADO["app"] = None
        cls.tmp.cleanup()

    # ---------- ayudas ----------
    def doc(self):
        return documentos.cargar_documento(self.app.actual / "general.json")

    def bloques(self, pred=lambda b: True):
        """['seccion/bloque', ...] de los bloques que cumplen pred, en el JSON guardado."""
        res = []

        def recorrer(lista):
            for s in lista:
                res.extend("%s/%s" % (s["id"], b["id"]) for b in s.get("bloques", []) if pred(b))
                recorrer(s.get("secciones", []))
        recorrer(self.doc()["secciones"])
        return res

    def total(self):
        return len(self.bloques())

    def esperar_guardado(self):
        time.sleep(0.8)
        self.nav.esperar("document.getElementById('guardado').textContent==='Guardado ✓'")
        time.sleep(0.3)

    def pos(self, selector, en_hoja=True):
        raiz = IF if en_hoja else "document"
        desfase = ("(()=>{const f=document.getElementById('hoja').getBoundingClientRect();return [f.left,f.top];})()"
                   if en_hoja else "[0,0]")
        r = self.nav.evaluar("(()=>{const o=%s;const e=%s.querySelector(%r);if(!e)return null;const r=e.getBoundingClientRect();"
                             "return {l:o[0]+r.left,t:o[1]+r.top,w:r.width,h:r.height};})()" % (desfase, raiz, selector))
        self.assertIsNotNone(r, selector)
        return r

    def centro(self, r):
        return r["l"] + r["w"] / 2, r["t"] + r["h"] / 2

    def asa(self, sid, bid):
        self.nav.evaluar("Folium.Editor.seleccionar({tipo:'bloque',sid:%r,bid:%r}, true)" % (sid, bid))
        time.sleep(0.9)
        self.nav.evaluar("%s.querySelector('[data-ref=\"b:%s:%s\"]').scrollIntoView({block:'center'})" % (IF, sid, bid))
        time.sleep(0.4)
        return self.centro(self.pos(".f-asa"))

    def fila_arbol(self, sid):
        return self.centro(self.pos('#arbol .fila[data-id="%s"]' % sid, en_hoja=False))

    def mover_por_estructura(self, sid, bid, destino, archivos=None):
        x0, y0 = self.asa(sid, bid)
        x1, y1 = self.fila_arbol(destino)
        iniciado = self.nav.arrastrar(x0, y0, x1, y1, archivos)
        self.esperar_guardado()
        return iniciado

    def pegar_imagen(self):
        self.nav.evaluar("(()=>{const dt=new DataTransfer();dt.items.add(%s);const e=new ClipboardEvent('paste',"
                         "{clipboardData:dt,bubbles:true,cancelable:true});%s.body.dispatchEvent(e);})()"
                         % (archivo_js(self.png, "image.png", "image/png"), IF))
        self.esperar_guardado()

    # ---------- pruebas ----------
    def test_mover_bloques_sin_duplicar(self):
        # una imagen de verdad en 'descripcion', pegada con Ctrl+V sobre su ultimo bloque
        self.nav.evaluar("Folium.Editor.seleccionar({tipo:'bloque',sid:'descripcion',bid:'b3'})")
        self.pegar_imagen()
        con_imagen = lambda b: b["tipo"] == "imagen" and b.get("archivo")
        origen = self.bloques(con_imagen)
        self.assertEqual(len(origen), 1)
        self.assertTrue(origen[0].startswith("descripcion/"))
        total = self.total()
        id_imagen = origen[0].split("/")[1]

        # A. la imagen, por el asa, a otra seccion de la hoja
        self.nav.evaluar("%s.querySelector('[data-ref=\"b:versiones:b1\"]').scrollIntoView({block:'center'})" % IF)
        time.sleep(0.4)
        destino = self.pos('[data-ref="b:versiones:b1"]')
        x0, y0 = self.asa("descripcion", id_imagen)
        destino = self.pos('[data-ref="b:versiones:b1"]')
        if not (80 < destino["t"] < 800):
            self.skipTest("el destino no cabe en pantalla con esta ventana")
        self.assertTrue(self.nav.arrastrar(x0, y0, destino["l"] + destino["w"] / 2, destino["t"] + 2))
        self.esperar_guardado()
        self.assertEqual(self.total(), total, "el total de bloques no debe cambiar")
        sitio = self.bloques(con_imagen)
        self.assertEqual(len(sitio), 1, "la imagen debe quedar en un solo lugar: %s" % sitio)
        self.assertTrue(sitio[0].startswith("versiones/"), sitio)
        # un solo paso en deshacer
        self.nav.evaluar("Folium.Editor.deshacer()")
        self.esperar_guardado()
        self.assertTrue(self.bloques(con_imagen)[0].startswith("descripcion/"))
        self.assertEqual(self.total(), total)
        self.nav.evaluar("Folium.Editor.rehacer()")
        self.esperar_guardado()

        # B. la imagen, por la estructura
        seccion, bloque = self.bloques(con_imagen)[0].split("/")
        self.assertTrue(self.mover_por_estructura(seccion, bloque, "detalle"))
        self.assertEqual(self.total(), total)
        sitio = self.bloques(con_imagen)
        self.assertEqual([s.split("/")[0] for s in sitio], ["detalle"], sitio)
        self.assertEqual(len(list((self.app.actual / "imagenes").iterdir())), 1)

        # C. arrastrar la imagen misma (no el asa): el navegador no debe arrastrarla; aunque
        # agregue la imagen como archivo al arrastre, no puede entrar como bloque nuevo
        seccion, bloque = self.bloques(con_imagen)[0].split("/")
        self.nav.evaluar("%s.querySelector('[data-ref=\"b:%s:%s\"]').scrollIntoView({block:'center'})" % (IF, seccion, bloque))
        time.sleep(0.4)
        self.assertTrue(self.nav.evaluar("[...%s.querySelectorAll('img')].every(i=>i.draggable===false)" % IF))
        x0, y0 = self.centro(self.pos('[data-ref="b:%s:%s"] img' % (seccion, bloque)))
        x1, y1 = self.fila_arbol("versiones")
        self.nav.arrastrar(x0, y0, x1, y1, [self.archivo_png])
        self.esperar_guardado()
        self.assertEqual(self.total(), total, "arrastrar la imagen misma no debe duplicar nada")
        self.assertEqual(self.bloques(con_imagen), ["detalle/" + bloque])

        # D. un parrafo y una tabla por la estructura
        self.assertTrue(self.mover_por_estructura("descripcion", "b1", "versiones"))
        self.assertEqual(self.total(), total)
        self.assertTrue(self.bloques(lambda b: b["tipo"] == "parrafo" and "Aplicacion de ejemplo" in b["texto"])[0].startswith("versiones/"))
        es_tabla = lambda b: b["tipo"] == "tabla" and any(c["id"] == "dev" for c in b["columnas"])
        self.assertTrue(self.mover_por_estructura("tag-desplegado", "b1", "descripcion"))
        self.assertEqual(self.total(), total)
        self.assertEqual([s.split("/")[0] for s in self.bloques(es_tabla)], ["descripcion"])

        # E. despues de arrastres internos, un archivo de fuera sigue entrando como imagen nueva
        antes = self.total()
        self.nav.evaluar("Folium.Editor.seleccionar({tipo:'seccion',id:'descripcion'})")
        self.nav.evaluar("(()=>{const dt=new DataTransfer();dt.items.add(%s);const o=%s.body;const opts={dataTransfer:dt,bubbles:true,"
                         "cancelable:true,clientX:300,clientY:300};o.dispatchEvent(new DragEvent('dragover',opts));"
                         "o.dispatchEvent(new DragEvent('drop',opts));})()" % (archivo_js(self.png, "externa.png", "image/png"), IF))
        self.esperar_guardado()
        self.assertEqual(self.total(), antes + 1)


if __name__ == "__main__":
    unittest.main(verbosity=1)
