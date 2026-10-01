# Bitácora de Vuelo UAS (PWA) - v3

Aplicación web instalable para llevar la **bitácora del piloto UAS** (DGAC Ecuador, Parte 101) con el **perímetro de vuelo** dibujado en un mapa. Funciona sin conexión y genera un PDF por vuelo.

## Cómo se usa

1. **Pilotos** (una sola vez): nombre completo, cédula, autorización No. (letras y números), fecha de otorgamiento, fecha de expiración y firma.
2. **Aeronaves** (una sola vez): nombre, marca, modelo y nro de serie.
3. **Bitácora → Nuevo vuelo**:
   - Elige piloto y aeronave en las listas desplegables; sus datos se integran solos al registro.
   - Inicio y fin de la operación (botón "Ahora"); el tiempo total se calcula automáticamente.
   - Objetivo del vuelo: texto libre (con sugerencias rápidas: Fotogrametría, Modelado 3D, Inspección, Foto / Video).
   - Característica del vuelo: Vuelo Manual o Vuelo Autónomo.
   - Condiciones (una opción cada una): luz (soleado / parcialmente nublado / nublado), viento (presencia / sin presencia) y entorno (urbano / rural).
   - Perímetro: dibújalo en el mapa o impórtalo (GeoJSON / KML desde QGIS). Calcula área, perímetro y centroide.
   - **Guardar** abre la ficha del vuelo, desde donde puedes Descargar PDF (con mapa, vértices en WGS84 y UTM, y firma), Compartir, exportar GeoJSON, Editar, Duplicar o Eliminar.
4. **Respaldo**: exporta / importa todos los datos en un archivo `.json`.

Otras salidas: resumen en PDF y CSV (separador `;`, con lat/lon del centroide) filtrables por mes, y **Exportar para SIG**: GeoJSON solo con los polígonos y los datos del vuelo. También aviso de traslape de horarios, recordatorio de respaldo (30 días) y aviso de nueva versión. El botón **Duplicar** copia piloto, aeronave, lugar y perímetro de un vuelo anterior (útil para varios vuelos en el mismo predio).

## Qué va a GitHub y qué queda en el teléfono

| En GitHub Pages (código, público) | En el teléfono (datos, privados) |
|---|---|
| `index.html`, `css/`, `js/`, `lib/` (Leaflet, Leaflet.draw, jsPDF), `icons/`, `sw.js`, `manifest.webmanifest` | Pilotos (con cédula y firma), aeronaves, vuelos, perímetros, imágenes de mapa y PDF generados |

GitHub solo entrega la aplicación. Ningún dato personal ni de vuelo sale del teléfono. Si el repositorio es público, cualquiera puede ver el código pero no tus datos.

## Publicar en GitHub Pages (automático)

Junto a esta carpeta hay un `publicar.bat` (y `publicar.ps1`). Usa el **mismo token de GitHub que "Generar Mapa Web" de GeoMapping Tools** (Administrador de credenciales de Windows) y publica esta app como una subcarpeta `bitacora-uas/` de la rama `gh-pages` del repositorio que elijas, sin tocar los mapas que ya estén ahí.

- Doble clic en `publicar.bat`. La primera vez pregunta el repositorio (existente o nuevo) y lo recuerda en `publicar.config.json`.
- Actualiza solo el número de versión de `sw.js`, sube lo que cambió, borra lo que ya no existe en la carpeta y, si no hay cambios, no crea ningún commit.
- Si el token falta o GitHub lo rechaza (vencido o revocado), el script te lo pide en la misma ventana (no se muestra al pegarlo), comprueba que sea válido y lo guarda en el Administrador de credenciales, reemplazando el anterior.
- Opciones: `publicar.bat -Simular` (no se conecta), `-Reconfigurar` (otro repositorio), `-GuardarToken` (pegar un token nuevo sin publicar).
- La dirección final queda como `https://USUARIO.github.io/REPOSITORIO/bitacora-uas/`.

### Publicar a mano (alternativa)

1. Crea un repositorio y sube **el contenido de esta carpeta** (`index.html`, `sw.js`, `manifest.webmanifest`, `css/`, `js/`, `lib/`, `icons/`).
2. *Settings → Pages → Deploy from a branch → main / (root)*.
3. Abre `https://TU-USUARIO.github.io/NOMBRE-REPO/` en Chrome del teléfono, con internet, y elige **Instalar app** o **Añadir a pantalla de inicio**. Espera unos segundos a que cargue completa.
4. En la pestaña **Respaldo** verás "La app está guardada en este teléfono y abre sin conexión".
5. Para publicar mejoras: sube los cambios y aumenta `VERSION` en `sw.js`. El teléfono se actualiza solo la próxima vez que abra la app con internet.

## Sin internet en campo

- La app **abre y funciona completa**: pilotos, aeronaves, formulario, cálculo de tiempos, guardado y PDF no necesitan red.
- El **mapa base** (satélite) sí necesita internet o teselas guardadas. Sin ellas verás el mapa en gris, pero **puedes dibujar el polígono igual** y el PDF sale con el perímetro, vértices y área (sin la imagen satelital de fondo).
- Para tener el fondo satelital en campo: con internet, abre el vuelo, dibuja o importa el perímetro y pulsa **Precargar mapa de la zona**. También se guardan las teselas que ya viste. Al guardar el vuelo, la imagen del PDF usa esas teselas.
- Recomendado: prepara el vuelo (perímetro incluido) en oficina, y en campo solo registra "Ahora" al despegar y al aterrizar.
- El GPS del teléfono (botón "Mi ubicación") funciona sin internet.

## Perímetros desde QGIS

Exporta la capa como **GeoJSON** (EPSG:4326) o KML e impórtalo en el vuelo. Se usa el primer polígono del archivo.

## Notas

- Los pilotos y aeronaves se copian dentro de cada registro al guardarlo: si luego editas o borras un piloto, los vuelos ya guardados no cambian. Si editas y guardas un vuelo, se refrescan con los datos actuales del catálogo.
- La app avisa si la autorización del piloto no está vigente en la fecha del vuelo, y valida el formato de la cédula ecuatoriana.
- *Precargar mapa* descarga pocas teselas (tope de 300). Respeta los términos de uso de Esri y OpenStreetMap: no es para descargas masivas.
- Librerías incluidas localmente: Leaflet 1.9.4, Leaflet.draw 1.0.4, jsPDF 4.2.1.
- Confirma con la DGAC si exige campos adicionales o un formato específico.
