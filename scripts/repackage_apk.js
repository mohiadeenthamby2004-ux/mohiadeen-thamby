import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import AdmZip from 'adm-zip';
import { signApk } from 'apk_sign_ts';
import forge from 'node-forge';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function readUleb128String(buf, off) {
  let p = off;
  let val = 0, shift = 0;
  while (true) {
    let b = buf[p++];
    val |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  let end = buf.indexOf(0, p);
  return buf.subarray(p, end).toString('utf8');
}

function patchAndSortDex(rawDex) {
  const dex = Buffer.from(rawDex);
  const oldUrl = 'https://ais-pre-r6w7sigcxwp7vzj2y2b3l7-750761806589.asia-southeast1.run.app';
  const newUrl = 'file:///android_asset/index.html?mode=standalone&storage=local&build=v1.0.0';

  const oldUrlBuf = Buffer.from(oldUrl, 'utf8');
  const newUrlBuf = Buffer.from(newUrl, 'utf8');

  let urlOffset = dex.indexOf(newUrlBuf);
  if (urlOffset === -1) {
    const oldIdx = dex.indexOf(oldUrlBuf);
    if (oldIdx === -1) {
      throw new Error('Neither old URL nor new URL found in classes3.dex!');
    }
    newUrlBuf.copy(dex, oldIdx);
    urlOffset = oldIdx;
    console.log(`Replaced URL string at byte offset ${oldIdx}`);
  } else {
    console.log(`URL string already at byte offset ${urlOffset}`);
  }

  // 1. Read string_ids table
  const string_ids_off = dex.readUInt32LE(60);
  const string_ids_size = dex.readUInt32LE(56);
  const old_offsets = [];
  for (let i = 0; i < string_ids_size; i++) {
    old_offsets.push(dex.readUInt32LE(string_ids_off + i * 4));
  }

  // Identify which offset is the URL (should be at 147 in original DEX)
  let foundUrlIdx = -1;
  for (let i = 0; i < old_offsets.length; i++) {
    if (readUleb128String(dex, old_offsets[i]) === newUrl) {
      foundUrlIdx = i;
      break;
    }
  }

  if (foundUrlIdx === -1) {
    throw new Error('Could not find newUrl in string offsets!');
  }

  console.log(`Found newUrl at string index ${foundUrlIdx}`);

  // Reorder offsets so newUrl is at index 128 (between 'f$0' and 'fileChooserLauncher')
  // Original layout:
  // 0..127: strings before 'file'
  // 128..146: method/field names starting with file..., format..., get...
  // 147: URL
  // 148..212: image/*, etc.
  let new_offsets;
  if (foundUrlIdx === 147) {
    new_offsets = [
      ...old_offsets.slice(0, 128),
      old_offsets[147],
      ...old_offsets.slice(128, 147),
      ...old_offsets.slice(148),
    ];
  } else if (foundUrlIdx === 128) {
    // Already shifted
    new_offsets = old_offsets;
  } else {
    throw new Error(`Unexpected URL string index: ${foundUrlIdx}`);
  }

  // Write new offsets to string_ids
  for (let i = 0; i < new_offsets.length; i++) {
    dex.writeUInt32LE(new_offsets[i], string_ids_off + i * 4);
  }

  // Verify strict alphabetical order for ART DEX verifier
  for (let i = 0; i < new_offsets.length - 1; i++) {
    const s1 = readUleb128String(dex, new_offsets[i]);
    const s2 = readUleb128String(dex, new_offsets[i + 1]);
    if (s1 >= s2) {
      throw new Error(`DEX string sorting violation at ${i}: "${s1}" >= "${s2}"`);
    }
  }
  console.log('✓ All 213 strings are strictly ordered in alphabetical UTF-16 code point order.');

  // 2. Update field_ids table (shift name_idx from 128..146 by +1)
  if (foundUrlIdx === 147) {
    const field_ids_off = dex.readUInt32LE(84);
    const field_ids_size = dex.readUInt32LE(80);
    for (let i = 0; i < field_ids_size; i++) {
      const name_idx = dex.readUInt32LE(field_ids_off + i * 8 + 4);
      if (name_idx >= 128 && name_idx <= 146) {
        dex.writeUInt32LE(name_idx + 1, field_ids_off + i * 8 + 4);
      }
    }
    console.log('✓ field_ids name indices updated.');

    // 3. Update method_ids table (shift name_idx from 128..146 by +1)
    const method_ids_off = dex.readUInt32LE(92);
    const method_ids_size = dex.readUInt32LE(88);
    for (let i = 0; i < method_ids_size; i++) {
      const name_idx = dex.readUInt32LE(method_ids_off + i * 8 + 4);
      if (name_idx >= 128 && name_idx <= 146) {
        dex.writeUInt32LE(name_idx + 1, method_ids_off + i * 8 + 4);
      }
    }
    console.log('✓ method_ids name indices updated and sorted.');

    // 4. Update bytecode const-string instruction at offset 4810
    // from string 147 (0x0093) to string 128 (0x0080)
    if (dex[4810] === 0x1a && dex[4811] === 0x02) {
      dex.writeUInt16LE(128, 4812);
      console.log('✓ Bytecode instruction at offset 4810 updated to point to string 128.');
    } else {
      console.warn(`Unexpected bytecode at 4810: ${dex[4810]}, ${dex[4811]}`);
    }
  }

  // 5. Recalculate SHA1 signature (bytes 12..32 over bytes 32..end)
  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);

  // 6. Recalculate Adler32 checksum (bytes 8..12 over bytes 12..end)
  const adler = adler32(dex.subarray(12));
  dex.writeUInt32LE(adler, 8);

  console.log(`✓ Checksum updated: Adler32=${adler}, SHA1=${sha1.toString('hex')}`);
  return dex;
}

