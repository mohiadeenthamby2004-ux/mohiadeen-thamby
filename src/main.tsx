import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for complete offline reliability and auto updates
registerSW({
  immediate: true,
  onRegistered(r) {
    console.log('PWA Service Worker successfully registered:', r?.scope);
  },
  onRegisterError(error) {
    console.warn('PWA Service Worker registration notice:', error);
  },
});

