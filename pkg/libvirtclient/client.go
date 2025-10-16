package libvirtclient

import (
	"encoding/xml"
	"fmt"
	"github.com/ccheshirecat/flint/pkg/activity"
	"github.com/ccheshirecat/flint/pkg/core"
	libvirt "github.com/libvirt/libvirt-go"
	"io"
	"os"
	"strings"
	"syscall"
)

// Constants for the managed image library
const (
	flintImagePoolName = "flint-image-library"
	flintImagePoolPath = "/var/lib/flint/images"
)

// ClientInterface defines the interface for all libvirt operations.
type ClientInterface interface {
	GetVMSummaries() ([]core.VM_Summary, error)
	GetVMDetails(uuidStr string) (core.VM_Detailed, error)
	GetVMSnapshots(uuidStr string) ([]core.Snapshot, error)
	CreateVMSnapshot(uuidStr string, cfg core.CreateSnapshotRequest) (core.Snapshot, error)
	DeleteVMSnapshot(uuidStr string, snapshotName string) error
	RevertToVMSnapshot(uuidStr string, snapshotName string) error
	GetVMPerformance(uuidStr string) (core.PerformanceSample, error)
	PerformVMAction(uuidStr string, action string) error
	DeleteVM(uuidStr string, deleteDisks bool) error
	CreateVM(cfg core.VMCreationConfig) (core.VM_Detailed, error)
	GetHostStatus() (core.HostStatus, error)
	GetHostResources() (core.HostResources, error)
	GetStoragePools() ([]core.StoragePool, error)
	GetVolumes(poolName string) ([]core.Volume, error)
	CreateVolume(poolName string, volConfig core.VolumeConfig) error
	GetNetworks() ([]core.Network, error)
	GetSystemInterfaces() ([]core.SystemInterface, error)
	CreateNetwork(name string, bridgeName string) error
	DeleteNetwork(name string) error
	GetISOs() ([]core.Image, error)
	GetTemplates() ([]core.Image, error)
	GetImages() ([]core.Image, error)
	ImportImageFromPath(path string) (core.Image, error)
	DeleteImage(imageId string) error
	GetVMSerialConsolePath(uuidStr string) (string, error)
	GetDomainByName(name string) (*libvirt.Domain, error)
	NewStream(flags libvirt.StreamFlags) (*libvirt.Stream, error)
	AttachDiskToVM(uuidStr string, volumePath string, targetDev string) error
	AttachNetworkInterfaceToVM(uuidStr string, networkName string, model string) error
	GetActivity() []core.ActivityEvent
	Close() error
	
	// Guest agent operations
	GetGuestAgentStatus(vmName string) (string, error)
	CheckGuestAgentStatus(uuidStr string) (bool, error)
	InstallGuestAgent(uuidStr string) error
	
	// Storage operations
	UpdateVolume(poolName string, volumeName string, config core.VolumeConfig) error
	DeleteVolume(poolName string, volumeName string) error
	
	// Network operations  
	UpdateNetwork(name string, bridgeName string) error
}

// Client holds the libvirt connection.
type Client struct {
	conn             *libvirt.Connect
	logger           *activity.Logger
	isoPoolName      string
	templatePoolName string
}

// NewClient opens a libvirt connection (e.g. "qemu:///system")
func NewClient(uri string, isoPoolName, templatePoolName string) (*Client, error) {
	conn, err := libvirt.NewConnect(uri) // typical API
	if err != nil {
		return nil, fmt.Errorf("libvirt connect: %w", err)
	}

	// Auto-configure the managed image library
	if err := ensureManagedImagePool(conn); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to setup managed image pool: %w", err)
	}

	logger := activity.NewLogger(50) // Initialize with default max size
	return &Client{
		conn:             conn,
		logger:           logger,
		isoPoolName:      isoPoolName,
		templatePoolName: templatePoolName,
	}, nil
}

