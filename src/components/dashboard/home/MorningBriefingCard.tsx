import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Panel, tidyPersonName } from '../../ui/Panel';
import { fetchBriefing, type Briefing } from '../../../lib/aiAssistApi';

/**
 * A few plain sentences on where the store stands, written from the same
 * numbers Operations shows. The AI only does the wording — every number in it
 * must already be in those figures, or the app's own version is shown instead
 * (server/handlers/aiAssistRoutes.ts). One briefing per store per day, kept on
 * the server until the numbers change (after the 6:00 AM or 4:45 PM pull).
 *
 * Names of yesterday's no-shows are listed by the app, never passed to the AI.
 */
export function MorningBriefingCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchBriefing()
      .then((b) => active && setBriefing(b))
      .catch((err) => {
        console.warn('[MorningBriefingCard]', err);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // No briefing is better than an error box at the top of Home.
  if (failed) return null;

  const f = briefing?.facts;
  const asOf = f?.laborAsOf ? `labor as of ${f.laborAsOf}` : null;

  return (
    <Panel title="Today's briefing" icon={Sparkles} tone="blue">
      <div className="px-4 py-3.5 space-y-3">
        {!briefing ? (
          <div className="space-y-2" aria-label="Loading the briefing">
            <div className="h-3.5 rounded animate-pulse w-11/12" style={{ backgroundColor: 'var(--color-surface-hover)' }} />
            <div className="h-3.5 rounded animate-pulse w-9/12" style={{ backgroundColor: 'var(--color-surface-hover)' }} />
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{briefing.text}</p>

            {briefing.noShowNames.length > 0 && (
              <div>
                <p className="crm-label">
                  {f?.lastDayLabel ?? 'Last day'}'s no-shows to call back
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {briefing.noShowNames.slice(0, 12).map((name, i) => (
                    <span key={`${name}-${i}`} className="badge badge-neutral">
                      {tidyPersonName(name)}
                    </span>
                  ))}
                  {briefing.noShowNames.length > 12 && (
                    <span className="crm-label self-center">+{briefing.noShowNames.length - 12} more on Operations</span>
                  )}
                </div>
              </div>
            )}

            <p className="crm-label">
              {briefing.source === 'ai' ? 'Written by AI from the numbers on Operations' : 'From the numbers on Operations'}
              {asOf ? ` · ${asOf}` : ''}
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

export default MorningBriefingCard;
