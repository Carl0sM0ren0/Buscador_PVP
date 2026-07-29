/**
 * Cloudflare Worker para evitar el bloqueo CORS del navegador.
 * Despliega este archivo como Worker y pega su URL en API_URL dentro de app.js.
 */
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const ean = new URL(request.url).searchParams.get('ean')?.replace(/\D/g, '');
    if (!ean || !/^(\d{8}|\d{12}|\d{13})$/.test(ean)) {
      return json({ error: 'EAN no válido' }, 400, cors);
    }

    try {
      // Endpoint de búsqueda utilizado por la versión original.
      const searchUrl = `https://comicstores.es/busqueda/listaLibros.php?tipoBus=full&palabrasBusqueda=${encodeURIComponent(ean)}`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PVPComicStores/2.0)',
          'Accept': 'text/html,application/xhtml+xml'
        },
        redirect: 'follow'
      });
      const searchHtml = await searchResponse.text();

      // Intenta localizar la ficha de producto/libro que contenga el EAN.
      const enlaces = [...searchHtml.matchAll(/href=["'](https?:\/\/comicstores\.es)?(\/(?:producto|libro)\/[^"'#?]+)["']/gi)]
        .map(m => `https://comicstores.es${m[2]}`);

      let productUrl = [...new Set(enlaces)][0];
      let productHtml = searchHtml;

      if (productUrl) {
        const productResponse = await fetch(productUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PVPComicStores/2.0)' }
        });
        productHtml = await productResponse.text();
      } else if (!searchHtml.includes(ean)) {
        return json({ error: 'Producto no encontrado en Comic Stores' }, 404, cors);
      } else {
        productUrl = searchResponse.url;
      }

      const texto = htmlATexto(productHtml);
      if (!texto.includes(ean)) {
        return json({ error: 'La ficha encontrada no coincide con el EAN solicitado' }, 404, cors);
      }

      const titulo = extraerTitulo(productHtml) || 'Producto encontrado';
      const precios = [...texto.matchAll(/(\d{1,4}(?:\.\d{3})*,\d{2})\s*€/g)]
        .map(m => Number(m[1].replace(/\./g, '').replace(',', '.')))
        .filter(n => Number.isFinite(n) && n > 0);

      if (!precios.length) return json({ error: 'Producto encontrado, pero no se pudo leer el precio' }, 422, cors);

      // Normalmente la ficha muestra primero PVP y después precio especial web.
      const valores = [...new Set(precios)];
      const pvp = Math.max(...valores);
      const precioWeb = Math.min(...valores);

      return json({ ean, titulo, pvp, precioWeb, url: productUrl }, 200, cors);
    } catch (error) {
      return json({ error: `Error consultando Comic Stores: ${error.message}` }, 502, cors);
    }
  }
};

function extraerTitulo(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return htmlATexto(h1 || title || '').replace(/\s*[-|].*Comic Stores.*$/i, '').trim();
}

function htmlATexto(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&euro;/gi, '€')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
