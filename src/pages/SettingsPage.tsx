import { useState } from 'react';
import { Button, Segmented, SelectField, Slider, Toggle } from '@/components/common/Controls';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Icon } from '@/components/common/Icon';
import { useSettings, type CameraResolution, type Orientation, type QualityMode, type ThemeId, type InputMode } from '@/stores/settingsStore';
import { LAYOUTS } from '@/features/keyboard-engine/layouts/qwerty';
import { useFullscreen } from '@/hooks/useFullscreen';
import { notify } from '@/stores/noticeStore';

type Tab = 'general' | 'air' | 'touch' | 'performance' | 'privacy';

const AIR_NOTE = 'Stored now; used by the Air Mode tracker when it ships (Stage 4–5).';

export function SettingsPage() {
  const s = useSettings();
  const [tab, setTab] = useState<Tab>('general');
  const [confirmReset, setConfirmReset] = useState(false);
  const fullscreen = useFullscreen();

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow">Preferences</p>
        <h1>Settings</h1>
        <p className="muted page__lead">Saved on this device only (browser local storage).</p>
      </header>

      <Segmented<Tab>
        label="Settings section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'general', label: 'General' },
          { value: 'touch', label: 'Touch' },
          { value: 'air', label: 'Air' },
          { value: 'performance', label: 'Performance' },
          { value: 'privacy', label: 'Privacy' },
        ]}
      />

      {tab === 'general' && (
        <section className="panel settings" aria-label="General settings">
          <SelectField<InputMode>
            label="Default mode"
            hint="Mode selected when NEO TYPE opens."
            value={s.general.defaultMode}
            onChange={(v) => s.update('general', { defaultMode: v })}
            options={[
              { value: 'touch', label: 'Touch Mode' },
              { value: 'air', label: 'Air Mode' },
            ]}
          />
          <SelectField<ThemeId>
            label="Theme"
            value={s.general.theme}
            onChange={(v) => s.update('general', { theme: v })}
            options={[
              { value: 'laser', label: 'Laser (red)' },
              { value: 'holo', label: 'Holo (cyan + red)' },
            ]}
          />
          <SelectField
            label="Keyboard layout"
            value={s.general.layout}
            onChange={(v) => s.update('general', { layout: v })}
            options={Object.values(LAYOUTS).map((l) => ({ value: l.id, label: l.name }))}
          />
          <SelectField
            label="Language"
            hint="Interface language. More languages are on the roadmap."
            value={s.general.language}
            onChange={(v) => s.update('general', { language: v })}
            options={[{ value: 'en', label: 'English' }]}
          />
          <Toggle
            label="Sound"
            hint="Master switch for all key sounds."
            checked={s.general.sound}
            onChange={(v) => s.update('general', { sound: v })}
          />
          {fullscreen.supported && (
            <Toggle label="Fullscreen" checked={fullscreen.active} onChange={() => void fullscreen.toggle()} />
          )}
        </section>
      )}

      {tab === 'touch' && (
        <section className="panel settings" aria-label="Touch Mode settings">
          <Slider
            label="Key size"
            value={s.touch.keySize}
            min={0.8}
            max={1.4}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => s.update('touch', { keySize: v })}
          />
          <Slider
            label="Key spacing"
            value={s.touch.keySpacing}
            min={2}
            max={14}
            format={(v) => `${v}px`}
            onChange={(v) => s.update('touch', { keySpacing: v })}
          />
          <Slider
            label="Key opacity"
            value={s.touch.keyOpacity}
            min={0.3}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => s.update('touch', { keyOpacity: v })}
          />
          <Toggle
            label="Touch feedback"
            hint="Keys sink and flood with light when pressed."
            checked={s.touch.visualFeedback}
            onChange={(v) => s.update('touch', { visualFeedback: v })}
          />
          <Toggle
            label="Sound feedback"
            hint="Click on key press (needs the master Sound switch)."
            checked={s.touch.soundFeedback}
            onChange={(v) => s.update('touch', { soundFeedback: v })}
          />
          <Toggle
            label="Hold to repeat"
            hint="Holding Backspace, arrows or a character repeats it."
            checked={s.touch.longPressRepeat}
            onChange={(v) => s.update('touch', { longPressRepeat: v })}
          />
          <SelectField<Orientation>
            label="Layout orientation"
            hint="Auto follows the device; portrait makes keys taller for thumbs."
            value={s.touch.orientation}
            onChange={(v) => s.update('touch', { orientation: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait', label: 'Portrait' },
            ]}
          />
        </section>
      )}

      {tab === 'air' && (
        <section className="panel settings" aria-label="Air Mode settings">
          <p className="settings__note">
            <Icon name="info" size={16} /> {AIR_NOTE}
          </p>
          <SelectField
            label="Camera"
            hint="The phone's rear camera gives the best view of your hands."
            value={s.air.cameraFacing}
            onChange={(v) => s.update('air', { cameraFacing: v })}
            options={[
              { value: 'environment', label: 'Rear camera' },
              { value: 'user', label: 'Front camera' },
            ]}
          />
          <Slider
            label="Tracking sensitivity"
            value={s.air.sensitivity}
            min={0}
            max={100}
            onChange={(v) => s.update('air', { sensitivity: v })}
          />
          <Slider
            label="Activation threshold"
            hint="How far a fingertip must travel downward to count as a press."
            value={s.air.activationThreshold}
            min={0.1}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => s.update('air', { activationThreshold: v })}
          />
          <Slider
            label="Debounce interval"
            value={s.air.debounceMs}
            min={40}
            max={400}
            step={10}
            format={(v) => `${v} ms`}
            onChange={(v) => s.update('air', { debounceMs: v })}
          />
          <Slider
            label="Tracking confidence"
            hint="Hands detected below this confidence are ignored."
            value={s.air.minConfidence}
            min={0.3}
            max={0.95}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => s.update('air', { minConfidence: v })}
          />
          <SelectField<CameraResolution>
            label="Camera resolution"
            value={s.performance.cameraResolution}
            onChange={(v) => s.update('performance', { cameraResolution: v })}
            options={[
              { value: '480p', label: '480p (fastest)' },
              { value: '720p', label: '720p (recommended)' },
              { value: '1080p', label: '1080p' },
            ]}
          />
          <Toggle
            label="Mirrored preview"
            checked={s.air.mirrored}
            onChange={(v) => s.update('air', { mirrored: v })}
          />
          <div className="field field--row">
            <div className="field__text">
              <span>Recalibrate</span>
              <p className="field__hint">Available once a phone camera is connected.</p>
            </div>
            <Button icon="target" disabled>
              Recalibrate
            </Button>
          </div>
        </section>
      )}

      {tab === 'performance' && (
        <section className="panel settings" aria-label="Performance settings">
          <div className="field">
            <div className="field__head">
              <span>Quality mode</span>
            </div>
            <Segmented<QualityMode>
              label="Quality mode"
              value={s.performance.quality}
              onChange={(v) => s.update('performance', { quality: v })}
              options={[
                { value: 'high', label: 'High' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <p className="field__hint">Balanced is recommended for Surface Pro 7. Low turns WebGL off entirely.</p>
          </div>
          <Slider
            label="Effects intensity"
            value={s.performance.effects}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(v) => s.update('performance', { effects: v })}
          />
          <SelectField
            label="Tracking frequency"
            hint={AIR_NOTE}
            value={String(s.performance.trackingHz)}
            onChange={(v) => s.update('performance', { trackingHz: Number(v) as 15 | 24 | 30 })}
            options={[
              { value: '15', label: '15 Hz' },
              { value: '24', label: '24 Hz' },
              { value: '30', label: '30 Hz' },
            ]}
          />
          <SelectField<CameraResolution>
            label="Camera resolution"
            value={s.performance.cameraResolution}
            onChange={(v) => s.update('performance', { cameraResolution: v })}
            options={[
              { value: '480p', label: '480p' },
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
            ]}
          />
        </section>
      )}

      {tab === 'privacy' && (
        <section className="panel settings privacy" aria-label="Privacy">
          <h2 className="panel__title">
            <Icon name="shield" /> Camera privacy
          </h2>
          <ul className="tips">
            <li>The camera is requested only when you start Air Mode pairing — never on page load.</li>
            <li>Video is streamed directly from your phone to your Surface (peer-to-peer WebRTC on your network).</li>
            <li>Frames are processed on the Surface in the browser. Nothing is recorded or stored by default.</li>
            <li>No camera footage is ever sent to a cloud or AI service. NEO TYPE uses no API keys.</li>
            <li>A camera-active indicator is shown whenever a stream is live, with a disconnect button.</li>
            <li>Camera tracks are stopped when the session ends or you leave Air Mode.</li>
            <li>The signaling server only relays connection setup messages (no video) and validates every message.</li>
          </ul>
          <p className="field__hint">
            Current build: no camera access is requested anywhere — Air Mode pairing is not implemented yet.
          </p>
        </section>
      )}

      <div className="page__actions">
        <Button variant="danger" onClick={() => setConfirmReset(true)}>
          Reset all settings
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all settings?"
        message="Every preference returns to its default. Your text is not affected."
        confirmLabel="Reset"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          s.reset();
          setConfirmReset(false);
          notify('Settings reset to defaults', 'success');
        }}
      />
    </div>
  );
}
