export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-destructive">
      {children}
    </p>
  );
}
