import React, { useEffect, useState } from 'react';
import { fetchVinRecalls, type VinRecallReport as Report } from '../../../lib/recallApi';
import { VinRecallReport } from '../vin/VinRecallReport';

/**
 * A customer's recalls: the same check as VIN Search — this car's model's
 * recalls from NHTSA, each matched to its repair orders. Checked when the tab is
 * opened, not stored. Needs the full VIN; a tail alone can't be looked up.
 */
export function CustomerRecalls({ vin, vinLast8 }: { vin?: string; vinLast8?: string }) {
  const fullVin = String(vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fullVin.length !== 17) return;
    let active = true;
    setLoading(true);
    setError(null);
    setReport(null);
    fetchVinRecalls(fullVin)
      .then((r) => active && setReport(r))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Recalls could not be checked.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fullVin]);

  if (fullVin.length !== 17) {
    return (
      <section className="card-base px-4 py-4">
        <p className="text-sm font-semibold">Recalls need the full VIN</p>
        <p className="crm-label mt-1">
          {vinLast8 ? `This profile only has the last 8 (…${vinLast8}). ` : 'This profile has no VIN. '}
          Add all 17 characters under Edit to check its recalls.
        </p>
      </section>
    );
  }

  return <VinRecallReport report={report} loading={loading} error={error} />;
}

export default CustomerRecalls;
