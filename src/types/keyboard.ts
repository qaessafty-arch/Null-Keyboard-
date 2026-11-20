/**
 * Shared keyboard types. Every input path (touch, pen, mouse, air) is reduced
 * to these before anything else in the app sees it.
 */

export type InputSource = 'AIR' | 'TOUCH' | 'PEN' | 'MOUSE';

export type KeyAction = 'KEY_DOWN' | 'KEY_UP' | 'KEY_PRESS';

/** Logical key identifier, e.g. "KeyA", "Digit1", "ShiftLeft", "Backspace". */
export type KeyId = string;

export type ModifierName = 'shift' | 'ctrl' | 'alt' | 'fn';

export interface ModifierSnapshot {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  fn: boolean;
  caps: boolean;
}

export type KeyKind = 'char' | 'modifier' | 'toggle' | 'action';

/**
 * Non-character actions the text output understands. Keys that have no
 * meaning inside the built-in editor (F1–F12, Escape) still produce events so a
 * future native companion can forward them.
 */
export type KeyCommand =
  | 'Backspace'
  | 'Delete'
  | 'Enter'
  | 'Tab'
  | 'Escape'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | `F${number}`;

export interface FnOverride {
  label: string;
  command: KeyCommand;
}

export interface KeyDefinition {
  id: KeyId;
  kind: KeyKind;
  /** Legend shown on the key (unshifted). */
  label: string;
  /** Secondary legend (shifted symbol), drawn small in the corner. */
  shiftLabel?: string;
  /** Character produced (unshifted). Only for kind === 'char'. */
  char?: string;
  /** Character produced with Shift. Letters derive this from `char`. */
  shiftChar?: string;
  /** For kind === 'action'. */
  command?: KeyCommand;
  /** For kind === 'modifier'. */
  modifier?: ModifierName;
  /** Width in key units (1u = standard key). */
  width: number;
  /** Behaviour while the Fn layer is active. */
  fn?: FnOverride;
  /** Whether holding the key auto-repeats. */
  repeatable?: boolean;
  /** Accessible name when the label is a symbol. */
  ariaLabel?: string;
}

export type KeyboardRow = KeyDefinition[];

export interface KeyboardLayout {
  id: string;
  name: string;
  /** Total width of the widest row in units, used for responsive sizing. */
  unitsWide: number;
  rows: KeyboardRow[];
}

export interface KeyboardInputEvent {
  key: KeyId;
  source: InputSource;
  action: KeyAction;
  /** `performance.now()` timebase (same as `PointerEvent.timeStamp`). */
  timestamp: number;
  /** 0..1. Pointer input is 1; air input reports detector confidence. */
  confidence: number;
  metadata: {
    /** Resolved character for KEY_PRESS on character keys (after Shift/Caps). */
    value?: string;
    /** Resolved command for KEY_PRESS on action keys (after Fn). */
    command?: KeyCommand;
    modifiers: ModifierSnapshot;
    /** True for auto-repeat presses. */
    repeat: boolean;
    /** Pointer id / fingertip id that owns the hold. */
    holderId?: string;
    /** Original input timestamp, for latency measurement. */
    inputTimestamp?: number;
    /** Why a KEY_UP happened if not a normal release. */
    reason?: 'release' | 'cancel' | 'blur' | 'tracking-lost' | 'reset';
  };
}
