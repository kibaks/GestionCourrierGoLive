import React from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  children?: React.ReactNode;
};

export const MaterialInput: React.FC<Props> = ({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  error,
  required,
  placeholder,
  multiline = false,
  rows = 3,
  className = '',
  onFocus,
  onBlur,
  children,
}) => {
  const hasValue = value !== undefined && value !== '';
  const [focused, setFocused] = React.useState(false);
  const isActive = focused || hasValue || type === 'select';

  const inputBaseCls = `w-full px-3 pt-5 pb-1.5 text-sm bg-transparent outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${error ? 'text-red-900' : 'text-slate-800'}`;
  const labelCls = `absolute left-3 transition-all duration-200 pointer-events-none ${
    isActive
      ? 'top-1 text-[10px] font-semibold uppercase tracking-wide'
      : 'top-3.5 text-sm font-normal'
  } ${error ? 'text-red-500' : focused ? 'text-blue-600' : 'text-slate-400'}`;
  const borderCls = `absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-200 ${
    error ? 'bg-red-400' : focused ? 'bg-blue-500 scale-x-100' : 'bg-slate-200 scale-x-100'
  }`;

  const handleFocus = (e: React.FocusEvent) => { setFocused(true); onFocus?.(e); };
  const handleBlur = (e: React.FocusEvent) => { setFocused(false); onBlur?.(e); };

  return (
    <div className={`relative rounded-lg border-2 transition-colors ${error ? 'border-red-300 bg-red-50/50' : focused ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-white'} ${className}`}>
      <label className={labelCls}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {type === 'select' ? (
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={inputBaseCls}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          {children}
        </select>
      ) : multiline ? (
        <textarea
          value={value}
          onChange={onChange}
          disabled={disabled}
          rows={rows}
          placeholder={isActive ? placeholder : ''}
          className={inputBaseCls}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={isActive ? placeholder : ''}
          className={inputBaseCls}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      )}
      <div className={borderCls} />
      {error && <p className="text-red-500 text-xs mt-0.5 px-3 pb-1">{error}</p>}
    </div>
  );
};

export default MaterialInput;
