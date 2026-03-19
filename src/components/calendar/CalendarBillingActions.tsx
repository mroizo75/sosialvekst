"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";

export const CalendarBillingActions = () => {
  const [status, setStatus] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");

  const createExtraPostsCheckout = async () => {
    setStatus("Oppretter betaling for tilleggsposter...");
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "extra_posts", returnPath: "/kalender" }),
    });
    const data = (await response.json()) as { url?: string };
    if (!response.ok || !data.url) {
      setStatus("Kunne ikke opprette betaling");
      return;
    }
    setCheckoutUrl(data.url);
    setStatus("Betaling opprettet");
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void createExtraPostsCheckout()}
      >
        Oppgrader: 5 poster/uke
      </Button>
      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary hover:underline"
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
