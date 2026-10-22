"use client";

import { Maximize2, X } from "lucide-react";
import { getPortraitImage } from "@/lib/images";
import type { Character } from "@/types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type VoiceActor = NonNullable<Character["actors"]>[number];

export function CharacterCastDialog({
  character,
  onClose,
  onCloseAutoFocus,
  onSelectPhoto,
}: {
  character: Character | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onSelectPhoto: (actor: VoiceActor, button: HTMLButtonElement) => void;
}) {
  const actors: VoiceActor[] = character?.actors?.length
    ? character.actors
    : character?.cv
      ? [{ id: character.id, name: character.cv }]
      : [];

  return (
    <Dialog
      open={!!character}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {character && (
        <DialogContent
          hideClose
          className="flex max-w-xl flex-col overflow-hidden"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-line p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-words text-lg font-semibold">
                {character.name}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-mut">
                声优详情 · 共 {actors.length} 位
              </DialogDescription>
            </div>
            <DialogClose
              className="icon-btn !h-11 !w-11"
              aria-label="关闭声优详情"
            >
              <X size={20} />
            </DialogClose>
          </div>
          <ul className="grid min-h-0 gap-2 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2 sm:p-5">
            {actors.map((actor, index) => {
              const photo = getPortraitImage(actor);
              const content = (
                <>
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-elev2 text-sm text-mut">
                    <span aria-hidden="true">{actor.name.slice(-1)}</span>
                    {photo && (
                      <img
                        src={photo.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">
                    {actor.name}
                  </span>
                  {photo && (
                    <Maximize2 size={14} className="shrink-0 text-mut" />
                  )}
                </>
              );
              return (
                <li key={`${actor.id}:${index}`}>
                  {photo ? (
                    <button
                      type="button"
                      aria-label={`查看声优 ${actor.name} 的照片`}
                      aria-haspopup="dialog"
                      onClick={(event) =>
                        onSelectPhoto(actor, event.currentTarget)
                      }
                      className="flex h-full w-full items-center gap-3 rounded-xl border border-line bg-elev/40 p-3 text-left transition-colors hover:bg-elev focus-visible:outline focus-visible:outline-2 focus-visible:outline-sakura"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex h-full items-center gap-3 rounded-xl border border-line bg-elev/40 p-3">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      )}
    </Dialog>
  );
}
