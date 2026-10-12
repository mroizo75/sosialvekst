"use client";

import { useState } from "react";

import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Input";
import type { OrderContact } from "@/lib/types";

type OrderContactCardProps = {
  contact: OrderContact;
  onSaved: (contact: OrderContact) => void;
};

type ContactForm = {
  phone: string;
  email: string;
  messenger: boolean;
};

const toForm = (contact: OrderContact): ContactForm => ({
  phone: contact.phone ?? "",
  email: contact.email ?? "",
  messenger: contact.messenger,
});

export const OrderContactCard = ({ contact, onSaved }: OrderContactCardProps) => {
  const { dictionary } = useI18n();
  const p = dictionary.products;
  const [form, setForm] = useState<ContactForm>(() => toForm(contact));
  const [seenContact, setSeenContact] = useState(contact);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  if (contact !== seenContact) {
    setSeenContact(contact);
    setForm(toForm(contact));
  }

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/products/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone.trim(), email: form.email.trim(), messenger: form.messenger }),
      });
      const data = (await response.json().catch(() => null)) as (OrderContact & { message?: string }) | null;
      if (!response.ok || !data) {
        setStatus(data?.message ?? p.contactSaveFailed);
        return;
      }
      const saved: OrderContact = { phone: data.phone, email: data.email, messenger: data.messenger };
      setSeenContact(saved);
      onSaved(saved);
      setStatus(p.contactSaved);
    } catch {
      setStatus(p.contactSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{p.contactTitle}</p>
        <p className="text-xs text-muted-foreground">{p.contactBody}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="order-contact-phone"
          label={p.contactPhoneLabel}
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          placeholder={p.contactPhonePlaceholder}
        />
        <Input
          name="order-contact-email"
          label={p.contactEmailLabel}
          type="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          placeholder={p.contactEmailPlaceholder}
        />
      </div>
      <Checkbox
        name="order-contact-messenger"
        label={p.contactMessengerLabel}
        checked={form.messenger}
        onChange={(e) => setForm((prev) => ({ ...prev, messenger: e.target.checked }))}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}>
          {saving ? p.saving : p.contactSave}
        </Button>
        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      </div>
    </div>
  );
};
