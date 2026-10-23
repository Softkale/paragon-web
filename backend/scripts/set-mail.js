// Configura el correo (SMTP) desde la consola, igual que el formulario de Configuración → Correo.
// Solo cambia lo que indiques; el resto se conserva. Lo usa deploy/setup-local-mail.sh.
//
//   node scripts/set-mail.js --host 127.0.0.1 --port 25 --secure false --clear-pass --user "" \
//        --from "PARAGON <no-reply@paragon.lat>" --app-url https://paragon.lat
const { getPublicConfig, saveConfig } = require('../src/mail/mailer');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const cur = await getPublicConfig();
  const text = (key, fallback) => (args[key] === undefined || args[key] === true ? fallback : String(args[key]));

  await saveConfig({
    host: text('host', cur.host),
    port: Number(text('port', cur.port)),
    secure: args.secure === undefined ? cur.secure : String(args.secure) === 'true',
    user: text('user', cur.user),
    pass: typeof args.pass === 'string' ? args.pass : '',
    clearPass: !!args['clear-pass'],
    from: text('from', cur.from),
    appUrl: text('app-url', cur.appUrl),
  });

  const now = await getPublicConfig();
  console.log(`Correo configurado: ${now.host}:${now.port} (SSL ${now.secure ? 'sí' : 'no'}), remitente ${now.from}`);
  await require('../src/db').pool.end();
})().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
