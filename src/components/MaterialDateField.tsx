import React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/fr';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

type Props = {
  label?: string;
  value: string | Date | null | undefined;
  onChange: (newValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  minDate?: Date | string;
  maxDate?: Date | string;
};

function toDayjs(value: string | Date | null | undefined): Dayjs | null {
  if (!value) return null;
  if (value instanceof Date) return dayjs(value);
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

function toHtmlLocalDateString(value: Dayjs | null): string {
  if (!value) return '';
  return value.format('YYYY-MM-DD');
}

export const MaterialDateField: React.FC<Props> = ({
  label,
  value,
  onChange,
  required,
  disabled,
  minDate,
  maxDate,
}) => {
  const djValue = toDayjs(value);
  const min = toDayjs(minDate ?? null) ?? undefined;
  const max = toDayjs(maxDate ?? null) ?? undefined;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
      <DatePicker
        label={label}
        value={djValue}
        onChange={(newVal) => onChange(toHtmlLocalDateString(newVal))}
        disabled={disabled}
        minDate={min}
        maxDate={max}
        slotProps={{
          textField: {
            required,
            fullWidth: true,
            size: 'small',
          },
        }}
        format="DD/MM/YYYY"
      />
    </LocalizationProvider>
  );
};

export default MaterialDateField;

