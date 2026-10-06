import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

const useHttps = !!process.env.HTTPS;

export default defineConfig({
  // Served from https://shwaddell28.github.io/line-runner/
  base: '/line-runner/',
  plugins: [
    react(),
    ...(useHttps ? [basicSsl() as PluginOption] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Line Runner',
        short_name: 'Lines',
        description: 'Record scenes and drill your lines',
        theme_color: '#110e0c',
        background_color: '#110e0c',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: useHttps ? { host: true } : undefined
});
