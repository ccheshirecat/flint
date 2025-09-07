package cmd

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/ccheshirecat/flint/pkg/config"
	"github.com/ccheshirecat/flint/pkg/core"
	"github.com/ccheshirecat/flint/pkg/libvirtclient"
	"github.com/ccheshirecat/flint/pkg/logger"
	"github.com/ccheshirecat/flint/server"
	libvirt "github.com/libvirt/libvirt-go"
	"github.com/spf13/cobra"
	"log"
	"os"
	"path/filepath"
	"runtime"
)

// dummyClient implements ClientInterface but returns errors for all operations
// Used when libvirt connection fails but we still want the web server to start
type dummyClient struct{}

func (d *dummyClient) GetVMSummaries() ([]core.VM_Summary, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) GetVMDetails(uuidStr string) (core.VM_Detailed, error) {
	// Return mock VM data for development/testing when libvirt is not available
	return core.VM_Detailed{
		VM_Summary: core.VM_Summary{
			Name:        "demo-vm",
			UUID:        uuidStr,
			State:       "running",
			MemoryKB:    2048 * 1024, // 2GB
			VCPUs:       2,
			CPUPercent:  15.5, // Valid number for toFixed()
			UptimeSec:   3600, // 1 hour
			OSInfo:      "Ubuntu 22.04",
			IPAddresses: []string{"192.168.122.100"},
		},
		MaxMemoryKB: 4096 * 1024, // 4GB
		XML:         "<domain></domain>",
		Disks: []core.Disk{
			{
				SourcePath: "/var/lib/libvirt/images/demo-vm.qcow2",
				TargetDev:  "vda",
				Device:     "disk",
			},
		},
		Nics: []core.NIC{
			{
				MAC:    "52:54:00:12:34:56",
				Source: "default",
				Model:  "virtio",
			},
		},
		OS: "linux",
	}, nil
}

func (d *dummyClient) GetVMSnapshots(uuidStr string) ([]core.Snapshot, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) CreateVMSnapshot(uuidStr string, cfg core.CreateSnapshotRequest) (core.Snapshot, error) {
	return core.Snapshot{}, errors.New("libvirt connection not available")
}

func (d *dummyClient) DeleteVMSnapshot(uuidStr string, snapshotName string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) RevertToVMSnapshot(uuidStr string, snapshotName string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) GetVMPerformance(uuidStr string) (core.PerformanceSample, error) {
	return core.PerformanceSample{}, errors.New("libvirt connection not available")
}

func (d *dummyClient) PerformVMAction(uuidStr string, action string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) DeleteVM(uuidStr string, deleteDisks bool) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) CreateVM(cfg core.VMCreationConfig) (core.VM_Detailed, error) {
	return core.VM_Detailed{}, errors.New("libvirt connection not available")
}

func (d *dummyClient) GetHostStatus() (core.HostStatus, error) {
	// Return mock data for development/testing when libvirt is not available
	return core.HostStatus{
		Hostname:          "localhost",
		HypervisorVersion: "QEMU 6.2.0",
		TotalVMs:          0,
		RunningVMs:        0,
		PausedVMs:         0,
		ShutOffVMs:        0,
		HealthChecks: []core.HealthCheck{
			{
				Type:    "info",
				Message: "System running in development mode (libvirt not connected)",
			},
		},
	}, nil
}

func (d *dummyClient) GetHostResources() (core.HostResources, error) {
	// Try to get real system information when libvirt is not available
	var resources core.HostResources

	// Get CPU cores using runtime
	resources.CPUCores = runtime.NumCPU()

	// Get memory information using runtime (fallback when libvirt unavailable)
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Use runtime memory stats as best available approximation
	resources.TotalMemoryKB = memStats.Sys / 1024
	resources.FreeMemoryKB = (memStats.Sys - memStats.Alloc) / 1024

	// Mock storage values for development
	resources.StorageTotalB = 500 * 1024 * 1024 * 1024 // 500GB
	resources.StorageUsedB = 100 * 1024 * 1024 * 1024  // 100GB
	resources.ActiveInterfaces = 2

	return resources, nil
}

func (d *dummyClient) GetStoragePools() ([]core.StoragePool, error) {
	// Try to detect real storage pools when libvirt is not available
	// For now, return a meaningful error since we can't detect storage without libvirt
	return nil, fmt.Errorf("libvirt connection required for storage pool management")
}

func (d *dummyClient) GetVolumes(poolName string) ([]core.Volume, error) {
	// Return meaningful error since volumes require libvirt storage pools
	return nil, fmt.Errorf("libvirt connection required for volume management")
}

func (d *dummyClient) CreateVolume(poolName string, volConfig core.VolumeConfig) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) GetNetworks() ([]core.Network, error) {
	// Return empty array instead of nil to prevent frontend errors
	return []core.Network{}, nil
}

