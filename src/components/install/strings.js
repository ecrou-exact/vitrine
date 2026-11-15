// @ts-check
/**
 * Interface strings of <vt-install>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/install/strings
 */

export const en = Object.freeze({
  installManagers: 'Package manager',
  installCommands: 'Commands for {manager}',
  installCopy: 'Copy the commands',
  installNone: '{manager} has no equivalent for this command.',
  installEmpty: 'No command: set `package`, or write the command in the element.',
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  installManagers: 'Gestionnaire de paquets',
  installCommands: 'Commandes pour {manager}',
  installCopy: 'Copier les commandes',
  installNone: '{manager} n’a pas d’équivalent pour cette commande.',
  installEmpty: 'Aucune commande : définissez `package`, ou écrivez la commande dans l’élément.',
};
