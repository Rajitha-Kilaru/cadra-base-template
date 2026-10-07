interface FieldErrorProps {
  message: string | null;
}
export function FieldError({ message }: FieldErrorProps) {
  return message ? <span className="field-error" role="alert">{message}</span> : null;
}