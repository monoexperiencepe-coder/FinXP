const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

config.transformer = {
  ...config.transformer,
  /** Mitigación cuando dependencias usan `require.context` / resolución especial */
  unstable_allowRequireContext: true,
  minifierConfig: {
    compress: {
      ...config.transformer?.minifierConfig?.compress,
    },
  },
};

const metroConfig = withNativeWind(config, { input: './global.css' });

/**
 * Fuerza entrada CommonJS de zustand (evita `zustand/esm/*.mjs` con `import.meta` en web/Metro).
 * Encontrado con búsqueda: `zustand/esm/middleware.mjs` contiene import.meta.
 */
const upstreamResolveRequest = metroConfig.resolver.resolveRequest;
metroConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'zustand/middleware') {
    return { type: 'sourceFile', filePath: require.resolve('zustand/middleware') };
  }
  if (moduleName === 'zustand') {
    return { type: 'sourceFile', filePath: require.resolve('zustand') };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = metroConfig;
