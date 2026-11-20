import type {
  InputSource,
  KeyCommand,
  KeyDefinition,
  KeyId,
  KeyboardInputEvent,
  KeyboardLayout,
  ModifierName,
  ModifierSnapshot,
} from '@/types/keyboard';
import { indexLayout } from './layouts/qwerty';

/**
 * The unified keyboard engine. Every input path (touch, pen, mouse, air) calls
 * `keyDown` / `keyUp` with a `holderId` (pointer id, fingertip id …). The
 * engine owns:
 *
 *  - press/release state and duplicate suppression (a held key cannot be
 *    pressed again by another holder until released)
 *  - modifiers: hold-to-chord, or tap-to-latch (one-shot) for Shift/Ctrl/Alt/Fn
 *  - Caps Lock
 *  - auto-repeat for repeatable keys
 *  - stuck-key recovery (`releaseAll`, `releaseHolder`, hold watchdog)
 *
 * It is framework-free and deterministic given injected timers, so it is
 * unit-tested directly.
 */

export interface PressOptions {
  source: InputSource;
  holderId: string;
  confidence?: number;
  timestamp?: number;
}

export interface RepeatConfig {
  delayMs: number;
  intervalMs: number;
  /** Sources allowed to auto-repeat. Air input should not repeat by default. */
  sources: InputSource[];
}

export interface EngineTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface KeyboardEngineOptions {
  layout: KeyboardLayout;
  repeat?: Partial<RepeatConfig>;
  /** Force-release a key held longer than this (stuck-key watchdog). 0 = off. */
  maxHoldMs?: number;
  now?: () => number;
  timers?: EngineTimers;
}

export interface EngineState {
  pressed: ReadonlySet<KeyId>;
  modifiers: ModifierSnapshot;
  /** Modifiers that are latched (one-shot) rather than physically held. */
  latched: ReadonlySet<ModifierName>;
}

interface Hold {
  key: KeyDefinition;
  holderId: string;
  source: InputSource;
  confidence: number;
  startedAt: number;
  /** Modifier holds: was another key pressed while this was down? */
  chorded: boolean;
  /** Modifier holds: was this modifier latched when the hold began? */
  wasLatched: boolean;
  repeatDelay?: unknown;
  repeatInterval?: unknown;
  watchdog?: unknown;
}

type EventListener = (event: KeyboardInputEvent) => void;
type StateListener = (state: EngineState) => void;

const DEFAULT_REPEAT: RepeatConfig = {
  delayMs: 450,
  intervalMs: 45,
  sources: ['TOUCH', 'PEN', 'MOUSE'],
};

const defaultTimers: EngineTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

const isLetter = (ch: string) => ch.length === 1 && ch.toLowerCase() !== ch.toUpperCase();

export class KeyboardEngine {
  private keys: Map<KeyId, KeyDefinition>;
  private holds = new Map<KeyId, Hold>();
  private holderIndex = new Map<string, KeyId>();
  private latched = new Set<ModifierName>();
  private caps = false;
  private repeat: RepeatConfig;
  private maxHoldMs: number;
  private now: () => number;
  private timers: EngineTimers;
  private eventListeners = new Set<EventListener>();
  private stateListeners = new Set<StateListener>();

  constructor(options: KeyboardEngineOptions) {
    this.keys = indexLayout(options.layout);
    this.repeat = { ...DEFAULT_REPEAT, ...options.repeat };
    this.maxHoldMs = options.maxHoldMs ?? 30_000;
    this.now = options.now ?? (() => performance.now());
    this.timers = options.timers ?? defaultTimers;
  }

  // ── configuration ──────────────────────────────────────────────────────

  setLayout(layout: KeyboardLayout): void {
    this.releaseAll('reset');
    this.keys = indexLayout(layout);
  }

  setRepeat(config: Partial<RepeatConfig>): void {
    this.repeat = { ...this.repeat, ...config };
  }

  getKey(id: KeyId): KeyDefinition | undefined {
    return this.keys.get(id);
  }

  // ── subscriptions ──────────────────────────────────────────────────────

  subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  getState(): EngineState {
    return {
      pressed: new Set(this.holds.keys()),
      modifiers: this.getModifiers(),
      latched: new Set(this.latched),
    };
  }

  getModifiers(): ModifierSnapshot {
    return {
      shift: this.isModifierActive('shift'),
      ctrl: this.isModifierActive('ctrl'),
      alt: this.isModifierActive('alt'),
      fn: this.isModifierActive('fn'),
      caps: this.caps,
    };
  }

  isHeld(id: KeyId): boolean {
    return this.holds.has(id);
  }

  // ── input ──────────────────────────────────────────────────────────────

  /** Returns true if the press was accepted, false if suppressed. */
  keyDown(id: KeyId, opts: PressOptions): boolean {
    const key = this.keys.get(id);
    if (!key) return false;

    // Duplicate suppression: a held key cannot be pressed again.
    if (this.holds.has(id)) return false;

    // A holder (one pointer / one fingertip) holds at most one key.
    const previous = this.holderIndex.get(opts.holderId);
    if (previous !== undefined) this.release(previous, 'cancel');

    const timestamp = opts.timestamp ?? this.now();
    const confidence = clamp01(opts.confidence ?? 1);
    const hold: Hold = {
      key,
      holderId: opts.holderId,
      source: opts.source,
      confidence,
      startedAt: timestamp,
      chorded: false,
      wasLatched: key.modifier ? this.latched.has(key.modifier) : false,
    };
    this.holds.set(id, hold);
    this.holderIndex.set(opts.holderId, id);

    if (this.maxHoldMs > 0) {
      hold.watchdog = this.timers.setTimeout(() => this.release(id, 'cancel'), this.maxHoldMs);
    }

    this.emit(this.makeEvent(hold, 'KEY_DOWN', timestamp, { repeat: false }));

    if (key.kind === 'modifier') {
      // Pressing a modifier while another key is held does not chord it.
    } else if (key.kind === 'toggle') {
      this.caps = !this.caps;
    } else {
      this.markHeldModifiersChorded();
      this.press(hold, timestamp, false);
      this.consumeLatched();
      this.scheduleRepeat(id, hold);
    }

    this.emitState();
    return true;
  }

