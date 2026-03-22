import Image from "next/image";
import Link from "next/link";

import { AppNav } from "@/components/layout/AppNav";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 6) return "God natt";
  if (hour < 12) return "God morgen";
  if (hour < 17) return "God ettermiddag";
  return "God kveld";
};

const getUserName = async (): Promise<string | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    return (profile?.full_name as string) ?? null;
  } catch {
    return null;
  }
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const name = await getUserName();
  const firstName = name?.split(" ")[0] ?? null;
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-4 sm:gap-6 py-2">
          <Link href="/dashboard" className="shrink-0 -my-4 sm:-my-8 -ml-6 sm:-ml-14">
            <Image
              src="/logo.png"
              alt="SosialVekst"
              width={624}
              height={250}
              className="h-28 sm:h-[250px] w-auto object-contain"
              priority
            />
          </Link>
          {firstName && (
            <div className="border-l border-border/50 pl-4 sm:pl-6">
              <p className="text-sm sm:text-lg text-muted-foreground">
                {greeting}, <span className="font-semibold text-foreground">{firstName}</span>
              </p>
            </div>
          )}
        </div>
        <div className="pb-2.5">
          <Breadcrumbs />
        </div>
        <div className="border-t border-border/50" />
        <main className="py-4 sm:py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
