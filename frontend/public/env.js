// Default runtime config. In a container, docker-entrypoint.sh overwrites this
// file with the deploy's VITE_* values. In dev the values come from Vite's
// import.meta.env, so this stays empty. See src/lib/env.js.
window.__ENV__ = {};