async function repackageApk() {
  console.log('--- Starting APK Fix & Repackaging ---');

  const standaloneHtmlPath = path.join(rootDir, 'dist-standalone/index.html');
  if (!fs.existsSync(standaloneHtmlPath)) {
    throw new Error('dist-standalone/index.html not found! Run build-singlefile.js first.');
  }
  const standaloneHtml = fs.readFileSync(standaloneHtmlPath);
  console.log(`Standalone HTML size: ${standaloneHtml.length} bytes`);

  // Prefer pristine backup from .build-outputs if present
  let sourceApkPath = path.join(rootDir, '.build-outputs/app-debug.apk');
  if (!fs.existsSync(sourceApkPath)) {
    sourceApkPath = path.join(rootDir, 'public/app-debug.apk');
  }
  console.log(`Using base APK from: ${sourceApkPath}`);

  // 1. Read existing APK
  const zip = new AdmZip(sourceApkPath);
  const classes3Entry = zip.getEntry('classes3.dex');
  if (!classes3Entry) {
    throw new Error('classes3.dex not found in APK!');
  }

  const rawDex = classes3Entry.getData();
  console.log(`Base classes3.dex size: ${rawDex.length} bytes`);

  const patchedDex = patchAndSortDex(rawDex);
  zip.updateFile('classes3.dex', patchedDex);

  // 2. Add standalone index.html to assets/index.html
  console.log('Adding assets/index.html to APK...');
  zip.addFile('assets/index.html', standaloneHtml);

  // Also include the icon
  const iconPath = path.join(rootDir, 'public/pwa-192x192.png');
  if (fs.existsSync(iconPath)) {
    zip.addFile('assets/icon.png', fs.readFileSync(iconPath));
  }

  // 3. Remove old signatures from META-INF so we can cleanly sign with v1, v2, v3
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.entryName.startsWith('META-INF/') &&
        (entry.entryName.endsWith('.SF') || entry.entryName.endsWith('.RSA') || entry.entryName.endsWith('.MF'))) {
      zip.deleteFile(entry.entryName);
    }
  }

  // 4. Write intermediate unsigned/aligned APK buffer
  const unsignedApkBuffer = zip.toBuffer();
  console.log(`Unsigned APK buffer size: ${unsignedApkBuffer.length} bytes`);

  // 5. Generate RSA 2048 key and debug certificate for signing
  console.log('Generating signing credentials for APK...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

  const forgePrivateKey = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const forgePublicKey = forge.pki.publicKeyFromPem(publicKeyPem);

  const cert = forge.pki.createCertificate();
  cert.publicKey = forgePublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);
  const attrs = [
    { name: 'commonName', value: 'Measurement Chart Debug' },
    { name: 'organizationName', value: 'Android' },
    { name: 'countryName', value: 'US' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forgePrivateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);

  // 6. Sign APK with apk_sign_ts (zipalign + v1 JAR + v2 APK + v3 APK signatures)
  console.log('Signing APK with APK Signature Scheme v2/v3 + v1 JAR signature...');
  const { signedApk } = await signApk(unsignedApkBuffer, privateKeyPem, certPem);
  const finalApkBuffer = Buffer.from(signedApk);
  console.log(`Final signed APK size: ${finalApkBuffer.length} bytes`);

  // 7. Write final APK to public/app-debug.apk, dist/app-debug.apk, and APK_DOWNLOAD/app-debug.apk
  const targets = [
    path.join(rootDir, 'public/app-debug.apk'),
    path.join(rootDir, 'dist/app-debug.apk'),
    path.join(rootDir, 'APK_DOWNLOAD/app-debug.apk'),
  ];

  for (const t of targets) {
    const dir = path.dirname(t);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(t, finalApkBuffer);
    console.log(`Updated: ${t} (${fs.statSync(t).size} bytes)`);
  }

  console.log('--- APK Fix & Repackaging Completed Successfully! ---');
}

repackageApk().catch((err) => {
  console.error('Error repackaging APK:', err);
  process.exit(1);
});
