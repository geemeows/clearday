import { useEffect, useState } from "react";
import { FocusReadyNow } from "./FocusReadyNow";
import { MeetingCountdownNow } from "./MeetingCountdownNow";
import type { CountdownState, NowSignal } from "./MeetingCountdownNow";

type Props = {
  signal: NowSignal;
  onStartFocus?: () => void;
  onJoin?: () => void;
};

function useCountdown(targetIso: string): CountdownState {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(targetIso).getTime() - now;
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    mm: String(Math.floor(total / 60)).padStart(2, "0"),
    ss: String(total % 60).padStart(2, "0"),
    minutes: Math.floor(total / 60),
    pct: Math.max(0, Math.min(1, ms / (15 * 60_000))),
  };
}

export function NextUpHero({ signal, onStartFocus, onJoin }: Props) {
  const cd = useCountdown(signal.when);
  if (cd.minutes <= 30) {
    return (
      <MeetingCountdownNow
        signal={signal}
        cd={cd}
        onJoin={onJoin}
      />
    );
  }
  return (
    <FocusReadyNow
      signal={signal}
      cd={cd}
      onStartFocus={onStartFocus}
    />
  );
}
