#!/usr/bin/env node
/**
 * Publica la librería en npm de punta a punta.
 *
 * Uso:
 *   npm run release                 # publica la versión actual de package.json
 *   npm run release -- patch        # 1.0.0 -> 1.0.1 y publica
 *   npm run release -- minor        # 1.0.0 -> 1.1.0 y publica
 *   npm run release -- major        # 1.0.0 -> 2.0.0 y publica
 *   npm run release -- 1.2.0-beta.0 --tag beta
 *   npm run release -- patch --dry-run   # todo menos publicar/pushear
 *
 * Pasos: valida nombre, git limpio, sesión en npmjs, acceso al scope, versión
 * libre -> lint, typecheck, tests, build, publint/attw -> bump de versión ->
 * pide OTP -> npm publish -> git push con tags.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const REGISTRY = 'https://registry.npmjs.org/';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tagIndex = args.indexOf('--tag');
const distTag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
const bump = args.find((a, i) => !a.startsWith('--') && i !== tagIndex + 1);

const c = { red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m', reset: '\x1b[0m' };
const step = (msg) => console.log(`\n${c.cyan}▶ ${msg}${c.reset}`);
const ok = (msg) => console.log(`${c.green}✔ ${msg}${c.reset}`);
const warn = (msg) => console.log(`${c.yellow}! ${msg}${c.reset}`);
function fail(msg) {
  console.error(`\n${c.red}✖ ${msg}${c.reset}\n`);
  process.exit(1);
}

/** Ejecuta un comando mostrando su salida; aborta si falla. */
function run(cmd, { allowFail = false } = {}) {
  console.log(`${c.yellow}$ ${cmd}${c.reset}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  if (r.status !== 0 && !allowFail) fail(`Falló: ${cmd}`);
  return r.status === 0;
}

/** Ejecuta un comando en silencio y devuelve stdout (o null si falla). */
function capture(cmd) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const readPkg = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

// 1. Nombre del paquete --------------------------------------------------------
step('Validando nombre del paquete');
const pkg = readPkg();
if (!/^(@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/.test(pkg.name)) {
  fail(`Nombre inválido: "${pkg.name}". Usa "nombre" o "@scope/nombre" (minúsculas, con @ si tiene scope).`);
}
ok(pkg.name);

// 2. Git limpio ----------------------------------------------------------------
step('Comprobando que git no tenga cambios sin commitear');
const dirty = capture('git status --porcelain');
if (dirty === null) fail('No se pudo ejecutar git.');
if (dirty) fail(`Hay cambios sin commitear:\n${dirty}\nHaz commit antes de publicar.`);
ok('Working tree limpio');

// 3. Sesión en npmjs -----------------------------------------------------------
step(`Comprobando sesión en ${REGISTRY}`);
let user = capture(`npm whoami --registry=${REGISTRY}`);
if (!user) {
  warn('No hay sesión iniciada. Abriendo npm login...');
  run(`npm login --registry=${REGISTRY}`);
  user = capture(`npm whoami --registry=${REGISTRY}`);
  if (!user) fail('El login no funcionó.');
}
ok(`Sesión: ${user}`);

// 4. Acceso al scope -----------------------------------------------------------
const scope = pkg.name.startsWith('@') ? pkg.name.slice(1, pkg.name.indexOf('/')) : null;
if (scope && scope !== user) {
  step(`Comprobando acceso a la organización @${scope}`);
  if (capture(`npm org ls ${scope} --registry=${REGISTRY}`) === null) {
    fail(
      `La organización "@${scope}" no existe o "${user}" no es miembro.\n` +
        `  Créala gratis en https://www.npmjs.com/org/create (nombre: ${scope}, plan "Unlimited public packages"),\n` +
        `  o cambia el nombre a "@${user}/${pkg.name.split('/')[1]}".`,
    );
  }
  ok(`Acceso a @${scope}`);
}

// 5. Calidad: lint, typecheck, tests, build, validación del paquete -------------
step('Lint, typecheck, tests y build');
run('npm run lint');
run('npm run typecheck');
run('npm test');
run('npm run check:package');

// 6. Versión -------------------------------------------------------------------
if (bump) {
  step(`Subiendo versión (${bump})`);
  run(`npm version ${bump} -m "Release %s"`);
}
const { version } = readPkg();
step(`Comprobando que ${pkg.name}@${version} no esté publicada`);
if (capture(`npm view ${pkg.name}@${version} version --registry=${REGISTRY}`)) {
  fail(`${pkg.name}@${version} ya existe en npm. Ejecuta con patch/minor/major para subir la versión.`);
}
ok(`Versión ${version} disponible`);

if (dryRun) {
  step('Dry run: simulando publish');
  run(`npm publish --dry-run --ignore-scripts${distTag ? ` --tag ${distTag}` : ''}`);
  warn('Dry run: no se publicó ni se hizo push.' + (bump ? ' Para deshacer el bump: git reset --hard HEAD~1 && git tag -d v' + version : ''));
  process.exit(0);
}

// 7. Publicar ------------------------------------------------------------------
step(`Publicando ${pkg.name}@${version}${distTag ? ` (tag ${distTag})` : ''}`);
const otp = await ask('Código OTP de tu app 2FA (Enter para autenticar por navegador): ');
const publishCmd = [
  'npm publish',
  '--ignore-scripts', // las comprobaciones ya se ejecutaron arriba
  '--access public',
  distTag ? `--tag ${distTag}` : '',
  otp ? `--otp=${otp}` : '',
].filter(Boolean).join(' ');
if (!run(publishCmd, { allowFail: true })) {
  fail(
    'npm publish falló. Si fue por el OTP (caduca en ~30 s), vuelve a ejecutar:\n' +
      `  npm run release${distTag ? ` -- --tag ${distTag}` : ''}\n` +
      '  (sin patch/minor/major: la versión ya está subida en package.json)',
  );
}
ok(`Publicado: https://www.npmjs.com/package/${pkg.name}`);

// 8. Push a GitHub -------------------------------------------------------------
step('Subiendo commit y tags a GitHub');
run('git push --follow-tags');

console.log(`\n${c.green}🎉 Listo. Instálala con: npm i ${pkg.name}${distTag ? `@${distTag}` : ''}${c.reset}\n`);
