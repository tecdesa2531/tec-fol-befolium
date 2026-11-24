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


ETIQUETAS_PORTADA = {
    "general": ["Proyecto", "Aplicación", "Tracking code", "Versión del documento", "Líder técnico",
                "Responsable de infraestructura", "Clasificación"],
    "repositorio": ["Proyecto", "Aplicación", "Tracking code", "Repositorio", "Versión del documento",
                    "Responsable", "Última actualización", "Clasificación"],
    "compartidos": ["Proyecto", "Aplicación", "Tracking code", "Versión del documento", "Responsable",
                    "Clasificación"],
}


class PruebasPortada(Base):
    """La portada de las plantillas y de los datos de prueba sigue a los HTML de referencia."""

    def test_plantillas(self):
        self.crear_todo()
        for doc, etiquetas in ETIQUETAS_PORTADA.items():
            self.assertEqual([c["etiqueta"] for c in self.leer(doc)["portada"]], etiquetas, doc)

    def test_datos_de_prueba(self):
        for doc, etiquetas in ETIQUETAS_PORTADA.items():
            datos = documentos.cargar_documento(RAIZ / "pruebas" / "datos" / (doc + ".json"))
            self.assertEqual([c["etiqueta"] for c in datos["portada"]], etiquetas, doc)

    def test_proyecto_en_la_portada_generada(self):
        self.crear_todo()
        pagina = visor.generar_html(self.leer("general"))
        self.assertIn('"etiqueta": "Proyecto", "valor": "Proyecto de ejemplo"', pagina)


class PruebasPrevisualizar(Base):
    def test_no_crea_nada(self):
        otra = Path(self.tmp.name) / "nueva"
        (otra / "010_Infraestructura").mkdir(parents=True)
        p = aplicacion.previsualizar("NUEVAP", otra, self.proceso)
        self.assertTrue(p["detectado"])
        self.assertEqual(p["crear"], list(aplicacion.SUBCARPETAS))
        self.assertEqual(list((otra / "010_Infraestructura").iterdir()), [])
        self.assertFalse((self.proceso / "NUEVAP").exists())

    def test_con_carpetas_existentes(self):
        p = aplicacion.previsualizar("DEMOAP", self.carpeta, self.proceso)
        self.assertEqual(p["crear"], [])
        self.assertEqual(p["existentes"], list(aplicacion.SUBCARPETAS))

    def test_errores(self):
        with self.assertRaises(ValueError):
            aplicacion.previsualizar("DEMOAP", self.carpeta / "no_existe", self.proceso)


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


class PruebasImagenYTablas(Base):
    def poner_imagen(self, contenido):
        (self.app.actual / "imagenes").mkdir(exist_ok=True)
        (self.app.actual / "imagenes" / "diagrama.png").write_bytes(contenido)

    def test_cambio_de_imagen_por_contenido(self):
        self.crear_todo()
        gen = self.leer("general")
        gen["secciones"][0]["bloques"].append(
            {"tipo": "imagen", "id": "b1", "alto_mm": 50, "archivo": "diagrama.png"})
        self.escribir("general", gen)
        self.poner_imagen(b"contenido uno")
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        self.assertFalse(versiones.cambio_propio(self.app, "general", self.leer("general")))
        self.poner_imagen(b"contenido dos")           # mismo nombre, otro contenido
        self.assertTrue(versiones.cambio_propio(self.app, "general", self.leer("general")))
        r = versiones.guardar_version(self.app, {}, DIA2)
        self.assertEqual(r["version_general"], "20260106-v01")
        self.assertEqual([i["documento"] for i in r["imprimir"]], ["general"])

    def test_imagen_incrustada_en_la_version(self):
        self.crear_todo()
        gen = self.leer("general")
        gen["secciones"][0]["bloques"].append(
            {"tipo": "imagen", "id": "b1", "alto_mm": 50, "archivo": "diagrama.png"})
        self.escribir("general", gen)
        self.poner_imagen(b"\x89PNG inventado")
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        pagina = (self.app.versiones("general") / "20260105_demoap_general-v01.html").read_text(encoding="utf-8")
        self.assertIn("data:image/png;base64,", pagina)

    def test_archivo_de_imagen_sin_rutas(self):
        self.crear_todo()
        gen = self.leer("general")
        gen["secciones"][0]["bloques"].append(
            {"tipo": "imagen", "id": "b1", "alto_mm": 50, "archivo": "../secreto.png"})
        self.assertTrue(any("sin rutas" in p["mensaje"] for p in validacion.validar(gen)))

    def test_tabla_sin_filas(self):
        self.crear_todo()
        pagina = visor.generar_html(self.leer("compartidos"))
        self.assertIn('<td class="sinreg" colspan="5">Sin registros</td>', pagina)


