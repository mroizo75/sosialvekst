"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

export const CalendarBillingActions = () => {
  const [status, setStatus] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");

  const createExtraPostsCheckout = async () => {
    setStatus("Oppretter betaling...");
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "extra_posts", returnPath: "/kalender" }),
    });
    const data = (await response.json()) as { url?: string };
    if (!response.ok || !data.url) {
      setStatus("Kunne ikke opprette betaling.");
      return;
    }
    setCheckoutUrl(data.url);
    setStatus("");
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void createExtraPostsCheckout()}
      >
        Legg til flere poster
      </Button>
      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Gå til betaling
        </a>
      ) : null}
      {status ? (
        <span className="text-xs text-muted-foreground">{status}</span>
      ) : null}
    </div>
  );
};
