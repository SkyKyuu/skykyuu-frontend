import { LOCAL_INPUT_CONFIG } from '@/game/input/inputConfig'
import type { LocalInputBinding } from '@/game/input/inputTypes'
import type { TeamSide } from '@/game/team/teamTypes'

interface PreviewInputPlayer {
  playerId: string
  teamSide: TeamSide
}

export function validateLocalInputBindings(
  bindings: readonly LocalInputBinding[],
): void {
  if (
    bindings.length === 0 ||
    bindings.length > LOCAL_INPUT_CONFIG.maxLocalPlayers
  ) {
    throw new RangeError(
      `Local input requires between 1 and ${LOCAL_INPUT_CONFIG.maxLocalPlayers} players`,
    )
  }

  const playerIds = new Set<string>()
  const gamepadSlots = new Set<number>()
  let keyboardCount = 0

  for (const binding of bindings) {
    if (playerIds.has(binding.playerId)) {
      throw new Error(`Duplicate local player binding: ${binding.playerId}`)
    }
    playerIds.add(binding.playerId)

    if (binding.deviceKind === 'keyboard') {
      keyboardCount += 1
      if (keyboardCount > 1) {
        throw new Error('Only one logical keyboard binding is supported')
      }
      continue
    }

    if (gamepadSlots.has(binding.gamepadSlot)) {
      throw new Error(`Duplicate gamepad slot binding: ${binding.gamepadSlot}`)
    }
    gamepadSlots.add(binding.gamepadSlot)
  }
}

export function createPreviewInputBindings(
  players: readonly PreviewInputPlayer[],
): readonly LocalInputBinding[] {
  const bindings: LocalInputBinding[] = players.map((player, index) =>
    index === 0
      ? {
          playerId: player.playerId,
          teamSide: player.teamSide,
          deviceKind: 'keyboard',
        }
      : {
          playerId: player.playerId,
          teamSide: player.teamSide,
          deviceKind: 'gamepad',
          gamepadSlot: index - 1,
        },
  )

  validateLocalInputBindings(bindings)
  return bindings
}
