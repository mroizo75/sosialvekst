import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm active:scale-[0.98]",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:scale-[0.98]",
  outline:
    "border border-border bg-transparent hover:bg-secondary text-foreground active:scale-[0.98]",
  ghost:
    "bg-transparent hover:bg-secondary text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:opacity-90 shadow-sm active:scale-[0.98]",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
  icon: "size-10 rounded-lg",
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  disabled,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
};
