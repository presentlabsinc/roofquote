import { NewSiteForm } from "./NewSiteForm";

export default function NewSitePage() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">새 현장 등록</h1>
      <p className="text-sm text-gray-500 mb-6">고객 정보와 현장 정보를 입력해 주세요.</p>
      <NewSiteForm />
    </div>
  );
}
