import { Button } from "../atoms/Button";
import { FormField } from "../molecules/FormField";
import { ErrorMessage } from "../molecules/ErrorMessage";

export function AuthForm({ register = false, busy, error, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      {register && (
        <FormField
          id="fullName"
          name="fullName"
          label="Nombre completo"
          autoComplete="name"
          required
          minLength={2}
          maxLength={150}
        />
      )}
      <FormField
        id="email"
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
      <FormField
        id="password"
        name="password"
        label="Contraseña"
        type="password"
        autoComplete={register ? "new-password" : "current-password"}
        required
        minLength={register ? 8 : 1}
        maxLength={128}
        placeholder={register ? "Entre 8 y 128 caracteres" : "Tu contraseña"}
      />
      {register && (
        <FormField
          id="confirmation"
          name="confirmation"
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
        />
      )}
      <ErrorMessage error={error} />
      <Button type="submit" className="primary" disabled={busy}>
        {busy ? "Procesando…" : register ? "Crear cuenta →" : "Ingresar →"}
      </Button>
    </form>
  );
}
