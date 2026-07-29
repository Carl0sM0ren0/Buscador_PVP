// Variables globales (nombres en castellano)
let lectorHtml5 = null;
const zonaEscaner = document.getElementById("zona-escaner");
const resultado = document.getElementById("resultado");
const codigoLeido = document.getElementById("codigo-leido");
const infoProducto = document.getElementById("info-producto");
const enlaceDirecto = document.getElementById("enlace-directo");

// Iniciar escáner
document.getElementById("btn-escanear").addEventListener("click", iniciarEscaner);
document.getElementById("btn-parar").addEventListener("click", detenerEscaner);
document.getElementById("btn-nuevo").addEventListener("click", reiniciar);

async function iniciarEscaner() {
  document.getElementById("btn-escanear").style.display = "none";
  document.getElementById("btn-parar").style.display = "block";

  lectorHtml5 = new Html5Qrcode("lector");
  const configuracion = {
    fps: 12,                    // equilibrio velocidad / batería
    qrbox: { width: 280, height: 160 },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128
    ]
  };

  try {
    await lectorHtml5.start(
      { facingMode: "environment" }, // cámara trasera
      configuracion,
      (codigo) => {
        detenerEscaner();
        procesarCodigo(codigo);
      },
      () => {} // error de frame (ignorar)
    );
  } catch (err) {
    alert("No se pudo acceder a la cámara. Revisa los permisos de Safari.");
    reiniciar();
  }
}

function detenerEscaner() {
  if (lectorHtml5) {
    lectorHtml5.stop().then(() => {
      lectorHtml5.clear();
      lectorHtml5 = null;
    }).catch(() => {});
  }
  document.getElementById("btn-escanear").style.display = "block";
  document.getElementById("btn-parar").style.display = "none";
}

function reiniciar() {
  resultado.classList.add("oculto");
  zonaEscaner.classList.remove("oculto");
  infoProducto.innerHTML = "";
  enlaceDirecto.style.display = "none";
}

async function procesarCodigo(codigo) {
  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");
  codigoLeido.textContent = codigo;
  infoProducto.innerHTML = `<p class="cargando">Buscando en comicstores.es…</p>`;

  // 1. Intentamos búsqueda directa por el código (texto=)
  const urlBusqueda = `https://comicstores.es/busqueda/listaLibros.php?texto=${encodeURIComponent(codigo)}`;
  // Proxy CORS gratuito y rápido (allorigins)
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlBusqueda)}`;

  try {
    const respuesta = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
    const html = await respuesta.text();

    // Parsing ultra-ligero (prioridad velocidad)
    const tituloMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                        html.match(/class="[^"]*titulo[^"]*"[^>]*>([^<]+)</i);
    const precios = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g)].map(m => m[1]);

    if (precios.length >= 1) {
      // El precio más alto suele ser el PVP sin descuento
      const preciosNum = precios.map(p => parseFloat(p.replace(".", "").replace(",", ".")));
      const pvp = Math.max(...preciosNum);
      const web = Math.min(...preciosNum);

      const titulo = tituloMatch ? tituloMatch[1].trim() : "Producto encontrado";

      infoProducto.innerHTML = `
        <p class="titulo-prod">${titulo}</p>
        <p class="pvp">${pvp.toFixed(2).replace(".", ",")} €</p>
        <p class="precio-web">Precio web: ${web.toFixed(2).replace(".", ",")} €</p>
        <p style="font-size:0.85rem;opacity:0.6;margin-top:8px">PVP = precio sin el descuento de la web</p>
      `;

      // Enlace a la búsqueda (o a la ficha si se detecta)
      enlaceDirecto.href = urlBusqueda;
      enlaceDirecto.style.display = "block";
      enlaceDirecto.textContent = "Ver resultados en Comic Stores";
    } else {
      // Fallback: abrir Google restringido
      mostrarFallback(codigo);
    }
  } catch (e) {
    console.warn("Error de red o proxy:", e);
    mostrarFallback(codigo);
  }
}

function mostrarFallback(codigo) {
  infoProducto.innerHTML = `
    <p>No se pudo obtener el precio automáticamente.</p>
    <p style="margin-top:12px">Código: <strong>${codigo}</strong></p>
  `;
  enlaceDirecto.href = `https://www.google.com/search?q=site%3Acomicstores.es+${codigo}`;
  enlaceDirecto.style.display = "block";
  enlaceDirecto.textContent = "Buscar en Google (site:comicstores.es)";
}