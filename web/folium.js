/* Interfaz de Folium (Fase 1). JavaScript nativo, sin librerias. */
(function () {
  const DOCS = ["general", "repositorio", "compartidos"];
  const NOMBRES = { general: "General", repositorio: "Repositorio", compartidos: "Compartidos" };
  const $ = (id) => document.getElementById(id);
  let estado = null;
  let activo = "general";

  function el(tag, props, hijos) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === "texto") e.textContent = v; else e.setAttribute(k, v); });
    (hijos || []).forEach((h) => e.appendChild(typeof h === "string" ? document.createTextNode(h) : h));
    return e;
  }

  async function api(ruta, cuerpo) {
    const opciones = cuerpo === undefined ? {} :
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) };
    const r = await fetch(ruta, opciones);
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error || "Error inesperado");
    return datos;
  }

  /* ---------- estado y pantallas ---------- */
  async function cargarEstado() {
    estado = await api("/api/estado");
    pintar();
  }

  function pintar() {
    const abierta = estado.abierta;
    $("pantalla-abrir").hidden = abierta;
    $("cuerpo").hidden = !abierta;
    $("pestanas").hidden = !abierta;
    $("acciones").hidden = !abierta;
    $("app-info").hidden = !abierta;
    if (!abierta) {
      if (!$("abrir-carpeta").value) $("abrir-carpeta").value = estado.carpeta_defecto;
      return;
    }
    $("app-info").textContent = estado.tracking + " · " + estado.trabajo;
    pintarPestanas();
    mostrarDocumento();
  }

  function textoPestana(info) {
    if (!info.existe) return "Sin crear";
    if (info.errores.length) return info.errores.length + (info.errores.length === 1 ? " error" : " errores");
    if (!info.ultima) return "Borrador";
    return (info.cambio ? "Borrador sobre " : "") + info.ultima;
  }

  function pintarPestanas() {
    document.querySelectorAll("#pestanas button").forEach((b) => {
      const d = b.dataset.doc, info = estado.documentos[d];
      b.textContent = "";
      b.appendChild(document.createTextNode(NOMBRES[d]));
      b.appendChild(el("small", { texto: textoPestana(info) }));
      b.setAttribute("aria-selected", d === activo ? "true" : "false");
      b.classList.toggle("error", info.errores.length > 0 || !!info.error_lectura);
    });
  }

  function mostrarDocumento() {
    const info = estado.documentos[activo];
    const hoja = $("hoja"), msg = $("mensaje"), aviso = $("aviso");
    aviso.hidden = true;
    msg.textContent = "";
    hoja.hidden = true;
    msg.hidden = true;
    $("vista").hidden = true;
    $("btn-imprimir").disabled = true;

    if (info.error_lectura) {
      msg.hidden = false;
      msg.appendChild(el("h2", { texto: "No se pudo leer el documento" }));
      msg.appendChild(el("p", { texto: info.error_lectura }));
      msg.appendChild(el("p", { texto: "Corrige el archivo a mano y pulsa Recargar." }));
      return;
    }
    if (!info.existe) { formularioCrear(msg); return; }
    if (info.errores.length) {
      msg.hidden = false;
      msg.appendChild(el("h2", { texto: "Errores de validación en " + NOMBRES[activo] }));
      msg.appendChild(el("p", { texto: "Corrige el archivo de actual/ y pulsa Recargar." }));
      msg.appendChild(listaProblemas(info.errores));
      return;
    }
    if (info.advertencias.length) {
      aviso.hidden = false;
      aviso.textContent = "";
      aviso.appendChild(document.createTextNode("Advertencias (no impiden guardar):"));
      aviso.appendChild(listaProblemas(info.advertencias));
    }
    hoja.hidden = false;
    $("vista").hidden = false;
    hoja.src = "/hoja/" + activo + "?t=" + Date.now();
    $("btn-imprimir").disabled = false;
  }

  function listaProblemas(problemas) {
    const ul = el("ul");
    problemas.forEach((p) => ul.appendChild(el("li", {}, [el("span", { class: "donde", texto: p.donde + " " }), p.mensaje])));
    return ul;
  }

  /* ---------- crear documentacion ---------- */
  function formularioCrear(contenedor) {
    contenedor.hidden = false;
    contenedor.appendChild(el("h2", { texto: "Crear documentación" }));
    contenedor.appendChild(el("p", { texto: "Todavía no existe este documento. Indica los datos de la portada; Folium crea los documentos que faltan con sus secciones vacías." }));
    const campos = [
      ["proyecto", "Proyecto", ""], ["aplicacion", "Aplicación", ""], ["organizacion", "Organización", ""],
      ["lider", "Líder técnico", ""], ["responsable", "Responsable de infraestructura", ""],
      ["clasificacion", "Clasificación", "USO INTERNO"], ["repositorio", "Repositorio de la aplicación", ""],
    ];
    const form = el("form");
    campos.forEach(([id, etiqueta, valor]) => {
      const input = el("input", { name: id, autocomplete: "off" });
      input.value = valor;
      form.appendChild(el("label", {}, [etiqueta, input]));
    });
    const error = el("p", { class: "error", hidden: "" });
    form.appendChild(error);
    form.appendChild(el("button", { type: "submit", class: "primario", texto: "Crear documentación" }));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const datos = {};
      campos.forEach(([id]) => { datos[id] = form.elements[id].value; });
      try { estado = await api("/api/crear", datos); pintar(); }
      catch (e) { error.hidden = false; error.textContent = e.message; }
    });
    contenedor.appendChild(form);
  }

  /* ---------- abrir / cerrar ---------- */
  $("form-abrir").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("abrir-error").hidden = true;
    try {
      estado = await api("/api/abrir", { tracking: $("abrir-tracking").value, carpeta: $("abrir-carpeta").value });
      activo = "general";
      pintar();
    } catch (e) { $("abrir-error").hidden = false; $("abrir-error").textContent = e.message; }
  });

  $("abrir-tracking").addEventListener("input", async (ev) => {
    ev.target.value = ev.target.value.toUpperCase();
    if (ev.target.value.length !== 6) return;
    try {
      const r = await api("/api/recordada?tracking=" + encodeURIComponent(ev.target.value));
      if (r.carpeta) $("abrir-carpeta").value = r.carpeta;
    } catch (e) { /* sin carpeta recordada */ }
  });

  /* ---------- controles de vista (zoom y margenes) sobre el iframe ---------- */
  function aplicarVista() {
    const w = $("hoja").contentWindow;
    if (!w || !w.__done) { setTimeout(aplicarVista, 150); return; }
    const d = w.document;
    d.getElementById("pages").style.zoom = $("vista-zoom").value;
    d.body.classList.toggle("guides", $("vista-margenes").checked);
  }
  $("hoja").addEventListener("load", aplicarVista);
  $("vista-zoom").addEventListener("change", aplicarVista);
  $("vista-margenes").addEventListener("change", aplicarVista);

  $("btn-cerrar").addEventListener("click", async () => { estado = await api("/api/cerrar", {}); pintar(); });
  $("btn-recargar").addEventListener("click", cargarEstado);
  $("btn-imprimir").addEventListener("click", () => { const h = $("hoja"); if (!h.hidden) h.contentWindow.print(); });
  document.querySelectorAll("#pestanas button").forEach((b) =>
    b.addEventListener("click", () => { activo = b.dataset.doc; pintarPestanas(); mostrarDocumento(); }));

  /* ---------- guardar version ---------- */
  const dlg = $("dlg-guardar");
  let propuesta = null;

  $("btn-guardar").addEventListener("click", async () => {
    $("guardar-error").hidden = true;
    $("guardar-contenido").textContent = "";
    $("guardar-confirmar").hidden = false;
    $("guardar-confirmar").disabled = false;
    dlg.showModal();
    try {
      propuesta = await api("/api/guardar/propuesta");
      pintarPropuesta();
    } catch (e) { mostrarErrorGuardar(e.message); $("guardar-confirmar").disabled = true; }
  });
  $("guardar-cancelar").addEventListener("click", () => dlg.close());

  function mostrarErrorGuardar(texto) { $("guardar-error").hidden = false; $("guardar-error").textContent = texto; }

  function pintarPropuesta() {
    const c = $("guardar-contenido");
    c.textContent = "";
    if (propuesta.faltan.length || Object.keys(propuesta.errores).length) {
      $("guardar-confirmar").disabled = true;
      if (propuesta.faltan.length) c.appendChild(el("p", { texto: "Faltan documentos por crear: " + propuesta.faltan.map((d) => NOMBRES[d]).join(", ") + "." }));
      Object.keys(propuesta.errores).forEach((d) => c.appendChild(el("p", { texto: NOMBRES[d] + " tiene errores de validación. Corrígelos antes de guardar." })));
      return;
    }
    if (!propuesta.hay_cambios) {
      $("guardar-confirmar").disabled = true;
      c.appendChild(el("p", { texto: "No hay cambios respecto a las últimas versiones guardadas." }));
      return;
    }
    const tabla = el("table");
    tabla.appendChild(el("thead", {}, [el("tr", {}, ["Documento", "Estado", "Versión nueva"].map((t) => el("th", { texto: t })))]));
    const cuerpo = el("tbody");
    DOCS.forEach((d) => {
      const p = propuesta.documentos[d];
      const input = el("input", { "data-doc": d, autocomplete: "off" });
      let estadoTexto, editable = true;
      if (d === "general") {
        estadoTexto = "Siempre se actualiza (lleva las versiones de los otros dos)";
        input.value = p.sugerida;
      } else if (p.cambio) {
        estadoTexto = p.ultima ? "Con cambios (última: " + p.ultima + ")" : "Primera versión";
        input.value = d === "compartidos" ? p.sugerida : "";
        if (d === "repositorio") input.placeholder = "Tag de entrega, por ejemplo 0.2.3";
      } else {
        estadoTexto = "Sin cambios: se copia su último PDF";
        input.value = p.ultima || "";
        input.disabled = true;
        editable = false;
      }
      cuerpo.appendChild(el("tr", {}, [el("td", { texto: NOMBRES[d] }), el("td", { texto: estadoTexto }), el("td", {}, [input])]));
    });
    tabla.appendChild(cuerpo);
    c.appendChild(tabla);
    c.appendChild(el("p", { class: "ayuda", texto: "Los documentos 1 y 3 usan AAAAMMDD-vNN; el documento 2 usa el tag de entrega, que escribes tú." }));
  }

  $("guardar-confirmar").addEventListener("click", async () => {
    $("guardar-error").hidden = true;
    const pedidas = {};
    document.querySelectorAll("#guardar-contenido input").forEach((i) => { if (!i.disabled) pedidas[i.dataset.doc] = i.value.trim(); });
    try {
      const r = await api("/api/guardar", pedidas);
      mostrarResultado(r);
      await cargarEstado();
    } catch (e) { mostrarErrorGuardar(e.message); }
  });

  function mostrarResultado(r) {
    const c = $("guardar-contenido");
    c.textContent = "";
    $("guardar-confirmar").hidden = true;
    c.appendChild(el("p", { texto: "Versión " + r.version_general + " guardada. Carpeta de PDF creada:" }));
    c.appendChild(el("p", {}, [el("code", { texto: r.carpeta })]));
    c.appendChild(el("p", { texto: "Imprime cada documento y guarda el PDF con el nombre que propone el navegador (es el título de la página):" }));
    const lista = el("div", { class: "lista" });
    r.imprimir.forEach((i) => {
      const b = el("button", { type: "button", texto: "Imprimir " + i.pdf });
      b.addEventListener("click", () => window.open("/imprimir/" + i.documento + "/" + i.version, "_blank"));
      lista.appendChild(b);
    });
    c.appendChild(lista);
    c.appendChild(el("div", { class: "nota", texto: "Antes de guardar: elige «Guardar como PDF» (no «Microsoft Print to PDF»), abre «Más ajustes» y activa «Gráficos de fondo»." }));
    if (r.copiados.length) c.appendChild(el("p", { texto: "PDF copiados de la versión anterior: " + r.copiados.join(", ") }));
    r.avisos.forEach((a) => c.appendChild(el("div", { class: "nota", texto: a })));
  }

  cargarEstado();
})();
