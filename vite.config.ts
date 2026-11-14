import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect, Plugin } from 'vite';
import { municipalReportsResponse } from './server/municipal-reports.ts';
import { municipalReportsPath } from './src/municipal-reports.ts';
import { routeChatResponse } from './server/route-chat.ts';

function appApi(geminiKey?: string): Plugin {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== municipalReportsPath && url.pathname !== '/api/route-chat') { next(); return; }
    async function respond() {
      if (url.pathname === municipalReportsPath) return municipalReportsResponse();
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 7500) return Response.json({ error: 'Mesajul este prea lung.' }, { status: 413 });
        chunks.push(chunk);
      }
      return routeChatResponse(new Request(url, {
        method: request.method,
        body: request.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined,
      }), geminiKey);
    }
    void respond().then(async result => {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    }).catch(next);
  };
  return {
    name: 'urban-conect-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), appApi(loadEnv(mode, process.cwd(), 'GEMINI_API_KEY').GEMINI_API_KEY)],
  server: { port: 5173, strictPort: true },
}));
