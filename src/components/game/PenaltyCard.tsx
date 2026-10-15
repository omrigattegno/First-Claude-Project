/** Results penalty prompt (dare / drink) for the losing side. */
import type { PenaltyKind } from '../../game/penalties';
import { useT } from '../../i18n';
import '../../styles/game.css';

export interface PenaltyCardProps {
  kind: PenaltyKind;
  prompt: string;
  loserNames: string[];
}

export function PenaltyCard({ kind, prompt, loserNames }: PenaltyCardProps) {
  const t = useT();
  return (
    <section className={`card penalty penalty--${kind}`} aria-label={kind === 'dare' ? t('penalty.dareTitle') : t('penalty.drinkTitle')}>
      <h2 className="card__title penalty__title">{kind === 'dare' ? t('penalty.dareTitle') : t('penalty.drinkTitle')}</h2>
      <p className="penalty__prompt">{prompt}</p>
      {loserNames.length > 0 && <p className="penalty__losers">{t('penalty.losers', { names: loserNames.join(', ') })}</p>}
    </section>
  );
}
