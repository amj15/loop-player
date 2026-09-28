# YT Loop Player

App en React + Vite para reproducir videos de YouTube en bucle, con soporte
para definir un inicio y fin en segundos.

## Qué hace

- Acepta una URL de YouTube o un ID de video.
- Extrae el `videoId` automáticamente.
- Genera un `embed` con `loop=1` y `playlist=<videoId>`.
- Permite crear loops de un tramo concreto usando `start` y `end`.

## Desarrollo

```bash
npm install
npm run dev
```

## Publicación

Página pública: https://amj15.github.io/loop-player/

GitHub Actions compila y publica la carpeta `dist` en GitHub Pages con cada
push a `main`. El workflow está en `.github/workflows/deploy.yml` y también
puede ejecutarse manualmente desde la pestaña Actions del repositorio.

Para comprobar la compilación localmente, usa Node.js 22.12 o superior:

```bash
npm ci
npm run lint
npm run build
npm run preview
```

La configuración `base: '/loop-player/'` en `vite.config.ts` permite servir
los recursos desde la ruta del repositorio.

## Notas sobre YouTube

- YouTube exige repetir el `videoId` en `playlist` para que el loop funcione en
  embeds.
- Si defines `end`, debe ser mayor que `start`.
