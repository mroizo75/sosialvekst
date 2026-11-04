"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/Button";

type SubmitButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  cooldownMs?: number;
  pendingText?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
};

export const SubmitButton = ({
  cooldownMs = 0,
  pendingText,
  children,
  disabled,
  ...props
}: SubmitButtonProps) => {
  const { pending } = useFormStatus();
  const [cooldown, setCooldown] = useState(false);
  const [seenPending, setSeenPending] = useState(pending);

  // The cooldown starts when a submit starts, adjusted during render instead of in an effect.
  if (pending !== seenPending) {
    setSeenPending(pending);
    if (pending && cooldownMs > 0) setCooldown(true);
  }

  // Keyed on the cooldown itself, so the timer survives the submit finishing first.
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), cooldownMs);
    return () => clearTimeout(timer);
  }, [cooldown, cooldownMs]);

  const isDisabled = disabled || pending || cooldown;
  const label = pending ? (pendingText ?? children) : children;

  return (
    <Button type="submit" disabled={isDisabled} {...props}>
      {label}
    </Button>
  );
};
