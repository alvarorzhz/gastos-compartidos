import { describe, expect, it } from 'vitest';
import { categoryStyle } from './categoryStyle';

describe('categoryStyle', () => {
  it('reconoce las categorías de serie', () => {
    expect(categoryStyle('Supermercado').icon).toBe('cart');
    expect(categoryStyle('Casa').icon).toBe('home');
    expect(categoryStyle('Facturas').icon).toBe('bolt');
    expect(categoryStyle('Transporte').icon).toBe('car');
    expect(categoryStyle('Restaurantes').icon).toBe('utensils');
    expect(categoryStyle('Ocio').icon).toBe('ticket');
    expect(categoryStyle('Salud').icon).toBe('health');
    expect(categoryStyle('Otros')).toEqual({ icon: 'tag', tone: 10 });
  });

  it('ignora mayúsculas y tildes', () => {
    expect(categoryStyle('NÓMINA').icon).toBe('coins');
    expect(categoryStyle('Comida fuera').icon).toBe('utensils');
  });

  it('no confunde palabras que solo contienen la clave', () => {
    // "Barbacoa" empieza por "bar", pero "Lugar" no debe ser restaurante.
    expect(categoryStyle('Lugar raro').icon).toBe('tag');
  });

  it('da siempre el mismo color a un nombre desconocido', () => {
    const a = categoryStyle('Bricolaje');
    expect(a.icon).toBe('tag');
    expect(categoryStyle('bricolaje')).toEqual(a);
    expect(a.tone).toBeGreaterThanOrEqual(1);
    expect(a.tone).toBeLessThanOrEqual(11);
  });
});
