import type { CameraLinkState } from '@/stores/appStore';
import type { DotTone } from '@/components/common/Controls';

export const CAMERA_LINK_LABEL: Record<CameraLinkState, string> = {
  idle: 'No phone linked',
  waiting: 'Waiting for phone',
  connecting: 'Connecting',
  'permission-required': 'Camera permission required',
  connected: 'Phone connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  unavailable: 'Camera unavailable',
};

export const CAMERA_LINK_TONE: Record<CameraLinkState, DotTone> = {
  idle: 'idle',
  waiting: 'warn',
  connecting: 'warn',
  'permission-required': 'warn',
  connected: 'ok',
  reconnecting: 'warn',
  disconnected: 'err',
  unavailable: 'err',
};
