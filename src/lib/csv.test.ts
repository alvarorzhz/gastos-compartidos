import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('escapa separadores, comillas y saltos de línea', () => {
    expect(toCsv(['a', 'b'], [['x;y', 'di "hola"'], [1, null], ['l1\nl2', '']])).toBe(
      'a;b\r\n"x;y";"di ""hola"""\r\n1;\r\n"l1\nl2";\r\n',
    );
  });
});
