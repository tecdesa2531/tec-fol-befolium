"""Pruebas de abrir aplicacion, crear documentacion y guardar versiones.
Todo ocurre en carpetas temporales con datos inventados.
Uso: python pruebas/probar_aplicacion.py
"""
import datetime
import json
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import aplicacion
import documentos
import validacion
import versiones
import visor

DATOS = {"proyecto": "Proyecto de ejemplo", "aplicacion": "demo", "organizacion": "Organizacion de ejemplo",
         "lider": "Persona Uno", "responsable": "Persona Dos", "repositorio": "demo-recursos"}
DIA1 = datetime.date(2026, 1, 5)
DIA2 = datetime.date(2026, 1, 6)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.carpeta = t / "010_Demo"
        self.infra = self.carpeta / "010_Infraestructura"
        (self.infra / "01_Arquitectura").mkdir(parents=True)
        self.proceso = t / "proceso"
        self.proceso.mkdir()
        self.app = aplicacion.abrir("DEMOAP", self.carpeta, self.proceso)

    def tearDown(self):
        self.tmp.cleanup()

    def crear_todo(self):
        aplicacion.crear_documentacion(self.app, DATOS)

    def leer(self, doc):
        return documentos.cargar_documento(self.app.actual / (doc + ".json"))

    def escribir(self, doc, datos):
        documentos.guardar_documento(self.app.actual / (doc + ".json"), datos)


class PruebasAbrir(Base):
    def test_crea_solo_las_carpetas_previstas(self):
        hijos = sorted(p.name for p in self.infra.iterdir())
        self.assertEqual(hijos, ["01_Arquitectura", "02_Documentacion", "03_Diagramas", "04_OperacionesManuales"])
        self.assertEqual(list((self.infra / "01_Arquitectura").iterdir()), [])
        for doc in documentos.DOCUMENTOS:
            self.assertTrue(self.app.versiones(doc).is_dir())

    def test_trabajo_sin_010_infraestructura(self):
        otra = Path(self.tmp.name) / "otra"
        otra.mkdir()
        app = aplicacion.abrir("OTROAP", otra, self.proceso)
        self.assertEqual(app.trabajo, otra)
        self.assertTrue((otra / "02_Documentacion").is_dir())

    def test_recuerda_la_carpeta(self):
        self.assertEqual(aplicacion.carpeta_recordada(self.proceso, "demoap"), str(self.carpeta))

    def test_errores(self):
        with self.assertRaises(ValueError):
            aplicacion.abrir("CORTO", self.carpeta, self.proceso)
        with self.assertRaises(ValueError):
            aplicacion.abrir("DEMOAP", self.carpeta / "no_existe", self.proceso)


class PruebasCrear(Base):
    def test_plantillas_son_validas(self):
        self.crear_todo()
        for doc in documentos.DOCUMENTOS:
            problemas = validacion.validar(self.leer(doc))
            self.assertEqual([p for p in problemas if p["nivel"] == "error"], [], doc)
            pagina = visor.generar_html(self.leer(doc))
            self.assertIn("Organizacion de ejemplo", pagina)
            self.assertIn("DEMOAP", pagina)

    def test_no_se_crea_dos_veces_ni_pisa(self):
        self.crear_todo()
        with self.assertRaises(ValueError):
            self.crear_todo()

    def test_faltantes_solamente(self):
        aplicacion.crear_documentacion(self.app, DATOS)
        (self.app.actual / "compartidos.json").unlink()
        self.assertEqual(aplicacion.crear_documentacion(self.app, DATOS), ["compartidos"])

    def test_datos_obligatorios(self):
        with self.assertRaises(ValueError):
            aplicacion.crear_documentacion(self.app, {"aplicacion": "demo"})

    def test_valor_con_comillas(self):
        datos = dict(DATOS, aplicacion='de"mo')
        aplicacion.crear_documentacion(self.app, datos)
        self.assertEqual(self.leer("general")["aplicacion"], 'de"mo')


