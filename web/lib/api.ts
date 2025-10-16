export interface HealthCheck {
  type: string
  message: string
}

export interface HostStatus {
  hostname: string
  hypervisor_version: string
  total_vms: number
  running_vms: number
  paused_vms: number
  shutoff_vms: number
  health_checks: HealthCheck[]
}

export interface HostResources {
  total_memory_kb: number
  free_memory_kb: number
  cpu_cores: number
  storage_total_b: number
  storage_used_b: number
  active_interfaces: number
}

export interface PerformanceDataPoint {
  timestamp: string
  cpu: number
  memory: number
  disk: number
}

export interface VMSummary {
  name: string
  uuid: string
  state: string
  memory_kb: number
  max_memory_kb: number
  vcpus: number
  cpu_percent: number
  uptime_sec: number
  os_info: string
  ip_addresses: string[]
}

export interface Disk {
  source_path: string
  target_dev: string
  device: string
}

export interface NIC {
  mac: string
  source: string
  model: string
}

export interface VMDetailed extends VMSummary {
  xml: string
  disks: Disk[]
  nics: NIC[]
  os: string
}

export interface StoragePool {
  name: string
  capacity_b: number
  allocation_b: number
}

export interface Volume {
  name: string
  path: string
  capacity_b: number
}

export interface VMCreationConfig {
  Name: string
  MemoryMB: number
  VCPUs: number
  DiskPool: string
  DiskSizeGB: number
  ISOPath: string
  StartOnCreate: boolean
  NetworkName: string
}

export interface VolumeConfig {
  Name: string
  SizeGB: number
}

export interface VMAction {
  action: "start" | "stop" | "reboot" | "force-stop" | "pause" | "resume"
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `${window.location.protocol}//${window.location.host}/api`
    : "http://localhost:5550/api")

let apiKey: string | null = null

class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "APIError"
  }
}

// Get API key from environment or server (now requires authentication)
async function getAPIKey(): Promise<string> {
  if (apiKey) return apiKey

  // First try environment variable
  const envKey = process.env.NEXT_PUBLIC_FLINT_API_KEY || process.env.FLINT_API_KEY
  if (envKey) {
    apiKey = envKey
    return apiKey
  }

  // For browser usage, we don't need the API key since we use session cookies
  // Only CLI usage needs to fetch the API key
  const isBrowser = typeof window !== 'undefined'
  if (isBrowser) {
    // Browser should use session authentication, not API key
    throw new Error("API key not available in browser environment")
  }

  // Fallback to server endpoint for CLI usage (now requires authentication)
  try {
    const response = await fetch(`${API_BASE_URL}/api/api-key`, {
      credentials: 'include' // Include session cookies
    })
    if (!response.ok) {
      throw new Error(`Failed to get API key: ${response.status}`)
    }
    const data = await response.text()
    apiKey = data.trim()
    return apiKey
  } catch (error) {
    console.error("Failed to get API key:", error)
    throw error
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  // For web app (browser), use session cookies for authentication
  // For CLI/API usage, use API key
  const isBrowser = typeof window !== 'undefined'

  let headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  }

  if (!isBrowser) {
    // CLI/API usage - use API key
    const apiKey = await getAPIKey()
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  // Browser usage - rely on session cookies from passphrase authentication

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include session cookies for browser requests
    mode: 'cors', // Ensure CORS is handled properly
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new APIError(response.status, `API request failed: ${response.status} ${errorText}`)
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return {} as T
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  } else {
    // Try to parse as JSON first, fallback to text
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return text as any
    }
  }
}

// Host API functions
export const hostAPI = {
  getStatus: (): Promise<HostStatus> => apiRequest("/host/status"),
  getResources: (): Promise<HostResources> => apiRequest("/host/resources"),
  getPerformance: (): Promise<PerformanceDataPoint[]> => apiRequest("/host/performance"),
}

