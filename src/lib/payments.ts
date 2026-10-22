import { useCallback, useEffect, useState } from 'react';
import { toIsoDate } from './dates';
import { normalize } from './search';
import { guessPersonalCategory } from './statement';
import { supabase } from './supabase';
import type { PersonalEntry } from './types';

/*
 * Pagos con Apple Pay (ver supabase/migrations/0012_pagos_apple_pay.sql).
 *
 * Una automatización de Atajos en el iPhone manda cada pago a la función "avisar" con la clave
 * de quien paga. El pago espera aquí hasta que se confirma (como gasto común o personal) o se
 * descarta. El aviso del móvil abre la app con ?pago=<id> para confirmarlo directamente.
 */

export interface PendingPayment {
  id: string;
  user_id: string;
  /** null si el iPhone mandó un importe que no se entiende. */
  amount_cents: number | null;
  merchant: string | null;
  card: string | null;
  raw_amount: string | null;
  paid_at: string;
}

/** Lo que se rellena en el formulario al confirmar un pago. */
export interface PaymentPrefill {
  amountCents: number | null;
  note: string;
  date: string;
}

export function prefillOf(p: PendingPayment): PaymentPrefill {
  return { amountCents: p.amount_cents, note: p.merchant ?? '', date: toIsoDate(new Date(p.paid_at)) };
}

/** Categoría personal para un pago: la de la última vez con la misma tienda o la que se reconozca. */
export function personalCategoryFor(merchant: string, entries: PersonalEntry[]): string | null {
  const n = normalize(merchant);
  if (!n) return null;
  const last = entries.find((e) => e.kind === 'expense' && e.note && normalize(e.note) === n);
  if (last) return last.category;
  const guess = guessPersonalCategory({ date: '', description: merchant, amountCents: -1 });
  return guess === 'Otros' ? null : guess;
}

/** Dirección a la que el atajo manda los pagos. */
export function paymentUrl(key: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${base.replace(/\/$/, '')}/functions/v1/avisar?pago=${key}`;
}

/** Pago que pide abrir el aviso del móvil (?pago=<id>), quitándolo de la dirección. */
export function takePaymentFromUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const id = params.get('pago');
  if (!id) return null;
  params.delete('pago');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Pagos por confirmar de quien usa la app, al día (tiempo real y al volver a la app). */
export function usePendingPayments(userId: string) {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  // Sin la migración 0012 la tabla no existe: no se enseña nada.
  const [available, setAvailable] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('pending_payments').select('*').order('paid_at', { ascending: false }).limit(100);
    if (error) return;
    setAvailable(true);
    setPayments((data ?? []) as PendingPayment[]);
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const channel = supabase
      .channel(`pagos-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_payments', filter: `user_id=eq.${userId}` }, () => void refresh())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pending_payments' }, () => void refresh())
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  /** Quita el pago (ya apuntado o descartado). */
  const remove = useCallback(async (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase.from('pending_payments').delete().eq('id', id);
    if (error) void refresh();
    return error;
  }, [refresh]);

  return { payments, available, refresh, remove };
}

/** Clave del atajo y cuándo llegó el último pago. renew = cambiarla por otra. */
export async function myPayKey(renew = false): Promise<{ key: string; lastUsedAt: string | null }> {
  const { data, error } = await supabase.rpc('my_pay_key', { p_renew: renew }).single<{ key: string; last_used_at: string | null }>();
  if (error || !data) throw error ?? new Error('Sin clave');
  return { key: data.key, lastUsedAt: data.last_used_at };
}
