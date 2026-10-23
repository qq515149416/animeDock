import { Suspense } from "react";
import type { Metadata } from "next";
import { Statistics } from "@/components/statistics";

export const metadata: Metadata = { title: "数据统计" };
export default function StatisticsPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <div
            className="skel h-[480px] rounded-2xl"
            aria-label="正在加载统计页面"
          />
        </div>
      }
    >
      <Statistics />
    </Suspense>
  );
}