  keyUp(id: KeyId, opts?: Partial<PressOptions>): boolean {
    const hold = this.holds.get(id);
    if (!hold) return false;
    if (opts?.holderId !== undefined && opts.holderId !== hold.holderId) return false;
    this.release(id, 'release', opts?.timestamp);
    return true;
  }

  /** Release whatever key a holder (pointer / fingertip) is holding. */
  releaseHolder(holderId: string, reason: KeyboardInputEvent['metadata']['reason'] = 'release'): void {
    const id = this.holderIndex.get(holderId);
    if (id !== undefined) this.release(id, reason);
  }

  /** Release every held key (window blur, tracking lost, mode switch …). */
  releaseAll(reason: KeyboardInputEvent['metadata']['reason'] = 'reset', source?: InputSource): void {
    for (const [id, hold] of [...this.holds]) {
      if (source && hold.source !== source) continue;
      this.release(id, reason);
    }
  }

  /** Clear latched modifiers and Caps Lock. */
  resetModifiers(): void {
    this.latched.clear();
    this.caps = false;
    this.emitState();
  }

  dispose(): void {
    this.releaseAll('reset');
    this.eventListeners.clear();
    this.stateListeners.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────

  private release(id: KeyId, reason: KeyboardInputEvent['metadata']['reason'], timestamp?: number): void {
    const hold = this.holds.get(id);
    if (!hold) return;
    this.clearTimers(hold);
    this.holds.delete(id);
    if (this.holderIndex.get(hold.holderId) === id) this.holderIndex.delete(hold.holderId);

    const mod = hold.key.modifier;
    if (mod && reason === 'release' && !hold.chorded) {
      // A clean tap toggles the latch: tap once = one-shot, tap again = cancel.
      if (hold.wasLatched) this.latched.delete(mod);
      else this.latched.add(mod);
    }

    this.emit(this.makeEvent(hold, 'KEY_UP', timestamp ?? this.now(), { repeat: false, reason }));
    this.emitState();
  }

  private press(hold: Hold, timestamp: number, repeat: boolean): void {
    const modifiers = this.getModifiers();
    const { key } = hold;
    let value: string | undefined;
    let command: KeyCommand | undefined;

    if (modifiers.fn && key.fn) {
      command = key.fn.command;
    } else if (key.kind === 'char' && key.char !== undefined) {
      const base = key.char;
      if (isLetter(base)) {
        value = modifiers.shift !== modifiers.caps ? base.toUpperCase() : base.toLowerCase();
      } else {
        value = modifiers.shift ? (key.shiftChar ?? base) : base;
      }
    } else if (key.kind === 'action') {
      command = key.command;
    }

    this.emit(
      this.makeEvent(hold, 'KEY_PRESS', timestamp, {
        repeat,
        ...(value !== undefined ? { value } : {}),
        ...(command !== undefined ? { command } : {}),
        modifiers,
      }),
    );
  }

  private scheduleRepeat(id: KeyId, hold: Hold): void {
    if (!hold.key.repeatable || !this.repeat.sources.includes(hold.source)) return;
    hold.repeatDelay = this.timers.setTimeout(() => {
      hold.repeatDelay = undefined;
      hold.repeatInterval = this.timers.setInterval(() => {
        if (this.holds.get(id) !== hold) return;
        this.press(hold, this.now(), true);
      }, this.repeat.intervalMs);
    }, this.repeat.delayMs);
  }

  private clearTimers(hold: Hold): void {
    if (hold.repeatDelay !== undefined) this.timers.clearTimeout(hold.repeatDelay);
    if (hold.repeatInterval !== undefined) this.timers.clearInterval(hold.repeatInterval);
    if (hold.watchdog !== undefined) this.timers.clearTimeout(hold.watchdog);
    hold.repeatDelay = hold.repeatInterval = hold.watchdog = undefined;
  }

  private isModifierActive(mod: ModifierName): boolean {
    if (this.latched.has(mod)) return true;
    for (const hold of this.holds.values()) if (hold.key.modifier === mod) return true;
    return false;
  }

  private markHeldModifiersChorded(): void {
    for (const hold of this.holds.values()) if (hold.key.modifier) hold.chorded = true;
  }

  private consumeLatched(): void {
    // One-shot latches are spent by the first real key press. A modifier that
    // is also physically held stays active through its hold.
    this.latched.clear();
  }

  private makeEvent(
    hold: Hold,
    action: KeyboardInputEvent['action'],
    timestamp: number,
    meta: Partial<KeyboardInputEvent['metadata']> & { repeat: boolean },
  ): KeyboardInputEvent {
    return {
      key: hold.key.id,
      source: hold.source,
      action,
      timestamp,
      confidence: hold.confidence,
      metadata: {
        modifiers: meta.modifiers ?? this.getModifiers(),
        holderId: hold.holderId,
        inputTimestamp: hold.startedAt,
        ...meta,
      },
    };
  }

  private emit(event: KeyboardInputEvent): void {
    for (const l of this.eventListeners) l(event);
  }

  private emitState(): void {
    if (this.stateListeners.size === 0) return;
    const state = this.getState();
    for (const l of this.stateListeners) l(state);
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