func (d *dummyClient) CreateNetwork(name string, bridgeName string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) DeleteNetwork(name string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) GetISOs() ([]core.Image, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) GetTemplates() ([]core.Image, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) GetImages() ([]core.Image, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) ImportImageFromPath(path string) (core.Image, error) {
	return core.Image{}, errors.New("libvirt connection not available")
}

func (d *dummyClient) DeleteImage(imageId string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) GetVMSerialConsolePath(uuidStr string) (string, error) {
	return "", errors.New("libvirt connection not available")
}

func (d *dummyClient) GetDomainByName(name string) (*libvirt.Domain, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) NewStream(flags libvirt.StreamFlags) (*libvirt.Stream, error) {
	return nil, errors.New("libvirt connection not available")
}

func (d *dummyClient) AttachDiskToVM(uuidStr string, volumePath string, targetDev string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) AttachNetworkInterfaceToVM(uuidStr string, networkName string, model string) error {
	return errors.New("libvirt connection not available")
}

func (d *dummyClient) GetActivity() []core.ActivityEvent {
	return []core.ActivityEvent{}
}

func (d *dummyClient) Close() error {
	return nil
}

func (d *dummyClient) GetGuestAgentStatus(vmName string) (string, error) {
	return "Not Available", nil
}

func (d *dummyClient) CheckGuestAgentStatus(uuidStr string) (bool, error) {
	return false, nil
}

func (d *dummyClient) InstallGuestAgent(uuidStr string) error {
	return fmt.Errorf("not implemented in dummy client")
}

func (d *dummyClient) UpdateVolume(poolName string, volumeName string, config core.VolumeConfig) error {
	return fmt.Errorf("not implemented in dummy client")
}

func (d *dummyClient) UpdateNetwork(name string, bridgeName string) error {
	return fmt.Errorf("not implemented in dummy client")
}

var (
	passphraseFlag string
	setPassphrase  bool
)

// handlePassphraseSetup handles passphrase configuration
func handlePassphraseSetup(cfg *config.Config) error {
	// If passphrase provided via flag, hash and save it
	if passphraseFlag != "" {
		hash := hashPassphrase(passphraseFlag)
		cfg.Security.PassphraseHash = hash

		// Save updated config
		if err := saveConfig(cfg); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}
		logger.Info("Passphrase updated via flag")
		return nil
	}

	// If --set-passphrase flag used, prompt interactively
	if setPassphrase {
		fmt.Println("🔐 Setting up web UI passphrase...")
		fmt.Print("Enter passphrase: ")
		var passphrase string
		fmt.Scanln(&passphrase)

		if len(passphrase) < 8 {
			return fmt.Errorf("passphrase must be at least 8 characters")
		}

		hash := hashPassphrase(passphrase)
		cfg.Security.PassphraseHash = hash

		// Save updated config
		if err := saveConfig(cfg); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}
		logger.Info("Passphrase set interactively")
		return nil
	}

	// If no passphrase set, prompt for initial setup
	if cfg.Security.PassphraseHash == "" {
		fmt.Println("🔐 No web UI passphrase set. Let's set one up for security.")
		fmt.Print("Enter passphrase: ")
		var passphrase string
		fmt.Scanln(&passphrase)

		if len(passphrase) < 8 {
			return fmt.Errorf("passphrase must be at least 8 characters")
		}

		hash := hashPassphrase(passphrase)
		cfg.Security.PassphraseHash = hash

		// Save updated config
		if err := saveConfig(cfg); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}
		logger.Info("Initial passphrase set")
	}

	return nil
}

// hashPassphrase creates a SHA256 hash of the passphrase
func hashPassphrase(passphrase string) string {
	hash := sha256.Sum256([]byte(passphrase))
	return hex.EncodeToString(hash[:])
}

