import { describe, expect, it } from 'vitest'
import { PLAYER_HIT_BUFFER_CONFIG } from '@/game/contact/playerHitBufferConfig'

describe('PLAYER_HIT_BUFFER_CONFIG', () => {
  it('uses the initial 100 ms tuning value', () => {
    expect(PLAYER_HIT_BUFFER_CONFIG.durationSeconds).toBe(0.1)
  })
})
