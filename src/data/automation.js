// Automation unlocks (doc section 10). Each is earned by a first clear.
export const AUTOMATION = {
  autoSalvage: { name: 'Auto-salvage', zone: 3, text: 'Salvages Normal items as they drop.' },
  lootFilter: { name: 'Loot filter', zone: 8, text: 'Salvages Magic and Rare items that have none of the mods you choose to keep.' },
  mapRunner: { name: 'Map runner', mapTier: 4, text: 'Runs maps from your stash automatically, one after another.' },
};

export const DEFAULT_AUTOMATION = {
  salvageNormal: true,
  salvageMagic: false,
  salvageRare: false,
  keepFamilies: ['fire_res', 'cold_res', 'lightning_res', 'chaos_res', 'life'],
  // Always keep items of these types regardless of mods (empty = none).
  keepTypes: [],
};
