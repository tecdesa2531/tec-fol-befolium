"""Pruebas de impresion con Edge o Chrome sin pantalla (se omiten si no hay navegador).

Imprimen a PDF como lo hace el boton de Folium (documento limpio, CSS de pagina del propio
documento) y comprueban: una hoja por pagina A4, el mismo numero de paginas que el visor,
la primera hoja sin margen y que el zoom y "Ver margenes" no cambian el resultado.
Uso: python pruebas/probar_impresion.py    Todos los datos de prueba son inventados.
"""
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import aplicacion
import cdp
import documentos
import servidor
import versiones

PX_MM = 96 / 25.4
A4_PT = (595.276, 841.89)
REFERENCIA = {"plantilla_documento_1_general.html": 7,
              "plantilla_documento_2_repositorio.html": 8,
              "plantilla_documento_3_compartidos.html": 17}


def comprobar_a4(prueba, tamanos, esperadas):
    prueba.assertEqual(len(tamanos), esperadas)
    for ancho, alto in tamanos:
        prueba.assertAlmostEqual(ancho, A4_PT[0], delta=1.2)
        prueba.assertAlmostEqual(alto, A4_PT[1], delta=1.2)


@unittest.skipUnless(cdp.buscar_navegador(), "No hay Edge ni Chrome (usa FOLIUM_NAVEGADOR)")
class PruebasImpresion(unittest.TestCase):
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
        cls.nav = cdp.Navegador().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.nav.__exit__(None, None, None)
        cls.http.shutdown()
        cls.http.server_close()
        servidor.ESTADO["app"] = None
        cls.tmp.cleanup()

    # ---------- utilidades ----------
    def geometria_impresa(self):
        """Posicion de cada hoja con los estilos de impresion."""
        self.nav.llamar("Emulation.setEmulatedMedia", media="print")
        try:
            return self.nav.evaluar("""[...document.querySelectorAll('.page')].map(p => {
                const r = p.getBoundingClientRect();
                return [r.left + scrollX, r.top + scrollY, r.width, r.height]; })""")
        finally:
            self.nav.llamar("Emulation.setEmulatedMedia", media="")

    def comprobar_documento(self, url, esperadas=None, variante=False):
        self.nav.navegar(url)
        hojas = self.nav.esperar_hojas()
        if esperadas is not None:
            self.assertEqual(hojas, esperadas, "hojas del visor")
        if variante:       # zoom al 75 % y "Ver margenes" activado
            self.nav.evaluar("""(() => { const z = document.getElementById('z');
                if (z) { z.value = '0.75'; z.dispatchEvent(new Event('change')); }
                document.body.classList.add('guides'); return true; })()""")
        cajas = self.geometria_impresa()
        self.assertEqual(len(cajas), hojas)
        alto = 297 * PX_MM
        for i, (izq, arriba, ancho, alto_hoja) in enumerate(cajas):
            self.assertAlmostEqual(izq, 0, delta=1, msg="hoja %d: margen izquierdo" % (i + 1))
            self.assertAlmostEqual(arriba, i * alto, delta=2, msg="hoja %d: espacio sobre la hoja" % (i + 1))
            self.assertAlmostEqual(ancho, 210 * PX_MM, delta=1.5)
            self.assertAlmostEqual(alto_hoja, alto, delta=1.5)
        paginas, tamanos = cdp.paginas_pdf(self.nav.pdf())
        self.assertEqual(paginas, hojas, "paginas del PDF frente a hojas del visor")
        comprobar_a4(self, tamanos, hojas)
        return hojas

    # ---------- pruebas ----------
    def test_borradores(self):
        for doc in documentos.DOCUMENTOS:
            url = "%s/imprimir/borrador/%s?sin_imprimir=1" % (self.base, doc)
            normal = self.comprobar_documento(url)
            con_vista = self.comprobar_documento(url, esperadas=normal, variante=True)
            self.assertEqual(normal, con_vista, doc)

    def test_version_guardada(self):
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"})
        for doc, version in (("general", versiones.ultima(self.app, "general")),
                             ("repositorio", "0.1.0")):
            url = "%s/imprimir/%s/%s?sin_imprimir=1" % (self.base, doc, version)
            self.comprobar_documento(url)
            self.comprobar_documento(url, variante=True)

    def test_el_boton_no_imprime_la_vista_del_editor(self):
        self.nav.navegar(self.base + "/")
        self.nav.esperar("window.Folium && Folium.Editor && Folium.Editor.modelo()")
        self.nav.esperar("document.getElementById('hoja').contentWindow.__done")
        self.nav.evaluar("""(() => {
            window.__abierta = null; window.__destino = null; window.__iframeImprimio = false;
            window.open = (u) => { window.__abierta = u; window.__v = { location: { set href(x) { window.__destino = x; } }, close() {} }; return window.__v; };
            document.getElementById('hoja').contentWindow.print = () => { window.__iframeImprimio = true; };
            document.getElementById('btn-imprimir').click(); return true; })()""")
        self.nav.esperar("window.__destino")
        self.assertEqual(self.nav.evaluar("window.__abierta"), "about:blank")
        self.assertTrue(self.nav.evaluar("window.__destino").endswith("/imprimir/borrador/general"))
        self.assertFalse(self.nav.evaluar("window.__iframeImprimio"))

    def test_el_documento_de_impresion_no_trae_estilos_del_editor(self):
        self.nav.navegar("%s/imprimir/borrador/general?sin_imprimir=1" % self.base)
        self.nav.esperar_hojas()
        for texto in ("f-sel", "f-editando", "data-ref", "#F0F1F5"):
            self.assertFalse(self.nav.evaluar("document.documentElement.outerHTML.includes(%r)" % texto), texto)

    @unittest.skipUnless(all((RAIZ / "referencia" / n).is_file() for n in REFERENCIA),
                         "No esta referencia/ (no se sube a git)")
    def test_referencia_siete_ocho_y_diecisiete_hojas(self):
        for nombre, esperadas in REFERENCIA.items():
            url = (RAIZ / "referencia" / nombre).as_uri()
            self.comprobar_documento(url, esperadas=esperadas)
            self.comprobar_documento(url, esperadas=esperadas, variante=True)


if __name__ == "__main__":
    unittest.main(verbosity=1)