// saveConfig saves the configuration to file
func saveConfig(cfg *config.Config) error {
	configDir := filepath.Join(os.Getenv("HOME"), ".flint")
	configPath := filepath.Join(configDir, "config.json")

	// Create config directory if it doesn't exist
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Save config to file
	if err := cfg.SaveConfig(configPath); err != nil {
		return fmt.Errorf("failed to save config file: %w", err)
	}

	logger.Info("Config saved", map[string]interface{}{
		"passphrase_hash_length": len(cfg.Security.PassphraseHash),
		"config_path":            configPath,
	})
	return nil
}

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the flint web server",
	Long: `Start the Flint web server with authentication.

The web UI requires a passphrase for access. You can set it in several ways:

1. Use --passphrase flag: flint serve --passphrase "yourpassword"
2. Use --set-passphrase flag for interactive setup: flint serve --set-passphrase
3. Set FLINT_PASSPHRASE environment variable
4. Configure in ~/.flint/config.json

The API requires an API key for authentication, which can be obtained from the web UI after login.

Examples:
  flint serve                           # Start with existing config
  flint serve --passphrase "mypassword" # Start with specific passphrase
  flint serve --set-passphrase         # Interactive passphrase setup`,
	Run: func(cmd *cobra.Command, args []string) {
		// Load configuration
		cfg, err := config.LoadConfig("")
		if err != nil {
			log.Fatalf("Failed to load configuration: %v", err)
		}

		// Validate configuration
		if err := cfg.Validate(); err != nil {
			log.Fatalf("Invalid configuration: %v", err)
		}

		// Set up logging
		logLevel := logger.INFO
		switch cfg.Logging.Level {
		case "DEBUG":
			logLevel = logger.DEBUG
		case "INFO":
			logLevel = logger.INFO
		case "WARN":
			logLevel = logger.WARN
		case "ERROR":
			logLevel = logger.ERROR
		case "FATAL":
			logLevel = logger.FATAL
		}
		logger.SetGlobalLevel(logLevel)

		// Handle passphrase setup
		if err := handlePassphraseSetup(cfg); err != nil {
			logger.Fatal("Failed to setup passphrase", map[string]interface{}{
				"error": err.Error(),
			})
		}

		logger.Info("Starting Flint server", map[string]interface{}{
			"config": cfg,
		})

		// 1. Create a dummy client first to allow server initialization
		var client libvirtclient.ClientInterface
		var clientErr error

		// Try to create the libvirt client
		client, clientErr = libvirtclient.NewClient(cfg.Libvirt.URI, cfg.Libvirt.ISOPool, cfg.Libvirt.TemplatePool)
		if clientErr != nil {
			logger.Warn("Failed to connect to libvirt - server will start in limited mode", map[string]interface{}{
				"error": clientErr.Error(),
				"uri":   cfg.Libvirt.URI,
			})
			// Create a dummy client that returns errors for all operations
			client = &dummyClient{}
		} else {
			defer client.Close()
		}

		// 2. Start the HTTP server, passing the client to it
		apiServer := server.NewServer(client, globalAssets)
		logger.Info("Flint API server starting", map[string]interface{}{
			"address": cfg.GetServerAddress(),
		})
		logger.Info("API authentication configured", map[string]interface{}{
			"api_key_length": len(apiServer.GetAPIKey()),
		})

		if clientErr != nil {
			logger.Warn("Libvirt connection failed - VM operations will not work", map[string]interface{}{
				"error": clientErr.Error(),
			})
		}

		if err := apiServer.Start(cfg.GetServerAddress()); err != nil {
			logger.Fatal("Failed to start server", map[string]interface{}{
				"error": err.Error(),
			})
		}
	},
}

var apiKeyCmd = &cobra.Command{
	Use:   "api-key",
	Short: "Show the API key for authentication",
	Long: `Display the API key that should be used for authenticating with the Flint API.
This key is generated on server startup and is required for all API requests.

Example usage:
  curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:5550/api/vms

WARNING: Keep this key secure and do not share it publicly.`,
	Run: func(cmd *cobra.Command, args []string) {
		// Try to load API key from config file
		configDir := filepath.Join(os.Getenv("HOME"), ".flint")
		configPath := filepath.Join(configDir, "config.json")

		var apiKey string

		// Try to read existing config
		if data, err := os.ReadFile(configPath); err == nil {
			var config map[string]interface{}
			if err := json.Unmarshal(data, &config); err == nil {
				if key, exists := config["api_key"]; exists && key != "" {
					apiKey = key.(string)
				}
			}
		}

		// If no key found in config, generate a new one (but warn user)
		if apiKey == "" {
			bytes := make([]byte, 32)
			rand.Read(bytes)
			apiKey = hex.EncodeToString(bytes)
			fmt.Println("📝 Note: No existing API key found. Generated a new one.")
			fmt.Println("   Start the server first with 'flint serve' to generate and save a key.")
			fmt.Println("")
		}

		fmt.Printf("🔑 Flint API Key: %s\n\n", apiKey)
		fmt.Println("Use this key in the Authorization header:")
		fmt.Printf("  Authorization: Bearer %s\n\n", apiKey)
		fmt.Println("⚠️  WARNING: Keep this key secure!")
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(apiKeyCmd)

	// Add flags specific to the server
	serveCmd.Flags().StringVar(&passphraseFlag, "passphrase", "", "Web UI passphrase (will be hashed)")
	serveCmd.Flags().BoolVar(&setPassphrase, "set-passphrase", false, "Interactively set web UI passphrase")
}
