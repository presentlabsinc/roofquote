"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  // Hide on focused task flows + auth pages (the auth pages don't have a
  // signed-in user to navigate; middleware bounces unauthed users to /login).
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/sites/new" ||
    pathname.endsWith("/estimates/new") ||
    pathname.endsWith("/preview")
  ) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 safe-x">
      <div className="max-w-lg mx-auto px-3 pb-2 safe-bottom">
        <div className="glass border border-border/60 rounded-3xl shadow-lg shadow-black/5 flex items-stretch h-16">
          <NavItem href="/" icon={<Home size={22} strokeWidth={2.3} />} label="현장" active={pathname === "/"} />
          <div className="flex-1 flex items-center justify-center">
            <Link
              href="/sites/new"
              aria-label="새 현장 추가"
              className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 pressable -mt-6"
            >
              <Plus size={26} strokeWidth={2.6} />
            </Link>
          </div>
          <NavItem href="/settings" icon={<Settings size={22} strokeWidth={2.3} />} label="설정" active={pathname === "/settings"} />
        </div>
      </div>
    </nav>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium pressable rounded-3xl",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
