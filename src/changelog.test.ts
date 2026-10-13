import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { CHANGELOG } from './changelog';

const semver = /^\d+\.\d+\.\d+$/;
const parse = (v: string) => v.split('.').map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

describe('changelog', () => {
  it('la primera entrada es la versión de package.json', () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
  });

  it('las versiones son válidas, únicas y van de la más nueva a la más antigua', () => {
    CHANGELOG.forEach((r, i) => {
      expect(r.version).toMatch(semver);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.changes.length).toBeGreaterThan(0);
      if (i > 0) expect(newer(CHANGELOG[i - 1].version, r.version)).toBe(true);
    });
  });
});
