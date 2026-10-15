import type { ReactNode } from 'react';
import { Segmented } from '../Segmented';
import { useT } from '../../i18n';

export interface SettingRowProps {
  label: string;
  hint?: string;
  /** Extra line under the control (e.g. sensor status). */
  status?: string;
  className?: string;
  children: ReactNode;
}

/** One labelled settings row: title, optional hint, the control, optional status line. */
export function SettingRow({ label, hint, status, className = '', children }: SettingRowProps) {
  return (
    <div className={`srow ${className}`.trim()}>
      <div className="srow__head">
        <span className="srow__label">{label}</span>
        {hint && <span className="srow__hint">{hint}</span>}
      </div>
      <div className="srow__control">{children}</div>
      {status && <p className="srow__status">{status}</p>}
    </div>
  );
}

type OnOff = 'on' | 'off';

/** Boolean setting rendered as an On / Off segmented control. */
export function OnOffSwitch({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  'aria-label'?: string;
}) {
  const t = useT();
  return (
    <Segmented<OnOff>
      aria-label={ariaLabel}
      value={value ? 'on' : 'off'}
      options={[
        { value: 'off', label: t('common.off') },
        { value: 'on', label: t('common.on') },
      ]}
      onChange={(v) => onChange(v === 'on')}
    />
  );
}
