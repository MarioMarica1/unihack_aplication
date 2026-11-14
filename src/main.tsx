import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './shell.css';
import './urban-connect.css';
import './night.css';
import { applyTheme, readTheme } from './theme';

applyTheme(readTheme());

const Entry = import.meta.env.VITE_APP_MODE === 'cloud' ? React.lazy(() => import('./CloudApp')) : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<main className="fatal"><p role="status">Se încarcă Urban Connect…</p></main>}>
      <Entry />
    </React.Suspense>
  </React.StrictMode>,
);
