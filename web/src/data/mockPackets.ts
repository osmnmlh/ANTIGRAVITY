import rawPacketBundle from '../../../shared/mock/astronaut-packets.json'
import type { AstronautHealthPacket, AstronautPacketBundle } from '../domain/types'

export const mockPacketBundle = rawPacketBundle as AstronautPacketBundle

export const mockPackets: AstronautHealthPacket[] = mockPacketBundle.astronauts

export function getMockPacket(crewId: string): AstronautHealthPacket | undefined {
  return mockPackets.find((packet) => packet.astronautId === crewId)
}
