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

  useEffect(() => {
    if (!pending && cooldownMs > 0) {
      return;
    }
    if (pending && cooldownMs > 0) {
      setCooldown(true);
      const timer = setTimeout(() => setCooldown(false), cooldownMs);
      return () => clearTimeout(timer);
    }
  }, [pending, cooldownMs]);

  const isDisabled = disabled || pending || cooldown;
  const label = pending ? (pendingText ?? children) : children;

  return (
    <Button type="submit" disabled={isDisabled} {...props}>
      {label}
    </Button>
  );
};
