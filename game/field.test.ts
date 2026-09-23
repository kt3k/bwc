import { FieldActors } from "./field.ts"
import { RectScope } from "../util/rect-scope.ts"

class Scope extends RectScope {}
import { Actor } from "../model/actor.ts"
import type { ActorDefinition } from "../model/catalog.ts"
import type { IField } from "../model/types.ts"
import { assert, assertFalse } from "@std/assert"

const def: ActorDefinition = { type: "npc", src: "../actor/x/", href: "./x/" }

Deno.test("an actor removed during its own step leaves no collision behind", () => {
  const actors = new FieldActors([], new Scope(1000, 1000))
  const sinking = new Actor(5, 5, def, "sinking")
  // Removes itself when stepped (like a boulder sinking into water)
  sinking.step = (field: IField) => {
    field.actors.remove(sinking)
  }
  actors.add(sinking)
  assert(actors.checkCollision(5, 5))
  const field = { actors } as unknown as IField
  actors.step(field)
  assertFalse(actors.has("sinking"))
  assertFalse(actors.checkCollision(5, 5))
})

Deno.test("an actor removed by another actor's step is not stepped", () => {
  const actors = new FieldActors([], new Scope(1000, 1000))
  const victim = new Actor(6, 5, def, "victim")
  let victimStepped = false
  victim.step = () => {
    victimStepped = true
  }
  const crusher = new Actor(5, 5, def, "crusher")
  crusher.step = (field: IField) => {
    field.actors.remove(victim)
  }
  actors.add(crusher)
  actors.add(victim)
  const field = { actors } as unknown as IField
  actors.step(field)
  assertFalse(victimStepped)
  assertFalse(actors.checkCollision(6, 5))
  assert(actors.checkCollision(5, 5))
})
