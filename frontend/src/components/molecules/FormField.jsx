import { Input } from "../atoms/Input";
import { Textarea } from "../atoms/Textarea";
import { Select } from "../atoms/Select";

export function FormField({
  id,
  label,
  hint,
  required = false,
  as = "input",
  children,
  ...props
}) {
  const Control =
    as === "textarea" ? Textarea : as === "select" ? Select : Input;
  return (
    <>
      <label htmlFor={id}>
        {label}
        {required && (
          <>
            {" "}
            <span>*</span>
          </>
        )}
        {hint && <small>{hint}</small>}
      </label>
      <Control id={id} required={required} {...props}>
        {children}
      </Control>
    </>
  );
}