class PruebasVersiones(Base):
    def test_nombres(self):
        self.assertEqual(versiones.nombre_base(self.app, "general", "20260105-v01"), "20260105_demoap_general-v01")
        self.assertEqual(versiones.nombre_base(self.app, "repositorio", "0.2.3"), "demoap-repositorio-v0.2.3")
        self.assertEqual(versiones.siguiente(self.app, "general", DIA1), "20260105-v01")

    def test_primera_version(self):
        self.crear_todo()
        p = versiones.propuesta(self.app, DIA1)
        self.assertTrue(p["hay_cambios"])
        with self.assertRaises(ValueError):
            versiones.guardar_version(self.app, {"compartidos": "20260105-v01"}, DIA1)   # falta el tag
        r = versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        self.assertEqual(r["version_general"], "20260105-v01")
        self.assertEqual(len(r["imprimir"]), 3)
        carpeta = self.infra / "02_Documentacion" / "20260105-v01"
        self.assertTrue(carpeta.is_dir())
        base = self.app.versiones("general") / "20260105_demoap_general-v01"
        self.assertTrue(base.with_suffix(".html").is_file() and base.with_suffix(".json").is_file())
        pagina = base.with_suffix(".html").read_text(encoding="utf-8")
        self.assertIn("demoap-repositorio-v0.1.0.pdf", pagina)     # {{pdf_repositorio}} resuelto
        self.assertNotIn("Borrador", pagina)
        self.assertEqual(self.leer("general")["versiones_vigentes"],
                         {"repositorio": "0.1.0", "compartidos": "20260105-v01"})

    def test_sin_cambios_no_guarda(self):
        self.crear_todo()
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        self.assertFalse(versiones.propuesta(self.app, DIA1)["hay_cambios"])
        with self.assertRaises(ValueError):
            versiones.guardar_version(self.app, {}, DIA1)

    def test_cambio_en_uno_copia_los_otros_pdf(self):
        self.crear_todo()
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        carpeta = self.infra / "02_Documentacion" / "20260105-v01"
        for nombre in ("20260105_demoap_general-v01.pdf", "demoap-repositorio-v0.1.0.pdf",
                       "20260105_demoap_compartidos-v01.pdf"):
            (carpeta / nombre).write_bytes(b"pdf inventado")
        comp = self.leer("compartidos")
        comp["secciones"][0]["bloques"].append({"tipo": "parrafo", "id": "b1", "texto": "Texto nuevo."})
        self.escribir("compartidos", comp)
        p = versiones.propuesta(self.app, DIA2)
        self.assertTrue(p["documentos"]["compartidos"]["cambio"])
        self.assertFalse(p["documentos"]["repositorio"]["cambio"])
        r = versiones.guardar_version(self.app, {}, DIA2)
        self.assertEqual(r["version_general"], "20260106-v01")
        self.assertEqual(sorted(i["documento"] for i in r["imprimir"]), ["compartidos", "general"])
        self.assertEqual(r["copiados"], ["demoap-repositorio-v0.1.0.pdf"])
        nueva = self.infra / "02_Documentacion" / "20260106-v01"
        self.assertEqual(sorted(p.name for p in nueva.iterdir()), ["demoap-repositorio-v0.1.0.pdf"])
        # las versiones y carpetas anteriores no se tocan
        self.assertTrue((carpeta / "demoap-repositorio-v0.1.0.pdf").is_file())

    def test_correlativo_del_dia_y_no_sobrescribe(self):
        self.crear_todo()
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        comp = self.leer("compartidos")
        comp["secciones"][0]["bloques"].append({"tipo": "nota", "id": "b1", "texto": "Otro cambio."})
        self.escribir("compartidos", comp)
        r = versiones.guardar_version(self.app, {}, DIA1)
        self.assertEqual(r["version_general"], "20260105-v02")
        with self.assertRaises(ValueError):
            versiones.guardar_version(self.app, {"general": "20260105-v02"}, DIA1)

    def test_errores_de_validacion_bloquean(self):
        self.crear_todo()
        comp = self.leer("compartidos")
        comp["secciones"][0]["id"] = "Mal Id"
        self.escribir("compartidos", comp)
        with self.assertRaises(ValueError):
            versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        self.assertEqual(versiones.guardadas(self.app, "general"), [])

    def test_tag_invalido(self):
        self.crear_todo()
        with self.assertRaises(ValueError):
            versiones.guardar_version(self.app, {"repositorio": "20260105-v01"}, DIA1)


if __name__ == "__main__":
    unittest.main(verbosity=1)
