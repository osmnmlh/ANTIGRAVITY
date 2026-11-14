// Public surface of the AI components. See web/src/ai/README.md for where to mount them.
export { AlertCenter, type AlertCenterProps } from './AlertCenter'
export { AiChat, askAi, type AiChatProps } from './AiChat'
export { AiDemoControls } from './AiDemoControls'
export { useAiState } from './aiStore'
export { AI_BASE_URL } from './api'
export type { Alert, CabinSnapshot, CabinReading } from './types'
