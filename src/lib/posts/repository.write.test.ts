import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { replacePostMedia, updatePostRow } from "@/lib/posts/repository";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

type Result = { error: { message: string } | null };

const fakeClient = (respond: (table: string, op: string, values?: unknown) => Result) => {
  const calls: Array<{ table: string; op: string; values?: unknown }> = [];
  const chain = (result: Result) => {
    const node = {
      eq: () => node,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return node;
  };
  const client = {
    from: (table: string) => ({
      update: (values: unknown) => {
        calls.push({ table, op: "update", values });
        return chain(respond(table, "update", values));
      },
      insert: (values: unknown) => {
        calls.push({ table, op: "insert", values });
        return chain(respond(table, "insert", values));
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return chain({ error: null });
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
};

describe("lagring av genererte innlegg", () => {
  it("lagrer med kreditt når kolonnen finnes", async () => {
    const { client, calls } = fakeClient(() => ({ error: null }));

    const error = await updatePostRow(client, { id: "p1", userId: "u1" }, { text_content: "Hei", image_credit: "Foto: Ada" });

    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("lagrer på nytt uten kreditt når kolonnene mangler i databasen", async () => {
    const { client, calls } = fakeClient((table, op, values) => {
      const row = (Array.isArray(values) ? values[0] : values) as Record<string, unknown>;
      if (op === "update" && "image_credit" in row) return { error: { message: "column posts.image_credit does not exist" } };
      if (op === "insert" && "credit" in row) return { error: { message: "column post_media_assets.credit does not exist" } };
      return { error: null };
    });

    const postError = await updatePostRow(client, { id: "p1", userId: "u1" }, { text_content: "Hei", image_credit: "Foto: Ada" });
    const mediaError = await replacePostMedia(client, "p1", ["https://a.jpg", "https://b.jpg"], ["Foto: Ada", ""]);

    expect(postError).toBeNull();
    expect(mediaError).toBeNull();
    expect(calls.filter((call) => call.op === "update").at(-1)?.values).toEqual({ text_content: "Hei" });
    expect(calls.filter((call) => call.op === "insert").at(-1)?.values).toEqual([
      { post_id: "p1", file_url: "https://a.jpg", sort_order: 0 },
      { post_id: "p1", file_url: "https://b.jpg", sort_order: 1 },
    ]);
  });

  it("lagrer uten generation_meta når migrasjon 024 ikke er kjørt", async () => {
    const { client, calls } = fakeClient((_table, _op, values) => {
      const row = values as Record<string, unknown>;
      return "generation_meta" in row
        ? { error: { message: "Could not find the 'generation_meta' column of 'posts'" } }
        : { error: null };
    });

    const error = await updatePostRow(client, { id: "p1", userId: "u1" }, {
      text_content: "Hei",
      generation_meta: { topic: "Lisboa", slideCount: 3, realPlacePhoto: true },
    });

    expect(error).toBeNull();
    expect(calls.at(-1)?.values).toEqual({ text_content: "Hei" });
  });

  it("hopper over lagring når bare generation_meta skulle skrives og kolonnen mangler", async () => {
    const { client, calls } = fakeClient(() => ({ error: { message: "column posts.generation_meta does not exist" } }));

    const error = await updatePostRow(client, { id: "p1", userId: "u1" }, { generation_meta: { topic: "x" } });

    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
