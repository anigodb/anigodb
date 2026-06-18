import { randomBytes } from 'crypto'

let counter = Math.floor(Math.random() * 0xffffff)

export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const random = randomBytes(5).toString('hex')
  counter = (counter + 1) & 0xffffff
  const c = counter.toString(16).padStart(6, '0')
  return timestamp + random + c
}
