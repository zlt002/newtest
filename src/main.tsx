import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.js'
import './index.css'
import 'katex/dist/katex.min.css'

// Windows Lite runs as a local desktop-style app, so we explicitly remove
// any previously registered service workers and related caches.
if (typeof window !== 'undefined') {
  const rootElement = document.documentElement
  const setKeyboardModality = () => {
    rootElement.dataset.inputModality = 'keyboard'
  }
  const setPointerModality = () => {
    rootElement.dataset.inputModality = 'pointer'
  }

  window.addEventListener('keydown', setKeyboardModality, { capture: true })
  window.addEventListener('mousedown', setPointerModality, { capture: true })
  window.addEventListener('pointerdown', setPointerModality, { capture: true })
  window.addEventListener('touchstart', setPointerModality, { capture: true })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((error) => {
        console.warn('Service worker cleanup failed:', error);
      });
  }

  if ('caches' in window) {
    caches.keys()
      .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
      .catch((error) => {
        console.warn('Cache cleanup failed:', error);
      });
  }
}

const appTree = import.meta.env.DEV
  ? <App />
  : (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found');
}

ReactDOM.createRoot(rootElement).render(appTree)
