// Per-event routing matrix (per PRD #29 mockup #2 / issue #41).
//
// Pure presentational table: rows are signal kinds, columns are alert
// channels. Parent owns `value` and gets `onToggle(kind, channel)` once per
// click — the component never mutates the prop.

import { Checkbox } from "#/components/ui/checkbox";

export type MatrixKind = { id: string; label: string };
export type MatrixChannel = { id: string; label: string };
export type MatrixValue = Record<string, Record<string, boolean>>;

export type NotificationMatrixProps = {
  kinds: ReadonlyArray<MatrixKind>;
  channels: ReadonlyArray<MatrixChannel>;
  value: MatrixValue;
  onToggle: (kind: string, channel: string) => void;
};

export function NotificationMatrix({
  kinds,
  channels,
  value,
  onToggle,
}: NotificationMatrixProps) {
  return (
    <table
      aria-label="Per-event notification routing"
      className="w-full text-sm"
    >
      <thead>
        <tr className="border-border border-b">
          <th className="py-2 pr-4 text-left font-medium text-muted-foreground text-xs">
            Event
          </th>
          {channels.map((c) => (
            <th
              key={c.id}
              scope="col"
              className="px-2 py-2 text-center font-medium text-muted-foreground text-xs"
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {kinds.map((k) => (
          <tr key={k.id} className="border-border border-b last:border-0">
            <th scope="row" className="py-2 pr-4 text-left font-normal text-sm">
              {k.label}
            </th>
            {channels.map((c) => {
              const checked = value[k.id]?.[c.id] ?? false;
              return (
                <td key={c.id} className="px-2 py-2 text-center">
                  <Checkbox
                    aria-label={`${k.label} via ${c.label}`}
                    checked={checked}
                    onCheckedChange={() => onToggle(k.id, c.id)}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
