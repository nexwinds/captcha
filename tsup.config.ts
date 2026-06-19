import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    'components/Captcha.css': 'src/components/Captcha.module.css',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  treeshake: true,
  splitting: false,
  minify: false,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  injectStyle: false,
  loader: {
    '.css': 'copy',
  },
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
