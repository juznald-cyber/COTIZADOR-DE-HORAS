# ⏱️ Cobro Horas — Estilo Apple

Aplicación web progresiva (PWA) con diseño iOS Human Interface Guidelines para prestadores de servicios por horas. Funciona 100% en el dispositivo (sin servidores externos ni bases de datos remotas, tus datos están seguros y privados).

---

## 🚀 Cómo abrir la aplicación

Puedes abrirla directamente de dos formas:

1. **Doble clic en el archivo:**
   Abre [`index.html`](file:///c:/Users/HP/OneDrive/Documentos/JUNIOR/COTIZADOR%20DE%20HORAS/index.html) directamente con tu navegador favorito (Chrome, Edge, Safari, Brave, etc.).

2. **Instalarla como App en tu teléfono o PC:**
   - **En iPhone (Safari):** Presiona el botón de *Compartir* (cuadrado con flecha hacia arriba) y selecciona **"Agregar al inicio"**.
   - **En Android (Chrome):** Toca los tres puntos de menú y selecciona **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
   - **En PC / Mac (Chrome o Edge):** En la barra de direcciones haz clic en el ícono de **Instalar app** para tenerla en una ventana limpia como app de escritorio.

---

## ✨ Características implementadas

### 🎨 Diseño estilo Apple (Light & Dark Mode)
- **Tema Automático, Claro y Oscuro:** Selector en la pestaña **Ajustes** y adaptación al modo del sistema.
- **Tipografía y Contraste:** Uso de tipografías nativas de Apple (`SF Pro`), números tabulares (`font-variant-numeric: tabular-nums`) y ratios de contraste WCAG AA probados tanto en fondo blanco como en fondo negro profundo (`#000000`).

### ⏱️ Registro día a día y Cronómetro en vivo
- **Cronómetro de servicio:** Inicia el servicio con un toque; el tiempo y el monto avanzan en tiempo real.
- **Registro manual (+):** Permite registrar fecha, hora de inicio, hora de término, cliente, valor por hora y notas o detalles de la labor realizada (ej. cruzando medianoche inclusive).
- **Navegación mensual:** Visualiza mes a mes con totales de horas y montos acumulados.

### 👥 Gestión de Clientes
- Registro de clientes con datos de contacto (WhatsApp, Correo, RUT/ID, Dirección).
- **Tarifa personalizada opcional:** Cada cliente puede tener un valor hora propio o heredar la tarifa general de Ajustes.
- Acceso directo a llamar o enviar mensaje.

### 📊 Reportes y Filtro por Fechas
- Selección rápida de período: **Este mes**, **Mes anterior** o **Personalizado** (rango exacto entre fechas de distintos meses).
- Filtro por cliente específico o todos los clientes.
- Métricas instantáneas: horas acumuladas, cantidad de servicios y total a cobrar.

### 📥 Descarga en Excel (.xlsx)
- Archivo Excel con formato profesional estilo Apple Numbers / Excel.
- Fórmulas dinámicas: sumas de horas en formato `[h]:mm` y decimal, cálculo de montos por fila, subtotal, retención de honorarios (opcional) y líquido a pagar.
- Hoja adicional de **Resumen por cliente** con subtotales automáticos.

### 📄 Boleta en Formato PDF (Tamaño Carta)
- Documento formal en tamaño Carta (`letter`).
- Incluye tus datos de emisor (nombre, RUT, giro, dirección, cuenta bancaria para transferencia).
- Datos del cliente, N° correlativo de boleta automático, fecha de emisión, concepto, desglose de servicios con horas y valor.
- Cuadro de totales con cálculo de retención si aplica (ej. 15.25% o configurable).
- **Acciones directas:**
  - **Compartir:** Abre el menú nativo de iOS/Android para enviar el archivo PDF directo por WhatsApp, Correo, Telegram, etc.
  - **WhatsApp:** Abre el chat del cliente con mensaje pre-redactado y descarga el PDF.
  - **Correo:** Abre tu cliente de correo con destinatario, asunto y mensaje prellenado.
  - **Descargar:** Guarda el archivo PDF en tu equipo.
  - **Ver PDF:** Vista previa en pestaña nueva.

### 💾 Ajustes y Respaldo
- Monedas compatibles: CLP, USD, EUR, ARS, MXN, COP, PEN, UYU.
- Respaldo completo en archivo JSON (exportar e importar) para migrar de teléfono o computador con un clic.
