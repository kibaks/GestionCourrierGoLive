import React, { useState, useCallback } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/fr';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import { frFR } from '@mui/x-date-pickers/locales';

/* Couleurs et rayons de la charte (index.css) */
const PRIMARY = 'var(--color-primary)';
const PRIMARY_LIGHT = 'var(--color-primary-100)';
const PRIMARY_DARK = 'var(--color-primary-dark)';
const BORDER = 'var(--border-light)';
const BORDER_FOCUS = 'var(--color-primary)';
const RADIUS = 'var(--radius-md)';

const localeTextFr = frFR.components.MuiLocalizationProvider.defaultProps.localeText ?? {};

type Props = {
  label?: string;
  value: string | Date | null | undefined;
  onChange: (newValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  minDateTime?: Date | string;
  maxDateTime?: Date | string;
  variant?: 'default' | 'card';
};

function toDayjs(value: string | Date | null | undefined): Dayjs | null {
  if (!value) return null;
  if (value instanceof Date) return dayjs(value);
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

function toHtmlLocalString(value: Dayjs | null): string {
  if (!value) return '';
  return value.format('YYYY-MM-DDTHH:mm');
}

export const MaterialDateTimeField: React.FC<Props> = ({
  label,
  value,
  onChange,
  required,
  disabled,
  minDateTime,
  maxDateTime,
  variant = 'default',
}) => {
  const djValue = toDayjs(value);
  const min = toDayjs(minDateTime ?? null) ?? undefined;
  const max = toDayjs(maxDateTime ?? null) ?? undefined;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'day' | 'hours' | 'minutes'>('day');

  const handleChange = useCallback(
    (newVal: Dayjs | null) => {
      onChange(toHtmlLocalString(newVal));
      // Au clic sur une date, afficher directement la vue heure (horloge)
      if (view === 'day') {
        requestAnimationFrame(() => setView('hours'));
      }
    },
    [onChange, view],
  );

  const picker = (
    <DateTimePicker
      label={label}
      value={djValue}
      open={open}
      onOpen={() => {
        setOpen(true);
        setView('day');
      }}
      onClose={() => setOpen(false)}
      view={view}
      onViewChange={(v) => setView(v as any)}
      onChange={handleChange}
      disabled={disabled}
      minDateTime={min}
      maxDateTime={max}
      ampm={false}
      views={['day', 'hours', 'minutes']}
      openTo="day"
      format="DD/MM/YYYY HH:mm"
      desktopModeMediaQuery="@media (min-width: 99999px)"
      timeSteps={{ hours: 1, minutes: 5 }}
      viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
      localeText={{
        ...localeTextFr,
        toolbarTitle: "Choisir la date et l'heure",
        dateTableLabel: 'Étape 1 — Date',
        timeTableLabel: 'Étape 2 — Heure',
        cancelButtonLabel: 'Annuler',
        okButtonLabel: 'OK',
        clearButtonLabel: 'Vider',
        todayButtonLabel: "Aujourd'hui",
      }}
      slotProps={{
        textField: {
          required,
          fullWidth: true,
          size: 'small',
          sx: {
            '& .MuiOutlinedInput-root': {
              borderRadius: RADIUS,
              backgroundColor: 'var(--bg-primary)',
              fontSize: '0.8125rem',
              minHeight: 36,
              '& fieldset': { borderColor: BORDER },
              '&:hover fieldset': { borderColor: PRIMARY },
              '&.Mui-focused fieldset': {
                borderWidth: 2,
                borderColor: BORDER_FOCUS,
              },
            },
            '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            '& .MuiInputLabel-root.Mui-focused': { color: BORDER_FOCUS },
          },
        },
        popper: {
          sx: {
            '& .MuiPaper-root': {
              borderRadius: RADIUS,
              boxShadow: 'var(--shadow-card), var(--shadow-glow)',
              overflow: 'hidden',
              minWidth: 400,
              width: 'max-content',
            },
            '& .MuiPickersDay-root': { borderRadius: RADIUS, fontSize: '0.8125rem', width: 32, height: 32 },
            '& .MuiPickersCalendarHeader-switchViewButton': { color: PRIMARY },
            '& .MuiPickersDay-root.Mui-selected': { backgroundColor: PRIMARY, '&:hover': { backgroundColor: PRIMARY_DARK } },
            '& .MuiPickersDay-root:not(.Mui-selected):hover': { backgroundColor: PRIMARY_LIGHT },
            '& .MuiClockNumber-root': { borderRadius: RADIUS, fontSize: '0.8125rem', '&.Mui-selected': { backgroundColor: PRIMARY, color: 'var(--text-inverse)' } },
            '& .MuiClock-pin, & .MuiClockPointer-root': { backgroundColor: PRIMARY },
            '& .MuiClockPointer-thumb': { backgroundColor: PRIMARY, borderColor: PRIMARY },
            '& .MuiClock-root': { margin: '4px 0', width: 200, height: 200 },
            '& .MuiTabs-indicator': { backgroundColor: PRIMARY, height: 2 },
            '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: '0.8125rem', minHeight: 36, borderRadius: RADIUS },
            '& .MuiTab-root.Mui-selected': { color: PRIMARY },
          },
        },
        toolbar: {
          hidden: false,
          sx: {
            padding: '10px 14px',
            borderBottom: 'none',
            backgroundColor: PRIMARY,
            color: 'var(--text-inverse)',
            '& .MuiDateTimePickerToolbar-dateTitle': { fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-inverse)' },
            '& .MuiDateTimePickerToolbar-timeLabel': { fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-inverse)' },
          },
        },
        tabs: {
          hidden: false,
          sx: { minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontWeight: 600, fontSize: '0.8125rem', borderRadius: RADIUS } },
        },
        actionBar: {
          actions: ['cancel', 'accept'],
        },
        layout: {
          sx: {
            '& .MuiDateTimePickerToolbar-root': {
              padding: '10px 14px',
              borderBottom: 'none',
              backgroundColor: PRIMARY,
              color: 'var(--text-inverse)',
            },
            '& .MuiDateTimePickerToolbar-dateTitle': { fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-inverse)' },
            '& .MuiDateTimePickerToolbar-timeLabel': { fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-inverse)' },
          },
        },
      }}
    />
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr" localeText={localeTextFr}>
      {picker}
    </LocalizationProvider>
  );
};

export default MaterialDateTimeField;
