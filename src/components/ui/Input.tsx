import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export const Input = ({
  className,
  label,
  error,
  hint,
  id,
  ...props
}: InputProps) => {
  const inputId = id ?? props.name;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive focus-visible:ring-destructive",
          className,
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export const Textarea = ({
  className,
  label,
  error,
  hint,
  id,
  ...props
}: TextareaProps) => {
  const inputId = id ?? props.name;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      <textarea
        id={inputId}
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed transition-all placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-y",
          error && "border-destructive focus-visible:ring-destructive",
          className,
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export const Checkbox = ({ className, label, id, ...props }: CheckboxProps) => {
  const inputId = id ?? props.name;

  return (
    <label htmlFor={inputId} className="flex items-center gap-2.5 text-sm cursor-pointer select-none group">
      <input
        id={inputId}
        type="checkbox"
        className={cn(
          "size-4 rounded border-border text-primary accent-primary focus:ring-ring transition-colors",
          className,
        )}
        {...props}
      />
      <span className="text-foreground/90 group-hover:text-foreground transition-colors">{label}</span>
    </label>
  );
};
