import { Suspense } from "react";
import { PracticeClient } from "@/components/practice/practice-client";

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
          <div className="skeleton w-[420px] h-[300px]" />
        </div>
      }
    >
      <PracticeClient />
    </Suspense>
  );
}
