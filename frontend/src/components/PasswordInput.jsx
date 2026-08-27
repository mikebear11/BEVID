import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Champ mot de passe avec œil pour afficher/masquer.
 * Reprend la classe `input-crm` du design system BEVID.
 * Toutes les props (value, onChange, required, minLength, placeholder, data-testid, autoComplete, name, id...) sont transmises à l'input.
 */
export default function PasswordInput({
  className = "",
  containerClassName = "",
  "data-testid": testId,
  ...props
}) {
  const [show, setShow] = useState(false);
  const toggleTid = testId ? `${testId}-toggle` : "password-toggle";
  return (
    <div className={`relative ${containerClassName}`}>
      <input
        {...props}
        type={show ? "text" : "password"}
        data-testid={testId}
        className={`input-crm min-h-[48px] pr-11 w-full ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-stone-800"
        data-testid={toggleTid}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
