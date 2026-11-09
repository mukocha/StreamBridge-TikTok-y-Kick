# ⚡ StreamBridge: Chat y Alertas para TikTok & Kick (Alternativa Ligera a BotRix)

Aplicación web y overlays para **OBS Studio** que unifica en tiempo real el chat y las alertas de **TikTok Live** y **Kick**, diseñada para desplegarse fácilmente en **Railway** o correr en local.

---

## 🌟 Características

- **💬 Chat Unificado para OBS (`/chat`)**:
  - Mensajes de Kick y TikTok en un solo widget transparente.
  - Insignias de plataforma (verde neón para Kick, magenta para TikTok).
  - Avatares, nombres con colores y animación fluida al recibir mensajes.
- **🔔 Alertas en Pantalla (`/alerts`)**:
  - Alertas animadas para:
    - **TikTok**: Regalos con cantidad de diamantes, nuevos seguidores y directos compartidos.
    - **Kick**: Suscripciones, regalos de suscripciones (`gifted subs`) y nuevos seguidores.
  - Sistema de cola para evitar que las alertas se encimen.
  - Sonido de campana sintetizado integrado (funciona sin necesidad de archivos de audio externos) y lluvia de confeti dinámico.
- **🖥️ Panel Dock para OBS (`/dock`)**:
  - Diseñado para anclarse directamente dentro de la interfaz de OBS Studio (`Docks / Paneles`).
- **🎛️ Panel de Control Web (`/`)**:
  - Conecta y desconecta tus canales con un clic.
  - Botones de prueba para simular regalos, subs y chats directamente en OBS.
  - Copia rápida de las URLs de cada widget.

---

## 🚀 Despliegue en Railway (Paso a Paso)

### Paso 1: Subir el proyecto a GitHub
1. Abre una terminal en esta carpeta e inicializa Git si aún no lo has hecho:
   ```bash
   git init
   git add .
   git commit -m "StreamBridge TikTok y Kick"
   ```
2. Crea un repositorio en tu cuenta de [GitHub](https://github.com/new) (puede ser Privado o Público).
3. Enlaza tu repositorio local y sube los archivos:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

### Paso 2: Crear el servicio en Railway
1. Ingresa a [railway.app](https://railway.app/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"New Project"** -> **"Deploy from GitHub repo"**.
3. Selecciona el repositorio que acabas de subir.
4. Railway detectará automáticamente el archivo `Dockerfile` o `package.json` y comenzará a compilar e instalar la app.

### Paso 3: Generar la URL pública
1. Dentro de tu proyecto en Railway, ve a la pestaña **"Settings"**.
2. En la sección **"Networking"**, haz clic en **"Generate Domain"**.
3. Obtendrás un enlace público seguro como:
   `https://tu-proyecto.up.railway.app`

¡Listo! Tu servidor ya está activo 24/7 en internet.

---

## 🎬 Configuración en OBS Studio

### 1. Chat en Pantalla
1. En OBS, en el panel de **Fuentes**, haz clic en **`+`** y selecciona **Navegador**.
2. Nombre: `Chat Unificado`.
3. URL: `https://tu-proyecto.up.railway.app/chat`
4. Ancho recomendado: `450` | Alto: `700`.
5. Marca la casilla **"Actualizar el navegador cuando la escena se active"**.

### 2. Alertas en Pantalla
1. En OBS, haz clic en **`+`** y selecciona **Navegador**.
2. Nombre: `Alertas Live`.
3. URL: `https://tu-proyecto.up.railway.app/alerts`
4. Ancho recomendado: `600` | Alto: `400`.
5. Si deseas controlar el volumen desde OBS, marca **"Controlar audio vía OBS"**.

### 3. Panel Dock en OBS (Para verlo mientras juegas o transmites)
1. En el menú superior de OBS, haz clic en **Paneles** (o *Docks*) > **Paneles de navegador personalizados**.
2. En **Nombre del panel**, escribe: `Chat & Estado Live`.
3. En **URL**, escribe: `https://tu-proyecto.up.railway.app/dock`
4. Haz clic en **Aplicar**. Ahora puedes arrastrar esa ventanita y encajarla en cualquier lugar de tu OBS.

---

## 🧪 Cómo probar en tu computadora antes de subir (Opcional)

Si deseas probarlo primero en tu equipo:
```bash
npm start
```
Luego abre tu navegador en [http://localhost:3000](http://localhost:3000).
Desde el panel podrás usar los botones de prueba (**"🎁 Regalo TikTok"**, **"⭐ Suscripción Kick"**, etc.) para ver cómo lucen las alertas en OBS.
