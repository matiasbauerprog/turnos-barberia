# Estilo Cruz — Frontend (SPA)

Interfaz web de reserva de turnos, construida con **React 19 + Vite + Tailwind CSS**.
Consume la API REST del backend (`../barberia-backend`).

> 📖 La documentación completa del proyecto está en el
> [README principal](../README.md).

## Scripts

```bash
npm install      # instalar dependencias
npm run dev      # servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción en dist/
npm run preview  # previsualizar el build
npm run lint     # linter
```

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `VITE_API_URL` | URL base de la API | `http://localhost:3001/api` |

Definila en un archivo `.env.local` si tu backend no está en `localhost:3001`.
