/* Panel del documento (sin seleccion): campos de la portada y lista de estados. */
(function (F) {
  "use strict";

  const el = F.el;
  const D = F.Documento = {};
  const E = () => F.Editor;
  const intentar = (fn) => { try { return fn(); } catch (e) { F.avisar(e.message); return null; } };

  function entrada(valor, alConfirmar, ayuda) {
    const i = el("input", { type: "text", autocomplete: "off" });
    i.value = valor;
    if (ayuda) i.title = ayuda;
    i.addEventListener("change", () => alConfirmar(i.value));
    i.addEventListener("keydown", (ev) => { if (ev.key === "Enter") i.blur(); ev.stopPropagation(); });
    return i;
  }

  function boton(texto, alClic, clase, deshabilitado, titulo) {
    const b = el("button", { type: "button", texto: texto });
    if (clase) b.className = clase;
    if (deshabilitado) { b.disabled = true; if (titulo) b.title = titulo; }
    b.addEventListener("click", alClic);
    return b;
  }

  const subtitulo = (texto) => el("h3", { class: "subtitulo", texto: texto });

  /* ---------- portada ---------- */
  function pintarPortada(cont, modelo) {
    cont.appendChild(subtitulo("Portada"));
    const campos = modelo.camposPortada();
    campos.forEach((c, i) => {
      const t = el("div", { class: "tarjeta", "data-problema": "portada:" + i });
      if (c.automatico) {
        t.appendChild(el("div", { class: "auto" }, [el("strong", { texto: c.etiqueta }),
          el("span", { class: "unidad", texto: " · se calcula sola (" + (c.automatico === "version" ? "versión" : "fecha") + ")" })]));
      } else {
        t.appendChild(entrada(c.etiqueta, (v) => {
          if (!v.trim()) { F.avisar("El campo necesita una etiqueta."); F.Propiedades.pintar(); return; }
          intentar(() => modelo.portadaEditar(i, "etiqueta", v));
        }, "Etiqueta"));
        t.appendChild(entrada(c.valor || "", (v) => intentar(() => modelo.portadaEditar(i, "valor", v)), "Valor"));
      }
      t.appendChild(el("div", { class: "fila-botones" }, [
        boton("↑", () => intentar(() => modelo.portadaMover(i, -1)), "", i === 0, "Subir"),
        boton("↓", () => intentar(() => modelo.portadaMover(i, 1)), "", i === campos.length - 1, "Bajar"),
        boton("Quitar", () => intentar(() => modelo.portadaQuitar(i)), "peligro", !!c.automatico, "La versión y la fecha no se quitan")]));
      cont.appendChild(t);
    });
    cont.appendChild(el("div", { class: "fila-botones" }, [boton("+ Campo", () => {
      const i = intentar(() => modelo.portadaAgregar());
      if (i !== null) setTimeout(() => {
        const t = document.querySelector('#props [data-problema="portada:' + i + '"] input');
        if (t) { t.focus(); t.select(); }
      }, 0);
    })]));
  }

  /* ---------- estados ---------- */
  const COLORES = [["ninguno", "Sin color"], ["amarillo", "Amarillo"], ["gris", "Gris"]];

  async function renombrar(modelo, i, nuevo) {
    const viejo = modelo.estadoDe(i).texto;
    nuevo = nuevo.trim();
    if (nuevo === viejo) return;
    const uso = modelo.usoEstado(viejo);
    if (uso > 0) {
      const ok = await F.confirmar("Renombrar el estado «" + viejo + "»",
        ["Hay " + F.cantidad(uso, "celda que lo usa", "celdas que lo usan") + ". Su texto también cambiará a «" + nuevo + "».",
         "Puedes deshacerlo con Ctrl+Z."], "Renombrar");
      if (!ok) { F.Propiedades.pintar(); return; }
    }
    if (!intentar(() => modelo.estadoRenombrar(i, nuevo))) F.Propiedades.pintar();
  }

  async function quitar(modelo, i) {
    const texto = modelo.estadoDe(i).texto;
    const uso = modelo.usoEstado(texto);
    if (uso > 0) {
      const ok = await F.confirmar("Quitar el estado «" + texto + "»",
        ["Hay " + F.cantidad(uso, "celda que lo usa", "celdas que lo usan") + ". Quedarán marcadas con error hasta que elijas otro estado.",
         "Puedes deshacerlo con Ctrl+Z."], "Quitar estado");
      if (!ok) return;
    }
    intentar(() => modelo.estadoQuitar(i));
  }

  function pintarEstados(cont, modelo) {
    cont.appendChild(subtitulo("Estados"));
    cont.appendChild(el("p", { class: "ayuda", texto: "Dan el color de las celdas de estado. Además valen «(no estable)» y «N de M aplicadas»." }));
    modelo.listaEstados().forEach((e, i) => {
      const uso = modelo.usoEstado(e.texto);
      const t = el("div", { class: "tarjeta", "data-problema": "estados:" + i });
      t.appendChild(entrada(e.texto, (v) => renombrar(modelo, i, v)));
      const color = el("select");
      COLORES.forEach(([valor, texto]) => {
        const o = el("option", { value: valor, texto: texto });
        if (valor === e.color) o.selected = true;
        color.appendChild(o);
      });
      color.addEventListener("change", () => intentar(() => modelo.estadoColor(i, color.value)));
      t.appendChild(el("div", { class: "fila-columna" }, [color,
        el("span", { class: "unidad", texto: F.cantidad(uso, "celda", "celdas") })]));
      t.appendChild(el("div", { class: "fila-botones" }, [boton("Quitar", () => quitar(modelo, i), "peligro")]));
      cont.appendChild(t);
    });
    cont.appendChild(el("div", { class: "fila-botones" }, [boton("+ Estado", () => {
      const i = intentar(() => modelo.estadoAgregar());
      if (i !== null) setTimeout(() => {
        const t = document.querySelector('#props [data-problema="estados:' + i + '"] input');
        if (t) { t.focus(); t.select(); }
      }, 0);
    })]));
  }

  D.pintar = function (cont, modelo) {
    cont.appendChild(el("h3", { class: "subtitulo primero", texto: "Documento" }));
    cont.appendChild(el("p", { class: "ayuda", texto: "Selecciona una sección o un bloque, en la estructura o en la hoja, para ver sus propiedades." }));
    pintarPortada(cont, modelo);
    pintarEstados(cont, modelo);
    D.marcar();
  };

  /* Marca en el panel las tarjetas con problemas (sin volver a pintarlo, para no perder lo que se escribe). */
  D.marcar = function () {
    const cont = document.getElementById("props");
    if (!cont) return;
    cont.querySelectorAll("[data-problema]").forEach((t) => t.classList.remove("con-error", "con-aviso"));
    (E().problemas() || []).forEach((p) => {
      if (!p.ref || (p.ref.tipo !== "portada" && p.ref.tipo !== "estados")) return;
      const t = cont.querySelector('[data-problema="' + p.ref.tipo + ":" + p.ref.indice + '"]');
      if (t) t.classList.add(p.nivel === "error" ? "con-error" : "con-aviso");
    });
  };

  /* Desde la lista de problemas: lleva a la tarjeta afectada. */
  D.resaltar = function (ref) {
    if (ref.indice === undefined) return;
    const t = document.querySelector('#props [data-problema="' + ref.tipo + ":" + ref.indice + '"]');
    if (!t) return;
    t.scrollIntoView({ block: "center", behavior: "smooth" });
    const i = t.querySelector("input");
    if (i) i.focus();
  };
})(window.Folium = window.Folium || {});
