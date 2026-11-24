// @ts-check
/**
 * Interface strings of <vt-dockerfile>, registered by its module with `defineStrings()`
 * so other modules do not carry them.
 *
 * @module components/dockerfile/strings
 */

export const en = Object.freeze({
  dockerTabs: 'Dockerfile views',
  dockerTabStages: 'Stages ({count})',
  dockerTabSource: 'Source',
  dockerEmpty: 'No Dockerfile.',
  dockerStages: '{count} stages',
  dockerOneStage: '1 stage',
  dockerStage: 'Stage {index}',
  dockerFinal: 'final image',
  dockerFrom: 'from {image}',
  dockerOnStage: 'built on stage {name}',
  dockerCopiesFrom: 'copies from {list}',
  dockerUser: 'runs as {user}',
  dockerRoot: 'runs as root',
  dockerPorts: 'ports {list}',
  dockerPlatform: 'platform {platform}',
  dockerArgs: 'Build arguments: {list}',
  dockerInstructions: '{count} instructions',
  dockerLayers: '{count} layers',
  dockerLine: 'line {line}',
  dockerProblems: '{count} problems',
  dockerProblem: '1 problem',
  dockerNoProblem: 'No problem',
  dockerFindings: 'Problems',
  dockerCopy: 'Copy the Dockerfile',
  dockerKw_FROM: 'Starts a stage from a base image.',
  dockerKw_RUN: 'Runs a command while building: a new layer.',
  dockerKw_CMD: 'The default command of the container.',
  dockerKw_LABEL: 'Metadata of the image.',
  dockerKw_MAINTAINER: 'Author of the image (deprecated: use a label).',
  dockerKw_EXPOSE: 'Ports the container listens on (documentation only).',
  dockerKw_ENV: 'Environment variables, kept in the image.',
  dockerKw_ADD: 'Copies files, URLs or archives (unpacked) into the image: a new layer.',
  dockerKw_COPY: 'Copies files into the image: a new layer.',
  dockerKw_ENTRYPOINT: 'The program the container runs.',
  dockerKw_VOLUME: 'A mount point for data.',
  dockerKw_USER: 'The user the next instructions and the container run as.',
  dockerKw_WORKDIR: 'The working directory of the next instructions.',
  dockerKw_ARG: 'A build argument, not kept in the final environment.',
  dockerKw_ONBUILD: 'An instruction run when another image is built from this one.',
  dockerKw_STOPSIGNAL: 'The signal sent to stop the container.',
  dockerKw_HEALTHCHECK: 'How to check that the container works.',
  dockerKw_SHELL: 'The shell used by the shell form of the next instructions.',
  dockerFinding_unknown: 'Unknown instruction: {text}',
  dockerFinding_beforeFrom: '{keyword} before the first FROM: only ARG is allowed there.',
  dockerFinding_noFrom: 'No FROM instruction.',
  dockerFinding_duplicateStage: 'Another stage is already named {name}.',
  dockerFinding_untagged: '{image} has no tag: it means latest, and the build changes when the image does.', // prettier-ignore
  dockerFinding_latest: '{image}: the latest tag changes without notice; pin a version (or a digest).', // prettier-ignore
  dockerFinding_variableImage: 'The base image comes from a variable ({image}): check its default.',
  dockerFinding_unknownStage:
    'COPY --from={name}: no stage has that name, so it is read as an image.',
  dockerFinding_noUser: 'The final image runs as root: add a USER with a non-root user.',
  dockerFinding_rootUser: 'The last USER is root: the container runs as root.',
  dockerFinding_several: 'Several {keyword} instructions: only the last one counts.',
  dockerFinding_noHealthcheck: 'No HEALTHCHECK: the orchestrator cannot tell whether the service works.', // prettier-ignore
  dockerFinding_unusedStage: 'Stage {name} is not used by the final image (BuildKit skips it).',
  dockerFinding_maintainer: 'MAINTAINER is deprecated: use LABEL org.opencontainers.image.authors.',
  dockerFinding_ssh: 'Port 22 is exposed: an SSH server in a container is rarely needed.',
  dockerFinding_relativeWorkdir: 'WORKDIR {dir} is relative: use an absolute path.',
  dockerFinding_addUrl: 'ADD downloads a URL without checking it: use curl with a checksum, or ADD --checksum.', // prettier-ignore
  dockerFinding_addCopy: 'ADD where COPY does: ADD also unpacks archives and fetches URLs.',
  dockerFinding_copyAllFirst: 'COPY . before installing dependencies: every code change reinstalls them. Copy the dependency files first.', // prettier-ignore
  dockerFinding_secret: '{keyword} {name} looks like a secret: it stays in the image history. Use a build secret (RUN --mount=type=secret).', // prettier-ignore
  dockerFinding_shellForm: '{keyword} in shell form: the program does not receive stop signals. Use the JSON form.', // prettier-ignore
  dockerFinding_sudo: 'sudo in RUN: the build already runs as root, or use USER.',
  dockerFinding_cd: 'cd in RUN: use WORKDIR, which also applies to the next instructions.',
  dockerFinding_pipeShell: 'A script downloaded and piped to a shell runs without being checked.',
  dockerFinding_chmod777: 'chmod 777 makes files writable by every user.',
  dockerFinding_upgrade: 'Upgrading every package makes the build depend on the day: update the base image instead.', // prettier-ignore
  dockerFinding_aptRecommends: 'apt-get install without --no-install-recommends adds packages you did not ask for.', // prettier-ignore
  dockerFinding_aptLists: 'The apt lists stay in the layer: end with rm -rf /var/lib/apt/lists/*.',
  dockerFinding_aptYes: 'apt-get install without -y waits for an answer and fails the build.',
  dockerFinding_aptUpdateAlone: 'apt-get update alone in a RUN: its cached layer gets old. Join it to the install.', // prettier-ignore
  dockerFinding_apkCache: 'apk add without --no-cache keeps the package index in the layer.',
  dockerFinding_pipCache: 'pip install without --no-cache-dir keeps its cache in the layer.',
  dockerFinding_npmCi: 'npm install with no package: npm ci installs the lockfile exactly.',
  dockerFinding_pipefail: 'A pipe hides the failure of its first command: set -o pipefail (or SHELL with -o pipefail).', // prettier-ignore
});

