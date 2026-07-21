import React, { useRef, useEffect } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Champ OTP composé de petites cases carrées, une par caractère.
 */
const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  placeholder,
  className = '',
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Garde value sous forme d'une chaîne de la bonne longueur (chiffres uniquement)
  const digits = value.replace(/\D/g, '').slice(0, length);

  useEffect(() => {
    // Auto-focus sur la première case au montage
    if (!disabled && !digits) {
      inputsRef.current[0]?.focus();
    }
  }, []);

  const updateValue = (newDigits: string) => {
    onChange(newDigits.slice(0, length));
  };

  const focusIndex = (index: number) => {
    const input = inputsRef.current[Math.max(0, Math.min(index, length - 1))];
    input?.focus();
    input?.select();
  };

  const handleChange = (index: number, rawValue: string) => {
    const char = rawValue.replace(/\D/g, '').slice(-1);
    const next = digits.slice(0, index) + char + digits.slice(index + 1);
    updateValue(next);
    if (char && index < length - 1) {
      focusIndex(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        const next = digits.slice(0, index) + digits.slice(index + 1);
        updateValue(next);
      } else if (index > 0) {
        const next = digits.slice(0, index - 1) + digits.slice(index);
        updateValue(next);
        focusIndex(index - 1);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    updateValue(pasted);
    focusIndex(Math.min(pasted.length, length - 1));
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => { inputsRef.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          placeholder={placeholder ? placeholder[index] : undefined}
          value={digits[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="h-12 w-12 rounded-lg border-2 border-surface-200 bg-white text-center text-xl font-semibold text-surface-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 disabled:opacity-60"
        />
      ))}
    </div>
  );
};

export default OtpInput;
