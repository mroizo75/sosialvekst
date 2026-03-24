"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Oversikt" },
  { href: "/kalender", label: "Kalender" },
  { href: "/media", label: "Bilder og video" },
  { href: "/publiser", label: "Publiser" },
  { href: "/onboarding", label: "Min bedrift" },
] as const;

type Workspace = {
  id: string;
  name: string;
  isDefault: boolean;
};

export const AppNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const isActive = (href: string): boolean => {
    if (href === "/kalender") {
      return pathname === "/kalender" || pathname === "/calendar";
    }
    return pathname.startsWith(href);
  };

  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const data = (await res.json()) as { workspaces: Workspace[]; activeId: string | null };
      setWorkspaces(data.workspaces);
      setActiveId(data.activeId);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = async (id: string) => {
    setWsDropdownOpen(false);
    const res = await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id }),
    });
    if (res.ok) {
      setActiveId(id);
      router.refresh();
    }
  };

  const createWorkspace = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const ws = (await res.json()) as Workspace;
      setWorkspaces((prev) => [...prev, ws]);
      setActiveId(ws.id);
      setNewName("");
      setWsDropdownOpen(false);
      router.push("/onboarding");
    }
    setCreating(false);
  };

  const activeName = workspaces.find((w) => w.id === activeId)?.name ?? "Bedrift";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {workspaces.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setWsDropdownOpen((p) => !p)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs sm:text-sm font-semibold text-foreground hover:bg-secondary transition-colors cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
              >
                <span className="truncate">{activeName}</span>
                <svg className={cn("size-3.5 shrink-0 transition-transform", wsDropdownOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {wsDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setWsDropdownOpen(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="p-1.5">
                      {workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => void switchWorkspace(ws.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer text-left",
                            ws.id === activeId
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground hover:bg-secondary",
                          )}
                        >
                          <span className="truncate flex-1">{ws.name}</span>
                          {ws.id === activeId && (
                            <span className="shrink-0 text-xs text-primary">&#10003;</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-border p-2">
                      <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Ny bedrift</p>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Bedriftsnavn..."
                          className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                          onKeyDown={(e) => { if (e.key === "Enter") void createWorkspace(); }}
                        />
                        <button
                          type="button"
                          onClick={() => void createWorkspace()}
                          disabled={!newName.trim() || creating}
                          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {creating ? "..." : "Opprett"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <form action={signOutAction} className="hidden sm:block">
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            Logg ut
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="sm:hidden flex flex-col items-center justify-center gap-1 p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
          aria-label="Meny"
        >
          <span className={cn(
            "block h-0.5 w-5 rounded-full bg-foreground transition-all",
            mobileOpen && "translate-y-[6px] rotate-45",
          )} />
          <span className={cn(
            "block h-0.5 w-5 rounded-full bg-foreground transition-all",
            mobileOpen && "opacity-0",
          )} />
          <span className={cn(
            "block h-0.5 w-5 rounded-full bg-foreground transition-all",
            mobileOpen && "-translate-y-[6px] -rotate-45",
          )} />
        </button>

        <div className="sm:hidden w-9" />
      </div>

      {mobileOpen && (
        <div className="sm:hidden border-t border-border bg-card animate-in slide-in-from-top-2 fade-in duration-200">
          <nav className="flex flex-col p-2 gap-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                >
                  Logg ut
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
