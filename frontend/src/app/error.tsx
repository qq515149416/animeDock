"use client";
import { ErrorState } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container-page py-16">
      <ErrorState message="页面加载遇到问题，请重试" retry={reset} />
    </div>
  );
}
