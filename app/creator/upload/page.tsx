// app/creator/upload/page.tsx
//
// The upload flow lives in components/creator/upload/UploadWizard.tsx. This
// page is just the route shell (Suspense is required because the wizard reads
// the URL's search params to resume drafts).

import { Suspense } from "react";
import { UploadWizard } from "@/components/creator/upload/UploadWizard";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="px-4 pt-6" aria-busy="true" />}>
      <UploadWizard />
    </Suspense>
  );
}
