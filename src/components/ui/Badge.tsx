import { cn } from "@/lib/utils";

const channelStyles = {
  facebook: "bg-facebook/10 text-facebook border-facebook/20",
  instagram: "bg-instagram/10 text-instagram border-instagram/20",
  linkedin: "bg-linkedin/10 text-linkedin border-linkedin/20",
} as const;

const statusStyles = {
  generating: "bg-primary/10 text-primary border-primary/20 animate-pulse",
  draft: "bg-muted text-muted-foreground border-border",
  approved: "bg-success/10 text-success border-success/20",
  scheduled: "bg-primary/10 text-primary border-primary/20",
  published: "bg-success/10 text-success border-success/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  needs_review: "bg-warning/10 text-warning-foreground border-warning/20",
} as const;

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  channel?: keyof typeof channelStyles;
  status?: keyof typeof statusStyles;
};

export const Badge = ({ className, channel, status, ...props }: BadgeProps) => {
  const style = channel
    ? channelStyles[channel]
    : status
      ? statusStyles[status]
      : "bg-secondary text-secondary-foreground border-border";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold capitalize",
        style,
        className,
      )}
      {...props}
    />
  );
};
