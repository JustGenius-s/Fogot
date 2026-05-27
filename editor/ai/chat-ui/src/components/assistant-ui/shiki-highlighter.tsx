"use client";

import type { FC } from "react";
import ShikiHighlighter, { type ShikiHighlighterProps } from "react-shiki/web";
import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-streamdown";
import { cn } from "@/lib/utils";

export type HighlighterProps = Omit<
  ShikiHighlighterProps,
  "children" | "theme"
> & {
  theme?: ShikiHighlighterProps["theme"];
} & Pick<AUIProps, "language" | "code"> &
  Partial<Pick<AUIProps, "node" | "components">>;

export const SyntaxHighlighter: FC<HighlighterProps> = ({
  code,
  language,
  theme = "kanagawa-wave",
  className,
  addDefaultStyles = false,
  showLanguage = false,
  node: _node,
  components: _components,
  ...props
}) => {
  return (
    <ShikiHighlighter
      {...props}
      language={language}
      theme={theme}
      addDefaultStyles={addDefaultStyles}
      showLanguage={showLanguage}
      className={cn(
        "aui-shiki-base [&_pre]:overflow-x-auto [&_pre]:rounded-b-lg [&_pre]:bg-muted/75! [&_pre]:p-4",
        className,
      )}
    >
      {code.trim()}
    </ShikiHighlighter>
  );
};

SyntaxHighlighter.displayName = "SyntaxHighlighter";