/** @type {Partial<Record<keyof typeof en, string>>} */
export const fr = {
  dockerTabs: 'Vues du Dockerfile',
  dockerTabStages: 'Étapes ({count})',
  dockerTabSource: 'Source',
  dockerEmpty: 'Aucun Dockerfile.',
  dockerStages: '{count} étapes',
  dockerOneStage: '1 étape',
  dockerStage: 'Étape {index}',
  dockerFinal: 'image finale',
  dockerFrom: 'depuis {image}',
  dockerOnStage: 'construite sur l’étape {name}',
  dockerCopiesFrom: 'copie depuis {list}',
  dockerUser: 'tourne en {user}',
  dockerRoot: 'tourne en root',
  dockerPorts: 'ports {list}',
  dockerPlatform: 'plateforme {platform}',
  dockerArgs: 'Arguments de build : {list}',
  dockerInstructions: '{count} instructions',
  dockerLayers: '{count} couches',
  dockerLine: 'ligne {line}',
  dockerProblems: '{count} problèmes',
  dockerProblem: '1 problème',
  dockerNoProblem: 'Aucun problème',
  dockerFindings: 'Problèmes',
  dockerCopy: 'Copier le Dockerfile',
  dockerKw_FROM: 'Commence une étape à partir d’une image de base.',
  dockerKw_RUN: 'Exécute une commande pendant le build : une nouvelle couche.',
  dockerKw_CMD: 'La commande par défaut du conteneur.',
  dockerKw_LABEL: 'Métadonnées de l’image.',
  dockerKw_MAINTAINER: 'Auteur de l’image (obsolète : utiliser un label).',
  dockerKw_EXPOSE: 'Ports écoutés par le conteneur (documentation seulement).',
  dockerKw_ENV: 'Variables d’environnement, gardées dans l’image.',
  dockerKw_ADD: 'Copie des fichiers, URL ou archives (décompressées) dans l’image : une nouvelle couche.', // prettier-ignore
  dockerKw_COPY: 'Copie des fichiers dans l’image : une nouvelle couche.',
  dockerKw_ENTRYPOINT: 'Le programme lancé par le conteneur.',
  dockerKw_VOLUME: 'Un point de montage pour les données.',
  dockerKw_USER: 'L’utilisateur des instructions suivantes et du conteneur.',
  dockerKw_WORKDIR: 'Le répertoire de travail des instructions suivantes.',
  dockerKw_ARG: 'Un argument de build, absent de l’environnement final.',
  dockerKw_ONBUILD: 'Une instruction exécutée quand une autre image est construite sur celle-ci.',
  dockerKw_STOPSIGNAL: 'Le signal envoyé pour arrêter le conteneur.',
  dockerKw_HEALTHCHECK: 'Comment vérifier que le conteneur fonctionne.',
  dockerKw_SHELL: 'Le shell de la forme shell des instructions suivantes.',
  dockerFinding_unknown: 'Instruction inconnue : {text}',
  dockerFinding_beforeFrom: '{keyword} avant le premier FROM : seul ARG y est permis.',
  dockerFinding_noFrom: 'Aucune instruction FROM.',
  dockerFinding_duplicateStage: 'Une autre étape s’appelle déjà {name}.',
  dockerFinding_untagged: '{image} n’a pas de tag : c’est latest, et le build change quand l’image change.', // prettier-ignore
  dockerFinding_latest: '{image} : le tag latest change sans prévenir ; fixer une version (ou un digest).', // prettier-ignore
  dockerFinding_variableImage: 'L’image de base vient d’une variable ({image}) : vérifier sa valeur par défaut.', // prettier-ignore
  dockerFinding_unknownStage: 'COPY --from={name} : aucune étape ne porte ce nom, il est lu comme une image.', // prettier-ignore
  dockerFinding_noUser: 'L’image finale tourne en root : ajouter un USER non root.',
  dockerFinding_rootUser: 'Le dernier USER est root : le conteneur tourne en root.',
  dockerFinding_several: 'Plusieurs instructions {keyword} : seule la dernière compte.',
  dockerFinding_noHealthcheck: 'Pas de HEALTHCHECK : l’orchestrateur ne sait pas si le service fonctionne.', // prettier-ignore
  dockerFinding_unusedStage: 'L’étape {name} ne sert pas à l’image finale (BuildKit la saute).',
  dockerFinding_maintainer: 'MAINTAINER est obsolète : utiliser LABEL org.opencontainers.image.authors.', // prettier-ignore
  dockerFinding_ssh: 'Le port 22 est exposé : un serveur SSH dans un conteneur est rarement utile.',
  dockerFinding_relativeWorkdir: 'WORKDIR {dir} est relatif : utiliser un chemin absolu.',
  dockerFinding_addUrl: 'ADD télécharge une URL sans la vérifier : utiliser curl avec une empreinte, ou ADD --checksum.', // prettier-ignore
  dockerFinding_addCopy: 'ADD là où COPY suffit : ADD décompresse aussi les archives et télécharge les URL.', // prettier-ignore
  dockerFinding_copyAllFirst: 'COPY . avant d’installer les dépendances : chaque changement de code les réinstalle. Copier d’abord les fichiers de dépendances.', // prettier-ignore
  dockerFinding_secret: '{keyword} {name} ressemble à un secret : il reste dans l’historique de l’image. Utiliser un secret de build (RUN --mount=type=secret).', // prettier-ignore
  dockerFinding_shellForm: '{keyword} en forme shell : le programme ne reçoit pas les signaux d’arrêt. Utiliser la forme JSON.', // prettier-ignore
  dockerFinding_sudo: 'sudo dans RUN : le build tourne déjà en root, ou utiliser USER.',
  dockerFinding_cd: 'cd dans RUN : utiliser WORKDIR, qui vaut aussi pour les instructions suivantes.', // prettier-ignore
  dockerFinding_pipeShell: 'Un script téléchargé et passé à un shell s’exécute sans vérification.',
  dockerFinding_chmod777: 'chmod 777 rend les fichiers modifiables par tous.',
  dockerFinding_upgrade: 'Mettre à jour tous les paquets fait dépendre le build du jour : mettre à jour l’image de base.', // prettier-ignore
  dockerFinding_aptRecommends: 'apt-get install sans --no-install-recommends ajoute des paquets non demandés.', // prettier-ignore
  dockerFinding_aptLists: 'Les listes apt restent dans la couche : finir par rm -rf /var/lib/apt/lists/*.', // prettier-ignore
  dockerFinding_aptYes: 'apt-get install sans -y attend une réponse et fait échouer le build.',
  dockerFinding_aptUpdateAlone: 'apt-get update seul dans un RUN : sa couche en cache vieillit. Le joindre à l’install.', // prettier-ignore
  dockerFinding_apkCache: 'apk add sans --no-cache garde l’index des paquets dans la couche.',
  dockerFinding_pipCache: 'pip install sans --no-cache-dir garde son cache dans la couche.',
  dockerFinding_npmCi: 'npm install sans paquet : npm ci installe exactement le lockfile.',
  dockerFinding_pipefail: 'Un pipe cache l’échec de sa première commande : set -o pipefail (ou SHELL avec -o pipefail).', // prettier-ignore
};
