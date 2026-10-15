import { Button } from '../Button';
import { useT } from '../../i18n';
import { IconBack } from './icons';

/** Ghost back button for TopBar's leading slot. */
export function BackButton({ onClick, testId }: { onClick: () => void; testId?: string }) {
  const t = useT();
  return (
    <Button variant="ghost" aria-label={t('common.back')} onClick={onClick} data-testid={testId}>
      <IconBack />
    </Button>
  );
}
