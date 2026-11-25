/* Imagenes de los diagramas: pegar (Ctrl+V), soltar archivos en la hoja o elegir un archivo.
   El servidor valida el contenido, le da un nombre propio con su hash y la guarda en
   actual/imagenes/; aqui solo se sube el archivo y se asigna al bloque. */
(function (F) {
  "use strict";

  const I = F.Imagenes = {};
  const E = () => F.Editor;
  const intentar = (fn) => { try { return fn(); } catch (e) { F.avisar(e.message); return null; } };

  I.esImagen = function (archivo) {
    return ["image/png", "image/jpeg", "image/svg+xml"].includes(archivo.type) || /\.(png|jpe?g|svg)$/i.test(archivo.name || "");
  };

  function aBase64(archivo) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result).split(",")[1] || "");
      lector.onerror = () => rechazar(new Error("No se pudo leer el archivo."));
      lector.readAsDataURL(archivo);
    });
  }

  /* Sube el archivo; sid es la seccion (da nombre a las imagenes pegadas, que no traen uno). */
  async function subir(archivo, sid) {
    if (!I.esImagen(archivo)) throw new Error("Solo se admiten imágenes PNG, JPG o SVG.");
    return F.api("/api/imagen", { datos: await aBase64(archivo), nombre: archivo.name || "", seccion: sid || "" });
  }

  /* Reemplaza (o asigna) la imagen de un bloque que ya existe. */
  I.asignar = async function (sid, bid, archivo) {
    try {
      const r = await subir(archivo, sid);
      const m = E().modelo();
      intentar(() => m.imagenArchivo(sid, bid, r.archivo, r.alto_mm));
    } catch (e) { F.avisar(e.message); }
  };

  /* Bloque de imagen nuevo con su archivo, en un solo cambio (un Ctrl+Z lo deshace). */
  I.insertar = async function (sid, indice, archivo) {
    try {
      const r = await subir(archivo, sid);
      const m = E().modelo();
      const bid = intentar(() => m.agregarImagen(sid, indice, r.archivo, r.alto_mm));
      if (bid) E().seleccionar({ tipo: "bloque", sid: sid, bid: bid }, true);
      return bid;
    } catch (e) { F.avisar(e.message); return null; }
  };

  function esImagenSeleccionada() {
    const s = E().seleccion, m = E().modelo();
    if (!s || s.tipo !== "bloque") return null;
    const o = m.bloqueDe(s.sid, s.bid);
    return o && o.bloque.tipo === "imagen" ? s : null;
  }

  /* Ctrl+V: reemplaza la imagen seleccionada o agrega una nueva. */
  I.pegar = async function (archivo) {
    const s = esImagenSeleccionada();
    if (s) { await I.asignar(s.sid, s.bid, archivo); return; }
    const lugar = E().lugarDeInsercion();
    if (!lugar) { F.avisar("Primero agrega una sección."); return; }
    await I.insertar(lugar.sid, lugar.indice, archivo);
  };

  /* Archivos soltados: encima de una imagen la reemplazan (el primero); los demas, o los que
     caen en otro lugar, se insertan como imagenes nuevas en orden. */
  I.soltar = async function (archivos, sid, indice, sobre) {
    const validas = archivos.filter(I.esImagen);
    if (!validas.length) { F.avisar("Solo se admiten imágenes PNG, JPG o SVG."); return; }
    let resto = validas;
    const p = sobre ? sobre.split(":") : null;
    const o = p ? E().modelo().bloqueDe(p[1], p[2]) : null;
    if (o && o.bloque.tipo === "imagen") {
      await I.asignar(p[1], p[2], validas[0]);
      resto = validas.slice(1);
      sid = p[1];
      indice = o.indice + 1;
    }
    for (let k = 0; k < resto.length; k++) {
      await I.insertar(sid, indice === null || indice === undefined ? null : indice + k, resto[k]);
    }
  };

  /* Boton "Elegir archivo" del panel. */
  I.elegir = function (sid, bid) {
    const entrada = F.el("input", { type: "file", accept: ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" });
    entrada.addEventListener("change", () => { if (entrada.files[0]) I.asignar(sid, bid, entrada.files[0]); });
    entrada.click();
  };
})(window.Folium = window.Folium || {});
