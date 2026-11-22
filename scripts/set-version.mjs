import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArg = (process.argv[2] || '').trim().replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(rawArg)) {
  console.error(`Usage: node scripts/set-version.mjs <semver> (got "${process.argv[2] || ''}")`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = rawArg;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = rawArg;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// 3. src-tauri/Cargo.toml (replace only [package] version line)
const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const cargoRaw = fs.readFileSync(cargoPath, 'utf8');
const cargoUpdated = cargoRaw.replace(
  /(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
  `$1${rawArg}$2`
);
if (cargoUpdated === cargoRaw && !cargoRaw.includes(`version = "${rawArg}"`)) {
  console.error('Could not locate [package] version in src-tauri/Cargo.toml');
  process.exit(1);
}
fs.writeFileSync(cargoPath, cargoUpdated);

console.log(`Synced version ${rawArg} across package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml`);
