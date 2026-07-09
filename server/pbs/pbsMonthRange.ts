/** Calendar month bounds in America/Los_Angeles (matches shop reporting). */
export function monthRangePacific(reference = new Date()): { start: string; end: string } {
  const todayPacific = reference.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const [year, month] = todayPacific.split('-');
  const yearNum = Number(year);
  const monthNum = Number(month);
  const lastDay = new Date(yearNum, monthNum, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}
