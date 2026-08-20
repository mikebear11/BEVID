// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

function makeDevServerV5Compatible(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    onListening,
    setupMiddlewares,
    ...compatibleConfig
  } = devServerConfig;

  compatibleConfig.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";
  // === Lot 5 P1 — En-têtes de sécurité (dev server) ===
  // Content-Security-Policy en mode Report-Only tant que P2 n'est pas terminé.
  // On observe via /api/csp-report avant de basculer en mode bloquant.
  const cspBlocking = [
    "default-src 'self'",
    // CSP resserrée — plus aucune whitelist pour Cloudflare beacon (bloqué),
    // ni pour assets.emergent.sh en production. assets.emergent.sh reste
    // whitelisté ci-dessous UNIQUEMENT parce que visual-edits l'utilise en
    // preview ; il sera bloqué automatiquement par CSP sur un vrai déploiement
    // (visual-edits n'est chargé qu'en preview via le check hostname dans
    // index.html).
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://assets.emergent.sh https://ap.emergent.sh https://*.i.posthog.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.i.posthog.com",
    "connect-src 'self' https://ap.emergent.sh https://*.i.posthog.com https://drink-sales-hub-8.preview.emergentagent.com wss: ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
  ].join("; ");

  const permissionsPolicy = [
    "camera=(self)",
    "microphone=(self)",
    "geolocation=(self)",
    "fullscreen=(self)",
    "payment=()",
    "usb=()",
    "midi=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "autoplay=()",
    "ambient-light-sensor=()",
  ].join(", ");

  compatibleConfig.headers = {
    ...compatibleConfig.headers,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": permissionsPolicy,
    // === Lot 5 P1 (bascule bloquante) ===
    // Émission simultanée : CSP appliquée (bloquante) ET Report-Only conservé
    // pour continuer à observer d'éventuelles régressions pendant 48h.
    // Les deux directives sont identiques → tout ce qui viole en réel est
    // remonté à /api/csp-report.
    "Content-Security-Policy": cspBlocking,
    "Content-Security-Policy-Report-Only": cspBlocking,
    // Neutralise l'en-tête bavard injecté par webpack-dev-server. Le proxy CDN
    // amont peut le réinjecter en preview, hors périmètre code.
    "X-Powered-By": "",
  };

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    compatibleConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) {
        onBeforeSetupMiddleware(devServer);
      }

      return setupMiddlewares
        ? setupMiddlewares(middlewares, devServer)
        : middlewares;
    };
  }

  compatibleConfig.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);

    if (onListening) {
      onListening(devServer);
    }
    if (onAfterSetupMiddleware) {
      onAfterSetupMiddleware(devServer);
    }
  };

  return compatibleConfig;
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// =============================================================================
// Lot 5 P3.1 — 404 SPA + P1 — Sécurité (appliqués APRÈS withVisualEdits)
// visual-edits écrase config.setupMiddlewares dans son setupDevServer ; on
// enveloppe donc APRÈS lui, sinon notre middleware 404 est perdu.
// =============================================================================
function wrapWith404AndHeaders(devServerConfig) {
  // === Lot 5 P3.1 — Vrai statut 404 côté serveur pour les routes SPA inconnues ===
  // La liste des routes valides vient de App.js. Les routes dynamiques utilisent
  // un motif regex. Les assets statiques (contenant un point dans le dernier
  // segment) et l'API sont laissés au comportement webpack habituel.
  const KNOWN_ROUTES = [
    /^\/$/,
    /^\/login$/,
    /^\/register$/,
    /^\/forgot-password$/,
    /^\/reset-password\/[^/]+$/,
    /^\/sign\/[^/]+$/,
    /^\/activate\/[^/]+$/,
    /^\/pricing$/,
    /^\/tarifs$/,
    /^\/plans$/,
    /^\/change-password$/,
    /^\/admin\/users$/,
    /^\/admin\/permissions$/,
    /^\/admin\/couts$/,
    /^\/paiements$/,
    /^\/confidentialite$/,
    /^\/clients$/,
    /^\/clients\/[^/]+$/,
    /^\/products$/,
    /^\/orders$/,
    /^\/tours$/,
    /^\/reports$/,
    /^\/agents$/,
    /^\/visit$/,
    /^\/planning$/,
    /^\/monthly-review$/,
    /^\/pipeline$/,
    /^\/deals$/,
    /^\/connectors$/,
    /^\/settings$/,
    /^\/smart-goals$/,
    /^\/tournee$/,
    /^\/etab\/new$/,
    /^\/etab\/[^/]+$/,
    /^\/etab\/[^/]+\/enrichissement$/,
    /^\/etab\/[^/]+\/commande$/,
    /^\/stock$/,
    /^\/containers$/,
    /^\/containers\/labels$/,
    /^\/containers\/[^/]+$/,
    /^\/scan$/,
    /^\/drm$/,
    /^\/rapprochement$/,
    /^\/sources-donnees$/,
    /^\/prospection$/,
    /^\/radar$/,
    /^\/veille$/,
    /^\/bouclier$/,
    /^\/design-system$/,
    /^\/profile$/,
    /^\/org\/settings$/,
    /^\/billing$/,
    /^\/team$/,
  ];

  const prevSetup = devServerConfig.setupMiddlewares;
  devServerConfig.setupMiddlewares = (middlewares, devServer) => {
    // Chaîne : d'abord la setup précédente (visual-edits enregistre son endpoint
    // /edit-file via devServer.app.use), puis on injecte notre 404 SPA en tête.
    if (typeof prevSetup === "function") {
      middlewares = prevSetup(middlewares, devServer) || middlewares;
    }
    // Enregistre AUSSI notre handler 404 comme middleware Express direct pour
    // qu'il s'exécute avant historyApiFallback (qui vit dans `middlewares`).
    // devServer.app est l'instance Express interne de webpack-dev-server.
    const spa404Handler = (req, res, next) => {
      try {
        const method = (req.method || "GET").toUpperCase();
        const originalUrl = req.originalUrl || req.url || "/";
        if (method !== "GET" && method !== "HEAD") return next();
        const url = originalUrl;
        const path = url.split("?")[0].split("#")[0];
          // Assets webpack (bundle, sockjs, hot-update, sourcemap, etc.) ou API : on ne touche pas.
          if (
            path.startsWith("/api/") ||
            path.startsWith("/static/") ||
            path.startsWith("/sockjs-node") ||
            path.startsWith("/ws") ||
            path.startsWith("/__webpack") ||
            path.includes(".hot-update.") ||
            /\.[a-zA-Z0-9]{1,8}$/.test(path)
          ) {
            return next();
          }
          // Route SPA connue : laisse passer.
          if (KNOWN_ROUTES.some((r) => r.test(path))) return next();

          // Route inconnue : renvoie 404 avec le HTML SPA (le composant NotFound se rendra).
        const fs = require("fs");
        const p = require("path");
        const indexPath = p.resolve(__dirname, "public", "index.html");
        fs.readFile(indexPath, "utf8", (err, html) => {
          if (err) return next(err);
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("X-Robots-Tag", "noindex, nofollow");
          res.end(html);
        });
      } catch (e) {
        return next(e);
      }
    };
    if (devServer && devServer.app && typeof devServer.app.use === "function") {
      devServer.app.use(spa404Handler);
    } else {
      // Fallback : insère en tête de la liste de middlewares.
      middlewares.unshift({ name: "bevid-spa-404", middleware: spa404Handler });
    }
    return middlewares;
  };

  return devServerConfig;
}

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
}

const configureDevServer = webpackConfig.devServer;
webpackConfig.devServer = (devServerConfig) =>
  // Ordre critique : visual-edits d'abord (via configureDevServer), puis notre
  // 404 SPA par-dessus, puis le shim V5.
  makeDevServerV5Compatible(wrapWith404AndHeaders(configureDevServer(devServerConfig)));

module.exports = webpackConfig;
