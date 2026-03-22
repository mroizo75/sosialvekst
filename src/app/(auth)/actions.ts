"use server";

import { redirect } from "next/navigation";

import { toAppError } from "@/lib/errors";
import { getAppUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const getStringValue = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw toAppError("VALIDATION_ERROR", `Feltet ${key} er påkrevd`);
  }
  return value.trim();
};

const getCheckedValue = (formData: FormData, key: string): boolean => {
  const value = formData.get(key);
  return value === "on" || value === "true";
};

export const signInAction = async (formData: FormData): Promise<void> => {
  const email = getStringValue(formData, "email");
  const password = getStringValue(formData, "password");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("email not confirmed")) {
      redirect(`/login?error=email_not_confirmed&email=${encodeURIComponent(email)}`);
    }
    redirect(`/login?error=signin_failed&email=${encodeURIComponent(email)}`);
  }

  redirect("/dashboard");
};

export const signUpAction = async (formData: FormData): Promise<void> => {
  const email = getStringValue(formData, "email");
  const password = getStringValue(formData, "password");
  const fullName = getStringValue(formData, "fullName");
  const companyName = getStringValue(formData, "companyName");
  const targetAudience = getStringValue(formData, "targetAudience");
  const termsAccepted = getCheckedValue(formData, "termsAccepted");
  const appUrl = getAppUrl();
  const supabase = await createSupabaseServerClient();

  if (!termsAccepted) {
    redirect(`/register?error=terms_required&email=${encodeURIComponent(email)}`);
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { fullName, companyName, targetAudience },
      emailRedirectTo: `${appUrl}/login?confirmed=1`,
    },
  });

  if (error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes("already registered") || lowerMessage.includes("already exists")) {
      redirect(`/register?error=email_exists&email=${encodeURIComponent(email)}`);
    }
    redirect(`/register?error=signup_failed&email=${encodeURIComponent(email)}`);
  }

  redirect(`/login?message=check_email&email=${encodeURIComponent(email)}`);
};

export const signOutAction = async (): Promise<void> => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
};

export const resendConfirmationAction = async (formData: FormData): Promise<void> => {
  const email = getStringValue(formData, "email");
  const appUrl = getAppUrl();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${appUrl}/login?confirmed=1`,
    },
  });

  if (error) {
    redirect(`/login?error=resend_failed&email=${encodeURIComponent(email)}`);
  }

  redirect(`/login?message=confirmation_sent&email=${encodeURIComponent(email)}`);
};
