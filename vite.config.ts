import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };
import vercel from './vercel.json' with { type: 'json' };

// Las mismas cabeceras de seguridad que pone Vercel (vercel.json), también en `vite preview`,
// para que las pruebas de pantallas comprueben que la app funciona con ellas. Allí la app habla
// con el Supabase de las pruebas en vez del de verdad.
const PROD_SUPABASE = 'fhowginbcglylkmrhwfk.supabase.co';
function previewHeaders(mode: string) {
  const url = loadEnv(mode, '.', 'VITE_').VITE_SUPABASE_URL;
  const host = url ? new URL(url).host : PROD_SUPABASE;
  return Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value.replaceAll(PROD_SUPABASE, host)]));
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  preview: { headers: previewHeaders(mode) },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    // La función avisar importa como en Deno; en las pruebas se usan los paquetes de npm.
    alias: {
      'npm:@supabase/supabase-js@2': '@supabase/supabase-js',
      'jsr:@negrel/webpush@0.5.0': decodeURIComponent(new URL('./supabase/functions/avisar/webpush.stub.ts', import.meta.url).pathname),
    },
  },
}));
