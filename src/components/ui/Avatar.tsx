"use client";

import { User } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "./Icon";

/** First letter of the first and last words, upper-cased by locale ("Ólafur Arnalds" → "ÓA"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letter = (w: string) => (Array.from(w)[0] ?? "").toLocaleUpperCase("en-GB");
  return letter(first) + (last ? letter(last) : "");
}

const SIZE = {
  32: "size-8 text-caption",
  40: "size-10 text-small",
  56: "size-14 text-body",
} as const;

/**
 * Round avatar: the photo; initials when there is no photo or it fails to load; a generic person icon when
 * there is no name either. Decorative by default (the name is next to it); `labelled` names it for
 * assistive tech when it stands alone.
 */
export function Avatar({
  name,
  src,
  size = 40,
  labelled = false,
  className,
}: {
  name?: string | undefined;
  src?: string | undefined;
  size?: keyof typeof SIZE;
  labelled?: boolean;
  className?: string;
}): React.JSX.Element {
  const [failed, setFailed] = useState<string | null>(null);
  const initials = initialsOf(name ?? "");
  const showImage = src !== undefined && src !== "" && failed !== src;
  return (
    <span
      {...(labelled && name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
      className={cx(
        "bg-gold-100 text-ink relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold select-none",
        SIZE[size],
        className,
      )}
    >
      {showImage ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="size-full object-cover"
          onError={() => {
            setFailed(src);
          }}
        />
      ) : initials ? (
        initials
      ) : (
        <Icon icon={User} size={size === 32 ? 16 : size === 40 ? 20 : 24} className="text-ink-2" />
      )}
    </span>
  );
}
