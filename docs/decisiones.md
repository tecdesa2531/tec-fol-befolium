# Decisiones

Cada decisión nueva, con su motivo en una o dos líneas.

## 2026-11-23

- **Referencia dividida por partes.** `herramientas/dividir_referencia.py` genera `referencia/secciones/` (fuera de git) con índice. Motivo: ahorrar tokens sin perder la visión de conjunto de `CLAUDE.md`.
- **CSS único.** Se usa el CSS del documento 1 como base para los tres. `.diag` es parte del CSS común; el documento 3 solo no lo usa porque no tiene diagramas.
- **Paginador único.** Las diferencias entre documentos (título de la página, texto del pie, datos de la portada) son datos de cada documento: salen del JSON de `actual/` y no quedan fijos en el código.
- **Directorios por defecto.** Si faltan `DOC_RAIZ_TRABAJO` o `DOC_RAIZ_PROCESO` (rutas completas), se usan `temp_pruebas/trabajo` y `temp_pruebas/proceso` dentro del repositorio, ignorados por git. Motivo: probar sin tocar carpetas reales.
- **Impresión del encabezado.** En el PDF el degradado de la portada salía en franjas y quedaba un hueco a la derecha. `web/ajustes_impresion.css` usa degradado opaco (mismos colores mezclados sobre blanco), franja de 211 mm recortada por la hoja y colores de fondo forzados. `referencia/` no se toca; el servidor lo agrega a los HTML que sirve.
