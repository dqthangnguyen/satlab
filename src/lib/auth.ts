import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

async function clearSessionAfterAdminVerificationFailure(): Promise<void> {
  try {
    await signOut();
  } catch (signOutError) {
    console.error("Failed to sign out after admin verification failed.", signOutError);
  }
}

export async function signInAdmin(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Supabase sign-in succeeded without returning a user.");

  let isAdmin: boolean;
  try {
    isAdmin = await checkIsAdmin();
  } catch (rpcError) {
    await clearSessionAfterAdminVerificationFailure();
    throw rpcError;
  }

  if (!isAdmin) {
    await clearSessionAfterAdminVerificationFailure();
    throw new Error("This account does not have admin privileges.");
  }

  return data.user;
}

export async function signInAnonymous(): Promise<User> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Anonymous sign-in succeeded without returning a user.");
  return data.user;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw error;
  if (typeof data !== "boolean") {
    throw new Error("Supabase RPC is_admin returned a non-boolean result.");
  }
  return data;
}
