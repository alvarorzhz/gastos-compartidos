import { describe, expect, it } from 'vitest';
import { errorMessage } from './supabase';

describe('errorMessage', () => {
  it('traduce los errores habituales', () => {
    expect(errorMessage({ message: 'TypeError: Failed to fetch' })).toBe('No hay conexión. Revisa internet e inténtalo de nuevo.');
    expect(errorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "categories_household_id_name_key"' })).toBe('Ya existe uno con ese nombre.');
    expect(errorMessage({ code: '42501', message: 'new row violates row-level security policy' })).toBe('No tienes permiso para hacer esto.');
  });
  it('deja tal cual los mensajes propios', () => {
    expect(errorMessage({ message: 'El espacio ya tiene dos personas' })).toBe('El espacio ya tiene dos personas');
    expect(errorMessage(null)).toBe('Algo ha fallado. Inténtalo de nuevo.');
  });
});
