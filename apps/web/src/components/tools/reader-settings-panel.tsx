'use client';
import {
  READER_RANGES,
  READER_THEMES,
  type ReaderSettings,
  type ReaderTheme,
} from '@couchlist/shared';

/**
 * The Customize panel.
 *
 * Grouped by what somebody is actually trying to fix — how it moves, how big
 * it is, how it looks — rather than by the shape of the settings object. The
 * labels say what changes, not what the property is called.
 */
export function ReaderSettingsPanel({
  settings,
  onChange,
  onReset,
  onClose,
}: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Reader settings"
      className="border-b border-line bg-bg/60 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="m-0 text-[14px] font-bold">Customize</h3>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onReset} className="cl-touch cl-pill rounded-pill border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-text">
            Reset
          </button>
          <button type="button" onClick={onClose} className="cl-touch cl-pill rounded-pill border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-text">
            Done
          </button>
        </div>
      </div>

      <Group title="Reading">
        <Choice
          label="Fit"
          value={settings.fit}
          options={[
            ['width', 'Fit width'],
            ['height', 'Fit height'],
            ['original', 'Original size'],
          ]}
          onPick={(fit) => onChange({ fit: fit as ReaderSettings['fit'] })}
        />
        <Toggle
          label="Two pages side by side"
          hint="Page mode only"
          checked={settings.spread}
          onChange={(spread) => onChange({ spread })}
        />
        {settings.spread ? (
          <Toggle
            label="First page on its own"
            hint="Keeps later spreads lined up, like a printed book"
            checked={settings.coverAlone}
            onChange={(coverAlone) => onChange({ coverAlone })}
          />
        ) : null}
        <Toggle
          label="Reduce motion"
          hint="Jump between pages instead of animating"
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => onChange({ reduceMotion })}
        />
      </Group>

      <Group title="Size and spacing">
        <Range label="Page width" unit="px" field="width" settings={settings} onChange={onChange} />
        <Range label="Zoom" unit="%" field="zoom" settings={settings} onChange={onChange} />
        <Range label="Gap between pages" unit="px" field="gap" settings={settings} onChange={onChange} />
        <Range label="Space around pages" unit="px" field="margin" settings={settings} onChange={onChange} />
      </Group>

      <Group title="Appearance">
        <Choice
          label="Theme"
          value={settings.theme}
          options={READER_THEMES.map((theme) => [theme, THEME_LABEL[theme]] as const)}
          onPick={(theme) => onChange({ theme: theme as ReaderTheme })}
        />
        {settings.theme === 'custom' ? (
          <Colour
            label="Background"
            value={settings.background}
            onChange={(background) => onChange({ background })}
          />
        ) : null}
        <Colour label="Accent" value={settings.accent} onChange={(accent) => onChange({ accent })} />
        <Range label="Brightness" unit="%" field="brightness" settings={settings} onChange={onChange} />
        <Range label="Contrast" unit="%" field="contrast" settings={settings} onChange={onChange} />
      </Group>

      <Group title="Hands-free">
        <Range
          label="Auto-scroll speed"
          unit="px/s"
          field="autoScrollSpeed"
          settings={settings}
          onChange={onChange}
        />
        <p className="m-0 text-[12px] text-muted/80">
          Auto-scroll runs in long strip mode. Press space or tap Auto-scroll to stop.
        </p>
      </Group>
    </section>
  );
}

const THEME_LABEL: Record<ReaderTheme, string> = {
  dark: 'Dark',
  light: 'Light',
  sepia: 'Sepia',
  custom: 'Pick my own',
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-muted/70">{title}</h4>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Range({
  label,
  unit,
  field,
  settings,
  onChange,
}: {
  label: string;
  unit: string;
  field: keyof typeof READER_RANGES;
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
}) {
  const [min, max] = READER_RANGES[field];
  const value = settings[field];

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted">
          {value}
          {unit === '%' ? '%' : ` ${unit}`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange({ [field]: Number(event.target.value) })}
        className="cl-range w-full min-w-0 accent-[var(--reader-accent)]"
      />
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-semibold">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onPick(key)}
            className={`cl-touch cl-pill rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold ${
              value === key
                ? 'border-transparent bg-selected text-selected-fg'
                : 'border-line text-muted hover:text-text'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] h-4 w-4 flex-none accent-[var(--reader-accent)]"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-semibold">{label}</span>
        {hint ? <span className="text-[12px] text-muted/80">{hint}</span> : null}
      </span>
    </label>
  );
}

function Colour({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2.5">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-12 flex-none cursor-pointer rounded-lg border border-line bg-bg"
      />
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="ml-auto font-mono text-[12px] uppercase text-muted">{value}</span>
    </label>
  );
}
