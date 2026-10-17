/**
 * A Date as YYYY-MM-DD on the local calendar.
 *
 * Its own file, free of Firebase, so the server can share the forecast math in
 * appointmentForecast without pulling the browser SDK along with it.
 */
export function toLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}
