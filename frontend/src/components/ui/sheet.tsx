"use client";
import * as React from "react";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export const Sheet = Primitive.Root;
export const SheetTitle = Primitive.Title;
export function SheetContent({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm" />
      <Primitive.Content
        aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[86dvh] flex-col rounded-t-2xl border-t border-line bg-card slide-up"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-elev2" />
        <div className="flex items-center justify-between px-5 py-3">
          <SheetTitle className="font-semibold">{title}</SheetTitle>
          <Primitive.Close className="icon-btn" aria-label="关闭筛选">
            <X size={18} />
          </Primitive.Close>
        </div>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
