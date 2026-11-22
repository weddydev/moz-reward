import { cx } from "@/lib/cx";

/** Molten button classes (PD-04): no client code here, so server components can style links with them. */
export type ButtonVariant = "molten" | "orbit" | "ghost" | "destructive";
export type ButtonSize = 46 | 54;

const VARIANT: Record<ButtonVariant, string> = {
  molten: "m-btn-molten",
  orbit: "m-btn-orbit",
  ghost: "m-btn-ghost",
  destructive: "m-btn-destructive",
};

/** Class string for links styled as buttons (e.g. `<Link className={buttonClasses()} />`). */
export function buttonClasses({
  variant = "molten",
  size = 54,
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean | undefined;
  className?: string | undefined;
} = {}): string {
  return cx("m-btn", VARIANT[variant], size === 46 && "m-sm", block && "w-full", className);
}
