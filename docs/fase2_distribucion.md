# Fase 2: distribución de la pantalla del editor (propuesta)

Esquema funcional, sin estilos. El diseño visual va al final, con la maqueta de referencia.

## Pantalla

```
+----------------------------------------------------------------------------+
| Folium · DEMOAP        [General] [Repositorio] [Compartidos]   [Guardar versión] [⋯] |
+--------------------+--------------------------------------+----------------+
| IZQUIERDO          | CENTRO                               | DERECHO        |
|                    |                                      |                |
| ESTRUCTURA         |   +------------------+               | PROPIEDADES    |
|  1. Descripción    |   |   Hoja A4        |               | (lo que esté   |
|  2. Documentos     |   |   texto editable |               |  seleccionado) |
|     a) Tag desp.   |   |   tablas         |               |                |
|  3. Arquitectura   |   +------------------+               |                |
|  [+ Sección]       |   +------------------+               |                |
|                    |   |   Hoja A4        |               |                |
| BLOQUES            |   +------------------+               |                |
|  Sección           |                      [Zoom · Márgenes]                |
|  Párrafo  Nota     |                                      | Guardado ✓     |
|  Nota destacada    |                                      |                |
|  Etiqueta          |                                      |                |
|  Tabla  Imagen     |                                      |                |
+--------------------+--------------------------------------+----------------+
```

## Panel izquierdo

- **Estructura:** árbol de secciones del documento activo (hasta 3 niveles).
  - Se reordena arrastrando; al soltar sobre otra sección se vuelve su hija y entre dos secciones queda del mismo nivel.
  - Cada fila tiene un menú `⋯`: renombrar, duplicar, quitar.
  - Clic en una sección: la hoja se desplaza hasta ella y queda seleccionada.
  - Botón `+ Sección`: crea una sección nueva.
- **Bloques:** paleta con Sección, Párrafo, Nota, Nota destacada, Etiqueta, Tabla e Imagen. Se arrastran a la hoja; también se pueden insertar con doble clic debajo de lo seleccionado.

## Centro

- Las hojas A4 reales (el mismo visor y paginador de ahora).
- Al pasar el cursor, cada bloque muestra un contorno suave y un asa para arrastrarlo (reordenar o mover a otra sección).
- Clic en un bloque, título o celda lo selecciona. Los textos y las celdas se editan ahí mismo, como texto plano con la sintaxis `` `código` ``, `**negrita**` y `[texto](url)`.
- Al arrastrar un bloque o un elemento de la paleta aparece una línea azul que indica dónde caerá.
- Teclas: `Esc` quita la selección, `Supr` quita el bloque seleccionado (con aviso), `Ctrl+Z` y `Ctrl+Y` deshacen y rehacen.
- Tras cada cambio la paginación, la numeración, el índice y los números de página se recalculan solos, y la hoja conserva la posición de desplazamiento y la selección.

## Panel derecho (cambia según lo seleccionado)

| Selección | Qué muestra |
|---|---|
| Nada (el documento) | Campos de la portada (agregar, quitar, ordenar) y lista de estados con su color |
| Sección | Título, identificador (solo lectura), nivel, "opcional", "anexo" (solo nivel 1) |
| Párrafo, nota, nota destacada, etiqueta | Tipo de bloque (se puede cambiar entre ellos) y "no separar del siguiente" |
| Tabla | Clase (estado o registro); columnas con título, tipo y ancho en mm, y la suma "N de 150 mm" (en rojo si no es 150); agregar, quitar y ordenar columnas y filas |
| Celda | Texto, estado (lista), color (automático, ninguno, amarillo o gris), tipo de la celda (igual que la columna, texto, identificador o estado) |
| Imagen | Archivo, alto en mm, descripción y fuente `.drawio` |

## Flujo 1: agregar una sección

1. El usuario pulsa `+ Sección` en el panel izquierdo, o arrastra "Sección" de la paleta a la hoja (una línea azul muestra dónde caerá).
2. Si hay una sección seleccionada, la nueva es su hermana; si se arrastró, toma el nivel del lugar donde cayó. El nivel se puede cambiar en el panel derecho.
3. Folium crea la sección con el título "Nueva sección" ya en edición sobre la hoja. Al confirmar el título se genera su identificador estable, que no vuelve a cambiar.
4. Aparece en el árbol, en la hoja y en el índice; la numeración se recalcula y el panel derecho muestra sus propiedades.
5. El cambio se guarda solo en `actual/` y queda en el historial para deshacer.

## Flujo 2: editar una celda de tabla

1. Clic en la celda: queda seleccionada y el panel derecho muestra sus propiedades.
2. Doble clic o empezar a escribir: se edita ahí mismo. `Tab` y `Mayús+Tab` pasan a la celda siguiente o anterior, `Enter` confirma y `Esc` cancela.
3. En una columna de estado, el panel derecho ofrece la lista de estados; el color sale del texto, o se fija a mano en la celda.
4. Para más líneas debajo del texto, Enter en el cuadro de texto del panel derecho (o Mayús+Enter en la hoja).
5. Al confirmar: se actualiza el documento, se recalcula la paginación (la tabla puede partirse entre hojas) y se guarda solo. Si el estado no está en la lista o las columnas no suman 150 mm, se marca al instante.

## Flujo 3: guardar

1. Cada cambio se guarda solo como borrador en `actual/` (con un breve retraso), y un indicador muestra "Guardando…" o "Guardado".
2. "Guardar versión" funciona como en la Fase 1: antes de abrir el diálogo valida los tres documentos. Si hay errores, los lista y cada uno lleva al bloque afectado.
3. Se crea la versión inmutable, la carpeta de PDF y el botón de impresión.

## Cómo se construye

- El modelo del documento vive en la pantalla; cada cambio lo actualiza, lo manda al servidor y vuelve a paginar sin recargar el `iframe`.
- Cada elemento de la hoja lleva el identificador de su sección, bloque, fila o columna, para saber qué se tocó.
- Servidor: un endpoint para guardar el documento de `actual/` (validado antes de escribir) y otro para subir imágenes, con nombre propio y hash.
- Arrastrar y soltar con JavaScript nativo, sin librerías. Solo hay los tipos de bloque definidos: sin fuentes ni colores libres.

## Orden propuesto de construcción

1. Modelo en pantalla, guardado automático, deshacer y rehacer; árbol izquierdo y flujo "agregar sección".
2. Bloques de texto y paleta; edición sobre la hoja y reordenar bloques.
3. Tablas: celdas, columnas, filas, estados y colores.
4. Imágenes: pegar, nombre propio y hash.
5. Validaciones en vivo y portada y lista de estados en el panel derecho.
