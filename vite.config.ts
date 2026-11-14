import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect, Plugin } from 'vite';
import { municipalReportDetailResponse, municipalReportsResponse } from './server/municipal-reports.ts';
import { municipalReportDetailPath, municipalReportsPath } from './src/municipal-reports.ts';
import { stptVehiclesResponse } from './server/stpt-live.ts';
import { stptVehiclesPath } from './src/stpt-live.ts';
import { veloStationsResponse } from './server/velo-live.ts';
import { veloStationsPath } from './src/velo-live.ts';

function urbanConectApis(): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let handler: Promise<Response> | undefined;
    if (url.pathname === municipalReportsPath) {
      handler = municipalReportsResponse();
    } else if (url.pathname === municipalReportDetailPath) {
      handler = municipalReportDetailResponse(url.searchParams.get('number') ?? '');
    } else if (url.pathname === stptVehiclesPath) {
      handler = stptVehiclesResponse();
    } else if (url.pathname === veloStationsPath) {
      handler = veloStationsResponse();
    }
    if (!handler) {
      next();
      return;
    }
    void handler.then(async result => {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    }).catch(next);
  };
  return {
    name: 'urban-conect-apis',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({ plugins: [react(), urbanConectApis()], server: { port: 5173, strictPort: true } });
