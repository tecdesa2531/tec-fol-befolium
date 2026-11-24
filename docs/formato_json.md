# Formato JSON de los documentos

Un archivo por documento en `DOC_RAIZ_PROCESO/<TRACKING>/actual/`: `general.json`, `repositorio.json`, `compartidos.json`. Se pueden corregir a mano. UTF-8, sangría de 2 espacios, claves en minúsculas sin tildes.

## 1. Estructura de un documento

```json
{
  "formato": 1,
  "documento": "general",
  "aplicacion": "demo",
  "organizacion": "Organizacion de ejemplo",
  "titulo_pagina": "Documento general de la aplicación",
  "portada": [
    {"etiqueta": "Aplicación", "valor": "demo"},
    {"etiqueta": "Versión del documento", "automatico": "version"},
    {"etiqueta": "Última actualización", "automatico": "fecha"}
  ],
  "versiones_vigentes": {"repositorio": "0.1.0", "compartidos": "20260101-v01"},
  "estados": [ ...ver sección 5... ],
  "ids_retirados": [],
  "secciones": [ ...árbol de secciones... ]
}
```

- `documento`: `general`, `repositorio` o `compartidos`.
- `organizacion`, `titulo_pagina` y `portada` salen de aquí, y el pie es `aplicacion · titulo_pagina · versión`. El paginador es uno solo y no lleva ningún dato fijo.
- La portada es una lista ordenada: se pueden agregar o quitar campos. Un campo lleva `valor` (texto fijo) o `automatico`: `version` o `fecha`, que Folium rellena al guardar. Mientras se edita, la versión es "Borrador".
- `versiones_vigentes` solo existe en `general`: las versiones vigentes del documento 2 y del 3.
- `ids_retirados` (opcional): identificadores de secciones quitadas. Folium lo llena al quitar una sección y la validación rechaza reutilizarlos.

## 2. Secciones (agregar y quitar libremente)

El documento es un árbol abierto. La profundidad define el título: nivel 1 = h1, nivel 2 = h2, nivel 3 = h3. No hay más niveles.

```json
{"id": "inv-bd", "titulo": "Base de datos", "opcional": false, "anexo": false,
 "bloques": [ ... ], "secciones": [ ... ]}
```

- `id`: identificador estable (`data-id`). Se crea una vez a partir del título (minúsculas y guiones) y **no cambia aunque cambie el título**. Es único en el documento. Los enlaces internos y la comparación entre versiones dependen de él. Un `id` quitado no se reutiliza.
- `opcional`: marca secciones que pueden no existir en una aplicación (Workload y Data del documento 3). Quitarlas es borrarlas del árbol.
- `anexo`: solo en nivel 1. No se numera.
- Numeración (h1: `1.`, h2: `a)`), índice, números de página y enlaces internos se recalculan solos y no se guardan.
- El h3 no se numera ni aparece en el índice.

## 3. Texto con formato

Se usa en párrafos, notas, celdas y líneas adicionales:

- `` `código` `` → Consolas.
- `**negrita**`.
- `[texto](https://...)` → enlace; `[texto](#id-de-seccion)` → enlace interno; `[texto]()` → enlace cuya URL aún no se pegó (se muestra como enlace sin destino).
- Un salto de línea (`\n`) dentro de una celda es un salto de línea. En una nota destacada, una línea en blanco separa párrafos.

Todos los enlaces son URL que el usuario pega.

## 4. Bloques

Todos llevan `tipo` y un `id` corto propio (`b1`, `b2`...), único dentro de su sección. Cualquier bloque admite `"con_siguiente": true` para que no se separe del bloque que sigue (`data-kwn`). Los títulos y las etiquetas siempre lo tienen.

