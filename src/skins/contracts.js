/**
 * Public contract for trusted, build-time skin packages.
 *
 * Skins receive data and host services through props. They must not import
 * application stores directly. This keeps playback, navigation, persistence,
 * accessibility, and sound permission under application control.
 */

export const SKIN_CATEGORIES = /** @type {const} */ (['ui', 'node']);
export const NODE_TYPES = /** @type {const} */ (['audio', 'comic', 'text', 'game']);

/**
 * @typedef {object} NodeSkinServices
 * @property {(url: string) => void} preloadImage
 * @property {(url: string, options?: { volume?: number }) => Promise<boolean>} playSound
 * @property {() => void} play Request the host's normal play or preview action.
 * @property {() => void} read Request the host's comic reader action.
 * @property {() => void} visit Record a creator-site visit.
 */

/**
 * Props supplied to every node stage. Individual stages may use only the
 * fields relevant to their type.
 * @typedef {object} NodeSkinStageProps
 * @property {import('../lib/ring.js').RingEntry} entry
 * @property {string | null} cover
 * @property {boolean} hasImage
 * @property {boolean} paused
 * @property {boolean} motionReduced
 * @property {NodeSkinServices} services
 * @property {() => void} onImageError
 */

/**
 * @typedef {object} NodeSkinManifest
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {'node'} category
 * @property {readonly ('audio' | 'comic' | 'text' | 'game')[]} types
 * @property {() => Promise<NodeSkinModule>} [load] Omitted by the synchronous default skin.
 */

/**
 * @typedef {object} NodeSkinModule
 * @property {Record<string, import('svelte').Component<NodeSkinStageProps>>} stages
 */

/**
 * @typedef {object} UiSkinManifest
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {'ui'} category
 * @property {() => Promise<unknown>} load
 */
