import { forgetPushOnSignOut } from './push';
import { supabase } from './supabase';
import { forgetSnapshot } from './useHousehold';

/** Cierra la sesión sin dejar en el móvil la copia de los datos ni los avisos de esta cuenta. */
export async function signOut() {
  await forgetPushOnSignOut();
  forgetSnapshot();
  await supabase.auth.signOut();
}
