"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        <NavItem href="/" icon={<Home size={22} />} label="현장 목록" active={pathname === "/"} />
        <div className="flex-1 flex items-center justify-center">
          <Link
            href="/sites/new"
            className="flex flex-col items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200 -mt-5"
          >
            <Plus size={26} />
          </Link>
        </div>
        <NavItem href="/settings" icon={<Settings size={22} />} label="단가 설정" active={pathname === "/settings"} />
      </div>
    </nav>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
      active ? "text-blue-600" : "text-gray-500 hover:text-gray-800")}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
