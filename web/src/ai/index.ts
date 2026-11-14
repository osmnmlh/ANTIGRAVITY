// Public surface of the AI components. See web/src/ai/README.md for where to mount them.
export { AlertCenter, type AlertCenterProps } from './AlertCenter'
export { AiChat, askAi, type AiChatProps } from './AiChat'
export { AiDemoControls } from './AiDemoControls'
export { DevicesPanel } from './DevicesPanel'
export { useAiState } from './aiStore'
export { useAiIndicatorGuidance, type AiIndicatorGuidance } from './useAiIndicatorGuidance'
export { AI_BASE_URL } from './api'
export type { Alert, CabinSnapshot, CabinReading, DeviceInfo } from './types'
