import { Suspense } from "react";
import { Library } from "@/components/library";
import { GridSkeleton } from "@/components/ui";
export default function AnimeLibrary() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-12">
          <GridSkeleton />
        </div>
      }
    >
      <Library />
    </Suspense>
  );
}
