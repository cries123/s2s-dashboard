import React from 'react';
import { CalendarDays, Clock, DollarSign, Package, Users, Wrench } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../context/ToastContext';
import { Panel } from '../../ui/Panel';
import { KpiStrip } from '../../ui/KpiStrip';
import { CardNotice, CardNoticeRow } from '../../ui/CardNotice';
import {
  computeFixedOpsForecast,
  emptyFixedOpsForecastInputs,
  mixPercentTotal,
  weekdayCountsForMonth,
  withWeekdayCounts,
  WEEKDAYS,
  type FixedOpsForecastInputs,
  type Weekday,
} from '../../../lib/fixedOpsForecastModel';
import { monthKeyLabel, monthKeyOf } from '../../../lib/operationsMonthKeys';

/**
 * The Fixed Operations Forecast, laid out as the store's spreadsheet.
 *
 * Same sections in the same order, and every cell the workbook colours orange is
 * a box you can type in — nothing else is editable, because everything else is
 * worked out from what you type. The arithmetic itself lives in
 * fixedOpsForecastModel.ts, which is tested against the workbook's own printed
 * totals to the cent.
 */

const money = (n: number): string =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const money2 = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (n: number): string => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

/** A number box. Empty stays empty while typing instead of snapping back to 0. */
function NumBox({
  value,
  onChange,
  label,
  suffix,
  prefix,
  step = 'any',
  width = 'w-20',
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  suffix?: string;
  prefix?: string;
  step?: string;
  width?: string;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '');
  return (
    <span className="inline-flex items-center gap-1">
      {prefix ? <span className="crm-label">{prefix}</span> : null}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        aria-label={label}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(Number(e.target.value) || 0);
        }}
        onBlur={() => setDraft(null)}
        className={`input-field ${width} px-2 py-1.5 text-right text-sm tabular-nums`}
      />
      {suffix ? <span className="crm-label">{suffix}</span> : null}
    </span>
  );
}

/** Label on the left, value on the right — the computed rows. */
function OutRow({
  label,
  value,
  strong,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="list-row min-h-0 py-2.5">
      <span className="flex-1 min-w-0">
        <span className={strong ? 'text-sm font-semibold' : 'text-sm'} style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
        {hint ? <span className="crm-label block mt-0.5">{hint}</span> : null}
      </span>
      <span className={`text-right tabular-nums ${strong ? 'text-base font-semibold' : 'text-sm font-medium'}`}>
        {value}
      </span>
    </div>
  );
}

/** A row that holds input boxes, stacked on a phone and in line on a desktop. */
function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--color-row-divider)' }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-sm min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
        <span className="flex flex-wrap items-center gap-2 justify-end">{children}</span>
      </div>
    </div>
  );
}

interface ForecastWorkbookProps {
  currentDealershipId?: string;
}

