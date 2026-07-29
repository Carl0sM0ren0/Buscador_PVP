let lectorHtml5 = null;
let escaneando = false;

const zonaEscaner = document.getElementById("zona-escaner");
const resultado = document.getElementById("resultado");
const codigoLeido = document.getElementById("codigo-leido");
const infoProducto = document.getElementById("info-producto");
const enlaceDirecto = document.getElementById("enlace-directo");

document.getElementById("btn-escanear").addEventListener("click", iniciarEscaner);
document.getElementById("btn-parar").addEventListener("click", detenerEscaner);
document.getElementById("btn-nuevo").addEventListener("click", reiniciar);
document.getElementById("btn-manual").addEventListener("click", buscarManual);
document.getElementById("btn-foto").addEventListener("click", () => {
  document.getElementById("input-foto").click();
});
document.getElementById("input-foto").addEventListener("change", escanearDesdeFoto);

function buscarManual() {
  const codigo = document.getElementById("input-manual").value.trim().replace(/\s/g, "");
  if (codigo.length >= 8) {
    detenerEscaner();
    procesarCodigo(codigo);
  } else {
    alert("Escribe un código válido (mínimo 8 dígitos)");
  }
}

async function iniciarEscaner() {
  if (escaneando) return;
  escaneando = true;

  document.getElementById("btn-escanear").style.display = "none";
  document.getElementById("btn-parar").style.display = "block";

  lectorHtml5 = new Html5Qrcode("lector");

  const config = {
    fps: 20,
    qrbox: function(viewfinderWidth, viewfinderHeight) {
      // Caja ancha y baja → mejor para códigos EAN
      let width = Math.floor(viewfinderWidth * 0.85);
      let height = Math.floor(width * 0.35);
      return { width, height };
    },
    aspectRatio: 1.777778,
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
      config,
      (codigo) => {
        if (!escaneando) return;
        escaneando = false;
        // Vibración de feedback (si el móvil la permite)
        if (navigator.vibrate) navigator.vibrate(100);
        detenerEscaner();
        procesarCodigo(codigo);
      },
      () => {} // ignoramos errores de frame
    );
  } catch (err) {
    console.error(err);
    alert("Error al iniciar la cámara. Prueba a recargar la página o usa la entrada manual.");
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

async function escanearDesdeFoto(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;

  infoProducto.innerHTML = `<p class="cargando">Analizando foto…</p>`;
  zonaEscaner.classList.add("oculto");
  resultado.classList.remove("oculto");

  try {
    const tempScanner = new Html5Qrcode("lector"); // reutilizamos el div
    const resultadoScan = await tempScanner.scanFile(archivo, true);
    procesarCodigo(resultadoScan);
  } catch (err) {
    infoProducto.innerHTML = `
      <p>No se pudo leer el código en la foto.</p>
      <p style="margin-top:10px;font-size:0.9rem">Prueba con mejor luz, más cerca o escribe el código a mano.</p>
    `;
    console.error(err);
  }
}

async function procesarCodigo(codigo) {
  codigo = codigo.trim();
  codigoLeido.textContent = codigo;
  infoProducto.innerHTML = `<p class="cargando">Buscando en comicstores.es…</p>`;

  const urlBusqueda = `https://comicstores.es/busqueda/listaLibros.php?texto=${encodeURIComponent(codigo)}`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlBusqueda)}`;

  try {
    const respuesta = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
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
        <p style="font-size:0.85rem;opacity:0.6;margin-top:8px">PVP = precio
