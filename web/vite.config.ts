import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages'te site https://<kullanıcı>.github.io/<repo>/ altında yayınlanır.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/cfp-takvim/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
