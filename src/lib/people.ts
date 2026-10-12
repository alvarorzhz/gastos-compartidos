import type { Member } from './types';

export function nameOf(members: Member[], userId: string, me?: string): string {
  if (me && userId === me) return 'Tú';
  return members.find((m) => m.user_id === userId)?.display_name ?? 'Cuenta borrada';
}

export function partnerOf(members: Member[], me: string): Member | undefined {
  return members.find((m) => m.user_id !== me);
}
