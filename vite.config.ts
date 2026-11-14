import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect, Plugin } from 'vite';
import { municipalReportDetailResponse, municipalReportsResponse } from './server/municipal-reports.ts';
import { stptVehiclesResponse } from './server/stpt-live.ts';
import { veloStationsResponse } from './server/velo-live.ts';
import { cityEventsResponse } from './server/city-events.ts';
import { routeChatResponse } from './server/route-chat.ts';
import { municipalReportDetailPath, municipalReportsPath } from './src/municipal-reports.ts';
import { stptVehiclesPath } from './src/stpt-live.ts';
import { veloStationsPath } from './src/velo-live.ts';
import { cityEventsPath } from './src/city-events.ts';

function urbanConectApi(geminiKey?: string): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === municipalReportsPath) {
      void municipalReportsResponse().then(async result => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
      }).catch(next);
      return;
    }

    if (url.pathname === municipalReportDetailPath) {
      const number = url.searchParams.get('number') ?? '';
      void municipalReportDetailResponse(number).then(async result => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
      }).catch(next);
      return;
    }

    if (url.pathname === stptVehiclesPath) {
      void stptVehiclesResponse().then(async result => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
      }).catch(next);
      return;
    }

    if (url.pathname === veloStationsPath) {
      void veloStationsResponse().then(async result => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
      }).catch(next);
      return;
    }

    if (url.pathname === cityEventsPath) {
      void cityEventsResponse().then(async result => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
      }).catch(next);
      return;
    }

    if (url.pathname === '/api/route-chat') {
      async function respondRouteChat() {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 7500) return Response.json({ error: 'Mesajul este prea lung.' }, { status: 413 });
          chunks.push(chunk);
        }
        return routeChatResponse(
          new Request(url, {
            method: request.method,
            body: request.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined,
          }),
          geminiKey,
        );
      }
      void respondRouteChat().then(async result => {
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
      }).catch(next);
      return;
    }

    next();
  };
  return {
    name: 'urban-conect-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), urbanConectApi(loadEnv(mode, process.cwd(), 'GEMINI_API_KEY').GEMINI_API_KEY)],
  server: { port: 5173, strictPort: true },
}));