// ensureManagedImagePool creates and ensures the flint-image-library pool exists and is active
func ensureManagedImagePool(conn *libvirt.Connect) error {
	// Check if pool already exists
	pool, err := conn.LookupStoragePoolByName(flintImagePoolName)
	if err == nil {
		// Pool exists, ensure it's active
		defer pool.Free()
		isActive, err := pool.IsActive()
		if err != nil {
			return fmt.Errorf("failed to check pool status: %w", err)
		}
		if !isActive {
			if err := pool.Create(0); err != nil {
				return fmt.Errorf("failed to activate pool: %w", err)
			}
		}
		return nil
	}

	// Pool doesn't exist, create it
	return createManagedStoragePool(conn)
}

// createManagedStoragePool creates the flint-image-library storage pool
func createManagedStoragePool(conn *libvirt.Connect) error {
	// Create the host directory
	if err := os.MkdirAll(flintImagePoolPath, 0755); err != nil {
		return fmt.Errorf("failed to create image directory: %w", err)
	}

	// Define the storage pool XML with libvirt ownership
	poolXML := fmt.Sprintf(`<pool type="dir">
      <name>%s</name>
      <target>
        <path>%s</path>
        <permissions>
          <mode>0755</mode>
          <owner>-1</owner>
          <group>-1</group>
        </permissions>
      </target>
    </pool>`, flintImagePoolName, flintImagePoolPath)

	// Define the pool
	pool, err := conn.StoragePoolDefineXML(poolXML, 0)
	if err != nil {
		return fmt.Errorf("failed to define storage pool: %w", err)
	}
	defer pool.Free()

	// Set autostart
	if err := pool.SetAutostart(true); err != nil {
		return fmt.Errorf("failed to set pool autostart: %w", err)
	}

	// Activate the pool
	if err := pool.Create(0); err != nil {
		return fmt.Errorf("failed to create storage pool: %w", err)
	}

	return nil
}


func (c *Client) Close() error {
	if c.conn != nil {
		_, err := c.conn.Close()
		return err
	}
	return nil
}

// GetImages returns all images from the managed library
func (c *Client) GetImages() ([]core.Image, error) {
	pool, err := c.conn.LookupStoragePoolByName(flintImagePoolName)
	if err != nil {
		return nil, fmt.Errorf("managed image pool not found: %w", err)
	}
	defer pool.Free()

	volumes, err := pool.ListAllStorageVolumes(0)
	if err != nil {
		return nil, fmt.Errorf("failed to list volumes: %w", err)
	}

	images := make([]core.Image, 0, len(volumes))
	for _, vol := range volumes {
		name, _ := vol.GetName()
		path, _ := vol.GetPath()
		info, _ := vol.GetInfo()

		// Determine type based on file extension
		imageType := "template"
		if strings.HasSuffix(strings.ToLower(name), ".iso") {
			imageType = "iso"
		}

		images = append(images, core.Image{
			ID:    name, // Use name as ID for simplicity
			Name:  name,
			Pool:  flintImagePoolName,
			Path:  path,
			SizeB: uint64(info.Capacity),
			Type:  imageType,
		})
		vol.Free()
	}

	return images, nil
}