| tipo | campos | se muestra como |
|---|---|---|
| `parrafo` | `texto` | párrafo normal |
| `etiqueta` | `texto` | texto en negrita (`p.lbl`) |
| `nota` | `texto` | nota pequeña en gris (`p.note`) |
| `nota_destacada` | `texto` | recuadro con borde izquierdo y fondo suave (`.callout`) |
| `tabla` | ver sección 5 | tabla de 150 mm |
| `imagen` | `archivo`, `alto_mm`, `descripcion`, `fuente_drawio` | imagen de diagrama |

Imagen:
- `archivo`: nombre dentro de `actual/imagenes/`. Se incrusta en el HTML al guardar la versión.
- `alto_mm`: alto del recuadro o de la imagen.
- `descripcion`: lista de textos que se muestra en el recuadro punteado `.diag` mientras no hay imagen; el primero es el título y los demás son líneas de detalle.
- `fuente_drawio`: ruta del `.drawio` en `03_Diagramas/`; se muestra como "Fuente: ...".
- El título de una tabla no es un campo: es la sección h3 o un bloque `etiqueta` que la precede.

## 5. Tablas

```json
{
  "tipo": "tabla", "id": "b2", "clase": "estado",
  "columnas": [
    {"id": "repo", "titulo": "Repositorio", "ancho_mm": 60, "tipo": "identificador"},
    {"id": "dev",  "titulo": "DEV",         "ancho_mm": 30, "tipo": "identificador"},
    {"id": "est",  "titulo": "Estado",      "ancho_mm": 60, "tipo": "estado"}
  ],
  "filas": [
    {"id": "f1", "celdas": {
      "repo": "demo-recursos",
      "dev": {"texto": "0.1.0", "lineas": ["en proceso `0.2.0-rc.1`"], "color": "amarillo"},
      "est": "En uso"}}
  ]
}
```

- `clase`: `estado` (solo lo vigente) o `registro` (acumula filas).
- `nuevas_filas` (solo en `registro`): `arriba` (la más reciente primero, como los scripts y cargas) o `abajo` (al final, como las entregas y los secretos). Borrar una fila de una tabla de registro pide confirmación. *(Se implementa en el paso 3 de la Fase 2.)*
- Los anchos suman **150 mm**; si no, Folium avisa y no deja guardar la versión.
- Tipo de columna = estilo por defecto de sus celdas:
  - `texto`: Georgia 8 pt.
  - `identificador`: Consolas 7,5 pt.
  - `estado`: el color sale de la lista de estados.
- Una celda es un texto simple o un objeto:
  - `texto`: admite el formato de la sección 3 en cualquier tipo de columna.
  - `lineas`: líneas adicionales debajo (`span.sub`), también con formato.
  - `color`: `ninguno`, `amarillo` o `gris`. Se puede fijar en cualquier celda, aunque no sea un estado de la lista. Si no se fija, el color sale de la lista de estados.
  - `estilo`: `texto` o `identificador`, para cambiar el estilo por defecto de la columna en esa celda (por ejemplo, un nombre lógico en texto normal dentro de una columna identificador).
- Filas y columnas llevan `id` estable.

### Lista de estados

El color de una celda de estado sale de su texto:

- **ninguno:** En uso, Creado, Aplicada, Lectura, Solo observabilidad.
- **gris:** No existe, No aplica, No usa.
- **amarillo:** Pendiente, Pendiente de confirmar, Pendiente de registrar, Sin uso, Sin acceso.
- Casos especiales en amarillo: un tag seguido de "(no estable)" y reglas incompletas con la forma "N de M aplicadas" (N menor que M).

La lista es configurable en `estados` de cada documento: `{"texto": "En uso", "color": "ninguno"}`. Una celda de columna estado con un texto que no está en la lista, que no es un caso especial y que no tiene `color` es un error de validación.

## 6. Secretos

Nunca se guardan contraseñas ni valores de secretos; solo dónde están. La detección de posibles secretos es una **advertencia** y no bloquea, para evitar falsos positivos.

## 7. Comparar versiones (Fase 3)

Cada versión guardada conserva el JSON junto al HTML. Con `id` estables en secciones, bloques, columnas y filas, dos versiones se comparan por identificador y no por posición.
