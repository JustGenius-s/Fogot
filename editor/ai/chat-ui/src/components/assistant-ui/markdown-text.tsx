"use client";

import { memo, useState, type FC } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  StreamdownTextPrimitive,
  type CodeHeaderProps,
} from "@assistant-ui/react-streamdown";

import { SyntaxHighlighter } from "@/components/assistant-ui/shiki-highlighter";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

const CodeHeader: FC<CodeHeaderProps> = ({ language, code: codeText }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!codeText || isCopied) return;
    copyToClipboard(codeText);
  };

  return (
    <div className="aui-code-header-root mt-2.5 flex items-center justify-between rounded-t-lg border border-border/50 border-b-0 bg-muted/50 px-3 py-1.5 text-xs">
      <span className="aui-code-header-language font-medium text-muted-foreground lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(value).then(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), copiedDuration);
      },
      () => {},
    );
  };

  return { isCopied, copyToClipboard };
};

const MarkdownTextImpl = () => {
  return (
    <StreamdownTextPrimitive
      components={{
        SyntaxHighlighter: SyntaxHighlighter as never,
        CodeHeader: CodeHeader as never,
      }}
      containerClassName="aui-md"
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