// ImportImageFromPath imports an image from a host path
func (c *Client) ImportImageFromPath(sourcePath string) (core.Image, error) {
	var image core.Image

	// Validate source path exists
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return image, fmt.Errorf("source path does not exist: %s", sourcePath)
	}

	pool, err := c.conn.LookupStoragePoolByName(flintImagePoolName)
	if err != nil {
		return image, fmt.Errorf("managed image pool not found: %w", err)
	}
	defer pool.Free()

	// Get filename from path
	parts := strings.Split(sourcePath, "/")
	filename := parts[len(parts)-1]

	// Create volume XML with capacity
	volXML := fmt.Sprintf(`<volume>
      <name>%s</name>
      <capacity unit="bytes">0</capacity>
      <target>
        <path>%s/%s</path>
      </target>
    </volume>`, filename, flintImagePoolPath, filename)

	// Create empty volume first
	vol, err := pool.StorageVolCreateXML(volXML, 0)
	if err != nil {
		return image, fmt.Errorf("failed to create volume: %w", err)
	}
	defer vol.Free()

	// Get volume info
	name, err := vol.GetName()
	if err != nil {
		return image, fmt.Errorf("failed to get volume name: %w", err)
	}
	path, err := vol.GetPath()
	if err != nil {
		return image, fmt.Errorf("failed to get volume path: %w", err)
	}

	// Copy the source file to the volume path
	if err := copyFile(sourcePath, path); err != nil {
		// Clean up the volume on failure
		_ = vol.Delete(0)
		return image, fmt.Errorf("failed to copy file: %w", err)
	}

	// Get updated volume info after copying
	info, err := vol.GetInfo()
	if err != nil {
		return image, fmt.Errorf("failed to get volume info: %w", err)
	}

	imageType := "template"
	if strings.HasSuffix(strings.ToLower(name), ".iso") {
		imageType = "iso"
	}

	image = core.Image{
		ID:    name, // Use name as ID for simplicity
		Name:  name,
		Pool:  flintImagePoolName,
		Path:  path,
		SizeB: uint64(info.Capacity),
		Type:  imageType,
	}

	return image, nil
}

// DeleteImage deletes an image from the managed library
func (c *Client) DeleteImage(imageId string) error {
	pool, err := c.conn.LookupStoragePoolByName(flintImagePoolName)
	if err != nil {
		return fmt.Errorf("managed image pool not found: %w", err)
	}
	defer pool.Free()

	// Look up the volume by name (imageId is the volume name)
	vol, err := pool.LookupStorageVolByName(imageId)
	if err != nil {
		return fmt.Errorf("image not found: %w", err)
	}
	defer vol.Free()

	// Delete the volume
	if err := vol.Delete(0); err != nil {
		return fmt.Errorf("failed to delete image: %w", err)
	}

	return nil
}

// GetActivity returns the current activity events
func (c *Client) GetActivity() []core.ActivityEvent {
	return c.logger.Get()
}

// GetISOs returns available ISO images from the designated pool
func (c *Client) GetISOs() ([]core.Image, error) {
	if c.isoPoolName == "" {
		return []core.Image{}, nil // No ISO pool configured
	}
	volumes, err := c.GetVolumes(c.isoPoolName)
	if err != nil {
		return nil, err
	}
	images := make([]core.Image, len(volumes))
	for i, vol := range volumes {
		images[i] = core.Image{
			Name:  vol.Name,
			Path:  vol.Path,
			SizeB: vol.Capacity,
		}
	}
	return images, nil
}

// GetTemplates returns available VM templates from the designated pool
func (c *Client) GetTemplates() ([]core.Image, error) {
	if c.templatePoolName == "" {
		return []core.Image{}, nil // No template pool configured
	}
	volumes, err := c.GetVolumes(c.templatePoolName)
	if err != nil {
		return nil, err
	}
	images := make([]core.Image, len(volumes))
	for i, vol := range volumes {
		images[i] = core.Image{
			Name:  vol.Name,
			Path:  vol.Path,
			SizeB: vol.Capacity,
		}
	}
	return images, nil
}

// GetDomainByName returns a libvirt domain by name
func (c *Client) GetDomainByName(name string) (*libvirt.Domain, error) {
	dom, err := c.conn.LookupDomainByName(name)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup domain: %w", err)
	}
	return dom, nil
}

// NewStream creates a new libvirt stream
func (c *Client) NewStream(flags libvirt.StreamFlags) (*libvirt.Stream, error) {
	stream, err := c.conn.NewStream(flags)
	if err != nil {
		return nil, fmt.Errorf("failed to create stream: %w", err)
	}
	return stream, nil
}