// VM API functions
export const vmAPI = {
  getAll: (): Promise<VMSummary[]> => apiRequest("/vms"),
  getById: (uuid: string): Promise<VMDetailed> => apiRequest(`/vms/${uuid}`),
  create: (config: VMCreationConfig): Promise<VMDetailed> =>
    apiRequest("/vms", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  performAction: (uuid: string, action: VMAction): Promise<{ message: string }> =>
    apiRequest(`/vms/${uuid}/action`, {
      method: "POST",
      body: JSON.stringify(action),
    }),
  delete: (uuid: string, deleteDisks = false): Promise<void> => {
    const url = deleteDisks ? `/vms/${uuid}?deleteDisks=true` : `/vms/${uuid}`
    return apiRequest(url, { method: "DELETE" })
  },
  getGuestAgentStatus: (uuid: string): Promise<{ available: boolean; vm_uuid: string }> =>
    apiRequest(`/vms/${uuid}/guest-agent/status`),
  installGuestAgent: (uuid: string): Promise<{ status: string; message: string }> =>
    apiRequest(`/vms/${uuid}/guest-agent/install`, { method: "POST" }),
}

// Storage API functions
export const storageAPI = {
  getPools: (): Promise<StoragePool[]> => apiRequest("/storage-pools"),
  getVolumes: (poolName: string): Promise<Volume[]> => apiRequest(`/storage-pools/${poolName}/volumes`),
  createVolume: (poolName: string, config: VolumeConfig): Promise<Volume> =>
    apiRequest(`/storage-pools/${poolName}/volumes`, {
      method: "POST",
      body: JSON.stringify(config),
    }),
  deleteVolume: (poolName: string, volumeName: string): Promise<void> =>
    apiRequest(`/storage-pools/${poolName}/volumes/${volumeName}`, {
      method: "DELETE",
    }),
}

// Network API types
export interface VirtualNetwork {
  name: string
  uuid: string
  bridge: string
  is_active: boolean
  is_persistent: boolean
  type?: string
  state?: string
  ipRange?: string
  dhcp?: {
    enabled: boolean
    start?: string
    end?: string
  }
  connectedVMs?: number
  autostart?: boolean
}

export interface NetworkInterface {
  name: string
  type: string
  state: string
  mac: string
  ip: string
  speed: string
  bridge?: string
}

export interface SystemInterface {
  name: string
  type: string // physical, bridge, tap, virtual
  state: string // up, down, inactive
  ip_addresses: string[]
  mac_address: string
  mtu: number
  speed: string
  rx_bytes: number
  tx_bytes: number
  rx_packets: number
  tx_packets: number
}

export interface VMNetworkConnection {
  vm: string
  network: string
  interface: string
  mac: string
  ip: string
  state: string
}

// Network API functions
export const networkAPI = {
  getNetworks: (): Promise<VirtualNetwork[]> => apiRequest("/networks"),
  getNetwork: (name: string): Promise<VirtualNetwork> => apiRequest(`/networks/${name}`),
  getInterfaces: (): Promise<NetworkInterface[]> => apiRequest("/interfaces"),
  getSystemInterfaces: (): Promise<SystemInterface[]> => apiRequest("/system-interfaces"),
  getVMConnections: (): Promise<VMNetworkConnection[]> => apiRequest("/vm-connections"),
  createNetwork: (name: string, bridgeName: string): Promise<void> =>
    apiRequest("/networks", {
      method: "POST",
      body: JSON.stringify({ name, bridgeName }),
    }),
}

// Image API types
export interface Image {
  id: string
  name: string
  type: "iso" | "template"
  pool: string
  path: string
  size_b: number
  format?: string
  os_info?: string
  description?: string
  created_at?: string
  status?: "available" | "uploading" | "downloading" | "error"
}

export interface ImageImportRequest {
  path: string
}

export interface ImageDownloadRequest {
  url: string
  name?: string
}

// Image API functions
export const imageAPI = {
  getAll: (): Promise<Image[]> => apiRequest("/images"),
  importFromPath: (request: ImageImportRequest): Promise<Image> =>
    apiRequest("/images/import-from-path", {
      method: "POST",
      body: JSON.stringify(request),
    }),
  upload: (file: File): Promise<Image> => {
    const formData = new FormData()
    formData.append("file", file)
    return apiRequest("/images/upload", {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set content-type for FormData
    })
  },
  download: (request: ImageDownloadRequest): Promise<Image> =>
    apiRequest("/images/download", {
      method: "POST",
      body: JSON.stringify(request),
    }),
  delete: (id: string): Promise<void> => apiRequest(`/images/${id}`, { method: "DELETE" }),
}
