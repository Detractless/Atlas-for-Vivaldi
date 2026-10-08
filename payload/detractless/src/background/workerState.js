export let tabLimit = 0 // Default Off
export function setTabLimit(v) { tabLimit = v; }

export let managementMethod = "block"
export function setManagementMethod(v) { managementMethod = v; }

// Search Delay State
export let searchDelayMs = 0 // Default Off (0 seconds)
export function setSearchDelayMs(v) { searchDelayMs = v; }

export let activeDelays = {} // Track active delays by URL
export function setActiveDelays(v) { activeDelays = v; }

export let managedEngines = {} // Track all configured search engines
export function setManagedEngines(v) { managedEngines = v; }