export default function ForecastWorkbook({ currentDealershipId = 'hyundai' }: ForecastWorkbookProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [inputs, setInputs] = React.useState<FixedOpsForecastInputs>(() => emptyFixedOpsForecastInputs());
  const [loading, setLoading] = React.useState(true);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  /**
   * The month being forecast. A forecast is made for the month ahead, so that is
   * what this opens on; the dropdown holds the months either side of it.
   */
  const [forecastMonth, setForecastMonth] = React.useState(() => {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    return monthKeyOf(next);
  });

  const monthOptions = React.useMemo(() => {
    const out: string[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - 2);
    for (let i = 0; i < 6; i++) {
      out.push(monthKeyOf(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, []);

  const docId = React.useMemo(() => {
    const base = currentDealershipId === 'hyundai' ? 'forecastWorkbook' : `forecastWorkbook_${currentDealershipId}`;
    return `${base}_${forecastMonth}`;
  }, [currentDealershipId, forecastMonth]);

  // Each month is its own document, so last month's plan stays readable after
  // this month's is written — the thing the single live document never allowed.
  React.useEffect(() => {
    if (!user) return;
    setLoading(true);
    const ref = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (data?.inputs) setInputs(data.inputs as FixedOpsForecastInputs);
        setSavedAt(typeof data?.updatedAt === 'string' ? data.updatedAt : null);
        setLoading(false);
      },
      (err) => {
        console.error('[Forecast workbook] load failed:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user, docId]);

  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<FixedOpsForecastInputs | null>(null);
  /** One complaint per outage, not one per keystroke. */
  const warnedRef = React.useRef(false);

  const writeNow = React.useCallback(
    async (next: FixedOpsForecastInputs) => {
      if (!user) return;
      const ref = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
      try {
        await setDoc(
          ref,
          {
            inputs: next,
            dealershipId: currentDealershipId,
            forecastMonth,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
          },
          { merge: true }
        );
        warnedRef.current = false;
      } catch (err) {
        console.error('[Forecast workbook] save failed:', err);
        if (!warnedRef.current) {
          warnedRef.current = true;
          showToast('Could not save the forecast. Check your connection.', 'error');
        }
      }
    },
    [user, docId, currentDealershipId, forecastMonth, showToast]
  );

  /**
   * Save shortly after typing stops rather than on every character. Typing
   * "132.99" into a rate is six keystrokes, and a write each time is six
   * documents' worth of traffic and, if the network is down, six identical
   * complaints on screen.
   */
  const save = React.useCallback(
    (next: FixedOpsForecastInputs) => {
      pending.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const queued = pending.current;
        pending.current = null;
        if (queued) void writeNow(queued);
      }, 700);
    },
    [writeNow]
  );

  // Don't lose the last keystroke when the tab or month changes.
  React.useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pending.current) void writeNow(pending.current);
    },
    [writeNow]
  );

  /** Every box goes through here: update on screen, then store it. */
  const edit = React.useCallback(
    (mutate: (draft: FixedOpsForecastInputs) => void) => {
      setInputs((prev) => {
        const next: FixedOpsForecastInputs = JSON.parse(JSON.stringify(prev));
        mutate(next);
        save(next);
        return next;
      });
    },
    [save]
  );

  const result = React.useMemo(() => computeFixedOpsForecast(inputs), [inputs]);
  const mixTotal = mixPercentTotal(inputs.labor);
  const mixIsOff = Math.abs(mixTotal - 100) > 0.01;

  const fillFromCalendar = () => {
    const counts = weekdayCountsForMonth(forecastMonth);
    const next = withWeekdayCounts(inputs, counts);
    setInputs(next);
    save(next);
    showToast(`Weekday counts filled in for ${monthKeyLabel(forecastMonth)}.`, 'success');
  };

  if (loading) {
    return <p className="crm-label px-4 py-10 text-center">Loading the forecast…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="card-base p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="crm-label shrink-0" htmlFor="forecast-month">
          Forecast for
        </label>
        <select
          id="forecast-month"
          value={forecastMonth}
          onChange={(e) => setForecastMonth(e.target.value)}
          className="input-field min-h-[44px] px-2 text-sm"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthKeyLabel(m)}
            </option>
          ))}
        </select>
        <span className="crm-label flex-1 min-w-0">
          {savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : 'Nothing saved for this month yet'}
        </span>
      </div>

      <CardNoticeRow>
        <CardNotice tone="info" summary="How this works">
          Type into the boxes; everything else is worked out from them, the same
          way the forecast spreadsheet does it. Each month is saved separately, so
          last month's plan stays readable once this one is written.
        </CardNotice>
        {mixIsOff && (
          <CardNotice tone="warn" summary={`Pay type mix adds up to ${pct(mixTotal)}`}>
            The mix decides how the projected hours are split, so it needs to come
            to 100%. At {pct(mixTotal)} the forecast is {mixTotal < 100 ? 'light' : 'heavy'} by{' '}
            {pct(Math.abs(100 - mixTotal))} of the hours.
          </CardNotice>
        )}
      </CardNoticeRow>

      <KpiStrip
        columns={4}
        tiles={[
          { label: 'Net projected hours', value: hrs(result.totalNetProjectedHours), sublabel: 'To sell', subvalue: `${hrs(result.totalMonthlyHoursAvailable)} available` },
          { label: 'Labor sales', value: money(result.totalLaborSales), sublabel: 'ELR', subvalue: money2(result.totalElr) },
          { label: 'Total parts', value: money(result.totalPartsSales), sublabel: 'GP', subvalue: pct(result.partsGpPercent) },
          { label: 'Fixed ops total', value: money(result.fixedOpsSales), sublabel: 'Gross', subvalue: money(result.fixedOpsGross) },
        ]}
      />

      {/* 1. Capacity ------------------------------------------------------- */}
      <Panel title="Technician capacity" icon={Users} action={{ label: 'Fill month', onClick: fillFromCalendar }}>
        {WEEKDAYS.map((day: Weekday) => (
          <EditRow key={day} label={day}>
            <NumBox
              label={`${day} — days in month`}
              value={inputs.capacity[day].daysInMonth}
              onChange={(v) => edit((d) => { d.capacity[day].daysInMonth = v; })}
              prefix="Days"
              width="w-16"
            />
            <NumBox
              label={`${day} — technicians available`}
              value={inputs.capacity[day].techsAvailable}
              onChange={(v) => edit((d) => { d.capacity[day].techsAvailable = v; })}
              prefix="Techs"
              width="w-16"
            />
            <NumBox
              label={`${day} — hours each`}
              value={inputs.capacity[day].hoursEach}
              onChange={(v) => edit((d) => { d.capacity[day].hoursEach = v; })}
              prefix="Hrs each"
              width="w-16"
            />
            <span className="text-sm font-semibold tabular-nums w-16 text-right">
              {hrs(result.hoursAvailableByWeekday[day])}
            </span>
          </EditRow>
        ))}
        <OutRow label="Total monthly hours available" value={hrs(result.totalMonthlyHoursAvailable)} strong />
      </Panel>

      {/* 2. Hours --------------------------------------------------------- */}
      <Panel title="Projected hours" icon={Clock} tone="teal">
        <EditRow label="Absenteeism">
          <NumBox
            label="Absenteeism percentage"
            value={inputs.absenteeismPercent}
            onChange={(v) => edit((d) => { d.absenteeismPercent = v; })}
            suffix="%"
            width="w-16"
          />
        </EditRow>
        <OutRow label="Lost hours" value={hrs(result.lostHours)} />
        <OutRow label="Total projected hours" value={hrs(result.totalProjectedHours)} />
        <EditRow label="Efficiency forecast">
          <NumBox
            label="Efficiency percentage"
            value={inputs.efficiencyPercent}
            onChange={(v) => edit((d) => { d.efficiencyPercent = v; })}
            suffix="%"
            width="w-16"
          />
        </EditRow>
        <OutRow label="Total net projected hours" value={hrs(result.totalNetProjectedHours)} strong hint="Every hour below is a share of this" />
      </Panel>

      {/* 3. Labor --------------------------------------------------------- */}
      <Panel title="Labor by pay type" icon={Wrench} tone="violet">
        {inputs.labor.map((line, i) => {
          const computed = result.laborLines[i];
          return (
            <div key={line.key} className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--color-row-divider)' }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{line.label}</span>
                <span className="text-sm font-semibold tabular-nums">{money(computed.sales)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <NumBox
                  label={`${line.label} — mix percentage`}
                  value={line.mixPercent}
                  onChange={(v) => edit((d) => { d.labor[i].mixPercent = v; })}
                  prefix="Mix"
                  suffix="%"
                  width="w-16"
                />
                <NumBox
                  label={`${line.label} — effective labor rate`}
                  value={line.elr}
                  onChange={(v) => edit((d) => { d.labor[i].elr = v; })}
                  prefix="ELR $"
                  width="w-20"
                />
                <NumBox
                  label={`${line.label} — gross profit percentage`}
                  value={line.gpPercent}
                  onChange={(v) => edit((d) => { d.labor[i].gpPercent = v; })}
                  prefix="GP"
                  suffix="%"
                  width="w-16"
                />
              </div>
              <p className="crm-label mt-1.5">
                {hrs(computed.hours)} hours · {money(computed.gross)} gross
              </p>
            </div>
          );
        })}
        <OutRow label="Total labor sales" value={money2(result.totalLaborSales)} strong hint={`${hrs(result.totalLaborHours)} hours · ${pct(result.laborGpPercent)} GP · ${money2(result.totalElr)} ELR`} />
      </Panel>

      {/* 4. Service total ------------------------------------------------- */}
      <Panel title="Sublet and service total" icon={DollarSign} tone="amber">
        <EditRow label="Sublet">
          <NumBox
            label="Sublet sales"
            value={inputs.sublet.sales}
            onChange={(v) => edit((d) => { d.sublet.sales = v; })}
            prefix="$"
            width="w-24"
          />
          <NumBox
            label="Sublet gross profit percentage"
            value={inputs.sublet.gpPercent}
            onChange={(v) => edit((d) => { d.sublet.gpPercent = v; })}
            prefix="GP"
            suffix="%"
            width="w-16"
          />
        </EditRow>
        <OutRow label="Sublet gross" value={money(result.sublet.gross)} />
        <EditRow label="Unapplied time">
          <NumBox
            label="Unapplied time cost"
            value={inputs.unappliedTime}
            onChange={(v) => edit((d) => { d.unappliedTime = v; })}
            prefix="$"
            width="w-24"
          />
        </EditRow>
        <OutRow label="Total service sales" value={money2(result.totalServiceSales)} />
        <OutRow label="Total service gross" value={money2(result.totalServiceGross)} hint={pct(result.serviceGpPercent)} />
        <OutRow label="Adjusted service gross" value={money2(result.adjustedServiceGross)} strong hint="After unapplied time" />
      </Panel>

      {/* 5. Parts --------------------------------------------------------- */}
      <Panel title="Parts, priced off labor" icon={Package} tone="slate">
        {inputs.parts.map((line, i) => {
          const computed = result.partsLines[i];
          return (
            <EditRow key={line.key} label={line.label}>
              <NumBox
                label={`${line.label} — parts to labor ratio`}
                value={line.partsToLaborRatio}
                onChange={(v) => edit((d) => { d.parts[i].partsToLaborRatio = v; })}
                prefix="× labor"
                width="w-16"
              />
              <NumBox
                label={`${line.label} — gross profit percentage`}
                value={line.gpPercent}
                onChange={(v) => edit((d) => { d.parts[i].gpPercent = v; })}
                prefix="GP"
                suffix="%"
                width="w-16"
              />
              <span className="text-sm font-semibold tabular-nums w-24 text-right">{money(computed.sales)}</span>
            </EditRow>
          );
        })}
        {inputs.partsDirect.map((line, i) => (
          <EditRow key={line.key} label={line.label}>
            <NumBox
              label={`${line.label} — sales`}
              value={line.sales}
              onChange={(v) => edit((d) => { d.partsDirect[i].sales = v; })}
              prefix="$"
              width="w-24"
            />
            <NumBox
              label={`${line.label} — gross profit percentage`}
              value={line.gpPercent}
              onChange={(v) => edit((d) => { d.partsDirect[i].gpPercent = v; })}
              prefix="GP"
              suffix="%"
              width="w-16"
            />
          </EditRow>
        ))}
        <OutRow label="Parts shop sales" value={money2(result.partsShopSales)} hint={`${money(result.partsShopGross)} gross · ${pct(result.partsShopGpPercent)}`} />
      </Panel>

      {/* 6. Counter ------------------------------------------------------- */}
      <Panel title="Counter, wholesale and accessories" icon={CalendarDays} tone="rose">
        {inputs.counter.map((line, i) => (
          <EditRow key={line.key} label={line.label}>
            <NumBox
              label={`${line.label} — sales`}
              value={line.sales}
              onChange={(v) => edit((d) => { d.counter[i].sales = v; })}
              prefix="$"
              width="w-24"
            />
            <NumBox
              label={`${line.label} — gross profit percentage`}
              value={line.gpPercent}
              onChange={(v) => edit((d) => { d.counter[i].gpPercent = v; })}
              prefix="GP"
              suffix="%"
              width="w-16"
            />
          </EditRow>
        ))}
        <OutRow label="Total parts sales" value={money2(result.totalPartsSales)} hint={`${money(result.totalPartsGross)} gross · ${pct(result.partsGpPercent)}`} strong />
      </Panel>

      {/* 7. The bottom line ---------------------------------------------- */}
      <Panel title="Fixed operations total" icon={DollarSign}>
        <OutRow label="Sales" value={money2(result.fixedOpsSales)} strong />
        <OutRow label="Gross profit" value={money2(result.fixedOpsGross)} strong hint={pct(result.fixedOpsGpPercent)} />
      </Panel>
    </div>
  );
}
