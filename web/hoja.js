/* Puente con las hojas A4 (iframe): pintar el modelo, marcar la seleccion, editar textos
   en la hoja, arrastrar bloques y recibir lo que se suelta encima. */
(function (F) {
  "use strict";

  let marcoListo = null;
  let secuencia = 0;
  let cola = Promise.resolve();

  const iframe = () => document.getElementById("hoja");
  const ventana = () => iframe().contentWindow;
  const documento = () => iframe().contentDocument;

  function escapar(ref) { return ref.replace(/["\\]/g, "\\$&"); }
  function elementosDe(ref) { return Array.from(documento().querySelectorAll('[data-ref="' + escapar(ref) + '"]')); }
  function elementoDe(ref) { return elementosDe(ref)[0] || null; }

  /* ---------- carga del marco ---------- */
  function asegurarMarco() {
    if (marcoListo) return marcoListo;
    marcoListo = new Promise((resolver) => {
      iframe().addEventListener("load", () => { instalar(); resolver(); }, { once: true });
      iframe().src = "/hoja";
    });
    return marcoListo;
  }

  function instalar() {
    const d = documento();
    d.addEventListener("click", (ev) => {
      if (ev.target.closest("a")) ev.preventDefault();
      if (ev.target.closest(".f-asa")) return;
      if (Date.now() - finArrastre < 300) return;            // el clic que cierra un arrastre de columna
      const mas = ev.target.closest(".f-mas");
      if (mas) { F.Editor.agregarDesdeBarra(mas.dataset.tipo, mas.dataset.sid, mas.dataset.bid); return; }
      const t = ev.target.closest("[data-ref]");
      F.Editor.alHacerClic(t ? t.dataset.ref : null);
    });
    d.addEventListener("dblclick", (ev) => {
      const t = ev.target.closest("[data-ref]");
      if (t) F.Editor.alDobleClic(t.dataset.ref);
    });
    d.addEventListener("keydown", (ev) => F.Editor.alTeclear(ev));
    d.addEventListener("paste", (ev) => F.Editor.alPegar(ev));
    d.addEventListener("mousemove", alMover);
    d.addEventListener("mouseleave", quitarAuxiliares);
    d.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || !borde || arrastre) return;
      ev.preventDefault();
      ev.stopPropagation();
      iniciarArrastre(ev);
    }, true);
    d.addEventListener("dragstart", (ev) => {
      F.Editor.arrastreInterno = true;
      const asa = ev.target.closest && ev.target.closest(".f-asa");
      if (!asa) {
        if (ev.target.tagName === "IMG") ev.preventDefault();      // solo el asa del bloque arrastra, no la imagen
        return;
      }
      ev.dataTransfer.setData(F.TIPO_INTERNO, "bloque");
      ev.dataTransfer.setData(F.Arbol.TIPO_BLOQUE, asa.dataset.bloque);
      ev.dataTransfer.effectAllowed = "move";
    });
    d.addEventListener("dragend", () => { ocultarLinea(); F.Editor.arrastreInterno = false; });
    d.addEventListener("dragover", (ev) => {
      const arrastrado = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!arrastrado) return;
      if (arrastrado.clase === "archivo") ev.preventDefault();         // nunca abrir el archivo en el navegador
      const destino = destinoSoltar(ev, arrastrado);
      if (!destino) { ocultarLinea(); return; }
      ev.preventDefault();
      mostrarLinea(destino);
    });
    d.addEventListener("dragleave", (ev) => { if (!ev.relatedTarget) ocultarLinea(); });
    d.addEventListener("drop", (ev) => {
      const arrastrado = F.Editor.tipoArrastrado(ev.dataTransfer);
      if (!arrastrado) return;
      ev.preventDefault();
      const destino = destinoSoltar(ev, arrastrado);
      ocultarLinea();
      if (destino && arrastrado.clase === "archivo") {
        const sobre = ev.target.closest && ev.target.closest('[data-ref^="b:"]');
        destino.sobre = sobre ? sobre.dataset.ref : null;               // soltado encima de un bloque: puede reemplazar su imagen
      }
      if (destino) F.Editor.alSoltar(arrastrado, ev.dataTransfer, destino);
      else if (arrastrado.clase === "archivo") F.Editor.alSoltarSinLugar(ev.dataTransfer);
    });
  }

  /* ---------- pintar ---------- */
  /* Espera a que no quede ningun repintado en curso (un cambio nuevo omite los anteriores). */
  async function inactiva() {
    let c;
    do { c = cola; await c; } while (c !== cola);
  }

  async function render(modelo) {
    const numero = ++secuencia;
    cola = cola.then(async () => {
      if (numero !== secuencia) return;            // llego un cambio mas nuevo: este se omite
      await asegurarMarco();
      const r = await F.api("/api/render/" + modelo.nombre, modelo.doc);
      if (numero !== secuencia) return;
      const w = ventana();
      const y = w.scrollY;
      await w.FoliumPaginar(r.src, r.cfg);
      w.scrollTo(0, y);
      documento().querySelectorAll("img").forEach((i) => { i.draggable = false; });
      quitarAuxiliares();
      marcarProblemas(F.Editor.problemas());
      marcarSeleccion(F.Editor.seleccion, false);
    });
    await inactiva();
  }

  /* ---------- barras + y ancho de columnas (solo en el editor) ----------
     Al acercar el cursor al borde inferior (o superior, en registros con filas nuevas arriba) o
     al borde derecho de una tabla aparece una barra con + para agregar una fila o una columna.
     Sobre el borde entre dos columnas el cursor pasa a redimensionar y el borde se resalta; al
     arrastrar solo cambian los anchos en pantalla y al soltar se guarda y se repagina.
     Todo esto se agrega a la hoja del editor: nunca esta en el HTML guardado ni al imprimir. */
  const ZONA_BORDE = 4;          // px a cada lado del borde entre columnas
  const GROSOR_BARRA = 12;       // px de la barra +
  const ANCHO_MINIMO = 5;        // mm, igual que el modelo
  let borde = null;              // borde de columnas bajo el cursor
  let barra = null;              // clave de la barra + visible
  let cursorPuesto = false;
  let arrastre = false;
  let finArrastre = 0;

  function quitarAuxiliares() {
    if (!marcoListo || arrastre) return;
    const d = documento();
    d.querySelectorAll(".f-mas,.f-borde").forEach((e) => e.remove());
    if (cursorPuesto) { d.documentElement.style.cursor = ""; cursorPuesto = false; }
    borde = null;
    barra = null;
  }

  function ponerBarra(tipo, sid, bid, r) {
    const clave = [tipo, sid, bid, Math.round(r.left), Math.round(r.top)].join("|");
    if (barra === clave) return;
    quitarAuxiliares();
    const d = documento();
    const w = ventana();
    const e = d.createElement("div");
    e.className = "f-mas";
    e.dataset.tipo = tipo; e.dataset.sid = sid; e.dataset.bid = bid;
    e.textContent = "+";
    e.title = tipo === "fila" ? "Agregar una fila" : "Agregar una columna";
    if (tipo === "fila") {
      const arriba = r.arriba;
      e.style.left = (r.left + w.scrollX) + "px";
      e.style.width = r.width + "px";
      e.style.height = GROSOR_BARRA + "px";
      e.style.top = ((arriba ? r.top - GROSOR_BARRA - 1 : r.bottom + 1) + w.scrollY) + "px";
    } else {
      e.style.left = (r.right + 2 + w.scrollX) + "px";
      e.style.width = GROSOR_BARRA + "px";
      e.style.top = (r.top + w.scrollY) + "px";
      e.style.height = r.height + "px";
    }
    d.body.appendChild(e);
    barra = clave;
  }

  function ponerBorde(b) {
    quitarAuxiliares();
    const d = documento();
    const w = ventana();
    const r = b.tabla.getBoundingClientRect();
    const l = d.createElement("div");
    l.className = "f-borde";
    l.style.left = (b.x - 1 + w.scrollX) + "px";
    l.style.top = (r.top + w.scrollY) + "px";
    l.style.height = r.height + "px";
    d.body.appendChild(l);
    d.documentElement.style.cursor = "col-resize";
    cursorPuesto = true;
    borde = b;
  }

  function alMover(ev) {
    if (arrastre) return;
    const d = documento();
    if (ev.buttons || d.querySelector(".f-editando") || !F.Editor.modelo()) { quitarAuxiliares(); return; }
    const x = ev.clientX, y = ev.clientY;
    let nuevoBorde = null, nuevaBarra = null;
    for (const t of d.querySelectorAll('table[data-ref^="b:"]')) {
      const r = t.getBoundingClientRect();
      if (x < r.left - 2 || x > r.right + GROSOR_BARRA + 4 || y < r.top - GROSOR_BARRA - 2 || y > r.bottom + GROSOR_BARRA + 2) continue;
      const [, sid, bid] = t.dataset.ref.split(":");
      if (y >= r.top && y <= r.bottom && t.tHead) {
        const celdas = Array.from(t.tHead.rows[0].cells);
        for (let i = 0; i < celdas.length - 1; i++) {
          const bx = celdas[i].getBoundingClientRect().right;
          if (Math.abs(x - bx) <= ZONA_BORDE) {
            nuevoBorde = { tabla: t, sid: sid, bid: bid, indice: i, cid: (celdas[i].dataset.ref || "").split(":")[3], x: bx };
            break;
          }
        }
        if (nuevoBorde) break;
      }
      let tabla;
      try { tabla = F.Editor.modelo().tablaDe(sid, bid); } catch (e) { continue; }
      const arriba = tabla.clase === "registro" && tabla.nuevas_filas === "arriba";
      const piezas = elementosDe(t.dataset.ref);
      const objetivo = arriba ? piezas[0] : piezas[piezas.length - 1];      // trozo que lleva la barra de filas
      const enFila = t === objetivo && x >= r.left && x <= r.right &&
        (arriba ? (y >= r.top - GROSOR_BARRA - 2 && y <= r.top + 6) : (y >= r.bottom - 6 && y <= r.bottom + GROSOR_BARRA + 2));
      if (enFila) {
        nuevaBarra = { tipo: "fila", sid: sid, bid: bid, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, arriba: arriba } };
        break;
      }
      if (x >= r.right - 6 && y >= r.top && y <= r.bottom) {
        nuevaBarra = { tipo: "columna", sid: sid, bid: bid, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } };
        break;
      }
    }
    if (nuevoBorde) { if (!borde || borde.x !== nuevoBorde.x || borde.tabla !== nuevoBorde.tabla) ponerBorde(nuevoBorde); }
    else if (nuevaBarra) ponerBarra(nuevaBarra.tipo, nuevaBarra.sid, nuevaBarra.bid, nuevaBarra.r);
    else quitarAuxiliares();
  }

  function iniciarArrastre(ev) {
    const b = borde;
    const d = documento();
    const w = ventana();
    const piezas = elementosDe("b:" + b.sid + ":" + b.bid);
    const cols = piezas.map((t) => Array.from(t.querySelectorAll("colgroup > col")));
    const i = b.indice;
    const inicial = parseFloat(cols[0][i].style.width);
    const total = inicial + parseFloat(cols[0][i + 1].style.width);
    const mmPorPx = 150 / b.tabla.getBoundingClientRect().width;
    const linea = d.querySelector(".f-borde");
    const capa = d.createElement("div");
    capa.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2000;cursor:col-resize";
    d.body.appendChild(capa);
    try { capa.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura: sigue dentro de la hoja */ }
    arrastre = true;
    let ancho = inicial;
    capa.addEventListener("pointermove", (e) => {
      ancho = Math.max(ANCHO_MINIMO, Math.min(inicial + (e.clientX - ev.clientX) * mmPorPx, total - ANCHO_MINIMO));
      cols.forEach((lista) => {
        lista[i].style.width = ancho + "mm";
        lista[i + 1].style.width = (total - ancho) + "mm";
      });
      if (linea) linea.style.left = (b.tabla.tHead.rows[0].cells[i].getBoundingClientRect().right - 1 + w.scrollX) + "px";
    });
    const soltar = () => {
      if (!arrastre) return;
      capa.remove();
      arrastre = false;
      finArrastre = Date.now();
      quitarAuxiliares();
      F.Editor.redimensionar(b.sid, b.bid, b.cid, ancho);
    };
    capa.addEventListener("pointerup", soltar);
    capa.addEventListener("pointercancel", soltar);
  }

  /* ---------- problemas de validacion ----------
     Cada problema trae el elemento afectado; se marca en la hoja (rojo: error, ambar: advertencia).
     Las marcas son solo del editor y se vuelven a poner despues de cada repintado. */
  function refDeProblema(r) {
    if (r.tipo === "seccion") return "s:" + r.sid;
    if (r.tipo === "bloque") return "b:" + r.sid + ":" + r.bid;
    if (r.tipo === "celda") return "c:" + [r.sid, r.bid, r.fid, r.cid].join(":");
    if (r.tipo === "columna") return "h:" + [r.sid, r.bid, r.cid].join(":");
    return null;
  }

  function marcarProblemas(lista) {
    if (!marcoListo) return;
    const d = documento();
    d.querySelectorAll(".f-error,.f-aviso").forEach((e) => e.classList.remove("f-error", "f-aviso"));
    ["advertencia", "error"].forEach((nivel) => (lista || []).filter((p) => p.nivel === nivel).forEach((p) => {
      const ref = p.ref ? refDeProblema(p.ref) : null;
      if (!ref) return;
      elementosDe(ref).forEach((e) => {
        e.classList.remove("f-error", "f-aviso");
        e.classList.add(nivel === "error" ? "f-error" : "f-aviso");
      });
    }));
  }

  /* ---------- seleccion ---------- */
  function refDe(sel) {
    if (!sel) return null;
    if (sel.tipo === "seccion") return "s:" + sel.id;
    if (sel.tipo === "bloque") return "b:" + sel.sid + ":" + sel.bid;
    if (sel.tipo === "celda") return "c:" + sel.sid + ":" + sel.bid + ":" + sel.fid + ":" + sel.cid;
    if (sel.tipo === "columna") return "h:" + sel.sid + ":" + sel.bid + ":" + sel.cid;
    return null;
  }

  function marcarSeleccion(sel, desplazar) {
    if (!marcoListo) return;
    const d = documento();
    d.querySelectorAll(".f-sel").forEach((e) => e.classList.remove("f-sel"));
    d.querySelectorAll(".f-asa").forEach((e) => e.remove());
    const ref = refDe(sel);
    if (!ref) return;
    const elementos = elementosDe(ref);
    if (!elementos.length) return;
    elementos.forEach((e) => e.classList.add("f-sel"));
    if (sel.tipo === "bloque") ponerAsa(elementos[0], sel);
    else if (sel.tipo === "celda" || sel.tipo === "columna") {     // el asa mueve la tabla entera
      const tabla = elementoDe("b:" + sel.sid + ":" + sel.bid);
      if (tabla) ponerAsa(tabla, sel);
    }
    if (desplazar) elementos[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* asa para arrastrar el bloque seleccionado, en el margen izquierdo de la hoja */
  function ponerAsa(elemento, sel) {
    const d = documento();
    const w = ventana();
    const r = elemento.getBoundingClientRect();
    const c = elemento.closest(".content").getBoundingClientRect();
    if (sel.tipo === "celda" || sel.tipo === "columna") sel = { sid: sel.sid, bid: sel.bid };
    const asa = d.createElement("div");
    asa.className = "f-asa";
    asa.draggable = true;
    asa.title = "Arrastra para mover el bloque";
    asa.dataset.bloque = sel.sid + ":" + sel.bid;
    asa.textContent = "⋮⋮";
    asa.style.top = (r.top + w.scrollY) + "px";
    asa.style.left = (c.left + w.scrollX - 26) + "px";
    d.body.appendChild(asa);
  }

  /* ---------- edicion de texto en la hoja ----------
     Se edita el texto con su sintaxis (`codigo`, **negrita**, [texto](url)), sin numeros.
     Enter confirma, Mayus+Enter agrega un salto de linea, Esc cancela; en una celda, Tab y
     Mayus+Tab confirman y pasan a la celda siguiente o anterior (alTerminar recibe la tecla). */
  function editarTexto(ref, textoCrudo, alTerminar) {
    const h = elementoDe(ref);
    if (!h) return;
    const d = documento();
    h.textContent = textoCrudo;
    h.contentEditable = "plaintext-only";
    h.classList.add("f-editando");
    h.style.whiteSpace = "pre-wrap";
    h.focus();
    const rango = d.createRange();
    rango.selectNodeContents(h);
    const sel = ventana().getSelection();
    sel.removeAllRanges();
    sel.addRange(rango);
    let terminado = false;
    const terminar = (confirmar, tecla) => {
      if (terminado) return;
      terminado = true;
      const texto = h.textContent.replace(/\r/g, "").replace(/^\n+|\n+$/g, "");
      h.contentEditable = "false";
      h.classList.remove("f-editando");
      h.style.whiteSpace = "";
      alTerminar(confirmar ? texto : null, tecla || null);
    };
    h.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); terminar(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); terminar(false); }
      else if (ev.key === "Tab" && /^(TD|TH)$/.test(h.tagName)) { ev.preventDefault(); terminar(true, ev.shiftKey ? "atras" : "adelante"); }
      ev.stopPropagation();
    });
    h.addEventListener("blur", () => terminar(true));
  }

  function editarTitulo(id, textoCrudo) {
    editarTexto("s:" + id, textoCrudo, (texto) => F.Editor.titulo(id, texto ? texto.replace(/\s+/g, " ").trim() : null));
  }

  function editarBloque(sid, bid, textoCrudo) {
    editarTexto("b:" + sid + ":" + bid, textoCrudo, (texto) => F.Editor.texto(sid, bid, texto));
  }

  function editarCelda(sid, bid, fid, cid, textoCrudo) {
    editarTexto("c:" + [sid, bid, fid, cid].join(":"), textoCrudo, (texto, tecla) => F.Tablas.terminarCelda(sid, bid, fid, cid, texto, tecla));
  }

  function editarEncabezado(sid, bid, cid, textoCrudo) {
    editarTexto("h:" + [sid, bid, cid].join(":"), textoCrudo, (texto, tecla) => F.Tablas.terminarEncabezado(sid, bid, cid, texto, tecla));
  }

  /* ---------- soltar encima de la hoja ----------
     Secciones: antes del primer titulo que queda debajo del cursor (o al final).
     Bloques: antes del primer titulo o bloque que queda debajo del cursor; antes de un titulo
     significa al final de la seccion anterior; sin nada debajo, al final de la ultima. */
  function destinoSoltar(ev, arrastrado) {
    return F.Editor.esBloque(arrastrado) ? destinoBloque(ev) : destinoSeccion(ev);
  }

  function destinoSeccion(ev) {
    const d = documento();
    const y = ev.clientY;
    const titulos = Array.from(d.querySelectorAll('[data-ref^="s:"]'));
    for (const h of titulos) {
      const r = h.getBoundingClientRect();
      if (r.top + r.height / 2 >= y) return { zona: "antes", ref: h.dataset.ref.slice(2), elemento: h };
    }
    return { zona: "fin", ref: null, elemento: null };
  }

  function destinoBloque(ev) {
    const d = documento();
    const modelo = F.Editor.modelo();
    const y = ev.clientY;
    const candidatos = Array.from(d.querySelectorAll('[data-ref^="s:"],[data-ref^="b:"]'));
    let previa = null;                    // seccion del ultimo elemento que quedo arriba
    for (const e of candidatos) {
      const ref = e.dataset.ref;
      const r = e.getBoundingClientRect();
      const esTitulo = ref.startsWith("s:");
      if (r.top + r.height / 2 >= y) {
        if (esTitulo) return previa ? { bloque: true, sid: previa, indice: null, elemento: e } : null;
        const partes = ref.split(":");
        const o = modelo.bloqueDe(partes[1], partes[2]);
        return o ? { bloque: true, sid: partes[1], indice: o.indice, elemento: e } : null;
      }
      previa = esTitulo ? ref.slice(2) : ref.split(":")[1];
    }
    return previa ? { bloque: true, sid: previa, indice: null, elemento: null } : null;
  }

  function mostrarLinea(destino) {
    const d = documento();
    let linea = d.querySelector(".f-linea");
    if (!linea) { linea = d.createElement("div"); linea.className = "f-linea"; d.body.appendChild(linea); }
    let arriba, izq, ancho;
    if (destino.elemento) {
      const r = destino.elemento.getBoundingClientRect();
      const c = destino.elemento.closest(".content").getBoundingClientRect();
      arriba = r.top - 5; izq = c.left; ancho = c.width;
    } else {
      const contenidos = d.querySelectorAll(".page .content");
      const ultimo = contenidos[contenidos.length - 1];
      const r = ultimo.getBoundingClientRect();
      const hijos = ultimo.children;
      const fin = hijos.length ? hijos[hijos.length - 1].getBoundingClientRect().bottom : r.top;
      arriba = fin + 4; izq = r.left; ancho = r.width;
    }
    const w = ventana();
    linea.style.top = (arriba + w.scrollY) + "px";
    linea.style.left = (izq + w.scrollX) + "px";
    linea.style.width = ancho + "px";
  }

  function ocultarLinea() {
    if (!marcoListo) return;
    const l = documento().querySelector(".f-linea");
    if (l) l.remove();
  }

  F.Hoja = {
    asegurarMarco: asegurarMarco,
    render: render,
    marcarSeleccion: marcarSeleccion,
    marcarProblemas: marcarProblemas,
    editarTitulo: editarTitulo,
    editarBloque: editarBloque,
    editarCelda: editarCelda,
    editarEncabezado: editarEncabezado,
    ocultarLinea: ocultarLinea,
    enfocar: () => { if (marcoListo) ventana().focus(); },
  };
})(window.Folium = window.Folium || {});
