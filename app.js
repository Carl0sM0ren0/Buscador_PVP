// Variables globales
let lectorHtml5 = null;
let escaneando = false;          // evita múltiples detecciones
const zonaEscaner = document.getElementById("zona-escaner");
const resultado = document.getElementById("resultado");
const codigoLeido = document.getElementById("codigo-leido");
const infoProducto = document.getElementById("info-producto");
const enlaceDirecto = document.getElementById("enlace-directo");

// Botones
document.getElementById("btn-escanear").addEventListener("click", iniciarEscaner);
document.getElementById("btn-parar").addEventListener("click", detenerEscaner);
document.getElementById("btn-nuevo").addEventListener("click", reiniciar);

// También permitimos escribir el código a mano (muy útil en iPhone)
document.getElementById("btn-manual")?.addEventListener("click", () => {
  const codigo = document.getElementById("input-manual").value.trim();
  if (codigo.length >= 8) {
    detenerEscaner();
    procesarCodigo(codigo);
  } else {
    alert("Escribe un código de barras válido (mínimo 8 dígitos)");
  }
});

async function iniciarEscaner() {
  if (escaneando) return;
  escaneando = true;

  document.getElementById("btn-escanear").style.display = "none";
  document.getElementById("btn-parar").style.display = "block";

  lectorHtml5 = new Html5Qrcode("lector");

  const configuracion = {
    fps: 15,
    qrbox: { width: 320, height: 140 },   // rectangular → mejor para EAN
    aspectRatio: 1.777,
    disableFlip: false,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    },
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
      { facingMode: "environment" },
      configuracion,
      (codigo, resultado) => {
        // Solo procesamos la primera detección
        if (!escaneando) return;
        escaneando = false;
        detenerEscaner();
        procesarCodigo(codigo);
      },
      (error) => {
        // Ignoramos errores de frame (normal)
      }
    );

    // Intento de mejorar el foco en iOS (a veces ayuda)
    setTimeout(() => {
      try {
        const track = lectorHtml5.getRunningTrackCameraCapabilities?.();
        if (track) {
          // no siempre disponible, pero no pasa nada si falla
        }
      } catch (e) {}
    }, 1000);

  } catch (err) {
    console.error(err);
    alert("No se pudo acceder a la cámara. Revisa los permisos de Safari.");
    reiniciar();
  }
}

function detenerEscaner() {
  escaneando = false;
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
  document.getElementById("input-manual").value = "";
  escaneando = false;
}

async function procesarCodigo(codigo) {
  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");
  codigoLeido.textContent = codigo;
  infoProducto.innerHTML = `<p class="cargando">Buscando en comicstores.es…</p>`;

  const urlBusqueda = `https://comicstores.es/busqueda/listaLibros.php?texto=${encodeURIComponent(codigo)}`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlBusqueda)}`;

  try {
    const respuesta = await fetch(proxy, { signal: AbortSignal.timeout(9000) });
    const html = await respuesta.text();

    const precios = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g)].map(m => m[1]);

    if (precios.length >= 1) {
      const preciosNum = precios.map(p => parseFloat(p.replace(/\./g, "").replace(",", ".")));
      const pvp = Math.max(...preciosNum);
      const web = Math.min(...preciosNum);

      infoProducto.innerHTML = `
        <p class="titulo-prod">Producto encontrado</p>
        <p class="pvp">${pvp.toFixed(2).replace(".", ",")} €</p>
        <p class="precio-web">Precio web: ${web.toFixed(2).replace(".", ",")} €</p>
        <p style="font-size:0.85rem;opacity:0.6;margin-top:8px">PVP = precio sin descuento web</p>
      `;

      enlaceDirecto.href = urlBusqueda;
      enlaceDirecto.style.display = "block";
      enlaceDirecto.textContent = "Ver resultados en Comic Stores";
    } else {
      mostrarFallback(codigo);
    }
  } catch (e) {
    console.warn(e);
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
