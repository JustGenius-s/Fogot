/**
 * Provider logo from models.dev, rendered as inline SVG.
 *
 * The models.dev logos are monochrome and use `fill="currentColor"`. Rendered
 * through an `<img>` tag, `currentColor` can't reach them so they stay black
 * and vanish on dark backgrounds. Inlining the SVG lets it inherit the text
 * color, so the logo adapts to the theme automatically. Genuinely multi-color
 * logos are unaffected (only `currentColor` fills follow the text color).
 */

import { useEffect, useState, type FC, type ReactNode } from "react";
import { providerLogo } from "@/lib/models-catalog";
import { cn } from "@/lib/utils";

const cache = new Map<string, Promise<string>>();

function loadLogo(providerId: string): Promise<string> {
  let pending = cache.get(providerId);
  if (!pending) {
    pending = fetch(providerLogo(providerId))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((svg) => {
        if (!/<svg[\s>]/i.test(svg)) throw new Error("not an svg");
        // Defensive: drop any script tags from the fetched markup.
        return svg.replace(/<script[\s\S]*?<\/script>/gi, "");
      });
    cache.set(providerId, pending);
  }
  return pending;
}

export const ProviderLogo: FC<{
  providerId: string;
  className?: string;
  /** Shown while loading and on failure (defaults to a two-letter chip). */
  fallback?: ReactNode;
}> = ({ providerId, className, fallback }) => {
  const [svg, setSvg] = useState<string | null>(() => {
    const cached = cache.get(providerId);
    // Synchronously reuse an already-resolved logo to avoid a load flash.
    if (cached) {
      let resolved: string | null = null;
      cached.then((s) => (resolved = s)).catch(() => {});
      return resolved;
    }
    return null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!cache.has(providerId)) setSvg(null);
    loadLogo(providerId).then(
      (s) => alive && setSvg(s),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [providerId]);

  const chip = (
    <span
      className={cn(
        "flex items-center justify-center rounded bg-muted text-[9px] font-semibold uppercase text-muted-foreground",
        className,
      )}
    >
      {providerId.slice(0, 2)}
    </span>
  );

  if (failed) return <>{fallback ?? chip}</>;
  if (!svg) return <>{fallback ?? <span className={cn("shrink-0", className)} />}</>;

  return (
    <span
      className={cn("inline-flex items-center justify-center [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
