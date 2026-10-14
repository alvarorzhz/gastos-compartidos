import { describe, expect, it } from 'vitest';
import { centsToInput, parseEuros } from './money';

describe('parseEuros', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12.50', 1250],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    [' 7,99 € ', 799],
    ['0,01', 1],
    ['1.200', 120000],
    ['1.234.567', 123456700],
  ])('%s -> %i', (input, cents) => expect(parseEuros(input)).toBe(cents));

  it.each(['', '0', '-3', 'abc', '1,234', '12,345', '1,2,3'])('rechaza %s', (input) => {
    expect(parseEuros(input)).toBeNull();
  });
});

describe('centsToInput', () => {
  it('vuelve a un texto que parseEuros entiende', () => {
    expect(centsToInput(1250)).toBe('12,50');
    expect(parseEuros(centsToInput(123456))).toBe(123456);
  });
});
