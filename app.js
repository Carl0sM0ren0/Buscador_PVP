'use strict';

// IMPORTANTE: pega aquí la URL pública de tu Cloudflare Worker.
// Ejemplo: https://pvp-comicstores.tuusuario.workers.dev
const API_URL = 'PEGA_AQUI_LA_URL_DEL_WORKER';

const zonaEscaner = document.getElementById('zona-escaner');
const resultado = document.getElementById('resultado');
const codigoLeido = document.getElementById('codigo-leido');
const infoProducto = document.getElementById('info-producto');
const enlaceDirecto = document.getElementById('enlace-directo');
const lectorDiv = document.getElementById('lector');
const video = document.getElementById('video');
const estadoCamara = document.getElementById('estado-camara');

let controlesVideo = null;
let procesandoLectura = false;

const lectorZXing = new ZXing.BrowserMultiFormatReader(
  new Map([
    [ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.CODE_128
    ]],
    [ZXing.DecodeHintType.TRY_HARDER, true]
  ]),
  500
);

document.getElementById('btn-escanear').addEventListener('click', iniciarEscaner);
document.getElementById('btn-parar').addEventListener('click', detenerEscaner);
document.getElementById('btn-nuevo').addEventListener('click', reiniciar);
document.getElementById('btn-manual').addEventListener('click', buscarManual);
document.getElementById('input-foto').addEventListener('change', escanearDesdeFoto);
document.getElementById('input-manual').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarManual();
});

function normalizarCodigo(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function esCodigoValido(codigo) {
  return /^(\d{8}|\d{12}|\d{13})$/.test(codigo);
}

function mostrarCargando(texto) {
  infoProducto.innerHTML = `<div class="cargando"><div class="spinner"></div><p>${texto}</p></div>`;
}

function buscarManual() {
  const codigo = normalizarCodigo(document.getElementById('input-manual').value);
  if (!esCodigoValido(codigo)) {
    alert('Introduce un EAN de 8 o 13 dígitos, o un UPC de 12 dígitos.');
    return;
  }
  procesarCodigo(codigo);
}

async function iniciarEscaner() {
  if (!window.isSecureContext) {
    alert('La cámara solo funciona desde HTTPS. Abre la app desde GitHub Pages, no desde un archivo local.');
    return;
  }

  procesandoLectura = false;
  lectorDiv.style.display = 'block';
  document.getElementById('btn-escanear').style.display = 'none';
  document.getElementById('btn-parar').style.display = 'block';
  estadoCamara.textContent = 'Solicitando permiso para usar la cámara…';

  try {
    const dispositivos = await ZXing.BrowserCodeReader.listVideoInputDevices();
    if (!dispositivos.length) throw new Error('No se encontró ninguna cámara');

    // En iPhone suele ser la última cámara de la lista. Además pedimos facingMode environment.
    const camaraTrasera = dispositivos.find(d => /back|rear|environment|trasera/i.test(d.label)) || dispositivos[dispositivos.length - 1];

    controlesVideo = await lectorZXing.decodeFromConstraints(
      {
        audio: false,
        video: {
          deviceId: camaraTrasera?.deviceId ? { exact: camaraTrasera.deviceId } : undefined,
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      },
      video,
      (result, error) => {
        if (result && !procesandoLectura) {
          const codigo = normalizarCodigo(result.getText());
          if (!esCodigoValido(codigo)) return;
          procesandoLectura = true;
          if (navigator.vibrate) navigator.vibrate(80);
          detenerEscaner();
          procesarCodigo(codigo);
        } else if (error && !(error instanceof ZXing.NotFoundException)) {
          console.warn('Error de lectura:', error);
        }
      }
    );
    estadoCamara.textContent = 'Apunta al código, llena el ancho de la pantalla y evita reflejos.';
  } catch (error) {
    console.error(error);
    detenerEscaner();
    alert(`No se pudo abrir la cámara: ${error.message || error}`);
  }
}

function detenerEscaner() {
  try { controlesVideo?.stop(); } catch (_) {}
  controlesVideo = null;
  try { lectorZXing.reset(); } catch (_) {}
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  lectorDiv.style.display = 'none';
  document.getElementById('btn-escanear').style.display = 'block';
  document.getElementById('btn-parar').style.display = 'none';
}

async function escanearDesdeFoto(evento) {
  const archivo = evento.target.files?.[0];
  evento.target.value = '';
  if (!archivo) return;

  zonaEscaner.classList.add('oculto');
  resultado.classList.remove('oculto');
  codigoLeido.textContent = 'Analizando…';
  mostrarCargando('Analizando la fotografía…');

  const url = URL.createObjectURL(archivo);
  try {
    const lectura = await lectorZXing.decodeFromImageUrl(url);
    const codigo = normalizarCodigo(lectura.getText());
    if (!esCodigoValido(codigo)) throw new Error('El código detectado no parece un EAN válido');
    await procesarCodigo(codigo);
  } catch (error) {
    console.error(error);
    codigoLeido.textContent = 'No detectado';
    infoProducto.innerHTML = `<p>No se ha podido reconocer el código.</p><p style="margin-top:10px;font-size:.95rem">Haz la foto en horizontal, acercándote hasta que el código ocupe casi todo el ancho, con buena luz y sin reflejos.</p>`;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function procesarCodigo(codigo) {
  detenerEscaner();
  codigo = normalizarCodigo(codigo);
  codigoLeido.textContent = codigo;
  zonaEscaner.classList.add('oculto');
  resultado.classList.remove('oculto');
  mostrarCargando('Buscando el PVP en comicstores.es…');

  // Enlace de respaldo. El Worker devolverá el enlace exacto cuando encuentre el producto.
  enlaceDirecto.href = `https://comicstores.es/`;
  enlaceDirecto.style.display = 'block';

  if (!API_URL.startsWith('https://')) {
    infoProducto.innerHTML = `<p><strong>Falta configurar el servidor de búsqueda.</strong></p><p style="margin-top:10px">Abre <code>app.js</code> y sustituye <code>PEGA_AQUI_LA_URL_DEL_WORKER</code> por la URL del Worker.</p>`;
    return;
  }

  try {
    const respuesta = await fetch(`${API_URL.replace(/\/$/, '')}/?ean=${encodeURIComponent(codigo)}`, {
      headers: { Accept: 'application/json' }
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || `Error HTTP ${respuesta.status}`);

    enlaceDirecto.href = datos.url;
    infoProducto.innerHTML = `
      <p class="titulo-prod">${escapar(datos.titulo)}</p>
      <p class="pvp">${formatearPrecio(datos.pvp)}</p>
      ${datos.precioWeb ? `<p class="precio-web">Precio web: ${formatearPrecio(datos.precioWeb)}</p>` : ''}
    `;
  } catch (error) {
    console.error(error);
    infoProducto.innerHTML = `<p>No se pudo obtener el PVP automáticamente.</p><p style="margin-top:10px;font-size:.9rem">${escapar(error.message || String(error))}</p>`;
  }
}

function formatearPrecio(valor) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(valor));
}

function escapar(texto) {
  return String(texto).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function reiniciar() {
  detenerEscaner();
  procesandoLectura = false;
  resultado.classList.add('oculto');
  zonaEscaner.classList.remove('oculto');
  infoProducto.innerHTML = '';
  enlaceDirecto.style.display = 'none';
  document.getElementById('input-manual').value = '';
}
