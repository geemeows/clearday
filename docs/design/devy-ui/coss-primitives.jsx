// coss-primitives.jsx — shadcn/coss-style React primitives.
// Render via the css classes defined in tokens.css. No styled-components, no inline styles.
// Any component can be swapped in for the legacy `.btn` etc usages in Devy.

const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

// ---------- icon wrapper around lucide ----------
function Icon({ name, size = 14, strokeWidth = 1.75, className = "", style, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide) return;
    // create svg via lucide.createIcons on a clean wrapper
    const el = ref.current;
    el.innerHTML = "";
    const ic = window.lucide.icons?.[toPascal(name)] || window.lucide.icons?.[name];
    if (!ic) {
      // fallback dot
      el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>`;
      return;
    }
    const [tag, attrs, children] = ic;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.entries({ ...attrs, width: size, height: size, "stroke-width": strokeWidth, "aria-hidden": "true" }).forEach(([k, v]) => svg.setAttribute(k, v));
    children.forEach(([t, a]) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", t);
      Object.entries(a).forEach(([k, v]) => c.setAttribute(k, v));
      svg.appendChild(c);
    });
    el.appendChild(svg);
  }, [name, size, strokeWidth]);
  return <span ref={ref} className={`lucide ${className}`} style={style} {...rest} />;
}
function toPascal(s) { return s.split(/[-_]/g).map(w => w[0].toUpperCase() + w.slice(1)).join(""); }

// ---------- Button ----------
function Button({
  variant = "outline", size = "md", icon, iconRight, children,
  className = "", disabled, loading, asChild, ...rest
}) {
  const cls = [
    "btn",
    variant === "primary" && "btn-primary",
    variant === "secondary" && "btn-secondary",
    variant === "outline" && "btn-outline",
    variant === "ghost" && "btn-ghost",
    variant === "destructive" && "btn-destructive",
    size === "sm" && "btn-sm",
    size === "xs" && "btn-xs",
    size === "lg" && "btn-lg",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <Icon name="loader-2" className="animate-spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </button>
  );
}

// ---------- IconButton ----------
function IconButton({ icon, label, className = "", size, ...rest }) {
  const dim = size === "sm" ? 28 : 32;
  return (
    <button
      className={`btn-icon ${className}`}
      aria-label={label}
      title={label}
      style={{ width: dim, height: dim }}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 13 : 14} />
    </button>
  );
}

// ---------- Input ----------
function Input({ icon, className = "", invalid, ...rest }) {
  if (icon) {
    return (
      <div className={`relative ${className}`}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none", display: "inline-flex" }}>
          <Icon name={icon} />
        </span>
        <input className="coss-input" style={{ paddingLeft: 32 }} aria-invalid={invalid || undefined} {...rest} />
      </div>
    );
  }
  return <input className={`coss-input ${className}`} aria-invalid={invalid || undefined} {...rest} />;
}

// ---------- Select (native, coss-styled) ----------
function Select({ value, onChange, options, className = "", placeholder, disabled, ...rest }) {
  return (
    <select className={`coss-input ${className}`} value={value} onChange={e => onChange?.(e.target.value)} disabled={disabled} {...rest}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

// ---------- Switch ----------
function Switch({ checked, onCheckedChange, disabled, "aria-label": ariaLabel }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-checked={checked ? "true" : "false"}
      data-disabled={disabled ? "true" : undefined}
      className="coss-switch"
      disabled={disabled}
      onClick={e => { e.stopPropagation(); if (!disabled) onCheckedChange?.(!checked); }}
    />
  );
}

// ---------- Tabs ----------
function Tabs({ value, onValueChange, items, variant = "underline", className = "" }) {
  if (variant === "pill") {
    return (
      <div className={`coss-tabs-pill ${className}`}>
        {items.map(t => {
          const id = typeof t === "string" ? t : t.value;
          const label = typeof t === "string" ? t : t.label;
          return (
            <button key={id} className="coss-tab-pill" data-active={value === id ? "true" : "false"} onClick={() => onValueChange?.(id)}>
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className={`coss-tabs-list ${className}`}>
      {items.map(t => {
        const id = typeof t === "string" ? t : t.value;
        const label = typeof t === "string" ? t : t.label;
        const count = typeof t === "object" ? t.count : undefined;
        return (
          <button key={id} className="coss-tab" data-active={value === id ? "true" : "false"} onClick={() => onValueChange?.(id)}>
            {label}{count != null && <span className="ml-1.5 text-[11px] text-muted-foreground">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Card ----------
function Card({ className = "", children, ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}
function CardHeader({ className = "", children, ...rest }) {
  return <div className={`px-4 pt-4 pb-2 ${className}`} {...rest}>{children}</div>;
}
function CardContent({ className = "", children, ...rest }) {
  return <div className={`px-4 pb-4 ${className}`} {...rest}>{children}</div>;
}
function CardTitle({ className = "", children, ...rest }) {
  return <div className={`t-title-md ${className}`} {...rest}>{children}</div>;
}
function CardDescription({ className = "", children, ...rest }) {
  return <div className={`t-body-sm muted ${className}`} {...rest}>{children}</div>;
}

// ---------- Badge ----------
function Badge({ variant = "default", className = "", icon, children, ...rest }) {
  const styleMap = {
    default: { background: "var(--secondary)", color: "var(--secondary-foreground)" },
    outline: { background: "transparent", color: "var(--foreground)", borderColor: "var(--border)" },
    success: { background: "var(--good-soft)", color: "var(--good)", borderColor: "transparent" },
    warn: { background: "var(--warn-soft)", color: "var(--warn)", borderColor: "transparent" },
    danger: { background: "var(--danger-soft)", color: "var(--destructive)", borderColor: "transparent" },
  };
  return (
    <span className={`badge ${className}`} style={styleMap[variant]} {...rest}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

// ---------- Dialog ----------
function Dialog({ open, onOpenChange, children, className = "", width = 480 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onOpenChange?.(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", padding: 16 }}
      onClick={() => onOpenChange?.(false)}
    >
      <div
        className={`card ${className}`}
        style={{ width, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 48px rgba(0,0,0,0.2)" }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
function DialogHeader({ children, onClose, className = "" }) {
  return (
    <div className={`px-5 pt-5 pb-2 flex items-start gap-3 ${className}`}>
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && <IconButton icon="x" label="Close" onClick={onClose} size="sm" />}
    </div>
  );
}
function DialogTitle({ children, className = "" }) { return <div className={`t-title-md ${className}`}>{children}</div>; }
function DialogDescription({ children, className = "" }) { return <div className={`t-body-sm muted mt-1 ${className}`}>{children}</div>; }
function DialogBody({ children, className = "" }) { return <div className={`px-5 py-3 ${className}`}>{children}</div>; }
function DialogFooter({ children, className = "" }) {
  return <div className={`px-5 pb-5 pt-3 flex items-center justify-end gap-2 ${className}`}>{children}</div>;
}

// ---------- Tooltip (lightweight, hover) ----------
function Tooltip({ label, side = "top", children }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span style={{
          position: "absolute", bottom: side === "top" ? "calc(100% + 6px)" : undefined, top: side === "bottom" ? "calc(100% + 6px)" : undefined,
          left: "50%", transform: "translateX(-50%)",
          background: "var(--foreground)", color: "var(--background)",
          padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500,
          whiteSpace: "nowrap", zIndex: 50, pointerEvents: "none",
        }}>{label}</span>
      )}
    </span>
  );
}

// ---------- Separator ----------
function Separator({ className = "", orientation = "horizontal" }) {
  return <div className={className} role="separator" style={{
    background: "var(--border)",
    width: orientation === "vertical" ? 1 : "100%",
    height: orientation === "vertical" ? "100%" : 1,
  }} />;
}

// ---------- expose to other babel scripts ----------
Object.assign(window, {
  Icon, Button, IconButton, Input, Select, Switch, Tabs,
  Card, CardHeader, CardContent, CardTitle, CardDescription,
  Badge, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Tooltip, Separator,
});
