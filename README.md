# Folium

Herramienta web local para editar y publicar la documentación de infraestructura de una aplicación. Solo usa Python (biblioteca estándar) y el navegador. No se instala nada.

## Requisitos

- Python 3 (sin paquetes adicionales).
- Edge o cualquier navegador moderno.
- Windows y PowerShell, sin permisos de administrador.

## Levantar la aplicación

En PowerShell, desde la raíz del proyecto:

```powershell
python servidor.py
```

Luego abre `http://localhost:8765`. Para detenerlo, pulsa Ctrl+C.

Para usar otro puerto:

```powershell
$env:FOLIUM_PUERTO = "8800"
python servidor.py
```

## Variables de entorno

| Variable | Para qué sirve | Por defecto | Estado |
|---|---|---|---|
| `FOLIUM_PUERTO` | Puerto del servidor local | `8765` | En uso (Fase 0) |
| `DOC_RAIZ_TRABAJO` | Ruta completa del directorio de trabajo que ve el equipo en SharePoint. Folium crea ahí `02_Documentacion/`, `03_Diagramas/` y `04_OperacionesManuales/`. No toca `01_Arquitectura/` | `temp_pruebas/trabajo` | Se usará desde la Fase 1 |
| `DOC_RAIZ_PROCESO` | Ruta completa del directorio de proceso, privado. Contiene `<TRACKING>/actual/` y `<TRACKING>/versiones/` | `temp_pruebas/proceso` | Se usará desde la Fase 1 |

Para fijarlas en la sesión de PowerShell (las rutas son solo un ejemplo):

```powershell
$env:DOC_RAIZ_TRABAJO = "C:\ruta\al\directorio\de\trabajo"
$env:DOC_RAIZ_PROCESO = "C:\ruta\al\directorio\de\proceso"
```

Si una variable no existe, Folium crea y usa la carpeta por defecto dentro del repositorio (`temp_pruebas/`, que está en `.gitignore`). Al arrancar, el servidor imprime qué directorios usa.

Nunca guardes contraseñas ni valores de secretos en estas variables ni en los documentos; solo dónde están.

## Carpeta `referencia/` (solo desarrollo)

Contiene los HTML de referencia y los acuerdos. No se sube a git. Para probar la Fase 0 hay que copiar a mano los tres `plantilla_documento_*.html` en `referencia/`. Si falta alguno, el servidor lo indica.

`python herramientas/dividir_referencia.py` divide esa carpeta en partes pequeñas dentro de `referencia/secciones/`.

## Comprobar el PDF (Fase 0)

1. Abre un documento desde la página de inicio.
2. Pulsa Ctrl+P y elige "Guardar como PDF".
3. En Más ajustes, activa "Gráficos de fondo".
4. Revisa fuentes, colores, portada y enlaces del índice.

## Estructura

- `servidor.py`: servidor local.
- `web/`: páginas de la interfaz.
- `herramientas/`: scripts de apoyo.
- `docs/decisiones.md`: decisiones y su motivo.
