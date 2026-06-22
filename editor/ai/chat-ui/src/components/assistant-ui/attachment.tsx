"use client";

import { type PropsWithChildren, useEffect, useRef, useState, type FC } from "react";
import { XIcon, PaperclipIcon, FileText } from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { sendToNative, usePendingAttachments, removeAttachment } from "@/bridge";
import { useTranslation } from "@/lib/i18n";

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const src = s.attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const { t } = useTranslation();
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={t("attachment.preview")}
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full object-contain",
        isLoaded
          ? "aui-attachment-preview-image-loaded"
          : "aui-attachment-preview-image-loading invisible",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation();
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger cursor-pointer transition-colors hover:bg-accent/50"
      >
        {children}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="aui-sr-only sr-only">
          {t("attachment.imagePreview")}
        </DialogTitle>
        <div className="aui-attachment-preview relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const { t } = useTranslation();
  const src = useAttachmentSrc();

  return (
    <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt={t("attachment.preview")}
        className="aui-attachment-tile-image object-cover"
      />
      <AvatarFallback>
        <FileText className="aui-attachment-tile-fallback-icon size-8 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
};

const AttachmentUI: FC = () => {
  const { t } = useTranslation();
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";

  const isImage = useAuiState((s) => s.attachment.type === "image");
  const typeLabel = useAuiState((s) => {
    const type = s.attachment.type;
    switch (type) {
      case "image":
        return t("attachment.typeImage");
      case "document":
        return t("attachment.typeDocument");
      case "file":
        return t("attachment.typeFile");
      default:
        return type;
    }
  });

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn(
          "aui-attachment-root relative",
          isImage && "aui-attachment-root-composer only:*:first:size-24",
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger render={<div className="aui-attachment-tile size-14 cursor-pointer overflow-hidden rounded-[calc(var(--composer-radius)-var(--composer-padding))] border bg-muted transition-opacity hover:opacity-75" role="button" tabIndex={0} aria-label={t("attachment.itemLabel", { type: typeLabel })} />}><AttachmentThumb /></TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer && <AttachmentRemove />}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentRemove: FC = () => {
  const { t } = useTranslation();
  return (
    <AttachmentPrimitive.Remove render={<TooltipIconButton tooltip={t("attachment.removeFile")} className="aui-attachment-tile-remove absolute inset-e-1.5 top-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive" side="top" />}><XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" /></AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments>
        {() => <AttachmentUI />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentUI />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const PendingAttachments: FC = () => {
  const pendingAttachments = usePendingAttachments();
  if (pendingAttachments.length === 0) return null;

  // Register pending attachments as composer attachments so they appear in messages
  const SyncAttachments: FC = () => {
    const aui = useAui();
    const composer = aui.composer();
    const addedRef = useRef(new Set<string>());

    useEffect(() => {
      for (const att of pendingAttachments) {
        if (addedRef.current.has(att.path)) continue;
        addedRef.current.add(att.path);
        composer.addAttachment({
          id: att.path,
          type: 'image',
          name: att.path.split('/').pop() || att.path,
          content: [{ type: 'image' as const, image: att.dataUrl }],
        }).catch(() => {});
      }
    }, []); // only on mount, since pendingAttachments are stable until cleared

    return null;
  };

  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-2 overflow-x-auto">
      <SyncAttachments />
      {pendingAttachments.map((att, index) => (
        <PendingAttachmentTile key={`${att.path}-${index}`} attachment={att} index={index} />
      ))}
    </div>
  );
};

const PendingAttachmentTile: FC<{ attachment: { path: string; dataUrl: string }; index: number }> = ({ attachment, index }) => {
  const { t } = useTranslation();
  const fileName = attachment.path.split('/').pop() || attachment.path;
  const hasPreview = !!attachment.dataUrl;

  return (
    <Tooltip>
      <TooltipTrigger render={<div className="aui-attachment-root relative" />}>
        <div className="aui-attachment-tile size-14 cursor-default overflow-hidden rounded-[calc(var(--composer-radius)-var(--composer-padding))] border bg-muted flex items-center justify-center">
          {hasPreview
            ? <img src={attachment.dataUrl} alt={fileName} className="size-full object-cover" />
            : <FileText className="size-6 text-muted-foreground" />}
        </div>
        <button
          onClick={() => {
            sendToNative('removeAttachment', { index: String(index) })
            removeAttachment(index)
          }}
          className="absolute inset-e-1.5 top-1.5 size-3.5 rounded-full bg-white text-muted-foreground shadow-sm hover:bg-white flex items-center justify-center [&_svg]:text-black hover:[&_svg]:text-destructive"
          aria-label={t("attachment.remove")}
        >
          <XIcon className="size-3 dark:stroke-[2.5px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{fileName}</TooltipContent>
    </Tooltip>
  );
};

export const ComposerAddAttachment: FC = () => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={() => {
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <TooltipIconButton
        tooltip={t("attachment.add")}
        side="top"
        variant="ghost"
        size="icon"
        className="aui-composer-add-attachment size-8 rounded-full p-1 hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30"
        aria-label={t("attachment.add")}
        onClick={() => inputRef.current?.click()}
      >
        <PaperclipIcon className="aui-attachment-add-icon size-4" />
      </TooltipIconButton>
    </>
  );
};
