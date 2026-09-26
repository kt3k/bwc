// Room declarations for the map generators: each block can name its
// rooms so the game shows "<block>-<room>" on screen (game/ui/place-label.ts).

export interface RoomSpec {
  id: string
  i: number
  j: number
  w: number
  h: number
}

/**
 * Creates the room list of a block at (bi, bj). `room(id, x0, y0, x1, y1)`
 * takes local, inclusive coordinates like the generators' `rect`. Nested
 * rooms are fine: the smallest room containing a cell wins.
 */
export function createRooms(bi: number, bj: number) {
  const rooms: RoomSpec[] = []
  const room = (id: string, x0: number, y0: number, x1: number, y1: number) =>
    rooms.push({ id, i: bi + x0, j: bj + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 })
  return { rooms, room }
}
