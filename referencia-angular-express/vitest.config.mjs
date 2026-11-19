import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export default defineConfig({
 resolve:{alias:[{find:/^(@angular\/.*|rxjs(?:\/.*)?|tslib)$/,replacement:'$1',customResolver(source){return require.resolve(source);}}]}
});
