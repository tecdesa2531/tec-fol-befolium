# Decisiones

Cada decisión nueva, con su motivo en una o dos líneas.

## 2026-11-23

- **Referencia dividida por partes.** `herramientas/dividir_referencia.py` genera `referencia/secciones/` (fuera de git) con índice. Motivo: ahorrar tokens sin perder la visión de conjunto de `CLAUDE.md`.
- **CSS único.** Se usa el CSS del documento 1 como base para los tres. `.diag` es parte del CSS común; el documento 3 solo no lo usa porque no tiene diagramas.
- **Paginador único.** Las diferencias entre documentos (título de la página, texto del pie, datos de la portada) son datos de cada documento: salen del JSON de `actual/` y no quedan fijos en el código.
- **Directorios por defecto.** Si faltan `DOC_RAIZ_TRABAJO` o `DOC_RAIZ_PROCESO` (rutas completas), se usan `temp_pruebas/trabajo` y `temp_pruebas/proceso` dentro del repositorio, ignorados por git. Motivo: probar sin tocar carpetas reales.
- **Degradado de portada opaco.** En el PDF el degradado semitransparente no se ve en el visor del navegador (sí en Adobe). `web/ajustes_impresion.css` usa los mismos colores mezclados sobre blanco. Lo agrega el servidor a los HTML servidos; `referencia/` no se toca. Las franjas y el hueco a la derecha eran de la impresora "Microsoft Print to PDF": no se corrigen.
- **Formato JSON (ajustes).** Las celdas son texto simple u objeto con `texto`, `lineas`, `color` y `estilo`; el tipo de columna solo da el estilo por defecto. El color se fija a mano en cualquier celda. Se agregan los bloques `etiqueta` y `con_siguiente`, y `alto_mm`/`descripcion` en imagen. La tabla no lleva título (lo da el h3 o una etiqueta). El h3 no se numera ni va en el índice. Motivo: reflejar los HTML de referencia.
- **Secretos: solo advertencia.** La detección no bloquea, para evitar falsos positivos.
- **Textos del paginador en el JSON.** `organizacion`, `aplicacion`, `titulo_pagina` y `portada` (con campos `automatico`: `version` o `fecha`) salen del JSON; el paginador no lleva datos fijos. Se agregan `**negrita**` y `[texto]()` (enlace sin URL aún) al texto con formato porque la referencia los usa.
- **CSS y paginador de Folium.** `web/estilos.css` y `web/paginador.js` son copias del CSS y paginador comunes (con el degradado opaco y el paginador leyendo `window.FOLIUM`). El HTML generado los incrusta, así que se abre sin Folium.
- **Prueba de equivalencia.** Se convirtió cada HTML de referencia a JSON con un script local (no se sube, usa el contenido de `referencia/`) y se generó con el visor: las hojas y el texto de cada hoja coinciden (7, 8 y 17 hojas) al abrir ambos en Chrome. En git solo hay datos inventados (`pruebas/datos/`).
- **Visor por URL.** `/visor/<TRACKING>/<documento>` genera el borrador desde `actual/`; si hay errores de validación los muestra en vez del documento.
