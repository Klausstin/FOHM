import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (window.location.hostname === 'ai-studio-applet-webapp-8efca.web.app') {
  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.hostname = 'ai-studio-applet-webapp-8efca.firebaseapp.com';
  window.location.replace(canonicalUrl.toString());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('No se pudo activar la instalacion de VEO:', error);
    });
  });
}
