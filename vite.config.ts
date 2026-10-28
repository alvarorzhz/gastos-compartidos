import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
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
});
