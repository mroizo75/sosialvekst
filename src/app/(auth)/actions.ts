"use server";

import { redirect } from "next/navigation";

import { toAppError } from "@/lib/errors";
import { getAppUrl } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

const signupAttempts = new Map<string, { count: number; resetAt: number }>();
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MAX_PER_WINDOW = 5;

const checkSignupThrottle = (key: string): boolean => {
  const now = Date.now();
  const entry = signupAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    signupAttempts.set(key, { count: 1, resetAt: now + SIGNUP_WINDOW_MS });
    return true;
  }
  if (entry.count >= SIGNUP_MAX_PER_WINDOW) {
    return false;
  }
  entry.count += 1;
  return true;
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
  const termsAccepted = getCheckedValue(formData, "termsAccepted");
  const appUrl = getAppUrl();
  const redirectTo = `${appUrl}/api/auth/callback?next=${encodeURIComponent("/login?confirmed=1")}`;

  if (!termsAccepted) {
    redirect(`/register?error=terms_required&email=${encodeURIComponent(email)}`);
  }

  if (!checkSignupThrottle(email.toLowerCase())) {
    redirect(`/register?error=rate_limited&email=${encodeURIComponent(email)}`);
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { fullName },
  });

  if (error) {
    const lowerMessage = error.message.toLowerCase();
    if (
      lowerMessage.includes("already registered") ||
      lowerMessage.includes("already exists") ||
      lowerMessage.includes("unique") ||
      lowerMessage.includes("duplicate")
    ) {
      redirect(`/register?error=email_exists&email=${encodeURIComponent(email)}`);
    }
    if (lowerMessage.includes("password")) {
      redirect(`/register?error=weak_password&email=${encodeURIComponent(email)}`);
    }
    redirect(`/register?error=signup_failed&email=${encodeURIComponent(email)}`);
  }

  await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
  });

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
      emailRedirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent("/login?confirmed=1")}`,
    },
  });

  if (error) {
    redirect(`/login?error=resend_failed&email=${encodeURIComponent(email)}`);
  }

  redirect(`/login?message=confirmation_sent&email=${encodeURIComponent(email)}`);
};