// GetVMSerialConsolePath extracts the PTY path for a VM's serial console
func (c *Client) GetVMSerialConsolePath(uuidStr string) (string, error) {
	dom, err := c.conn.LookupDomainByUUIDString(uuidStr)
	if err != nil {
		return "", fmt.Errorf("failed to lookup domain: %w", err)
	}
	defer dom.Free()

	xmlDesc, err := dom.GetXMLDesc(0)
	if err != nil {
		return "", fmt.Errorf("failed to get domain XML: %w", err)
	}

	// Parse the XML to find the console or serial PTY path
	ptyPath, err := extractPTYPathFromXML(xmlDesc)
	if err != nil {
		return "", fmt.Errorf("failed to extract PTY path: %w", err)
	}
	if ptyPath == "" {
		return "", fmt.Errorf("no PTY path found in domain XML")
	}

	return ptyPath, nil
}

// DomainXMLForPTY represents the structure for parsing libvirt domain XML to extract PTY paths
type DomainXMLForPTY struct {
	Devices struct {
		Consoles []struct {
			Type   string `xml:"type,attr"`
			Source struct {
				Path string `xml:"path,attr"`
			} `xml:"source"`
		} `xml:"console"`
		Serials []struct {
			Type   string `xml:"type,attr"`
			Source struct {
				Path string `xml:"path,attr"`
			} `xml:"source"`
		} `xml:"serial"`
	} `xml:"devices"`
}

// extractPTYPathFromXML parses the domain XML to find the PTY path using proper XML parsing
func extractPTYPathFromXML(xmlDesc string) (string, error) {
	var domain DomainXMLForPTY
	if err := xml.Unmarshal([]byte(xmlDesc), &domain); err != nil {
		return "", fmt.Errorf("failed to parse domain XML: %w", err)
	}

	// Look for console PTY first
	for _, console := range domain.Devices.Consoles {
		if console.Type == "pty" && console.Source.Path != "" {
			return console.Source.Path, nil
		}
	}

	// Look for serial PTY
	for _, serial := range domain.Devices.Serials {
		if serial.Type == "pty" && serial.Source.Path != "" {
			return serial.Source.Path, nil
		}
	}

	return "", nil
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return fmt.Errorf("failed to copy file contents: %w", err)
	}

	// Ensure data is written to disk
	if err := destFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync destination file: %w", err)
	}

	// Fix ownership for libvirt access - inherit from parent directory
	if parentInfo, err := os.Stat(flintImagePoolPath); err == nil {
		if stat, ok := parentInfo.Sys().(*syscall.Stat_t); ok {
			if err := os.Chown(dst, int(stat.Uid), int(stat.Gid)); err != nil {
				return fmt.Errorf("failed to set file ownership: %w", err)
			}
		}
	}

	// Set proper permissions for libvirt access
	if err := os.Chmod(dst, 0644); err != nil {
		return fmt.Errorf("failed to set file permissions: %w", err)
	}

	return nil
}

// FormatUptime converts seconds to a human-readable uptime string (e.g., "2h 30m 45s")
func FormatUptime(uptimeSec uint64) string {
	if uptimeSec == 0 {
		return "0s"
	}

	days := uptimeSec / 86400
	hours := (uptimeSec % 86400) / 3600
	mins := (uptimeSec % 3600) / 60
	secs := uptimeSec % 60

	var parts []string
	if days > 0 {
		parts = append(parts, fmt.Sprintf("%dd", days))
	}
	if hours > 0 {
		parts = append(parts, fmt.Sprintf("%dh", hours))
	}
	if mins > 0 {
		parts = append(parts, fmt.Sprintf("%dm", mins))
	}
	if secs > 0 || len(parts) == 0 {
		parts = append(parts, fmt.Sprintf("%ds", secs))
	}

	return strings.Join(parts, " ")
}
