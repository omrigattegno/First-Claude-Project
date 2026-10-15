import './Segmented.css';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string | number> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  'aria-label'?: string;
  /** When set, every option gets data-testid="{testId}-{value}" (stable selectors for e2e tests). */
  testId?: string;
}

/** Single-choice option row (radio semantics). */
export function Segmented<T extends string | number>({ value, options, onChange, testId, ...rest }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={rest['aria-label']}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          data-testid={testId ? `${testId}-${String(o.value)}` : undefined}
          className={`segmented__opt ${o.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
