// Development CSP override - allows React hot reloading while maintaining security
(function() {
  // Only override in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Find existing CSP meta tag
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (cspMeta) {
      // Add unsafe-eval only for React development
      cspMeta.content = cspMeta.content.replace(
        "script-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      );
    }
  }
})();
