import { Suspense } from "react";
import { Chat } from "@/components/chat";
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-[70vh]" />}>
      <Chat />
    </Suspense>
  );
}
