import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'ghost' | 'danger' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  children?: ReactNode;
}

export function Button({ variant = 'ghost', icon, children, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: ReactNode; icon?: IconName; disabled?: boolean }>;
  onChange: (value: T) => void;
  label: string;
  size?: 'm' | 'l';
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'm' }: SegmentedProps<T>) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : undefined}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field field--row">
      <div className="field__text">
        <label htmlFor={id}>{label}</label>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  hint,
  format = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  hint?: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="field__head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="mono">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  label,
  hint,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field field--row">
      <div className="field__text">
        <label htmlFor={id}>{label}</label>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type DotTone = 'ok' | 'warn' | 'err' | 'idle' | 'accent';

export function StatusDot({ tone, pulse = false }: { tone: DotTone; pulse?: boolean }) {
  return <span className={`dot dot--${tone}${pulse ? ' dot--pulse' : ''}`} aria-hidden="true" />;
}
