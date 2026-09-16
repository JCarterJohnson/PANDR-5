/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  pandrDesktop?: import('./services/auth').DesktopOAuth;
}
