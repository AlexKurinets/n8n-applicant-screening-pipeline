// Fills ${VAR:-default} placeholders in the credentials template from the
// environment, so a real API key never has to live in the repo.
const fs = require('fs');
const [, , src, dest] = process.argv;
const text = fs.readFileSync(src, 'utf8').replace(/\$\{([A-Z0-9_]+):-([^}]*)\}/g, (_, name, fallback) => {
  const value = process.env[name] || fallback;
  return JSON.stringify(value).slice(1, -1);
});
JSON.parse(text);
fs.writeFileSync(dest, text, { mode: 0o600 });
