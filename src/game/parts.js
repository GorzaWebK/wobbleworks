// The parts you can build with. Lengths are in grid cells.

export const PARTS = {
  plank: {
    name: 'Plank', cost: 10, kind: 'link', minLen: 1, maxLen: 4,
    mass: 1, floatF: 2.6, strength: 7, collide: true,
    tip: 'A wooden plank. Wob can roll on it. Bolt each end to something!',
  },
  rope: {
    name: 'Rope', cost: 5, kind: 'link', minLen: 1, maxLen: 7,
    mass: 0.15, floatF: 0.2, strength: 9, collide: false,
    tip: 'Rope pulls but never pushes. Hang planks from it.',
  },
  spring: {
    name: 'Spring', cost: 15, kind: 'link', minLen: 1, maxLen: 2,
    mass: 0.6, floatF: 0.6, strength: 6, collide: true, bounce: true,
    tip: 'Boing! Wob bounces off it, away from the side it touches.',
  },
  balloon: {
    name: 'Balloon', cost: 20, kind: 'point', mass: 0.1, floatF: 0,
    tip: 'Tie it to a joint and it lifts things up. Wind pushes it a lot.',
  },
  wheel: {
    name: 'Wheel', cost: 15, kind: 'point', mass: 1, floatF: 1.2,
    tip: 'A motor wheel that rolls forwards. On a bolt, it spins in place like a roller.',
  },
  sticky: {
    name: 'Sticky pad', cost: 10, kind: 'point', mass: 0, floatF: 0,
    tip: 'Stick it on any ground or moving block to make a new bolt there.',
  },
};

export const PART_ORDER = ['plank', 'rope', 'spring', 'balloon', 'wheel', 'sticky'];
