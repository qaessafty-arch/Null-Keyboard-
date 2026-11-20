/**
 * Regenerates the NULL-TECH brand assets from the single source of truth in
 * src/brand/fingerprint.ts:  node scripts/gen-brand.ts
 *  - public/icons/null-tech.svg          favicon / SVG app icon
 *  - public/icons/null-tech-mono.svg     single-colour watermark
 * PNG icons are rendered from these with Playwright (see README › Brand assets).
 */
import { writeFileSync } from 'node:fs';
import { fingerprintSvg } from '../src/brand/fingerprint.ts';

writeFileSync('public/icons/null-tech.svg', fingerprintSvg({ size: 64, background: '#090B10', padding: 6 }));
writeFileSync('public/icons/null-tech-mono.svg', fingerprintSvg({ size: 48, ridge: '#F5F6FA', core: '#F5F6FA' }));
console.log('brand assets written');
