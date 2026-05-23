import { NewSiteForm } from "./NewSiteForm";
import { AppHeader } from "@/components/AppHeader";

export default function NewSitePage() {
  return (
    <>
      <AppHeader title="새 현장" subtitle="고객 정보와 현장 사진을 등록합니다" />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-4">
        <NewSiteForm />
      </div>
    </>
  );
}
