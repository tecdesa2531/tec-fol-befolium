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
- La portada es una lista ordenada: se pueden agregar, quitar, editar y ordenar campos. Un campo lleva `etiqueta` y `valor` (texto fijo) o `automatico`: `version` o `fecha`, que Folium rellena al guardar y que no se editan ni se quitan (sí se ordenan). Mientras se edita, la versión es "Borrador".
- `versiones_vigentes` solo existe en `general`: las versiones vigentes del documento 2 y del 3.
- `estados`: lista `{texto, color}` con `color` ninguno, amarillo o gris. El texto no puede estar vacío ni repetido.
- `ids_retirados` (opcional): identificadores de secciones quitadas. Folium lo llena al quitar una sección y la validación rechaza reutilizarlos.

## 2. Secciones (agregar y quitar libremente)

El documento es un árbol abierto. La profundidad define el título: nivel 1 = h1, nivel 2 = h2, nivel 3 = h3. No hay más niveles.

```json
{"id": "inv-bd", "titulo": "Base de datos", "opcional": false, "anexo": false,
 "bloques": [ ... ], "siguiente_bloque": 4, "secciones": [ ... ]}
```

- `id`: identificador estable (`data-id`). Se crea una vez a partir del título (minúsculas y guiones) y **no cambia aunque cambie el título**. Es único en el documento: si el título se repite, se antepone el id del padre (`cuenta-eks-rol-iam`), luego también el del abuelo y, como último recurso, un sufijo numérico (`-2`). Mientras la sección no esté en ninguna versión guardada, el `id` sigue al título; después queda fijo. Los enlaces internos y la comparación entre versiones dependen de él. Un `id` quitado no se reutiliza.
- `siguiente_bloque` (opcional): contador de ids de bloque de la sección. Solo sube: si se borra `b3`, el bloque siguiente es `b4`. Debe ser mayor que el número de cualquier `id` de bloque de la sección. Si falta, se toma el máximo actual + 1.
- `opcional`: marca secciones que pueden no existir en una aplicación (Workload y Data del documento 3). Quitarlas es borrarlas del árbol.
- `anexo`: solo en nivel 1. No se numera.
- Numeración (h1: `1.`, h2: `a)`), índice, números de página y enlaces internos se recalculan solos y no se guardan.
- El h3 no se numera ni aparece en el índice.

## 3. Texto con formato

Se usa en párrafos, notas y celdas:

- `` `código` `` → Consolas.
- `**negrita**`.
- `[texto](https://...)` → enlace; `[texto](#id-de-seccion)` → enlace interno; `[texto]()` → enlace cuya URL aún no se pegó (se muestra como enlace sin destino).
- Un salto de línea (`\n`) dentro de una celda es una línea nueva debajo (una línea debajo de otra, sin espacio extra). En una nota destacada, una línea en blanco separa párrafos.

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
- `archivo`: solo el nombre (sin rutas) dentro de `actual/imagenes/`. Se incrusta en el HTML al guardar la versión. Sin `archivo`, el bloque se dibuja como el recuadro punteado `.diag`.
- Nombre del archivo: Folium lo crea al subir la imagen, `<nombre>-<hash>.png|jpg|svg`. El nombre es el del archivo de origen si dice algo y, si no (una imagen pegada llega como `image.png`), `imagen-<id de la sección>`. El hash son los 8 primeros caracteres del SHA-256 del contenido; el hash completo se guarda con cada versión en `<nombre>.imagenes.json` y por él se detecta que una imagen cambió.
- `alto_mm`: alto del recuadro o de la imagen, mayor que 0 y de hasta 247 mm (el alto útil de la hoja). La imagen ocupa 150 mm de ancho como máximo, se ajusta dentro de ese recuadro sin deformarse y, si no cabe en lo que queda de la hoja, pasa a la siguiente. Al poner una imagen en un bloque sin imagen, el alto es el que da 150 mm de ancho con su proporción; al reemplazarla se conserva el alto.
- `descripcion`: lista de textos que se muestra en el recuadro punteado `.diag` mientras no hay imagen; el primero es el título y los demás son líneas de detalle.
- `fuente_drawio`: ruta del `.drawio`, escrita con `/` y dentro de `03_Diagramas/` (sin `..`); se muestra como "Fuente: ...". Es solo texto: Folium no abre ni copia el archivo.
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
      "dev": {"texto": "0.1.0\nen proceso `0.2.0-rc.1`", "color": "amarillo"},
      "est": "En uso"}}
  ],
  "siguiente_fila": 2, "siguiente_columna": 1
}
```

- `clase`: `estado` (solo lo vigente) o `registro` (acumula filas).
- `nuevas_filas` (solo en `registro`): `arriba` (la más reciente primero, como los scripts y cargas) o `abajo` (al final, como las entregas y los secretos). Borrar una fila de una tabla de registro pide confirmación.
- Los anchos suman **150 mm**; si no, Folium avisa y no deja guardar la versión.
- `siguiente_fila` y `siguiente_columna` (opcionales): contadores de ids de la tabla. Solo suben: si se borra `f3`, la fila siguiente es `f4`. Deben ser mayores que el número de cualquier `id` `f<N>` o `c<N>` existente. Si faltan, se toma el máximo actual + 1.
- Tipo de columna = tipo por defecto de sus celdas:
  - `texto`: Georgia 8 pt.
  - `identificador`: Consolas 7,5 pt.
  - `estado`: el color sale de la lista de estados.
- Una celda es un texto simple o un objeto:
  - `texto`: admite el formato de la sección 3 y saltos de línea. Para el color y la validación de estado cuenta solo la **primera línea**.
  - `color`: `ninguno`, `amarillo` o `gris`. Se puede fijar en cualquier celda, aunque no sea un estado de la lista. Si no se fija, el color sale de la lista de estados.
  - `tipo`: `texto`, `identificador` o `estado`. Es la excepción de esa celda al tipo de su columna y funciona en cualquier columna (una celda estado dentro de una columna de texto, o una de texto dentro de una columna de estado). Si falta, vale el tipo de la columna. Una celda de tipo `estado` calcula su color sola y se valida como estado.
  - Los campos anteriores `estilo` y `lineas` ya no existen: Folium los migra al abrir (`estilo` pasa a `tipo`; las líneas pasan al texto) y la validación rechaza los que queden.
- Filas y columnas llevan `id` estable (`f<N>`, `c<N>`) que no se reutiliza, gracias a los contadores.

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

## 8. Problemas de validación

Cada problema que devuelve la validación lleva `nivel` (`error` o `advertencia`), `donde` (texto), `mensaje` y `ref`, el elemento afectado: `{"tipo": "seccion", "sid"}`, `{"tipo": "bloque", "sid", "bid"}`, `{"tipo": "columna", "sid", "bid", "cid"}`, `{"tipo": "celda", "sid", "bid", "fid", "cid"}`, `{"tipo": "portada", "indice"}`, `{"tipo": "estados", "indice"}` o `{"tipo": "documento"}`. El editor lo usa para marcar el elemento y llevar a él.
