import React, { useEffect, useState } from 'react';
import {
  combinePromiseDateAndTime,
  splitPromiseTimeIso,
  validatePromiseDateAndTime,
} from '../../../lib/dispatchPromiseTime';
import { DispatchPromiseTimeInput } from './DispatchPromiseTimeInput';

interface CardPromiseTimeEditorProps {
  promiseTimeAt?: string;
  onSave: (promiseTimeAt: string | null) => void;
}

export function CardPromiseTimeEditor({ promiseTimeAt, onSave }: CardPromiseTimeEditorProps) {
  const split = splitPromiseTimeIso(promiseTimeAt);
  const [date, setDate] = useState(split.date);
  const [time, setTime] = useState(split.time);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = splitPromiseTimeIso(promiseTimeAt);
    setDate(next.date);
    setTime(next.time);
    setError(null);
  }, [promiseTimeAt]);

  const commit = (nextDate: string, nextTime: string) => {
    if (!nextDate.trim() && !nextTime.trim()) {
      setError(null);
      onSave(null);
      return;
    }

    const validation = validatePromiseDateAndTime(nextDate, nextTime);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid promise time.');
      return;
    }

    setError(null);
    onSave(combinePromiseDateAndTime(nextDate, nextTime)!);
  };

  return (
    <DispatchPromiseTimeInput
      date={date}
      time={time}
      onDateChange={(value) => {
        setDate(value);
        commit(value, time);
      }}
      onTimeChange={(value) => {
        setTime(value);
        commit(date, value);
      }}
      error={error}
      compact
      showHint={false}
    />
  );
}
