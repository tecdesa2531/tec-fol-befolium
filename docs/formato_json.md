# Formato JSON de los documentos (propuesta)

Un archivo por documento en `DOC_RAIZ_PROCESO/<TRACKING>/actual/`: `general.json`, `repositorio.json`, `compartidos.json`. Se pueden corregir a mano. UTF-8, sangría de 2 espacios, claves en minúsculas sin tildes.

## 1. Estructura de un documento

```json
{
  "formato": 1,
  "documento": "general",
  "titulo_pagina": "Documento general de la aplicación",
  "portada": [
    {"etiqueta": "Proyecto", "valor": "Nube"},
    {"etiqueta": "Aplicación", "valor": "demo"},
    {"etiqueta": "Tracking code", "valor": "DEMOAP"},
    {"etiqueta": "Clasificación", "valor": "USO INTERNO"}
  ],
  "versiones_vigentes": {"repositorio": "0.1.0", "compartidos": "20260101-v01"},
  "estados": [ ...ver sección 4... ],
  "secciones": [ ...árbol de secciones... ]
}
```

- `documento`: `general`, `repositorio` o `compartidos`.
- `titulo_pagina`, `portada` y el texto del pie salen de aquí; el paginador es uno solo.
- La versión del documento y la fecha NO se escriben a mano: Folium las pone al guardar. En edición el pie dice "Borrador".
- `versiones_vigentes` solo existe en `general`. Es lo que Folium usa para escribir las versiones del 2 y del 3 en el documento 1.
- La portada es una lista ordenada de pares etiqueta y valor, por lo que se pueden agregar o quitar campos.

## 2. Secciones (agregar y quitar libremente)

El documento es un árbol abierto. Una sección puede tener bloques y subsecciones; la profundidad del árbol define h1, h2 y h3.

```json
{
  "id": "inv-bd",
  "titulo": "Base de datos",
  "opcional": false,
  "bloques": [ ... ],
  "secciones": [ ... ]
}
```

- `id`: identificador estable (`data-id`). Se crea una vez a partir del título, en minúsculas y con guiones, y **no cambia aunque cambie el título**. Es único en el documento. Los enlaces internos y la comparación entre versiones dependen de él.
- Agregar una sección crea un `id` nuevo (si choca, se agrega un sufijo numérico). Quitarla no reutiliza su `id`.
- `opcional`: marca secciones que pueden no existir en una aplicación (por ejemplo Workload y Data del documento 3). Quitarlas es borrarlas del árbol.
- Numeración, índice, números de página y enlaces internos se recalculan solos; no se guardan.
- Hay una marca `anexo: true` para secciones de primer nivel que van como anexo (por ejemplo "Anexo A").

## 3. Bloques

Todos llevan `tipo` y un `id` corto propio del bloque (`b1`, `b2`...), único dentro de su sección, para poder comparar versiones.

| tipo | campos | se muestra como |
|---|---|---|
| `parrafo` | `texto` | párrafo normal |
| `nota` | `texto` | nota pequeña en gris (`p.note`) |
| `nota_destacada` | `texto` | recuadro con borde izquierdo y fondo suave (`.callout`) |
| `tabla` | ver sección 4 | tabla de 150 mm |
| `imagen` | `archivo`, `ancho_mm`, `pie`, `fuente_drawio` | imagen de diagrama; si falta `archivo`, el recuadro punteado `.diag` |

Texto enriquecido mínimo dentro de `texto`: `` `código` `` para identificadores en Consolas y `[texto](url)` para enlaces. Un enlace interno usa `[texto](#id-de-seccion)`. Todos los enlaces externos son URL que el usuario pega.

Las imágenes se guardan como archivo en `DOC_RAIZ_PROCESO/<TRACKING>/actual/imagenes/` y se incrustan en el HTML al guardar la versión. `fuente_drawio` solo apunta al archivo `.drawio` de `03_Diagramas/`.

## 4. Tablas

```json
{
  "tipo": "tabla",
  "id": "b2",
  "clase": "estado",
  "titulo": "Tag desplegado",
  "columnas": [
    {"id": "repo", "titulo": "Repositorio", "ancho_mm": 60, "tipo": "identificador"},
    {"id": "dev",  "titulo": "DEV",         "ancho_mm": 30, "tipo": "identificador"},
    {"id": "est",  "titulo": "Estado",      "ancho_mm": 60, "tipo": "estado"}
  ],
  "filas": [
    {"id": "f1", "celdas": {"repo": "demo-resources", "dev": "0.1.0", "est": "En uso"}}
  ]
}
```

- `clase`: `estado` (muestra solo lo vigente) o `registro` (acumula filas: scripts y cargas, entregas de credenciales, secretos recibidos).
- Los anchos de las columnas deben sumar **150 mm**. Si no suman, Folium avisa y no deja guardar la versión.
- Tipos de columna:
  - `texto`: Georgia 8 pt.
  - `identificador`: Consolas 7,5 pt (recursos, rutas, FQDN, tags, commits, tickets).
  - `estado`: solo valores de la lista de estados; el color sale del texto.
- Las filas llevan `id` estable y las columnas también, para comparar versiones.
- En tablas `registro` las filas nuevas se agregan al final y no se borran, salvo corrección manual.

### Lista de estados (configurable)

```json
"estados": [
  {"texto": "En uso",       "color": "ninguno"},
  {"texto": "Sin recurso",  "color": "amarillo"},
  {"texto": "Pendiente",    "color": "amarillo"},
  {"texto": "Acceso",       "color": "amarillo"},
  {"texto": "No existe",    "color": "gris"},
  {"texto": "No aplica",    "color": "gris"}
]
```

Colores permitidos: `ninguno`, `amarillo` (requiere atención) y `gris` (no existe o no aplica), como en los HTML de referencia. Los textos finales de la lista los define el usuario; los de arriba son de ejemplo. Una celda con un texto fuera de la lista es un error de validación.

## 5. Secretos y datos sensibles

Nunca se guardan contraseñas ni valores de secretos; solo dónde están. El validador rechaza valores que parezcan secretos.

## 6. Comparar versiones (Fase 3)

Cada versión guardada conserva el JSON junto al HTML. Con `id` estables en secciones, bloques, columnas y filas, dos versiones se comparan por identificador y no por posición.
