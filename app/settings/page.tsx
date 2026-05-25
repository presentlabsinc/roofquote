import { requireUserAndSettings } from "@/lib/auth";
import { SettingsForm } from "./SettingsForm";
import { AppHeader } from "@/components/AppHeader";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, settings } = await requireUserAndSettings();
  return (
    <>
      <AppHeader title="설정" subtitle="회사 정보 · 단가 · 견적서" showBack={false} />
      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Account strip — shows current user + logout. Tiny on purpose; this
            is settings-page chrome, not the main content. */}
        <div className="flex items-center justify-between bg-card border border-border/60 rounded-2xl px-4 py-3 mb-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">로그인됨</p>
            <p className="text-sm font-semibold text-foreground truncate">{user.email}</p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1 px-3 h-9 rounded-full bg-muted text-foreground text-xs font-semibold pressable"
            >
              <LogOut size={13} />로그아웃
            </button>
          </form>
        </div>
        <SettingsForm defaultValues={settings} />
      </div>
    </>
  );
}
