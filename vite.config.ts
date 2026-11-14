import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect, Plugin } from 'vite';
import { municipalReportsResponse } from './server/municipal-reports.ts';
import { municipalReportsPath } from './src/municipal-reports.ts';

function municipalReportsApi(): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== municipalReportsPath) { next(); return; }
    void municipalReportsResponse(url).then(async result => {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    }).catch(next);
  };
  return {
    name: 'municipal-reports-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({ plugins: [react(), municipalReportsApi()], server: { port: 5173, strictPort: true } });