class PruebasApi(Base):
    """Rutas del editor, con el servidor real en un hilo y datos inventados."""

    def setUp(self):
        super().setUp()
        import threading
        import servidor
        self.crear_todo()
        self.servidor = servidor
        servidor.ESTADO["app"] = self.app
        self.http = servidor.crear_servidor(0)
        self.puerto = self.http.server_address[1]
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.servidor.ESTADO["app"] = None
        super().tearDown()

    def pedir(self, ruta, cuerpo=None):
        import urllib.error
        import urllib.request
        url = "http://127.0.0.1:%d%s" % (self.puerto, ruta)
        datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
        peticion = urllib.request.Request(url, data=datos, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(peticion) as r:
                return r.status, r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8")

    def test_leer_y_guardar_borrador(self):
        codigo, texto = self.pedir("/api/documento/general")
        doc = json.loads(texto)
        self.assertEqual(codigo, 200)
        doc["secciones"].append({"id": "nueva", "titulo": "Nueva", "bloques": [], "secciones": []})
        codigo, texto = self.pedir("/api/documento/general", doc)
        self.assertEqual(codigo, 200)
        self.assertIn("cambio", json.loads(texto))
        self.assertEqual(self.leer("general")["secciones"][-1]["id"], "nueva")

    def test_guarda_borrador_aunque_tenga_errores(self):
        doc = self.leer("general")
        doc["secciones"][0]["id"] = "Mal Id"
        codigo, texto = self.pedir("/api/documento/general", doc)
        self.assertEqual(codigo, 200)
        self.assertTrue(any(p["nivel"] == "error" for p in json.loads(texto)["problemas"]))
        self.assertEqual(self.leer("general")["secciones"][0]["id"], "Mal Id")

    def test_rechaza_documento_incorrecto(self):
        self.assertEqual(self.pedir("/api/documento/general", {"documento": "repositorio", "formato": 1})[0], 400)
        self.assertEqual(self.pedir("/api/documento/general", [1, 2])[0], 400)

    def test_render_con_referencias(self):
        codigo, texto = self.pedir("/api/render/general", self.leer("general"))
        r = json.loads(texto)
        self.assertEqual(codigo, 200)
        self.assertIn('data-ref="s:descripcion"', r["src"])
        self.assertIn("Proyecto de ejemplo", json.dumps(r["cfg"]))

    def test_render_no_guarda(self):
        doc = self.leer("general")
        doc["secciones"] = []
        self.pedir("/api/render/general", doc)
        self.assertTrue(self.leer("general")["secciones"])

    def test_render_de_documento_roto(self):
        self.assertEqual(self.pedir("/api/render/general", {"documento": "general"})[0], 400)

    def test_marco_vacio_y_estaticos(self):
        codigo, texto = self.pedir("/hoja")
        self.assertEqual(codigo, 200)
        self.assertIn("window.FOLIUM = null", texto)
        self.assertEqual(self.pedir("/modelo.js")[0], 200)
        self.assertEqual(self.pedir("/estilos.css")[0], 404)       # solo se sirve incrustado
        self.assertEqual(self.pedir("/..%2fCLAUDE.md")[0], 404)

    def test_ids_fijos_vienen_de_las_versiones_guardadas(self):
        codigo, texto = self.pedir("/api/ids_fijos/general")
        self.assertEqual((codigo, json.loads(texto)["ids"]), (200, []))
        versiones.guardar_version(self.app, {"repositorio": "0.1.0"}, DIA1)
        ids = json.loads(self.pedir("/api/ids_fijos/general")[1])["ids"]
        self.assertIn(self.leer("general")["secciones"][0]["id"], ids)
        doc = self.leer("general")
        doc["secciones"].append({"id": "solo-borrador", "titulo": "X", "bloques": [], "secciones": []})
        self.pedir("/api/documento/general", doc)
        self.assertNotIn("solo-borrador", json.loads(self.pedir("/api/ids_fijos/general")[1])["ids"])

    def test_borrador_para_imprimir_es_el_documento_limpio(self):
        codigo, texto = self.pedir("/imprimir/borrador/general?sin_imprimir=1")
        self.assertEqual(codigo, 200)
        self.assertIn("<title>demoap_general_borrador</title>", texto)
        for marca in ("data-ref", "f-sel", "F0F1F5", "window.print"):
            self.assertNotIn(marca, texto)
        self.assertIn("window.print", self.pedir("/imprimir/borrador/general")[1])   # el boton si imprime
        doc = self.leer("general")
        doc["secciones"][0]["id"] = "Mal Id"
        self.pedir("/api/documento/general", doc)
        self.assertEqual(self.pedir("/imprimir/borrador/general")[0], 422)

    def test_sin_aplicacion_abierta(self):
        self.servidor.ESTADO["app"] = None
        self.assertEqual(self.pedir("/api/documento/general")[0], 409)

    def test_id_retirado_no_se_reutiliza(self):
        doc = self.leer("general")
        doc["ids_retirados"] = [doc["secciones"][0]["id"]]
        self.assertTrue(any("no se reutiliza" in m for m in
                            [p["mensaje"] for p in validacion.validar(doc)]))


class PruebasServidor(unittest.TestCase):
    def test_escucha_solo_en_local(self):
        import servidor
        s = servidor.crear_servidor(0)
        try:
            self.assertEqual(s.server_address[0], "127.0.0.1")
        finally:
            s.server_close()


if __name__ == "__main__":
    unittest.main(verbosity=1)
