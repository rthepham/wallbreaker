// Active skills. Only Cleave exists in the prototype (supports arrive in M5).
export const SKILLS = {
  cleave: {
    name: 'Cleave',
    kind: 'attack',
    damageType: 'physical',
    // "Weapon damage x 1.2"
    damageMore: 1.2,
    // DOC: doc says 6. Lowered with the mana regen change so base Cleave never starves.
    manaCost: 4,
    targets: 3,
    tags: ['Melee', 'Area'],
  },
};
